import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

// POST /api/vendas/[id]/compartilhar
// Retorna (ou regenera) o token público de compartilhamento da venda
// Query param: ?regenerar=true para gerar novo token
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const vendaId = Number(id);
  if (isNaN(vendaId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const regenerar = new URL(req.url).searchParams.get("regenerar") === "true";

  if (regenerar) {
    await sql`
      UPDATE alissonerp.vendas_erp
      SET token_compartilhamento = gen_random_uuid()
      WHERE id = ${vendaId}
    `;
  }

  const [venda] = await sql`
    SELECT token_compartilhamento FROM alissonerp.vendas_erp WHERE id = ${vendaId}
  `;
  if (!venda) return NextResponse.json({ error: "Venda não encontrada" }, { status: 404 });

  return NextResponse.json({ token: venda.token_compartilhamento });
}
