import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

// GET /api/ordens/busca?q=C-1865
// Busca rápida de ordem por número — retorna id + numero_ordem + tipo_ordem + cliente_nome
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (!q) return NextResponse.json([]);

  const rows = await sql`
    SELECT o.id, o.numero_ordem, o.tipo_ordem::text AS tipo_ordem,
           c.nome AS cliente_nome, o.situacao::text AS situacao
    FROM alissonerp.ordens o
    LEFT JOIN public.contatos c ON c.id_contato = o.cliente_id
    WHERE o.numero_ordem ILIKE ${'%' + q + '%'}
      AND o.situacao != 'cancelado'
    ORDER BY o.numero_ordem
    LIMIT 10
  `;

  return NextResponse.json(rows);
}
