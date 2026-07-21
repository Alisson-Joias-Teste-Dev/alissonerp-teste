// ═══════════════════════════════════════════════════════════════════════════
// API de Configuração de Aprovadores
//
// REGRA DE NEGÓCIO: cada tipo de aprovação tem um responsável configurável
// via tabela configuracoes_sistema. Só admin/desenvolvedor pode alterar.
// GET  → retorna config atual + lista de usuários elegíveis por role
// PUT  → atualiza os responsáveis
//
// Se alterar: sincronizar com as chaves usadas em:
//   - vendas-credito-aprovar.ts (aprovador_credito_diretor)
//   - aprovacao-regras.ts (aprovador_desconto, aprovador_cartao_desconto)
//   - solicitar-aprovacao/route.ts
//   - entrega-sem-pagamento.ts (Automacao de Estoque 2.0)
//   - src/lib/aprovacoes/catalogo.ts (camada config-first, Fase 3 — metal já usa
//     metal_aprovador_id; conversão/conversão-SKU usam aprovador_conversao;
//     alteração de venda usa aprovador_alteracao_venda, Fase 3g.1)
// ═══════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/auth-server";
import { isFullAccess } from "@/lib/roles";

// Chaves de configuração dos aprovadores
// REGRA DE NEGÓCIO: aprovadora_credito_gerente já existia antes da refatoração.
// As outras 3 foram criadas junto com a separação dos campos de aprovação.
const CHAVES = [
  "aprovador_credito_diretor",
  "aprovador_desconto_padrao",
  "aprovador_cartao_desconto_padrao",
  "aprovadora_credito_gerente",
  "aprovador_compra_comercial",
  "metal_aprovador_id",
  "aprovador_limpeza",
  "aprovador_entrega_sem_pagamento",
  "aprovador_devolucao_fora_prazo",
  "aprovador_devolucao_estoque",
  "aprovador_vale_troca_excecao",
  // MULTI (vários UUIDs separados por vírgula): quem aprova a devolução da peça
  // quando a reserva do crediário vira vale-crédito (endpoint reserva/.../devolver-peca).
  "aprovadores_devolver_peca",
  // Fase 3b (centralização de aprovações, 12/07): aprova conversão de estoque em peso
  // E conversão de SKU — mesmo aprovador pros dois sub-fluxos (decisão do Jonathan).
  "aprovador_conversao",
  // Fase 3c (centralização de aprovações, 12/07): aprova alteração de markup (preço).
  "aprovador_precificacao",
  // Fase 3e (centralização de aprovações, 12/07): aprova a devolução (etapa 1) — 1
  // aprovador só, decisão do Jonathan (não depende mais de dentro/fora do prazo).
  "aprovador_devolucao",
  // Fase 3g.1 (centralização de aprovações, 15/07): aprova solicitação de alteração
  // de venda (campo restrito/pagamento após fechar) — antes era ROLES_FINANCEIRO fixo.
  "aprovador_alteracao_venda",
  // MULTI (vários UUIDs separados por vírgula): quem aprova a Conversão Reversa (ouro
  // do cofre vira peça de estoque) — endpoint conversao-reversa/aprovar|recusar.
  // Plugada na camada config-first nesta mesma sessão (15/07) — config vazia ->
  // nao_configurado (ninguém decide, nem admin), sem fallback de cargo.
  "aprovadores_conversao_reversa",
  // MULTI: quem aprova abrir garantia DEPOIS dos 7 dias úteis da entrega, para
  // serviços não vitalícios (regra do Jonathan, 17/07 — docs/regras-negocio/ordens.md).
  // NÃO cobre venda não entregue: essa trava é seca, sem saída por aprovação.
  "aprovadores_garantia_fora_prazo",
  // MULTI (vários UUIDs separados por vírgula): pool de quem pode liberar/recusar
  // uma solicitação de frete avulso feita pela consultora (migration 353, modelo
  // TAREFA/POOL, camada config-first — evento "frete_avulso" em
  // src/lib/aprovacoes/catalogo.ts). Substitui a antiga tabela
  // frete_avulso_liberadores — qualquer um da lista decide a MESMA tarefa de
  // aprovação (ver módulo Tarefas, tipo 'frete_avulso'). Espelha exatamente o
  // padrão de aprovadores_devolver_peca.
  "aprovadores_frete_avulso",
  // MULTI (migration 354, 21/07 — regra "quem paga"): lista SEPARADA de quem
  // autoriza o CUSTO quando o frete avulso solicitado é pago pela LOJA (não
  // pelo cliente) — evento 'frete_avulso_loja' em
  // src/lib/aprovacoes/catalogo.ts. Espelha exatamente o padrão de
  // aprovadores_frete_avulso (mesma tarefa, chave diferente conforme quem paga).
  "aprovadores_frete_avulso_loja",
  // SINGLE (UUID único — não é MULTI): gerente dona do saldo de frete grátis
  // (verba de 0,1% do faturamento mensal). Antes escolhida arbitrariamente
  // por `WHERE role='gerente_loja' AND ativo=true ORDER BY created_at LIMIT
  // 1` em 2 lugares (bug latente com múltiplas gerentes ativas) — agora
  // configurável aqui. Fonte única de leitura: resolverGerenteFreteGratisId
  // (src/lib/entrega-venda.ts), com fallback ao comportamento antigo quando
  // vazia (zero impacto até o Jonathan configurar).
  "gerente_frete_gratis",
] as const;

