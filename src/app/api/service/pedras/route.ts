import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess, ROLES_SERVICE_PANEL } from "@/lib/roles";

// GET /api/service/pedras?inicio=YYYY-MM-DD&fim=YYYY-MM-DD
// Agrega pedras usadas em serviços concluídos no período.
// Auth: role em ROLES_SERVICE_PANEL OU fullAccess

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [caller] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid
  `;
  if (!caller) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 403 });

  const hasAccess =
    isFullAccess(caller.role as string) ||
    ROLES_SERVICE_PANEL.includes(caller.role as typeof ROLES_SERVICE_PANEL[number]);
  if (!hasAccess) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const sp    = req.nextUrl.searchParams;
  const inicio = sp.get("inicio") || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const fim    = sp.get("fim")    || new Date().toISOString().slice(0, 10);

  const rows = await sql`
    SELECT
      pe->>'nome'      AS pedra_nome,
      pe->>'insumo_id' AS insumo_id,
      SUM((pe->>'qtd')::int)             AS qtd_total,
      SUM((pe->>'peso_total')::numeric)  AS peso_total,
      COUNT(*) FILTER (WHERE pe->>'origem' = 'estoque') AS do_estoque,
      COUNT(*) FILTER (WHERE pe->>'origem' = 'cliente') AS do_cliente
    FROM alissonerp.servicos s,
         jsonb_array_elements(s.pedras_colocadas) AS pe
    WHERE s.status = 'concluido'
      AND s.concluido_em >= ${inicio}::timestamptz
      AND s.concluido_em <= ${fim}::timestamptz + INTERVAL '1 day'
      AND s.colocou_pedra = true
    GROUP BY pe->>'nome', pe->>'insumo_id'
    ORDER BY qtd_total DESC
  `;

  const pedras = rows.map(r => ({
    pedra_nome: r.pedra_nome as string,
    insumo_id:  r.insumo_id  as string,
    qtd_total:  parseInt(String(r.qtd_total ?? 0)),
    peso_total: parseFloat(String(r.peso_total ?? 0)),
    do_estoque: parseInt(String(r.do_estoque ?? 0)),
    do_cliente: parseInt(String(r.do_cliente ?? 0)),
  }));

  return NextResponse.json({ pedras, inicio, fim });
}
