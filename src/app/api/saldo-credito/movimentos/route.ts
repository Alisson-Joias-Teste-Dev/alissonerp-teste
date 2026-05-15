import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess, hasRole } from "@/lib/roles";
import { normalizeRow } from "@/lib/db";

const ROLES_VER_SALDO = ["desenvolvedor", "admin", "diretor", "gerente_loja"];

// ─── GET /api/saldo-credito/movimentos ──────────────────────────────────────
// Lista movimentações do saldo de crédito com filtros opcionais.
// Query params: inicio, fim, venda_id, tipo, page (default 1), limit (default 50)
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario || (!isFullAccess(usuario.role) && !hasRole(usuario.role, ROLES_VER_SALDO))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const inicio = searchParams.get("inicio");
  const fim = searchParams.get("fim");
  const vendaIdParam = searchParams.get("venda_id");
  const tipo = searchParams.get("tipo");
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? 50)));
  const offset = (page - 1) * limit;

  const movimentos = await sql`
    SELECT
      s.id, s.tipo, s.valor, s.saldo_antes, s.saldo_depois,
      s.venda_id, s.pagamento_id, s.descricao, s.created_at,
      u.nome AS usuario_nome,
      v.numero_venda
    FROM alissonerp.saldo_credito_loja s
    LEFT JOIN alissonerp.usuarios u ON u.id = s.usuario_id
    LEFT JOIN alissonerp.vendas_erp v ON v.id = s.venda_id
    WHERE 1=1
      ${inicio ? sql`AND s.created_at >= ${inicio}::date` : sql``}
      ${fim ? sql`AND s.created_at < (${fim}::date + interval '1 day')` : sql``}
      ${vendaIdParam ? sql`AND s.venda_id = ${Number(vendaIdParam)}` : sql``}
      ${tipo ? sql`AND s.tipo = ${tipo}` : sql``}
    ORDER BY s.id DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const [countRow] = await sql`
    SELECT COUNT(*) AS total FROM alissonerp.saldo_credito_loja s
    WHERE 1=1
      ${inicio ? sql`AND s.created_at >= ${inicio}::date` : sql``}
      ${fim ? sql`AND s.created_at < (${fim}::date + interval '1 day')` : sql``}
      ${vendaIdParam ? sql`AND s.venda_id = ${Number(vendaIdParam)}` : sql``}
      ${tipo ? sql`AND s.tipo = ${tipo}` : sql``}
  `;

  const numericFields = ["valor", "saldo_antes", "saldo_depois"];
  return NextResponse.json({
    movimentos: movimentos.map((m) => normalizeRow(m, numericFields)),
    total: Number(countRow.total),
    page,
    limit,
  });
}
