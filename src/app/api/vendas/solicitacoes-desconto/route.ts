import { NextRequest, NextResponse } from "next/server";
import sql, { normalizeRow } from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

const FULL_ROLES = ["desenvolvedor", "admin"];

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [u] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  if (!u || !FULL_ROLES.includes(u.role as string)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? "pendente";

  const rows = await sql`
    SELECT id, venda_id, item_id, produto_nome, preco_lista,
           pct_desconto_solicitado, preco_solicitado, status,
           solicitado_por_nome, autorizado_por_nome, observacao, created_at
    FROM alissonerp.solicitacoes_desconto
    WHERE status = ${status}
    ORDER BY created_at DESC
    LIMIT 100
  `;

  // BLINDAGEM: preco_lista/pct_desconto_solicitado/preco_solicitado sao NUMERIC
  // no banco — o driver postgres.js devolve como string. Sem normalizar, a tela
  // de Autorizacoes (AutorizacoesClient) exibe o valor cru em vez de "R$ X,XX".
  return NextResponse.json(
    rows.map((r) => normalizeRow(r, ["preco_lista", "pct_desconto_solicitado", "preco_solicitado"]))
  );
}
