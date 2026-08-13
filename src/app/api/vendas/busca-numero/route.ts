import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  if (!q || q.length < 2) return NextResponse.json([]);

  const rows = await sql`
    SELECT id, numero_venda, total_venda AS valor_total, situacao, created_at,
      c.nome AS cliente_nome
    FROM alissonerp.vendas_erp v
    LEFT JOIN public.contatos c ON c.id_contato = v.cliente_id
    WHERE v.numero_venda::text ILIKE ${"%" + q + "%"}
    ORDER BY v.created_at DESC
    LIMIT 10
  `;

  return NextResponse.json(rows);
}
