// ═══════════════════════════════════════════════════════════════════════════
// Resposta à Aprovação de Tarefa
//
// REGRA DE NEGÓCIO #1: cada handler (cartao_desconto, desconto, credito)
//   limpa SEU próprio campo em vendas_erp. Nunca mexer no campo do outro.
//   - cartao_desconto → limpa aprovacao_cartao_desconto_tarefa_id
//   - desconto        → limpa aprovacao_desconto_tarefa_id
//   - credito         → limpa aprovacao_credito_tarefa_id
//   Se alterar: manter esta separação. Um campo não pode afetar o outro.
//
// REGRA DE NEGÓCIO #2 (Bug 3): toda aprovação passa SÓ pela página de tarefas.
//   Removeu-se o botão "Aprovar" inline na notificação porque ele não
//   reduzia a comissão (0,5%) como a aprovação via tarefa fazia.
//   Se alterar: garantir que aprovação pela notificação tenha os MESMOS
//   efeitos colaterais que aprovação pela tarefa.
// ═══════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { processarDecisao } from "@/lib/aprovacao-regras";
import { internalError } from "@/lib/api-error";
import { zodError } from "@/lib/schemas/common";
import { processarAprovacaoQuebraLimpeza } from "@/lib/limpeza-ouro-aprovacao";
import { criarNotificacao } from "@/lib/notificacoes";
import { ENTREGA_SEM_PAGAMENTO_TIPO, processarAprovacaoEntregaSemPagamento } from "@/lib/entrega-sem-pagamento";
import { liberarFreteAvulsoNoTx, recusarFreteAvulsoNoTx } from "@/lib/entrega-venda";
import { podeDecidir, eventoDaTarefa } from "@/lib/aprovacoes";

/**
 * REGRA DE NEGÓCIO (BLOCO 1, jul/2026 — guard de idempotência): sinaliza que o
 * UPDATE de aprovacoes_tarefa não afetou nenhuma linha porque status já não é
 * mais 'pendente' — outra decisão já rodou (reenvio do mesmo PATCH, ou 2º
 * aprovador concorrente decidindo ao mesmo tempo). Vira 409 pro cliente;
 * NUNCA reprocessa a decisão nem os efeitos colaterais dela.
 * IMPACTO SE REMOVIDO: reenviar o PATCH (ex.: duplo-clique, retry de rede)
 * re-executa a decisão inteira — no frete avulso isso lançaria o saldo da
 * gerente em dobro.
 */
class AprovacaoJaRespondidaError extends Error {
  constructor() {
    super("Esta aprovação já foi respondida por outro aprovador.");
    this.name = "AprovacaoJaRespondidaError";
  }
}

/**
 * REGRA DE NEGÓCIO: erro de domínio que precisa de um status HTTP específico
 * (não 500) quando estourado DENTRO da transação do dispatcher — ex.: entrega
 * de frete avulso não encontrada para a tarefa (404). Sem isto, qualquer throw
 * dentro do sql.begin cairia no catch genérico e viraria 500 via internalError.
 */
class ErroComStatus extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "ErroComStatus";
  }
}

/**
 * REGRA DE NEGÓCIO (BLOCO 2, jul/2026 — mensagem clara de auto-aprovação):
 * traduz o `motivo` de ResultadoDecisao (src/lib/aprovacoes/autoridade.ts) pra
 * texto que o solicitante entende, SÓ pro caso "você é o único do pool e não
 * pode aprovar o próprio pedido" (motivo "aprovador_e_o_proprio_solicitante").
 * Os demais motivos (não configurado, não é aprovador) continuam com o "Sem
 * permissão" genérico de sempre — não é o caso que precisa de explicação
 * (o Jonathan pediu mensagem clara especificamente pro caso de segregação de
 * função ficar sem ninguém pra decidir).
 * IMPACTO SE REMOVIDO: quem solicita e é o único aprovador configurado vê
 * "Sem permissão" sem entender que a solução é configurar mais um aprovador.
 */
function mensagemNegacaoAprovacao(motivo: string | undefined): string {
  if (motivo === "aprovador_e_o_proprio_solicitante") {
    return "Você solicitou este frete avulso — quem solicita não pode aprovar o próprio pedido. " +
      "No momento não há outro aprovador configurado nesse pool; peça para adicionar mais alguém " +
      "em Configurações › Aprovadores.";
  }
  return "Sem permissão";
}

const AprovacaoTarefaPostSchema = z.object({
  aprovador_id: z.string().min(1, "obrigatório"),
}).passthrough();

const AprovacaoTarefaPatchSchema = z.object({
  aprovacao_id: z.coerce.number().int().positive(),
  decisao: z.enum(["aprovado", "rejeitado"]),
  motivo: z.string().optional(),
}).passthrough();

