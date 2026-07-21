/**
 * GET /api/entregas-venda/motoboy/relatorio-pagamento/[id]
 *
 * REGRA DE NEGÓCIO (reforma 21/07/2026 — relatórios persistidos, ver
 * docs/regras-negocio/entregas.md §12.8): detalhe de UM relatório salvo —
 * usado pelo botão "Abrir" da lista, dentro da aba "Pagamento do motoboy".
 * Reidrata a tabela de corridas (com fotos e ajuste por linha) a partir do
 * relatório SALVO, em vez de recalcular por entregador+período (isso agora
 * só acontece uma vez, na criação — `POST /motoboy/relatorio-pagamento`).
 *
 * O QUE: junta o cabeçalho (`relatorios_pagamento_motoboy`) com os itens
 * (`relatorios_pagamento_motoboy_itens` — snapshot de classificação+decisão)
 * e dados de exibição ATUAIS da entrega (código, venda, cliente, data,
 * fotos) via JOIN com `entregas_venda`/`vendas_erp`/`contatos`. `foi_pago`
 * é sempre recalculado AO VIVO (`EXISTS ... pagamentos_motoboy_itens`) — uma
 * vez true, nunca mais muda, não precisa (nem deve) ser snapshot.
 *
 * IMPACTO SE ALTERADO: front usa esta forma para inicializar o toggle
 * Pagar/Não pagar (`decisao` persistida) e para decidir se mostra o toggle
 * ou o badge "Já paga" (`foi_pago`) — mudar os nomes de campo quebra
 * `RelatorioPagamentoMotoboy.tsx`.
 */
import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { buscarFotosEntregaEmLote } from "@/lib/entrega-venda";
import { getPublicUrl } from "@/lib/storage-url";
import { ROLES_PAGAMENTO_MOTOBOY } from "@/lib/pagamento-motoboy";

const ROLES_PERMITIDOS = ROLES_PAGAMENTO_MOTOBOY;

export async function GET(
  _req: NextRequest,
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

  const [cabecalho] = await sql`
    SELECT r.id, r.motoboy_id, r.data_inicio, r.data_fim, r.status,
           r.total_sugerido, r.created_at, r.pago_em,
           mb.nome AS motoboy_nome
    FROM alissonerp.relatorios_pagamento_motoboy r
    LEFT JOIN alissonerp.motoboys mb ON mb.user_id = r.motoboy_id
    WHERE r.id = ${relatorioId}
    LIMIT 1
  `;

  if (!cabecalho) {
    return NextResponse.json({ error: "Relatório não encontrado" }, { status: 404 });
  }

  // ─── Itens do relatório + dados ATUAIS de exibição da entrega (sem N+1:
  // 1 única consulta para todas as corridas do relatório) + foi_pago AO VIVO
  // (mesmo EXISTS de sempre, nunca reverte de true pra false).
  const itensRows: Record<string, unknown>[] = await sql`
    SELECT
      i.entrega_id, i.classificacao, i.decisao, i.frete_motoboy,
      ev.codigo_entrega, ev.venda_id, ev.is_avulso, ev.descricao_avulso,
      ev.regiao, ev.data_entrega_realizada,
      ve.numero_venda,
      COALESCE(c.nome, ca.nome) AS cliente_nome,
      EXISTS (
        SELECT 1 FROM alissonerp.pagamentos_motoboy_itens pmi WHERE pmi.entrega_id = ev.id
      ) AS foi_pago
    FROM alissonerp.relatorios_pagamento_motoboy_itens i
    JOIN alissonerp.entregas_venda ev ON ev.id = i.entrega_id
    LEFT JOIN alissonerp.vendas_erp ve ON ve.id = ev.venda_id
    LEFT JOIN public.contatos c ON c.id_contato = ve.cliente_id
    LEFT JOIN public.contatos ca ON ca.id_contato = ev.contato_id
    WHERE i.relatorio_id = ${relatorioId}
    ORDER BY ev.data_entrega_realizada ASC, ev.id ASC
  `;

  const fotosPorEntrega = await buscarFotosEntregaEmLote(itensRows.map((r) => Number(r.entrega_id)));

  const corridas = itensRows.map((r) => {
    const entregaId = Number(r.entrega_id);
    const fotos = (fotosPorEntrega.get(entregaId) ?? []).map((path) =>
      getPublicUrl("pagamento-fotos", path),
    );
    return {
      id: entregaId,
      codigo_entrega: r.codigo_entrega,
      venda_id: r.venda_id === null ? null : Number(r.venda_id),
      numero_venda: r.numero_venda ?? null,
      cliente_nome: r.cliente_nome ?? null,
      is_avulso: Boolean(r.is_avulso),
      descricao_avulso: (r.descricao_avulso as string | null) ?? null,
      regiao: r.regiao ?? null,
      frete_motoboy: Number(r.frete_motoboy ?? 0),
      data_entrega_realizada: r.data_entrega_realizada,
      classificacao: r.classificacao,
      decisao: r.decisao,
      foi_pago: Boolean(r.foi_pago),
      fotos,
    };
  });

  return NextResponse.json({
    id: Number(cabecalho.id),
    motoboy_id: cabecalho.motoboy_id,
    motoboy_nome: cabecalho.motoboy_nome ?? "—",
    data_inicio: cabecalho.data_inicio,
    data_fim: cabecalho.data_fim,
    status: cabecalho.status,
    total_sugerido: Number(cabecalho.total_sugerido),
    created_at: cabecalho.created_at,
    pago_em: cabecalho.pago_em,
    corridas,
  });
}