// Chaves NUMÉRICAS (%) — não são UUID de aprovador, são o limiar que decide
// SE precisa de aprovação (Fase 5, 15/07). Ficaram só no banco no pacote
// original ("UI fica pra depois") — Jonathan pediu a tela em 16/07.
const CHAVES_NUMERICAS = [
  // Sem cadastro de mx_desconto_permitido, este é o teto (fallback do fallback:
  // FALLBACK_TETO_DESCONTO_PCT=0 em precificar-item.ts se a chave nem existir).
  "desconto_fallback_sem_cadastro_pct",
  // Acima deste %, pagamento em Cartão de Crédito exige aprovação (era hardcoded
  // 20 em 4 lugares — ver LIMITE_DESCONTO_CARTAO_PADRAO em precificar-item.ts).
  "limite_desconto_cartao_pct",
] as const;

// GET /api/configuracoes/aprovadores
// Retorna a config atual + lista de usuários elegíveis por role
export async function GET() {
  try {
    // Ler valores atuais — busca TODAS as chaves, incluindo a já existente
    const configs = await sql`
      SELECT chave, valor FROM alissonerp.configuracoes_sistema
      WHERE chave = ANY(${[...CHAVES, ...CHAVES_NUMERICAS]})
    `;
    const configMap = new Map(configs.map((r: any) => [r.chave, r.valor]));

    // Listar usuários elegíveis
    const gerentes = await sql`
      SELECT id, nome FROM alissonerp.usuarios
      WHERE role = 'gerente_loja' AND ativo = true ORDER BY nome
    `;
    const diretoresAdmins = await sql`
      SELECT id, nome, role FROM alissonerp.usuarios
      WHERE role IN ('diretor', 'admin', 'desenvolvedor') AND ativo = true
      ORDER BY CASE role WHEN 'diretor' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END, nome
    `;
    const adminsDevs = await sql`
      SELECT id, nome FROM alissonerp.usuarios
      WHERE role IN ('admin', 'desenvolvedor') AND ativo = true ORDER BY nome
    `;
    const aprovadoresMetal = await sql`
      SELECT id, nome, role FROM alissonerp.usuarios
      WHERE role IN ('admin', 'desenvolvedor', 'gerente_fabrica', 'gerente_loja')
        AND ativo = true
      ORDER BY
        CASE role
          WHEN 'admin' THEN 1
          WHEN 'desenvolvedor' THEN 2
          WHEN 'gerente_fabrica' THEN 3
          WHEN 'gerente_loja' THEN 4
          ELSE 9
        END,
        nome
    `;
    const aprovadoresLimpeza = await sql`
      SELECT id, nome, role FROM alissonerp.usuarios
      WHERE role IN ('admin', 'desenvolvedor', 'gerente_fabrica', 'gerente_loja')
        AND ativo = true
      ORDER BY nome
    `;
    /**
     * REGRA DE NEGOCIO: entrega com pagamento incompleto baixa estoque de loja,
     * entao o aprovador deve ser alguem com alçada de baixa/financeiro.
     * IMPACTO SE AMPLIADO: consultora poderia liberar estoque sem pagamento total.
     */
    const aprovadoresEntregaSemPagamento = await sql`
      SELECT id, nome, role FROM alissonerp.usuarios
      WHERE role IN ('admin', 'desenvolvedor', 'diretor', 'gerente_fabrica', 'gerente_loja')
        AND ativo = true
      ORDER BY
        CASE role
          WHEN 'diretor' THEN 1
          WHEN 'admin' THEN 2
          WHEN 'desenvolvedor' THEN 3
          WHEN 'gerente_fabrica' THEN 4
          WHEN 'gerente_loja' THEN 5
          ELSE 9
        END,
        nome
    `;

    // Lista ABERTA — qualquer usuário ativo pode ser escolhido como aprovador de
    // devolução fora do prazo (decisão Jonathan 15/06/2026).
    const todosUsuarios = await sql`
      SELECT id, nome, role FROM alissonerp.usuarios
      WHERE ativo = true ORDER BY nome
    `;

    // Fase 3e: elegíveis pra aprovar devolução (etapa 1) — mesmo conjunto de cargos
    // do antigo fallback de src/lib/devolucoes.ts (gerente_loja→diretor→admin→dev),
    // agora só como lista de escolha na tela (não mais fallback automático).
    const aprovadoresDevolucao = await sql`
      SELECT id, nome, role FROM alissonerp.usuarios
      WHERE role IN ('gerente_loja', 'diretor', 'admin', 'desenvolvedor') AND ativo = true
      ORDER BY
        CASE role
          WHEN 'gerente_loja' THEN 1
          WHEN 'diretor' THEN 2
          WHEN 'admin' THEN 3
          ELSE 4
        END,
        nome
    `;

    return NextResponse.json({
      aprovador_credito_diretor: configMap.get("aprovador_credito_diretor") ?? "",
      aprovador_desconto_padrao: configMap.get("aprovador_desconto_padrao") ?? "",
      aprovador_cartao_desconto_padrao: configMap.get("aprovador_cartao_desconto_padrao") ?? "",
      aprovadora_credito_gerente: configMap.get("aprovadora_credito_gerente") ?? "",
      aprovador_compra_comercial: configMap.get("aprovador_compra_comercial") ?? "",
      metal_aprovador_id: configMap.get("metal_aprovador_id") ?? "",
      aprovador_limpeza: configMap.get("aprovador_limpeza") ?? "",
      aprovador_entrega_sem_pagamento: configMap.get("aprovador_entrega_sem_pagamento") ?? "",
      aprovador_devolucao_fora_prazo: configMap.get("aprovador_devolucao_fora_prazo") ?? "",
      aprovador_devolucao_estoque: configMap.get("aprovador_devolucao_estoque") ?? "",
      aprovador_vale_troca_excecao: configMap.get("aprovador_vale_troca_excecao") ?? "",
      // MULTI: lista de UUIDs separados por vírgula.
      aprovadores_devolver_peca: configMap.get("aprovadores_devolver_peca") ?? "",
      aprovador_conversao: configMap.get("aprovador_conversao") ?? "",
      aprovador_precificacao: configMap.get("aprovador_precificacao") ?? "",
      aprovador_devolucao: configMap.get("aprovador_devolucao") ?? "",
      aprovador_alteracao_venda: configMap.get("aprovador_alteracao_venda") ?? "",
      aprovadores_conversao_reversa: configMap.get("aprovadores_conversao_reversa") ?? "",
      aprovadores_garantia_fora_prazo: configMap.get("aprovadores_garantia_fora_prazo") ?? "",
      // MULTI: pool de liberadores do frete avulso solicitado (migration 353).
      aprovadores_frete_avulso: configMap.get("aprovadores_frete_avulso") ?? "",
      // MULTI (migration 354): pool de quem autoriza o CUSTO quando pagante='loja'.
      aprovadores_frete_avulso_loja: configMap.get("aprovadores_frete_avulso_loja") ?? "",
      // SINGLE: gerente dona do saldo de frete grátis (verba mensal 0,1% do faturamento).
      gerente_frete_gratis: configMap.get("gerente_frete_gratis") ?? "",
      // Fase 5 (15/07): limites numéricos (%), não são UUID de aprovador — ver CHAVES_NUMERICAS.
      desconto_fallback_sem_cadastro_pct: configMap.get("desconto_fallback_sem_cadastro_pct") ?? "0",
      limite_desconto_cartao_pct: configMap.get("limite_desconto_cartao_pct") ?? "20",
      usuarios: {
        gerentes,
        diretores_admins: diretoresAdmins,
        admins_devs: adminsDevs,
        metal_aprovadores: aprovadoresMetal,
        aprovadores_limpeza: aprovadoresLimpeza,
        aprovadores_entrega_sem_pagamento: aprovadoresEntregaSemPagamento,
        todos_usuarios: todosUsuarios,
        // Conversão (estoque + SKU) hoje é aprovada por admin/desenvolvedor — mesma
        // lista já usada por desconto/cartão/compra comercial (admins_devs).
        conversao_aprovadores: adminsDevs,
        // Precificação hoje é isFullAccess (admin/dev/diretor) — reusa diretores_admins.
        precificacao_aprovadores: diretoresAdmins,
        devolucao_aprovadores: aprovadoresDevolucao,
      },
    });
  } catch {
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

// PUT /api/configuracoes/aprovadores
// Atualiza a configuração dos aprovadores (só admin/dev)
export async function PUT(req: NextRequest) {
  try {
    const user = await requireAuth();
    if (!isFullAccess(user.role)) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }
    const body = await req.json() as Record<string, string>;

    const updates: { chave: string; valor: string }[] = [];
    if (body.aprovador_credito_diretor !== undefined) {
      updates.push({ chave: "aprovador_credito_diretor", valor: body.aprovador_credito_diretor });
    }
    if (body.aprovador_desconto_padrao !== undefined) {
      updates.push({ chave: "aprovador_desconto_padrao", valor: body.aprovador_desconto_padrao });
    }
    if (body.aprovador_cartao_desconto_padrao !== undefined) {
      updates.push({ chave: "aprovador_cartao_desconto_padrao", valor: body.aprovador_cartao_desconto_padrao });
    }
    if (body.aprovadora_credito_gerente !== undefined) {
      updates.push({ chave: "aprovadora_credito_gerente", valor: body.aprovadora_credito_gerente });
    }
    if (body.aprovador_compra_comercial !== undefined) {
      updates.push({ chave: "aprovador_compra_comercial", valor: body.aprovador_compra_comercial });
    }
    if (body.metal_aprovador_id !== undefined) {
      updates.push({ chave: "metal_aprovador_id", valor: body.metal_aprovador_id });
    }
    /**
     * REGRA DE NEGÓCIO: aprovador da limpeza de metal (sangria) precisa ser
     * persistido em configuracoes_sistema para liberar o fluxo
     * recebido -> em_limpeza -> aguardando_aprovacao -> concluido.
     *
     * O QUE: grava a chave `aprovador_limpeza` quando enviada pelo front.
     * POR QUE: as APIs de limpeza/aprovação validam essa chave antes de
     * permitir iniciar/concluir/aprovar.
     * IMPACTO SE REMOVIDO: UI aparenta salvar, mas backend continua acusando
     * "Aprovador de limpeza não configurado" (erro 409).
     */
    if (body.aprovador_limpeza !== undefined) {
      updates.push({ chave: "aprovador_limpeza", valor: body.aprovador_limpeza });
    }
    /**
     * REGRA DE NEGOCIO: Automacao de Estoque 2.0 permite entregar com saldo
     * aberto apenas com aprovador configurado. A chave roteia a tarefa de
     * excecao; sem ela, o backend bloqueia a entrega incompleta.
     * IMPACTO SE REMOVIDO: pedidos poderiam ficar sem responsavel claro para
     * liberar baixa de estoque antes da quitacao total.
     */
    if (body.aprovador_entrega_sem_pagamento !== undefined) {
      updates.push({ chave: "aprovador_entrega_sem_pagamento", valor: body.aprovador_entrega_sem_pagamento });
    }
    // Aprovador de devolução fora do prazo (lista aberta — qualquer usuário ativo).
    if (body.aprovador_devolucao_fora_prazo !== undefined) {
      updates.push({ chave: "aprovador_devolucao_fora_prazo", valor: body.aprovador_devolucao_fora_prazo });
    }
    // B3: aprovador do estoque — conferência da devolução antes de gerar o vale.
    if (body.aprovador_devolucao_estoque !== undefined) {
      updates.push({ chave: "aprovador_devolucao_estoque", valor: body.aprovador_devolucao_estoque });
    }
    // A1: aprovador de exceção do vale — libera quando a confirmação por WhatsApp falha.
    if (body.aprovador_vale_troca_excecao !== undefined) {
      updates.push({ chave: "aprovador_vale_troca_excecao", valor: body.aprovador_vale_troca_excecao });
    }
    // MULTI: aprovadores da devolução de peça (venda virou crédito). Vários UUIDs
    // separados por vírgula. Normaliza (tira espaços/vazios/duplicados) antes de gravar.
    if (body.aprovadores_devolver_peca !== undefined) {
      const lista = Array.from(new Set(
        String(body.aprovadores_devolver_peca).split(",").map((s) => s.trim()).filter(Boolean)
      )).join(",");
      updates.push({ chave: "aprovadores_devolver_peca", valor: lista });
    }
    // Fase 3b: aprovador de conversão (estoque + SKU — mesma chave pros dois).
    if (body.aprovador_conversao !== undefined) {
      updates.push({ chave: "aprovador_conversao", valor: body.aprovador_conversao });
    }
    // Fase 3c: aprovador de precificação (alteração de markup).
    if (body.aprovador_precificacao !== undefined) {
      updates.push({ chave: "aprovador_precificacao", valor: body.aprovador_precificacao });
    }
    // Fase 3e: aprovador da devolução (etapa 1) — 1 aprovador só, sem distinção de prazo.
    if (body.aprovador_devolucao !== undefined) {
      updates.push({ chave: "aprovador_devolucao", valor: body.aprovador_devolucao });
    }
    // Fase 3g.1: aprovador de alteração de venda (antes ROLES_FINANCEIRO fixo).
    if (body.aprovador_alteracao_venda !== undefined) {
      updates.push({ chave: "aprovador_alteracao_venda", valor: body.aprovador_alteracao_venda });
    }
    // MULTI: aprovadores da conversão reversa. Vários UUIDs separados por vírgula.
    if (body.aprovadores_conversao_reversa !== undefined) {
      const lista = Array.from(new Set(
        String(body.aprovadores_conversao_reversa).split(",").map((s) => s.trim()).filter(Boolean)
      )).join(",");
      updates.push({ chave: "aprovadores_conversao_reversa", valor: lista });
    }
    // MULTI (17/07): aprovadores de garantia fora do prazo de 7 dias úteis.
    // Vários UUIDs separados por vírgula. Ver docs/regras-negocio/ordens.md §3.
    if (body.aprovadores_garantia_fora_prazo !== undefined) {
      const lista = Array.from(new Set(
        String(body.aprovadores_garantia_fora_prazo).split(",").map((s) => s.trim()).filter(Boolean)
      )).join(",");
      updates.push({ chave: "aprovadores_garantia_fora_prazo", valor: lista });
    }
    // MULTI: pool de liberadores do frete avulso (migration 353, modelo TAREFA/POOL).
    // Normaliza igual ao bloco de aprovadores_devolver_peca acima.
    if (body.aprovadores_frete_avulso !== undefined) {
      const lista = Array.from(new Set(
        String(body.aprovadores_frete_avulso).split(",").map((s) => s.trim()).filter(Boolean)
      )).join(",");
      updates.push({ chave: "aprovadores_frete_avulso", valor: lista });
    }
    // MULTI (migration 354, regra "quem paga"): pool separado de quem autoriza
    // o custo do frete avulso quando pagante='loja'. Normaliza igual ao bloco acima.
    if (body.aprovadores_frete_avulso_loja !== undefined) {
      const lista = Array.from(new Set(
        String(body.aprovadores_frete_avulso_loja).split(",").map((s) => s.trim()).filter(Boolean)
      )).join(",");
      updates.push({ chave: "aprovadores_frete_avulso_loja", valor: lista });
    }
    // SINGLE (BLOCO 1, 21/07): gerente do saldo de frete grátis — 1 UUID só,
    // sem normalização de lista (não é MULTI). Vazio = fallback antigo
    // (ORDER BY created_at) em resolverGerenteFreteGratisId.
    if (body.gerente_frete_gratis !== undefined) {
      updates.push({ chave: "gerente_frete_gratis", valor: body.gerente_frete_gratis });
    }
    // Fase 5 (15/07, tela adicionada 16/07): limites em % — valida 0-100, número.
    // Sem isso gravado errado, o fallback do código (0 / 20) nunca é sobrescrito
    // e o comportamento muda silenciosamente sem avisar ninguém.
    for (const chaveNum of CHAVES_NUMERICAS) {
      const bodyRec = body as unknown as Record<string, string>;
      if (bodyRec[chaveNum] === undefined) continue;
      const n = Number(bodyRec[chaveNum]);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        return NextResponse.json({ error: `${chaveNum}: precisa ser um número entre 0 e 100` }, { status: 400 });
      }
      updates.push({ chave: chaveNum, valor: String(n) });
    }

    for (const u of updates) {
      await sql`
        INSERT INTO alissonerp.configuracoes_sistema (chave, valor)
        VALUES (${u.chave}, ${u.valor})
        ON CONFLICT (chave) DO UPDATE SET valor = ${u.valor}
      `;
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
