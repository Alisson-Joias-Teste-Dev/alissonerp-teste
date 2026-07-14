import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

function mapRow(r: Record<string, unknown>) {
  return {
    ...r,
    saldo_fisico: Number(r.saldo_fisico ?? r.saldo ?? 0),
    reservado: Number(r.reservado ?? 0),
    disponivel: Number(r.disponivel ?? r.saldo ?? 0),
    em_transito: Number(r.em_transito ?? 0),
    estoque_minimo: Number(r.estoque_minimo ?? 0),
    total_movimentacoes: Number(r.total_movimentacoes ?? 0),
  };
}

// GET /api/estoque-comercial?local_estoque_id=2&consolidado=true
// Lista todos os produtos com estoque comercial ativo + alertas
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const url = new URL(req.url);
  const localId = url.searchParams.get("local_estoque_id");
  const consolidado = url.searchParams.get("consolidado") !== "false";

  // Detectar se views v2 existem
  const [v2Exists] = await sql`
    SELECT 1 FROM information_schema.views
    WHERE table_schema = 'alissonerp' AND table_name = 'vw_estoque_comercial_alerta_v2'
    LIMIT 1
  `;

  if (v2Exists) {
    // ── V2: views novas com multi-local, reserva, disponivel ──
    if (consolidado) {
      const rows = await sql`
        SELECT
          v.produto_id, v.nome_produto, v.sku, v.categoria,
          v.saldo_fisico, v.reservado, v.disponivel, v.em_transito,
          v.estoque_minimo, v.ativo, v.config_id, v.total_movimentacoes,
          v.alerta,
          ep.localizacao
        FROM alissonerp.vw_estoque_comercial_alerta_v2 v
        LEFT JOIN alissonerp.erp_produtos ep ON ep.produto_id = v.produto_id
        ORDER BY
          CASE v.alerta
            WHEN 'negativo'       THEN 0
            WHEN 'zerado'         THEN 1
            WHEN 'abaixo_minimo'  THEN 2
            WHEN 'no_minimo'      THEN 3
            ELSE                       4
          END,
          v.nome_produto
      `;
      return NextResponse.json(rows.map(mapRow));
    }

    if (localId) {
      const rows = await sql`
        SELECT
          s.produto_id, s.nome_produto, s.sku, s.categoria,
          s.local_estoque_id, s.local_nome,
          s.saldo_fisico, s.reservado, s.disponivel, s.em_transito,
          s.estoque_minimo, s.ativo, s.config_id, s.total_movimentacoes,
          ep.localizacao
        FROM alissonerp.vw_saldo_estoque_comercial_v2 s
        LEFT JOIN alissonerp.erp_produtos ep ON ep.produto_id = s.produto_id
        WHERE s.local_estoque_id = ${Number(localId)}
        ORDER BY s.nome_produto
      `;
      return NextResponse.json(rows.map(mapRow));
    }

    const rows = await sql`
      SELECT
        s.produto_id, s.nome_produto, s.sku, s.categoria,
        s.local_estoque_id, s.local_nome,
        s.saldo_fisico, s.reservado, s.disponivel, s.em_transito,
        s.estoque_minimo, s.ativo, s.config_id, s.total_movimentacoes,
        ep.localizacao
      FROM alissonerp.vw_saldo_estoque_comercial_v2 s
      LEFT JOIN alissonerp.erp_produtos ep ON ep.produto_id = s.produto_id
      ORDER BY s.nome_produto, s.local_estoque_id
    `;
    return NextResponse.json(rows.map(mapRow));
  }

  // ── Fallback: view antiga (pre-migration 140) ──
  const rows = await sql`
    SELECT
      produto_id, nome_produto, sku, categoria,
      saldo, estoque_minimo, ativo, config_id,
      total_movimentacoes, alerta
    FROM alissonerp.vw_estoque_comercial_com_alerta
    ORDER BY
      CASE alerta
        WHEN 'zerado'         THEN 0
        WHEN 'abaixo_minimo'  THEN 1
        WHEN 'no_minimo'      THEN 2
        ELSE                       3
      END,
      nome_produto
  `;
  return NextResponse.json(rows.map(r => ({
    ...r,
    saldo_fisico: Number(r.saldo ?? 0),
    reservado: 0,
    disponivel: Number(r.saldo ?? 0),
    em_transito: 0,
    estoque_minimo: Number(r.estoque_minimo ?? 0),
    total_movimentacoes: Number(r.total_movimentacoes ?? 0),
    alerta: r.alerta,
  })));
}
