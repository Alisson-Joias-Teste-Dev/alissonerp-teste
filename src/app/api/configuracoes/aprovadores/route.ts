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
  // MULTI (vários UUIDs separados por vírgula): pool de quem pode liberar/recusar
  // uma solicitação de frete avulso feita pela consultora (migration 353, modelo
  // TAREFA/POOL). Substitui a antiga tabela frete_avulso_liberadores — qualquer
  // um da lista decide a MESMA tarefa de aprovação (ver módulo Tarefas, tipo
  // 'frete_avulso'). Espelha exatamente o padrão de aprovadores_devolver_peca.
  "aprovadores_frete_avulso",
] as const;

// GET /api/configuracoes/aprovadores
// Retorna a config atual + lista de usuários elegíveis por role
export async function GET() {
  try {
    // Ler valores atuais — busca TODAS as chaves, incluindo a já existente
    const configs = await sql`
      SELECT chave, valor FROM alissonerp.configuracoes_sistema
      WHERE chave = ANY(${CHAVES})
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
      // MULTI: pool de liberadores do frete avulso solicitado (migration 353).
      aprovadores_frete_avulso: configMap.get("aprovadores_frete_avulso") ?? "",
      usuarios: {
        gerentes,
        diretores_admins: diretoresAdmins,
        admins_devs: adminsDevs,
        metal_aprovadores: aprovadoresMetal,
        aprovadores_limpeza: aprovadoresLimpeza,
        aprovadores_entrega_sem_pagamento: aprovadoresEntregaSemPagamento,
        todos_usuarios: todosUsuarios,
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
    // MULTI: pool de liberadores do frete avulso (migration 353, modelo TAREFA/POOL).
    // Normaliza igual ao bloco de aprovadores_devolver_peca acima.
    if (body.aprovadores_frete_avulso !== undefined) {
      const lista = Array.from(new Set(
        String(body.aprovadores_frete_avulso).split(",").map((s) => s.trim()).filter(Boolean)
      )).join(",");
      updates.push({ chave: "aprovadores_frete_avulso", valor: lista });
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
