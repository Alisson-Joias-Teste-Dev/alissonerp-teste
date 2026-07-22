/**
 * POST /api/entregas-venda/motoboy/relatorio-pagamento/[id]/confirmar
 *
 * REGRA DE NEGÓCIO (reforma 21/07/2026 — relatórios persistidos, ver
 * docs/regras-negocio/entregas.md §12.8 e migration 358): confirma o
 * pagamento de um relatório SALVO — os dois pontos de entrada da task:
 *
 *   1. "Confirmar pagamento" DIRETO da lista (sem abrir): body vazio (sem
 *      `decisoes`) — usa a DECISÃO já persistida em
 *      `relatorios_pagamento_motoboy_itens.decisao` (a sugestão inicial,
 *      `decisaoInicialFinanceiro`, gravada na criação do relatório).
 *   2. "Confirmar pagamento" depois de "Abrir" e ajustar linha a linha:
 *      body `{ decisoes: { [entregaId]: "pagar" | "nao_pagar" } }` — as
 *      chaves presentes SOBREPÕEM a decisão persistida daquela corrida
 *      (mesma UX de ajuste efêmero que já existia — o ajuste só vira fato
 *      gravado aqui, no clique de confirmar).
 *
 * NÃO CRIA um segundo caminho de pagamento: reusa
 * `criarPagamentoMotoboyTx`/`buscarEntregasValidasParaPagar`
 * (`src/lib/pagamento-motoboy.ts`, extraída de `motoboy/pagar`) — MESMA
 * validação (entrega confirmada, pertence ao motoboy, ainda não paga —
 * `NOT EXISTS pagamentos_motoboy_itens`) e MESMO INSERT (cabeçalho + itens +
 * conta a pagar). A trava anti-duplo-pagamento (UNIQUE em
 * `pagamentos_motoboy_itens.entrega_id`) nunca é contornada.
 *
 * PAGO = HISTÓRICO TRAVADO: relatório com `status='pago'` responde 409 a
 * qualquer nova tentativa de confirmar — não reedita, não paga de novo.
 *
 * IMPACTO SE ALTERADO: pular a checagem de `status` permite pagar o mesmo
 * relatório 2x (a UNIQUE de `pagamentos_motoboy_itens` ainda barraria no
 * banco, mas a resposta ficaria confusa — 0 entregas válidas em vez de
 * "já pago"). Divergir da lógica de `motoboy/pagar` cria um segundo caminho
 * de pagamento (proibido pela task).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { zodError } from "@/lib/schemas/common";
import {
  ROLES_PAGAMENTO_MOTOBOY,
  buscarEntregasValidasParaPagar,
  criarPagamentoMotoboyTx,
  vencimentoPadrao,
} from "@/lib/pagamento-motoboy";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbTx = any;

const ROLES_PERMITIDOS = ROLES_PAGAMENTO_MOTOBOY;

const ConfirmarSchema = z.object({
  decisoes: z.record(z.string(), z.enum(["pagar", "nao_pagar"])).optional(),
  observacoes: z.string().max(500).optional(),
  data_vencimento: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario || !ROLES_PERMITIDOS.includes(usuario.role as string)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const relatorioId = Number(id);
  if (!Number.isInteger(relatorioId) || relatorioId <= 0) {
    return NextResponse.json({ error: "ID de relatório inválido" }, { status: 400 });
  }

  let raw: unknown = {};
  try { raw = await req.json(); } catch {
    // Body vazio é válido aqui (confirmação direta da lista, sem ajustes).
    raw = {};
  }
  const parsed = ConfirmarSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { decisoes, observacoes, data_vencimento } = parsed.data;

  const [relatorio] = await sql`
    SELECT r.id, r.motoboy_id, r.status, mb.nome AS motoboy_nome
    FROM alissonerp.relatorios_pagamento_motoboy r
    LEFT JOIN alissonerp.motoboys mb ON mb.user_id = r.motoboy_id
    WHERE r.id = ${relatorioId}
    LIMIT 1
  `;

  if (!relatorio) {
    return NextResponse.json({ error: "Relatório não encontrado" }, { status: 404 });
  }

  // REGRA DE NEGÓCIO: PAGO = histórico travado — nunca reconfirma.
  if (relatorio.status === "pago") {
    return NextResponse.json(
      { error: "Este relatório já foi pago e não pode ser confirmado novamente." },
      { status: 409 },
    );
  }

  const motoboyId = relatorio.motoboy_id as string;
  const motoboyNome = (relatorio.motoboy_nome as string | null) ?? "Motoboy";

  const itensRows: Record<string, unknown>[] = await sql`
    SELECT entrega_id, decisao
    FROM alissonerp.relatorios_pagamento_motoboy_itens
    WHERE relatorio_id = ${relatorioId}
  `;

  if (itensRows.length === 0) {
    return NextResponse.json({ error: "Relatório sem corridas — nada para confirmar." }, { status: 400 });
  }

  // REGRA DE NEGÓCIO: decisão FINAL = override do body (se presente para
  // aquela entrega) senão a decisão persistida na criação. Chaves de
  // `decisoes` que não pertencem a este relatório são ignoradas (defensivo —
  // nunca usa dado de fora do relatório atual).
  const idsDoRelatorio = new Set(itensRows.map((r) => Number(r.entrega_id)));
  const decisaoFinalPorEntrega = new Map<number, "pagar" | "nao_pagar">();
  for (const r of itensRows) {
    const entregaId = Number(r.entrega_id);
    const override = decisoes?.[String(entregaId)];
    decisaoFinalPorEntrega.set(entregaId, override ?? (r.decisao as "pagar" | "nao_pagar"));
  }

  const entregaIdsParaPagar = [...decisaoFinalPorEntrega.entries()]
    .filter(([, decisao]) => decisao === "pagar")
    .map(([entregaId]) => entregaId)
    .filter((entregaId) => idsDoRelatorio.has(entregaId));

  if (entregaIdsParaPagar.length === 0) {
    return NextResponse.json(
      { error: "Nenhuma corrida marcada para pagamento. Abra o relatório e marque ao menos uma como \"Pagar\"." },
      { status: 400 },
    );
  }

  const vencimento = data_vencimento ?? vencimentoPadrao();

  try {
    const resultado = await sql.begin(async (tx: DbTx) => {
      // Mesma validação final de `motoboy/pagar` — confirma que as entregas
      // ainda são válidas (confirmadas, do motoboy, ainda não pagas) NA hora
      // de confirmar, não só na hora de criar o relatório (o mundo pode ter
      // mudado entre os dois momentos).
      const entregas = await buscarEntregasValidasParaPagar(tx, motoboyId, entregaIdsParaPagar);

      if (entregas.length === 0) {
        throw new Error("NENHUMA_ENTREGA_VALIDA");
      }

      const { pagamentoId, valorTotal } = await criarPagamentoMotoboyTx(tx, {
        motoboyId,
        motoboyNome,
        entregas,
        observacoes,
        dataVencimento: vencimento,
        userId: user.id,
      });

      // Trava o relatório (histórico) e atualiza a decisão final gravada por
      // corrida — auditoria fiel do que realmente foi pago, mesmo que tenha
      // divergido da sugestão inicial.
      await tx`
        UPDATE alissonerp.relatorios_pagamento_motoboy
        SET status = 'pago',
            total_sugerido = ${valorTotal},
            pagamento_id = ${pagamentoId},
            pago_em = now(),
            pago_por = ${user.id}::uuid
        WHERE id = ${relatorioId}
      `;

      for (const [entregaId, decisao] of decisaoFinalPorEntrega.entries()) {
        await tx`
          UPDATE alissonerp.relatorios_pagamento_motoboy_itens
          SET decisao = ${decisao}
          WHERE relatorio_id = ${relatorioId} AND entrega_id = ${entregaId}
        `;
      }

      return { pagamentoId, valorTotal, entregasPagas: entregas.length };
    });

    return NextResponse.json({
      ok: true,
      pagamento_id: resultado.pagamentoId,
      entregas_pagas: resultado.entregasPagas,
      valor_total: resultado.valorTotal,
      message: `${resultado.entregasPagas} entrega(s) paga(s). Total: R$ ${resultado.valorTotal.toFixed(2)}`,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "NENHUMA_ENTREGA_VALIDA") {
      return NextResponse.json(
        { error: "Nenhuma das corridas marcadas está mais válida para pagamento (já foi paga em outro lote, ou não está mais confirmada). Recarregue o relatório." },
        { status: 400 },
      );
    }
    const message = err instanceof Error ? err.message : "Erro ao confirmar pagamento";
    console.error("[motoboy/relatorio-pagamento/[id]/confirmar] Erro:", err);
    if (message.includes("duplicate") || message.includes("unicidade") || message.includes("unique")) {
      return NextResponse.json(
        { error: "Uma ou mais entregas selecionadas já foram pagas. Recarregue o relatório." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