async function processarAprovacaoCompraComercial(
  tarefaId: number,
  decisao: "aprovado" | "rejeitado",
  aprovadorId: string,
  motivo?: string,
) {
  // REGRA DE NEGOCIO:
  // - O que faz: ao aprovar compra comercial, executa entrada no estoque e gera contas a pagar.
  // - Por que: pagamento operacional ocorre via contas a pagar e só após aprovação formal.
  // - Impacto se alterado/removido: compra pode ficar aprovada sem reflexo em estoque/financeiro.
  const [compra] = await sql`
    SELECT id, fornecedor_id, local_estoque_id, qtd_parcelas, primeiro_vencimento, created_by, situacao, bloqueado, tarefa_aprovacao_id
    FROM alissonerp.compras_comercial
    WHERE tarefa_aprovacao_id = ${tarefaId}
    LIMIT 1
  `;

  if (!compra) return { ok: false, motivo: "compra_nao_encontrada" };

  if (decisao === "rejeitado") {
    await sql`
      UPDATE alissonerp.compras_comercial
      SET
        situacao = 'rejeitado',
        bloqueado = false,
        aprovado_por = ${aprovadorId}::uuid,
        data_decisao = NOW(),
        motivo_rejeicao = ${motivo ?? 'Rejeitada na aprovação'}
      WHERE id = ${compra.id}
    `;
    return { ok: true, decisao };
  }

  const itens = await sql`
    SELECT produto_id, qtd, valor_total
    FROM alissonerp.itens_compra_comercial
    WHERE compra_comercial_id = ${compra.id}
    ORDER BY id
  `;

  if (!Array.isArray(itens) || itens.length === 0) {
    throw new Error("Compra comercial sem itens para aprovação");
  }

  // REGRA DE NEGOCIO:
  // - O que faz: executa aprovacao em transacao unica para manter estoque, financeiro e status consistentes.
  // - Por que: se qualquer etapa falhar, nenhuma parte da aprovacao pode ficar aplicada parcialmente.
  // - Impacto se alterado/removido: risco de compra aprovada sem contas a pagar ou sem entrada de estoque.
  await sql.begin(async (tx: any) => {
    const [tot] = await tx`
      SELECT COALESCE(SUM(valor_total), 0) AS total
      FROM alissonerp.itens_compra_comercial
      WHERE compra_comercial_id = ${compra.id}
    `;
    const totalCompra = Number(tot?.total ?? 0);

    // REGRA DE NEGOCIO (Fase 4, item 4 — guard R4 anti-duplicação de estoque):
    // - O que faz: pula o loop de INSERT em movimentacoes_estoque_comercial se esta compra já
    //   gerou a entrada (mesmo motivo + mesma observação, que carrega o "#<id> aprovada" único).
    // - Por que: não existe coluna própria compra_comercial_id em
    //   movimentacoes_estoque_comercial (confirmado via information_schema.columns — só há
    //   referencia_id/referencia_tipo genéricos, não usados por este insert) — o casamento
    //   possível é por motivo+observação, que já é único por compra (o texto sempre termina em
    //   "#<id> aprovada", sem colisão com outro id: "#5 aprovada" não é substring de "#50
    //   aprovada"). Se a compra for reprocessada (ex.: reaprovação após erro parcial) o estoque
    //   duplicaria a entrada.
    // - Impacto se alterado/removido: reprocessar a aprovação duplica a entrada de estoque.
    const [jaTemEstoque] = await tx`
      SELECT 1 FROM alissonerp.movimentacoes_estoque_comercial
      WHERE motivo = 'compra_comercial_aprovada'
        AND observacao LIKE ${`%compra comercial #${compra.id} aprovada%`}
      LIMIT 1
    `;

    for (const item of jaTemEstoque ? [] : itens) {
      // REGRA DE NEGOCIO:
      // - O que faz: normaliza qtd para inteiro antes do insert no estoque.
      // - Por que: a coluna quantidade e INTEGER no banco e compras comerciais usam pecas inteiras.
      // - Impacto se alterado/removido: valores decimais quebram o insert com erro 22P02.
      const qtdNum = Number(item.qtd);
      if (!Number.isFinite(qtdNum) || qtdNum <= 0 || !Number.isInteger(qtdNum)) {
        throw new Error(
          `Quantidade invalida na compra comercial #${compra.id}: produto ${item.produto_id}, qtd=${JSON.stringify(item.qtd)}. Apenas inteiros positivos sao aceitos.`
        );
      }
      await tx`
        INSERT INTO alissonerp.movimentacoes_estoque_comercial
          (produto_id, tipo, quantidade, motivo, local_estoque_id, status, observacao, created_by)
        VALUES
          (
            ${item.produto_id},
            'entrada',
            ${qtdNum},
            'compra_comercial_aprovada',
            ${compra.local_estoque_id},
            'efetivado',
            ${`Entrada via compra comercial #${compra.id} aprovada`},
            ${compra.created_by ?? aprovadorId}::uuid
          )
      `;
    }

    const parcelas = Math.max(Number(compra.qtd_parcelas ?? 1), 1);
    const base = Math.round((totalCompra / parcelas) * 100) / 100;
    const somaBase = Math.round(base * parcelas * 100) / 100;
    const diff = Math.round((totalCompra - somaBase) * 100) / 100;

    const [forn] = await tx`
      SELECT nome FROM public.contatos WHERE id_contato = ${compra.fornecedor_id} LIMIT 1
    `;
    const fornecedorNome = String(forn?.nome ?? "Fornecedor");

    // REGRA DE NEGOCIO (Fase 4, item 4 — guard R4 anti-duplicação financeira):
    // - O que faz: pula o loop de INSERT em contas_pagar se esta compra já tem parcela gerada
    //   (coluna própria compra_comercial_id, confirmada via information_schema.columns e já usada
    //   pelo guard EXISTS da trigger 331 fn_gerar_conta_pagar_chegada_comercial).
    // - Por que: a "chegada" (trigger 331) já pode ter gerado as parcelas antes desta aprovação
    //   rodar — sem o guard, reprocessar a aprovação duplicaria as contas a pagar.
    // - Impacto se alterado/removido: compra que já teve chegada processada ganha parcelas
    //   duplicadas ao ser aprovada.
    const [jaTemContaPagar] = await tx`
      SELECT 1 FROM alissonerp.contas_pagar WHERE compra_comercial_id = ${compra.id} LIMIT 1
    `;

    for (let i = 1; i <= (jaTemContaPagar ? 0 : parcelas); i++) {
      const valorParcela = i === parcelas ? Math.round((base + diff) * 100) / 100 : base;
      await tx`
        INSERT INTO alissonerp.contas_pagar
          (descricao, fornecedor_id, fornecedor_nome, compra_comercial_id, valor, data_vencimento, situacao, categoria, created_by, obs)
        VALUES
          (
            ${`Compra Comercial #${compra.id} - Parcela ${i}/${parcelas}`},
            ${compra.fornecedor_id},
            ${fornecedorNome},
            ${compra.id},
            ${valorParcela},
            ${(sql`${compra.primeiro_vencimento}::date + ${`${i - 1} month`}::interval`)},
            'pendente',
            'compra_comercial',
            ${compra.created_by ?? aprovadorId}::uuid,
            ${`Gerado automaticamente na aprovação da compra comercial #${compra.id}`}
          )
      `;
    }

    await tx`
      UPDATE alissonerp.compras_comercial
      SET
        situacao = 'aprovado',
        bloqueado = true,
        total = ${totalCompra},
        aprovado_por = ${aprovadorId}::uuid,
        data_decisao = NOW(),
        motivo_rejeicao = NULL
      WHERE id = ${compra.id}
    `;
  });

  return { ok: true, decisao };
}

// ─── Handler específico para Recebimento de Metal ─────────────────────────
async function processarAprovacaoRecebimentoMetal(
  tarefaId: number,
  decisao: "aprovado" | "rejeitado",
  aprovadorId: string,
  motivo?: string,
) {
  const [receb] = await sql`
    SELECT * FROM alissonerp.recebimentos_metal
    WHERE tarefa_aprovacao_id = ${tarefaId}
    LIMIT 1
  `;
  if (!receb) throw new Error("Recebimento de metal não encontrado para esta tarefa");

  const { aprovarRecebimentoMetal, rejeitarRecebimentoMetal } = await import("@/lib/metal/recebimentos");

  if (decisao === "aprovado") {
    await aprovarRecebimentoMetal(receb.id, aprovadorId);
  } else {
    await rejeitarRecebimentoMetal(receb.id, aprovadorId, motivo);
  }

  return { ok: true, decisao };
}

// ─── Handler específico para Compra de Metal ──────────────────────────────
async function processarAprovacaoCompraMetal(
  tarefaId: number,
  decisao: "aprovado" | "rejeitado",
  user: { id: string; role: string | null },
  motivo?: string,
) {
  // REGRA DE NEGÓCIO: este é um caminho LATENTE (o front usa os endpoints
  // dedicados /api/metal/aprovacoes/[id]/{aprovar,rejeitar}) — mas se for
  // acionado, tem que respeitar a MESMA autoridade config-first, não a checagem
  // genérica do topo do PATCH (L326-333, que serve os outros fluxos e não muda).
  const decisaoAutorizada = await podeDecidir(user, "compra_metal");
  if (!decisaoAutorizada.pode) {
    return { ok: false, motivo: "sem_permissao" };
  }
  const aprovadorId = user.id;

  const [compra] = await sql`
    SELECT * FROM alissonerp.compras_metal
    WHERE tarefa_aprovacao_id = ${tarefaId}
    LIMIT 1
  `;
  if (!compra) throw new Error("Compra de metal não encontrada para esta tarefa");

  if (decisao === "aprovado") {
    await sql`
      UPDATE alissonerp.compras_metal
      SET status = 'pendente_pagamento',
          updated_at = now()
      WHERE id = ${compra.id}
    `;
    await sql`
      UPDATE alissonerp.compras_metal_aprovacoes
      SET status = 'aprovado',
          aprovador_id = ${aprovadorId}::uuid,
          updated_at = now()
      WHERE compra_id = ${compra.id} AND status = 'pendente'
    `;
  } else {
    await sql`
      UPDATE alissonerp.compras_metal
      SET status = 'cancelado',
          updated_at = now()
      WHERE id = ${compra.id}
    `;
    await sql`
      UPDATE alissonerp.compras_metal_aprovacoes
      SET status = 'rejeitado',
          aprovador_id = ${aprovadorId}::uuid,
          motivo = ${motivo ?? "Rejeitado pelo aprovador"},
          updated_at = now()
      WHERE compra_id = ${compra.id} AND status = 'pendente'
    `;
  }

  return { ok: true, decisao };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;

  const aprovacoes = await sql`
    SELECT
      a.id, a.tarefa_id, a.status, a.motivo, a.created_at, a.respondido_em,
      us.nome AS solicitante_nome,
      ua.nome AS aprovador_nome,
      a.solicitante_id, a.aprovador_id
    FROM alissonerp.aprovacoes_tarefa a
    LEFT JOIN alissonerp.usuarios us ON us.id = a.solicitante_id
    LEFT JOIN alissonerp.usuarios ua ON ua.id = a.aprovador_id
    WHERE a.tarefa_id = ${Number(id)}
    ORDER BY a.created_at DESC
  `;

  return NextResponse.json(aprovacoes);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const raw = await req.json().catch(() => ({}));
  const parsed = AprovacaoTarefaPostSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;

  await sql`
    UPDATE alissonerp.tarefas SET status = 'aguardando_aprovacao', updated_at = now()
    WHERE id = ${Number(id)}
  `;

  const [aprovacao] = await sql`
    INSERT INTO alissonerp.aprovacoes_tarefa (tarefa_id, solicitante_id, aprovador_id, status)
    VALUES (${Number(id)}, ${user.id}::uuid, ${body.aprovador_id}::uuid, 'pendente')
    RETURNING id
  `;

  await sql`
    INSERT INTO alissonerp.tarefas_historico (tarefa_id, usuario_id, acao, created_at)
    VALUES (${Number(id)}, ${user.id}::uuid, 'aguardando_aprovacao', now())
  `.catch(() => {});

  const [tarefaTitulo] = await sql`
    SELECT titulo FROM alissonerp.tarefas WHERE id = ${Number(id)}
  `;
  await criarNotificacao({
    usuarioId: body.aprovador_id,
    tipo: "aprovacao",
    titulo: "Aprovação solicitada",
    mensagem: tarefaTitulo?.titulo ?? "Tarefa aguardando aprovação",
    remetenteId: user.id,
    link: `/tarefas?abrir=${Number(id)}`,
  }).catch(() => {});

  return NextResponse.json({ id: aprovacao.id }, { status: 201 });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const rawPatch = await req.json().catch(() => ({}));
  const parsedPatch = AprovacaoTarefaPatchSchema.safeParse(rawPatch);
  if (!parsedPatch.success) return zodError(parsedPatch.error);
  const body = parsedPatch.data;

  const [aprovacao] = await sql`
    SELECT * FROM alissonerp.aprovacoes_tarefa
    WHERE id = ${body.aprovacao_id} AND tarefa_id = ${Number(id)}
  `;
  if (!aprovacao) return NextResponse.json({ error: "Aprovação não encontrada" }, { status: 404 });

  const [usuarioLogado] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;

  // REGRA DE NEGÓCIO (BUG 2, item b — docs/regras-negocio/aprovacoes-refatoracao/
  // 19-FASE-7-bugs-pos-merge.md): o SELECT da tarefa (tipo/tags/venda) sobe pra
  // ANTES do portão de permissão (antes era feito só depois das escritas, linha
  // ~391 na versão anterior). eventoDaTarefa precisa desses dados pra saber qual
  // evento do CATÁLOGO decide quem pode responder — sem isso o portão só
  // enxergava o UUID gravado em aprovacoes_tarefa.aprovador_id (BUG 1).
  // IMPACTO SE REMOVIDO/MOVIDO: o portão volta a decidir sem saber o evento —
  // mesmo bug do 2º aprovador configurado tomando 403.
  // REGRA DE NEGÓCIO (BLOCO 2, jul/2026 — pool decidido pelo DADO, não pela tag):
  // join com entregas_venda pelo mesmo vínculo tarefa_aprovacao_id (migration 353)
  // que já é usado em tarefas/[id]/route.ts (GET) e listarAprovadoresFreteAvulso* —
  // traz `pagante` (migration 354) pra dentro de tarefaInfo, com o MESMO alias
  // `frete_pagante` do GET, pra alimentar eventoDaTarefa. Substitui a leitura da
  // tag `frete_pagante:loja`, que o próprio solicitante podia editar via PATCH
  // /api/tarefas/[id] (tags é array livre, sem validação) e assim escolher qual
  // pool decidia a própria tarefa.
  // IMPACTO SE REMOVIDO: eventoDaTarefa volta a decidir pela tag manipulável —
  // reabre o caminho de trocar a tag pra mudar quem aprova o frete avulso.
  const [tarefaInfo] = await sql`
    SELECT t.venda_id, t.tags, t.tipo,
           ve.aprovacao_credito_tipo,
           ve.situacao AS venda_situacao,
           evfa.pagante AS frete_pagante
    FROM alissonerp.tarefas t
    LEFT JOIN alissonerp.vendas_erp ve ON ve.id = t.venda_id
    LEFT JOIN alissonerp.entregas_venda evfa ON evfa.tarefa_aprovacao_id = t.id
    WHERE t.id = ${Number(id)}
  `;
  const tagsRaw = tarefaInfo?.tags;
  const tags: string[] = Array.isArray(tagsRaw)
    ? tagsRaw
    : (typeof tagsRaw === "string" ? tagsRaw.replace(/[{}"]/g, "").split(",").filter(Boolean) : []);

  // REGRA DE NEGÓCIO (BUG 1 — 19-FASE-7-bugs-pos-merge.md): o portão genérico
  // do PATCH passa a ser "é o aprovador gravado OU a config do evento diz que
  // pode". `isAdminOuDev` SOME de propósito: a política é config-first ESTRITA
  // (03b-config-first-estrito.md) — nem admin/desenvolvedor decide fora da
  // lista configurada. Quando eventoDaTarefa devolve null (tarefa 'geral',
  // 'sangria' — que não são aprovação de negócio), vale só o aprovador gravado,
  // igual ao comportamento de sempre (menos o bypass de admin que havia antes).
  // POR QUÊ: sem isto, o 2º/3º aprovador configurado (não-admin) de um evento
  // com múltiplos aprovadores tomava 403 ao tentar decidir — só quem tinha
  // role admin/desenvolvedor conseguia (achado testando com o dono, 16/07,
  // tarefa 301 de desconto em homolog).
  // IMPACTO SE REMOVIDO: volta o 403 pro 2º/3º aprovador configurado.
  const evento = eventoDaTarefa(tarefaInfo?.tipo ?? null, tags, tarefaInfo);

  // REGRA DE NEGÓCIO (BLOCO 2, jul/2026 — sem auto-aprovação no frete avulso):
  // `ehFreteAvulsoTipo` escopa as duas correções abaixo (exclusão do solicitante
  // + ctx no podeDecidir) SÓ pra este tipo — os outros ~11 tipos deste portão
  // genérico continuam exatamente como estavam (avaliado e reportado: mudar
  // aqui de forma global arriscava dar 403 em fluxo já em produção onde o
  // aprovador_id gravado hoje coincide com o solicitante por outro motivo —
  // não investigado caso a caso; candidato a PR próprio).
  // O BUG: `aprovacoes_tarefa.aprovador_id` é gravado, na criação, com o
  // PRIMEIRO UUID do pool configurado (criarFreteAvulso: responsavelPrincipal =
  // listaAprovadoresFrete[0]) — se quem está SOLICITANDO também está no pool E
  // é o primeiro da lista, `aprovador_id` acaba sendo o próprio UUID do
  // solicitante. Sem esta exclusão, `ehAprovadorGravado` (linha abaixo) dava
  // bypass TOTAL no portão config-first: nem chegava a chamar podeDecidir.
  // IMPACTO SE REMOVIDO: quem está no pool solicita e aprova o PRÓPRIO pedido
  // de frete avulso sozinho, sem segregação de função nenhuma.
  const ehFreteAvulsoTipo = tarefaInfo?.tipo === "frete_avulso";
  const ehAprovadorGravado =
    String(aprovacao.aprovador_id) === user.id &&
    !(ehFreteAvulsoTipo && String(aprovacao.solicitante_id) === user.id);
  let autorizado = ehAprovadorGravado;
  let motivoNegado: string | undefined;
  if (!autorizado && evento) {
    const ctxPodeDecidir = ehFreteAvulsoTipo ? { solicitanteId: String(aprovacao.solicitante_id) } : undefined;
    const decisaoGenerica = await podeDecidir({ id: user.id, role: usuarioLogado?.role ?? null }, evento, ctxPodeDecidir);
    autorizado = decisaoGenerica.pode;
    motivoNegado = decisaoGenerica.motivo;
  }
  if (!autorizado) {
    return NextResponse.json({ error: mensagemNegacaoAprovacao(motivoNegado) }, { status: 403 });
  }

  // REGRA DE NEGÓCIO (BLOCO 1, jul/2026 — frete avulso, pré-checagens ANTES de
  // qualquer escrita): motivo obrigatório na recusa e a checagem de
  // autoridade config-first ESPECÍFICA do evento (frete_avulso /
  // frete_avulso_loja, conforme `evento` acima) rodam aqui, antes do
  // sql.begin — nenhuma escrita acontece se falharem.
  // POR QUÊ: antes desta correção, essas duas checagens só existiam DEPOIS da
  // transação genérica já ter gravado a tarefa como aprovada/rejeitada (o
  // bloco ficava lá embaixo, igual aos outros ~11 tipos) — um 403/400 aqui
  // devolvia erro pro aprovador com a tarefa JÁ decidida no banco.
  // ESCOPO: só frete_avulso. Os demais ~11 tipos continuam com suas checagens
  // de autoridade específicas DEPOIS da transação genérica, sem mudança —
  // generalizar este padrão é candidata a PR próprio (ver comentário maior
  // mais abaixo, dentro da transação).
  // IMPACTO SE REMOVIDO: volta o 403/400 com a tarefa já decidida no banco.
  if (tarefaInfo?.tipo === "frete_avulso") {
    // REGRA DE NEGÓCIO (BLOCO 2, jul/2026): mesmo ctx.solicitanteId do portão
    // genérico acima — esta chamada é redundante em condições normais (o portão
    // já barrou quem não pode chegar até aqui), mas é mantida por defesa em
    // profundidade (comentário original desta pré-checagem, logo abaixo) e
    // porque é ELA quem produz o `motivo` usado na mensagem clara pro caso de
    // auto-aprovação.
    const decFreteAvulsoPreCheck = await podeDecidir(
      { id: user.id, role: usuarioLogado?.role ?? null },
      evento ?? "frete_avulso",
      { solicitanteId: String(aprovacao.solicitante_id) },
    );
    if (!decFreteAvulsoPreCheck.pode) {
      return NextResponse.json({ error: mensagemNegacaoAprovacao(decFreteAvulsoPreCheck.motivo) }, { status: 403 });
    }
    if (body.decisao === "rejeitado" && !body.motivo?.trim()) {
      return NextResponse.json({ error: "Motivo é obrigatório para recusar o frete avulso" }, { status: 400 });
    }
  }

  // REGRA DE NEGÓCIO (BUG 2, item c — cinto e suspensório): as 2 escritas
  // genéricas (status da aprovação + status da tarefa) e o registro de
  // histórico rodam na MESMA transação. O portão acima (BUG 1) já autoriza
  // ANTES de qualquer escrita — isto é proteção extra contra o mapa
  // eventoDaTarefa errar um tipo (ou um handler abaixo negar por outro motivo
  // não previsto): se a transação falhar/for revertida, nenhuma das 2 escritas
  // fica gravada pela metade.
  // POR QUÊ: antes desta correção, essas escritas rodavam SEM transação e
  // ANTES do 403 dos handlers por tipo — a tarefa ficava "aprovada"/"rejeitada"
  // mesmo quando o negócio (venda, estoque, financeiro) não rodava. Mesma
  // classe de bug que travou as vendas 15300/15312/15399/15562 (dossiê
  // comercial.md) — lá a causa era outra, mas o sintoma (tarefa órfã, venda
  // travada) é idêntico.
  // IMPACTO SE REMOVIDO: volta o risco de tarefa órfã (aprovada/rejeitada sem
  // o negócio ter rodado) se o mapa de eventos errar um caso.
  //
  // REGRA DE NEGÓCIO (BLOCO 1, jul/2026 — guard de idempotência): o UPDATE
  // abaixo ganhou `AND status = 'pendente'`. Escolhido em vez de filtrar no
  // SELECT (linha ~361, `SELECT * FROM aprovacoes_tarefa WHERE id = ...`)
  // porque um guard só no SELECT tem janela de corrida clássica (TOCTOU):
  // duas requisições concorrentes podem ambas LER status='pendente' antes de
  // qualquer uma ESCREVER — as duas passariam. O UPDATE com WHERE
  // status='pendente' é atômico (mesmo padrão de src/lib/entrega-venda.ts
  // ~L2807, `res.count` = linhas afetadas, driver postgres.js): só uma das
  // duas requisições concorrentes afeta 1 linha; a outra afeta 0 e recebe 409.
  // IMPACTO SE REMOVIDO: reenviar o PATCH (duplo-clique, retry, 2 aprovadores
  // simultâneos) reprocessa a decisão e os efeitos colaterais dela.
  //
  // REGRA DE NEGÓCIO (BLOCO 1, jul/2026 — ação de domínio do frete avulso
  // DENTRO da transação, ESCOPO RESTRITO a este tipo): liberar/recusar a
  // corrida (liberarFreteAvulsoNoTx/recusarFreteAvulsoNoTx, em
  // src/lib/entrega-venda.ts) agora roda AQUI DENTRO, recebendo este mesmo
  // `tx` — não abrem sql.begin próprio (postgres.js não erra num begin
  // aninhado, mas pega OUTRA conexão do pool e vira uma transação separada,
  // sem atomicidade nenhuma com esta). Se a ação de domínio lançar, a
  // transação INTEIRA reverte: aprovacoes_tarefa volta a 'pendente' e tarefas
  // volta a 'aguardando_aprovacao' — nunca fica "aprovada" com a entrega ainda
  // 'solicitada' (estado hoje invisível, nenhuma tela lista entregas
  // is_avulso='solicitada').
  // OUTROS ~11 TIPOS (desconto, cartão, crédito, metal, devolução, inventário,
  // compra_comercial...) NÃO FORAM TOCADOS — continuam com a ação de domínio
  // FORA desta transação, mais abaixo neste arquivo, exatamente como estavam
  // em produção. Generalizar este padrão para os demais tipos é candidata a
  // PR PRÓPRIO — não faz parte deste fix (escopo combinado: só frete avulso).
  let entregaFreteIdDecidida: number | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await sql.begin(async (tx: any) => {
      const resUpdateAprovacao = await tx`
        UPDATE alissonerp.aprovacoes_tarefa
        SET status = ${body.decisao}, motivo = ${body.motivo ?? null}, respondido_em = now()
        WHERE id = ${body.aprovacao_id} AND status = 'pendente'
      `;
      if (resUpdateAprovacao.count === 0) {
        throw new AprovacaoJaRespondidaError();
      }

      const novoStatus = body.decisao === "aprovado" ? "aprovada" : "rejeitada";
      await tx`
        UPDATE alissonerp.tarefas SET status = ${novoStatus}, updated_at = now()
        ${body.decisao === "aprovado" ? tx`, concluida_em = now()` : tx``}
        WHERE id = ${Number(id)}
      `;

      await processarDecisao(Number(id), body.decisao, user.id, body.motivo, tx);

      if (tarefaInfo?.tipo === "frete_avulso") {
        const [entregaFrete] = await tx`
          SELECT id FROM alissonerp.entregas_venda WHERE tarefa_aprovacao_id = ${Number(id)} LIMIT 1
        `;
        if (!entregaFrete) {
          throw new ErroComStatus("Entrega de frete avulso não encontrada para esta tarefa", 404);
        }
        entregaFreteIdDecidida = Number(entregaFrete.id);
        if (body.decisao === "aprovado") {
          await liberarFreteAvulsoNoTx(tx, entregaFreteIdDecidida, user.id);
        } else {
          // body.motivo já validado (não-vazio) na pré-checagem acima, quando
          // tipo === "frete_avulso" e decisao === "rejeitado".
          await recusarFreteAvulsoNoTx(tx, entregaFreteIdDecidida, user.id, body.motivo!);
        }
      }
    });
  } catch (err) {
    if (err instanceof AprovacaoJaRespondidaError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    if (err instanceof ErroComStatus) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return internalError(`[PATCH /api/tarefas/${id}/aprovacao]`, err);
  }

  // REGRA DE NEGÓCIO (BLOCO 1): resposta + notificação do frete avulso saem
  // DAQUI agora (a transação acima já fez tudo que precisa ser atômico — ação
  // de domínio inclusa). A notificação fica FORA da transação de propósito
  // (não-crítica: se falhar, não deve reverter uma decisão que já é válida —
  // mesmo padrão .catch(() => {}) usado nos demais blocos deste arquivo).
  if (tarefaInfo?.tipo === "frete_avulso" && entregaFreteIdDecidida !== null) {
    await criarNotificacao({
      usuarioId: String(aprovacao.solicitante_id),
      tipo: "aprovacao",
      titulo: body.decisao === "aprovado" ? "Frete avulso liberado" : "Frete avulso recusado",
      mensagem: body.decisao === "aprovado"
        ? "O frete avulso foi liberado e entrou no pool de motoboys."
        : (body.motivo ?? "O frete avulso foi recusado."),
      remetenteId: user.id,
      link: tarefaInfo?.venda_id ? `/vendas/${tarefaInfo.venda_id}` : `/tarefas?abrir=${Number(id)}`,
      vendaId: tarefaInfo?.venda_id ? Number(tarefaInfo.venda_id) : null,
    }).catch(() => {});

    return NextResponse.json({
      ok: true,
      frete_avulso: { entrega_id: entregaFreteIdDecidida, decisao: body.decisao },
    });
  }

  /**
   * REGRA DE NEGOCIO: Automacao de Estoque 2.0.
   * O QUE: ao aprovar entrega sem pagamento total, reconcilia A Receber sem
   * duplicar e so depois muda a venda para `entregue`, disparando a baixa real
   * do estoque comercial pelos triggers existentes.
   * POR QUE: tarefas registram a decisao, mas a excecao precisa refletir no
   * financeiro e no estoque de forma atomica.
   * IMPACTO SE REMOVIDO: tarefa ficaria aprovada sem entregar a venda ou sem
   * gerar o saldo aberto no crediario.
   */
  if (tarefaInfo?.tipo === ENTREGA_SEM_PAGAMENTO_TIPO || tags.includes("aprov_entrega_sem_pagamento")) {
    // REGRA DE NEGÓCIO: entrega sem pagamento decidida pela camada config-first
    // (aprovador_entrega_sem_pagamento) — não mais pela checagem genérica do topo
    // do PATCH. Sem ctx.solicitanteId: entrega sem pagamento não exclui quem solicitou.
    const decEntregaSemPagamento = await podeDecidir(
      { id: user.id, role: usuarioLogado?.role ?? null },
      "entrega_sem_pagamento",
    );
    if (!decEntregaSemPagamento.pode) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }
    try {
      const resultado = await processarAprovacaoEntregaSemPagamento(
        Number(id),
        user.id,
        body.decisao,
        body.motivo,
      );
      return NextResponse.json({ ok: true, entrega_sem_pagamento: resultado });
    } catch (err) {
      return internalError(`[PATCH /api/tarefas/${id}/aprovacao] entrega_sem_pagamento`, err);
    }
  }

  /**
   * REGRA DE NEGÓCIO: aprovação de quebra da limpeza deve refletir no kanban
   * de baixas (cofre_ouro_baixas), e não só na tarefa.
   *
   * O QUE: ao aprovar/rejeitar tarefa `aprovacao_quebra_metal` (ou legado
   * com tag limpeza_ouro), executa serviço único que transita a baixa,
   * rastreia evento e mantém estoque consistente.
   * POR QUE: evita divergência entre tarefa aprovada e baixa ainda em
   * aguardando_aprovacao.
   * IMPACTO SE REMOVIDO: usuário aprova a tarefa e a baixa fica "presa" no
   * quadro de limpeza.
   */
  const tagLimpeza = tags.find((t) => t.startsWith("limpeza_ouro:"));
  const baixaIdTag = tagLimpeza ? Number(tagLimpeza.split(":")[1]) : 0;
  const isFluxoQuebraLimpeza = tarefaInfo?.tipo === "aprovacao_quebra_metal" || (tarefaInfo?.tipo === "protocolo_metal" && !!tagLimpeza);
  if (isFluxoQuebraLimpeza && baixaIdTag > 0) {
    const resultado = await processarAprovacaoQuebraLimpeza({
      baixaId: baixaIdTag,
      decisao: body.decisao === "aprovado" ? "aprovar" : "reprovar",
      userId: user.id,
      motivo: body.motivo,
      tarefaId: Number(id),
    });
    if (!resultado.ok) {
      return NextResponse.json({ error: resultado.error ?? "Erro ao processar aprovação da quebra" }, { status: resultado.status });
    }
    return NextResponse.json({ ok: true, quebra_limpeza: resultado.baixa ?? { id: baixaIdTag } });
  }

  if (tarefaInfo?.tipo === "cartao_desconto" && tarefaInfo?.venda_id) {
    // REGRA DE NEGÓCIO (Fase 3g.3): cartão com desconto decidido pela camada
    // config-first (aprovador_cartao_desconto_padrao) — sem ctx.solicitanteId.
    const decCartaoDesconto = await podeDecidir(
      { id: user.id, role: usuarioLogado?.role ?? null },
      "cartao_desconto",
    );
    if (!decCartaoDesconto.pode) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }
    const logCtx = { tarefa_id: Number(id), venda_id: tarefaInfo.venda_id, decisao: body.decisao, aprovador_id: user.id };
    console.log(`[cartao_desconto] inicio`, logCtx);
    try {
      if (body.decisao === "aprovado") {
        await sql`
          UPDATE alissonerp.vendas_erp
          SET aprovacao_cartao_desconto_tarefa_id = NULL,
              desconto_cartao_aprovado_por = ${user.id}::uuid,
              desconto_cartao_aprovado_em  = NOW(),
              updated_at = NOW()
          WHERE id = ${tarefaInfo.venda_id}
        `;
        console.log(`[cartao_desconto] vendas_erp: cartao liberado`);
      } else {
        await sql`
          UPDATE alissonerp.vendas_erp
          SET aprovacao_cartao_desconto_tarefa_id = NULL,
              updated_at = NOW()
          WHERE id = ${tarefaInfo.venda_id}
        `;
        console.log(`[cartao_desconto] vendas_erp: rejeitado`);
      }
      const [aprov] = await sql`SELECT solicitante_id FROM alissonerp.aprovacoes_tarefa WHERE tarefa_id = ${Number(id)} LIMIT 1`;
      if (aprov?.solicitante_id) {
        await criarNotificacao({
          usuarioId: String(aprov.solicitante_id),
          tipo: "aprovacao",
          titulo: body.decisao === "aprovado" ? "Cartão de crédito liberado!" : "Cartão de crédito não aprovado",
          mensagem: body.motivo ?? (body.decisao === "aprovado" ? "O cartão de crédito foi liberado para esta venda." : "O uso do cartão de crédito foi recusado para esta venda."),
          remetenteId: user.id,
          link: tarefaInfo.venda_id ? `/vendas/${tarefaInfo.venda_id}` : `/tarefas?abrir=${Number(id)}`,
          vendaId: tarefaInfo.venda_id ? Number(tarefaInfo.venda_id) : null,
        }).catch(() => {});
      }
      console.log(`[cartao_desconto] CONCLUÍDO ok`, logCtx);
      return NextResponse.json({ ok: true, cartao_desconto: { decisao: body.decisao } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[cartao_desconto] ERRO`, { ...logCtx, erro: msg });
      return internalError(`[PATCH /api/tarefas/${id}/aprovacao] cartao_desconto`, err);
    }
  }

  // BUG FIX (jun/2026): casar por TIPO, não pela tag. A tarefa é criada com tipo
  // 'desconto_acima', mas nem sempre recebe a tag 'aprovacao_desconto' (alguns
  // caminhos só põem 'aprov_desconto_acima'). Casar pela tag deixava a aprovação
  // ser registrada na tarefa SEM marcar desconto_aprovado_por na venda → venda
  // travava em rascunho mesmo após o diretor aprovar (vendas 15300/15312/15399/
  // 15562/15629 destravadas à mão). Espelha o padrão do bloco cartao_desconto acima.
  if (tarefaInfo?.tipo === "desconto_acima" && tarefaInfo?.venda_id) {
    // REGRA DE NEGÓCIO (Fase 3g.3): desconto decidido pela camada config-first
    // (aprovador_desconto_padrao) — sem ctx.solicitanteId.
    const decDesconto = await podeDecidir(
      { id: user.id, role: usuarioLogado?.role ?? null },
      "desconto",
    );
    if (!decDesconto.pode) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }
    const logCtx = { tarefa_id: Number(id), venda_id: tarefaInfo.venda_id, decisao: body.decisao, aprovador_id: user.id };
    console.log(`[desconto] inicio`, logCtx);
    try {
      if (body.decisao === "aprovado") {
        await sql`
          UPDATE alissonerp.vendas_erp
          SET aprovacao_desconto_tarefa_id = NULL,
              desconto_aprovado_por = ${user.id}::uuid,
              desconto_aprovado_em  = NOW(),
              updated_at = NOW()
          WHERE id = ${tarefaInfo.venda_id}
        `;
        console.log(`[desconto] vendas_erp: lock removido, desconto_aprovado_por gravado`);
        // REGRA DE NEGÓCIO (jul/2026 — correção): aprovar o desconto libera o
        // lock, NÃO altera a comissão. A comissão sempre segue a tabela de
        // faixas (faixas_comissao) pelo desconto real de cada item — igual ao
        // getComissao() do front. Até aqui isso jogava TODOS os itens pra
        // 0,5% fixo (taxa de desconto >30%) mesmo quando o desconto real
        // era, por ex., 21% (que vale 1,55% na tabela). Equívoco identificado
        // pelo dono: a aprovação de um desconto de 20-30% não deveria ter o
        // mesmo efeito na comissão que um desconto acima de 30%.
        await sql`
          UPDATE alissonerp.itens_venda_erp iv
          SET pct_comissao   = calc.pct_comissao,
              valor_comissao = ROUND(iv.total_item * calc.pct_comissao / 100, 2)
          FROM (
            SELECT i.id,
                   CASE
                     WHEN i.pct_desconto > 30 THEN 0.5
                     ELSE COALESCE(fc.comissao_pct, 0)
                   END AS pct_comissao
            FROM alissonerp.itens_venda_erp i
            LEFT JOIN alissonerp.faixas_comissao fc
              ON fc.desconto_pct = ROUND(i.pct_desconto) AND fc.ativo = true
            WHERE i.venda_id = ${tarefaInfo.venda_id}
          ) calc
          WHERE iv.id = calc.id
        `;
        console.log(`[desconto] itens_venda_erp: comissão recalculada pela tabela de faixas`);
      } else {
        await sql`
          UPDATE alissonerp.vendas_erp
          SET aprovacao_desconto_tarefa_id = NULL,
              updated_at = NOW()
          WHERE id = ${tarefaInfo.venda_id}
        `;
        console.log(`[desconto] vendas_erp: lock removido (rejeição)`);

        /**
         * REGRA DE NEGÓCIO (16/07, decisão do Jonathan): REPROVAR o desconto
         * reprova, em cascata, a aprovação de CARTÃO da mesma venda.
         *
         * O QUÊ: se existir tarefa de cartão pendente nesta venda, ela é
         *   marcada rejeitada junto e o lock da venda é limpo.
         * O PORQUÊ: as duas passaram a poder ser pedidas juntas (ver
         *   solicitar-aprovacao/route.ts, mesma data). Sem a cascata, reprovar
         *   o desconto deixaria órfã uma tarefa de "cartão com desconto de X%"
         *   cujo X foi recusado — o aprovador decidiria sobre um desconto que
         *   não existe mais. Aprovar o desconto NÃO aprova o cartão: cada uma
         *   tem sua decisão (só a reprovação cascateia).
         * O IMPACTO SE REMOVIDO: volta a tarefa órfã de cartão, e a consultora
         *   veria "aguardando aprovação de cartão" numa venda cujo desconto foi
         *   recusado (o banner some só quando a tarefa é decidida).
         */
        const [vendaCartao] = await sql`
          SELECT aprovacao_cartao_desconto_tarefa_id AS tid
          FROM alissonerp.vendas_erp WHERE id = ${tarefaInfo.venda_id}
        `;
        const cartaoTarefaId = vendaCartao?.tid ? Number(vendaCartao.tid) : null;
        if (cartaoTarefaId) {
          const motivoCascata = `Reprovado automaticamente: o desconto desta venda foi reprovado${body.motivo ? ` (${body.motivo})` : ""}.`;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await sql.begin(async (tx: any) => {
            await tx`
              UPDATE alissonerp.aprovacoes_tarefa
              SET status = 'rejeitado', motivo = ${motivoCascata}, respondido_em = now()
              WHERE tarefa_id = ${cartaoTarefaId} AND status = 'pendente'
            `;
            await tx`
              UPDATE alissonerp.tarefas SET status = 'rejeitada', updated_at = now()
              WHERE id = ${cartaoTarefaId} AND status = 'aguardando_aprovacao'
            `;
            await tx`
              UPDATE alissonerp.vendas_erp
              SET aprovacao_cartao_desconto_tarefa_id = NULL, updated_at = NOW()
              WHERE id = ${tarefaInfo.venda_id}
            `;
          });
          console.log(`[desconto] cascata: tarefa de cartão ${cartaoTarefaId} reprovada junto`);
        }
      }
      const [aprov] = await sql`SELECT solicitante_id FROM alissonerp.aprovacoes_tarefa WHERE tarefa_id = ${Number(id)} LIMIT 1`;
      if (aprov?.solicitante_id) {
        await criarNotificacao({
          usuarioId: String(aprov.solicitante_id),
          tipo: "aprovacao",
          titulo: body.decisao === "aprovado" ? "Desconto liberado!" : "Desconto não aprovado",
          mensagem: body.motivo ?? (body.decisao === "aprovado" ? "O desconto foi liberado. Finalize o pagamento para concluir a venda." : "O desconto solicitado foi recusado pelo administrador."),
          remetenteId: user.id,
          link: `/vendas/${tarefaInfo.venda_id}`,
          vendaId: Number(tarefaInfo.venda_id),
        }).catch(() => {});
      }
      console.log(`[desconto] CONCLUÍDO ok`, logCtx);
      await sql`
        INSERT INTO alissonerp.webhook_log (webhook_nome, payload, response_status)
        VALUES ('aprovacao_desconto', ${JSON.stringify({ ...logCtx, resultado: "ok" })}::text::jsonb, 200)
      `.catch(() => {});
      return NextResponse.json({ ok: true, desconto: { decisao: body.decisao } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[desconto] ERRO`, { ...logCtx, erro: msg });
      await sql`
        INSERT INTO alissonerp.webhook_log (webhook_nome, payload, response_status, erro)
        VALUES ('aprovacao_desconto', ${JSON.stringify({ ...logCtx, resultado: "erro" })}::text::jsonb, 500, ${msg})
      `.catch(() => {});
      return internalError(`[PATCH /api/tarefas/${id}/aprovacao] desconto`, err);
    }
  }

  // Handler crédito: só roda se a venda tem aprovacao_credito_tipo configurado
  // (fluxo criado por submeterVendaParaAprovacaoCredito) E está em estado ativo.
  // Exclui: aprovacao_venda (notificação genérica), venda cancelada/entregue.
  const vendaAtiva = tarefaInfo?.venda_id &&
    !["cancelado", "entregue", "aprovado"].includes(tarefaInfo?.venda_situacao ?? "");
  const isCreditoReal = vendaAtiva && tarefaInfo?.aprovacao_credito_tipo;

  if (isCreditoReal &&
      tarefaInfo?.tipo !== "desconto_acima" &&
      !tags.includes("aprovacao_venda") &&
      tarefaInfo?.tipo !== "cartao_desconto") {
    // REGRA DE NEGÓCIO (Fase 3g.2): crédito decidido pela camada config-first —
    // 2 aprovadores (aprovadora_credito_gerente / aprovador_credito_diretor),
    // escolhidos pelo evento conforme aprovacao_credito_tipo (gravado na venda
    // por submeterVendaParaAprovacaoCredito, roteado pela regra de saldo — isso
    // não muda). Não mais pela checagem genérica do topo do PATCH. Sem
    // ctx.solicitanteId: crédito não exclui quem solicitou.
    const eventoCredito = tarefaInfo?.aprovacao_credito_tipo === "diretor" ? "credito_diretor" : "credito_gerente";
    const decCredito = await podeDecidir({ id: user.id, role: usuarioLogado?.role ?? null }, eventoCredito);
    if (!decCredito.pode) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }
    try {
      const { processarAprovacaoCredito } = await import("@/lib/vendas-credito-aprovar");
      const resultado = await processarAprovacaoCredito(
        Number(id), user.id, body.decisao, body.motivo,
      );

      /**
       * REGRA DE NEGÓCIO (17/07, decisão do Jonathan): aprovar o crédito e a
       * venda ser aprovada são 2 passos, e o 2º (approveVenda) pode falhar por
       * motivo OPERACIONAL — o clássico é cliente sem celular cadastrado.
       *
       * O QUE: quando falha, a aprovação do crédito CONTINUA VALENDO (a tarefa
       *   não volta pra fila) e devolvemos o motivo real junto do 200, pra tela
       *   avisar quem aprovou. Quem corrige o cadastro aprova a venda na mão.
       * POR QUE: o aprovador já decidiu — a decisão dele é válida. A falha não é
       *   de decisão, é de cadastro. Fazer ele aprovar de novo é ruído ("pedir
       *   aprovação é chato" — Jonathan).
       *   Isto DIVERGE de propósito do fd80d4d0 (23/06), que revertia a tarefa
       *   pra 'aguardando_aprovacao' e devolvia 409. Aquele bloco sumiu no
       *   0ae5e1607 (26/06, base errada); NÃO restaurar — o desenho mudou.
       * IMPACTO SE REMOVIDO: volta o 200 mudo — o aprovador vê "sucesso", o
       *   approveVenda falhou por baixo e ninguém avisa que falta aprovar a
       *   venda na mão. (A consultora é notificada por
       *   vendas-credito-aprovar.ts; quem aprova, não era.)
       *
       * Espera legítima por pagamento (venda_aprovada=false SEM erro_aprovacao)
       * não é falha — segue 200 limpo, sem aviso.
       */
      const falhouAoAprovarVenda = body.decisao === "aprovado" && !!resultado.erro_aprovacao;
      return NextResponse.json({
        ok: true,
        credito: resultado,
        ...(falhouAoAprovarVenda
          ? {
              aviso: `Crédito aprovado, mas a venda não foi aprovada automaticamente: ${resultado.erro_aprovacao}. Corrija o cadastro e aprove a venda manualmente.`,
              venda_id: tarefaInfo?.venda_id ?? null,
            }
          : {}),
      });
    } catch (err) {
      return internalError(`[PATCH /api/tarefas/${id}/aprovacao] credito`, err);
    }
  }

  // Aprovacao do ESTOQUE da devolucao (tag 'devolucao_estoque') tem PRIORIDADE
  // sobre a aprovacao normal — ambas as tarefas apontam pra mesma devolucao via
  // tarefa_id, entao desambiguamos pela tag. Ao aprovar, conclui e gera o vale.
  if (tags.includes("devolucao_estoque")) {
    // REGRA DE NEGÓCIO: etapa 2 (estoque) decidida pela camada config-first
    // (aprovador_devolucao_estoque) — não mais pela checagem genérica do topo do
    // PATCH. Sem ctx.solicitanteId: devolução não exclui quem solicitou.
    const decEstoque = await podeDecidir({ id: user.id, role: usuarioLogado?.role ?? null }, "devolucao_estoque");
    if (!decEstoque.pode) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }
    try {
      const { processarAprovacaoEstoqueDevolucao } = await import("@/lib/devolucoes");
      const resultado = await processarAprovacaoEstoqueDevolucao(
        Number(id), user.id, body.decisao, body.motivo,
      );
      return NextResponse.json({ ok: true, devolucao_estoque: resultado });
    } catch (err) {
      return internalError(`[PATCH /api/tarefas/${id}/aprovacao] devolucao_estoque`, err);
    }
  }

  const [devLink] = await sql`
    SELECT id FROM alissonerp.devolucoes_venda WHERE tarefa_id = ${Number(id)} LIMIT 1
  `;
  if (devLink || tags.includes("devolucao")) {
    // REGRA DE NEGÓCIO: etapa 1 (devolução) decidida pela camada config-first
    // (aprovador_devolucao) — 1 aprovador só, sem distinção de prazo (decisão do
    // Jonathan, 12/07). Sem ctx.solicitanteId: devolução não exclui quem solicitou.
    const decDevolucao = await podeDecidir({ id: user.id, role: usuarioLogado?.role ?? null }, "devolucao");
    if (!decDevolucao.pode) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }
    try {
      const { processarAprovacaoDevolucao } = await import("@/lib/devolucoes");
      const resultado = await processarAprovacaoDevolucao(
        Number(id), user.id, body.decisao, body.motivo,
      );
      return NextResponse.json({ ok: true, devolucao: resultado });
    } catch (err) {
      return internalError(`[PATCH /api/tarefas/${id}/aprovacao] devolucao`, err);
    }
  }

  /**
   * REGRA DE NEGÓCIO (v2.83.0): solicitação de ação do inventário feita
   * pela role operador_inventario (Ytalo/Geovana). Ao APROVAR, o sistema
   * EXECUTA a ação (abrir/concluir/cancelar) — mesma engrenagem das rotas
   * diretas (src/lib/inventario-acoes). Ao rejeitar, nada muda no estoque.
   */
  if (tarefaInfo?.tipo === "inventario_solicitacao" || tags.includes("aprovacao_inventario")) {
    try {
      const { processarAprovacaoInventario } = await import("@/lib/inventario-solicitacoes");
      const resultado = await processarAprovacaoInventario(Number(id), body.decisao, user.id, body.motivo);
      return NextResponse.json({ ok: true, inventario_solicitacao: resultado });
    } catch (err) {
      return internalError(`[PATCH /api/tarefas/${id}/aprovacao] inventario_solicitacao`, err);
    }
  }

  if (tarefaInfo?.tipo === "compra_comercial" || tags.includes("aprovacao_compra_comercial")) {
    // REGRA DE NEGÓCIO: compra comercial decidida pela camada config-first
    // (aprovador_compra_comercial) — não mais pela checagem genérica do topo do
    // PATCH. Sem ctx.solicitanteId: compra comercial não exclui quem solicitou.
    const dec = await podeDecidir({ id: user.id, role: usuarioLogado?.role ?? null }, "compra_comercial");
    if (!dec.pode) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }
    try {
      const resultado = await processarAprovacaoCompraComercial(Number(id), body.decisao, user.id, body.motivo);
      return NextResponse.json({ ok: true, compra_comercial: resultado });
    } catch (err) {
      return internalError(`[PATCH /api/tarefas/${id}/aprovacao] compra_comercial`, err);
    }
  }

  if (tarefaInfo?.tipo === "recebimento_metal" || tags.includes("aprovacao_recebimento_metal")) {
    // REGRA DE NEGÓCIO: recebimento de metal decidido pela camada config-first
    // (metal_aprovador_id) — não mais pela checagem genérica do topo do PATCH.
    // Sem ctx.solicitanteId: metal não exclui quem cadastrou o recebimento.
    const decisaoAutorizada = await podeDecidir({ id: user.id, role: usuarioLogado?.role ?? null }, "recebimento_metal");
    if (!decisaoAutorizada.pode) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }
    try {
      const resultado = await processarAprovacaoRecebimentoMetal(Number(id), body.decisao, user.id, body.motivo);
      return NextResponse.json({ ok: true, recebimento_metal: resultado });
    } catch (err) {
      return internalError(`[PATCH /api/tarefas/${id}/aprovacao] recebimento_metal`, err);
    }
  }

  if (tarefaInfo?.tipo === "compra_metal" || tags.includes("aprovacao_compra_metal")) {
    try {
      const resultado = await processarAprovacaoCompraMetal(
        Number(id), body.decisao, { id: user.id, role: usuarioLogado?.role ?? null }, body.motivo,
      );
      return NextResponse.json({ ok: true, compra_metal: resultado });
    } catch (err) {
      return internalError(`[PATCH /api/tarefas/${id}/aprovacao] compra_metal`, err);
    }
  }

  // REGRA DE NEGÓCIO (BLOCO 1, jul/2026): o bloco frete_avulso que existia
  // aqui (autorização config-first + liberar/recusar + notificação + return)
  // foi MOVIDO para dentro/logo após a transação genérica acima (comentário
  // "ação de domínio do frete avulso DENTRO da transação"), para rodar
  // atomicamente com a decisão da tarefa. Este ponto do código nunca é
  // alcançado por uma tarefa tipo='frete_avulso' (já retornou lá em cima) —
  // não duplicar o bloco aqui de novo.

  await criarNotificacao({
    usuarioId: String(aprovacao.solicitante_id),
    tipo: "aprovacao",
    titulo: body.decisao === "aprovado" ? "Tarefa aprovada!" : "Tarefa rejeitada",
    mensagem: body.motivo ?? (body.decisao === "aprovado" ? "Aprovada com sucesso" : "Rejeitada pelo aprovador"),
    remetenteId: user.id,
    link: `/tarefas?abrir=${Number(id)}`,
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
