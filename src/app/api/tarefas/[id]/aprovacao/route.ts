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
    SELECT id, fornecedor_id, local_estoque_id, qtd_parcelas, primeiro_vencimento, created_by, status AS situacao, bloqueado, tarefa_aprovacao_id
    FROM alissonerp.compras_comercial
    WHERE tarefa_aprovacao_id = ${tarefaId}
    LIMIT 1
  `;

  if (!compra) return { ok: false, motivo: "compra_nao_encontrada" };

  if (decisao === "rejeitado") {
    await sql`
      UPDATE alissonerp.compras_comercial
      SET
        status = 'rejeitado',
        bloqueado = false,
        aprovado_por = ${aprovadorId}::uuid,
        data_decisao = NOW(),
        motivo_rejeicao = ${motivo ?? 'Rejeitada na aprovação'}
      WHERE id = ${compra.id}
    `;
    return { ok: true, decisao };
  }

  const itens = await sql`
    SELECT produto_id, quantidade AS qtd, valor_total
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

    for (const item of itens) {
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

    for (let i = 1; i <= parcelas; i++) {
      const valorParcela = i === parcelas ? Math.round((base + diff) * 100) / 100 : base;
      await tx`
        INSERT INTO alissonerp.contas_pagar
          (descricao, fornecedor_id, fornecedor_nome, compra_comercial_id, valor, data_vencimento, status, categoria, created_by, observacao)
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
        status = 'aprovado',
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
  aprovadorId: string,
  motivo?: string,
) {
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

  // Admin e desenvolvedor podem responder qualquer aprovação
  const [usuarioLogado] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  const isAdminOuDev = ["admin", "desenvolvedor"].includes(usuarioLogado?.role ?? "");

  if (String(aprovacao.aprovador_id) !== user.id && !isAdminOuDev) {
    return NextResponse.json({ error: "Somente o aprovador pode responder" }, { status: 403 });
  }

  await sql`
    UPDATE alissonerp.aprovacoes_tarefa
    SET status = ${body.decisao}, motivo = ${body.motivo ?? null}, respondido_em = now()
    WHERE id = ${body.aprovacao_id}
  `;

  const novoStatus = body.decisao === "aprovado" ? "aprovada" : "rejeitada";
  await sql`
    UPDATE alissonerp.tarefas SET status = ${novoStatus}, updated_at = now()
    ${body.decisao === "aprovado" ? sql`, concluida_em = now()` : sql``}
    WHERE id = ${Number(id)}
  `;

  await processarDecisao(Number(id), body.decisao, user.id, body.motivo);

  const [tarefaInfo] = await sql`
    SELECT t.venda_id, t.tags, t.tipo,
           ve.aprovacao_credito_tipo,
           ve.status AS venda_situacao
    FROM alissonerp.tarefas t
    LEFT JOIN alissonerp.vendas_erp ve ON ve.id = t.venda_id
    WHERE t.id = ${Number(id)}
  `;
  const tagsRaw = tarefaInfo?.tags;
  const tags: string[] = Array.isArray(tagsRaw)
    ? tagsRaw
    : (typeof tagsRaw === "string" ? tagsRaw.replace(/[{}"]/g, "").split(",").filter(Boolean) : []);

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

  if (tags.includes("aprovacao_desconto") && tarefaInfo?.venda_id) {
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
        await sql`
          UPDATE alissonerp.itens_venda_erp
          SET pct_comissao    = 0.5,
              valor_comissao  = ROUND(total_item * 0.005, 2)
          WHERE venda_id = ${tarefaInfo.venda_id}
        `;
        console.log(`[desconto] itens_venda_erp: comissão → 0,5%`);
      } else {
        await sql`
          UPDATE alissonerp.vendas_erp
          SET aprovacao_desconto_tarefa_id = NULL,
              updated_at = NOW()
          WHERE id = ${tarefaInfo.venda_id}
        `;
        console.log(`[desconto] vendas_erp: lock removido (rejeição)`);
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
      !tags.includes("aprovacao_desconto") &&
      !tags.includes("aprovacao_venda") &&
      tarefaInfo?.tipo !== "cartao_desconto") {
    try {
      const { processarAprovacaoCredito } = await import("@/lib/vendas-credito-aprovar");
      const resultado = await processarAprovacaoCredito(
        Number(id), user.id, body.decisao, body.motivo,
      );
      return NextResponse.json({ ok: true, credito: resultado });
    } catch (err) {
      return internalError(`[PATCH /api/tarefas/${id}/aprovacao] credito`, err);
    }
  }

  // Aprovacao do ESTOQUE da devolucao (tag 'devolucao_estoque') tem PRIORIDADE
  // sobre a aprovacao normal — ambas as tarefas apontam pra mesma devolucao via
  // tarefa_id, entao desambiguamos pela tag. Ao aprovar, conclui e gera o vale.
  if (tags.includes("devolucao_estoque")) {
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

  if (tarefaInfo?.tipo === "compra_comercial" || tags.includes("aprovacao_compra_comercial")) {
    try {
      const resultado = await processarAprovacaoCompraComercial(Number(id), body.decisao, user.id, body.motivo);
      return NextResponse.json({ ok: true, compra_comercial: resultado });
    } catch (err) {
      return internalError(`[PATCH /api/tarefas/${id}/aprovacao] compra_comercial`, err);
    }
  }

  if (tarefaInfo?.tipo === "recebimento_metal" || tags.includes("aprovacao_recebimento_metal")) {
    try {
      const resultado = await processarAprovacaoRecebimentoMetal(Number(id), body.decisao, user.id, body.motivo);
      return NextResponse.json({ ok: true, recebimento_metal: resultado });
    } catch (err) {
      return internalError(`[PATCH /api/tarefas/${id}/aprovacao] recebimento_metal`, err);
    }
  }

  if (tarefaInfo?.tipo === "compra_metal" || tags.includes("aprovacao_compra_metal")) {
    try {
      const resultado = await processarAprovacaoCompraMetal(Number(id), body.decisao, user.id, body.motivo);
      return NextResponse.json({ ok: true, compra_metal: resultado });
    } catch (err) {
      return internalError(`[PATCH /api/tarefas/${id}/aprovacao] compra_metal`, err);
    }
  }

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
