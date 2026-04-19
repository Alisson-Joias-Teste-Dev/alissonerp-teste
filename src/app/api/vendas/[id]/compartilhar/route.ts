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

  // Verificar permissão: vendedor da venda ou admin/dev/gerente
  const [vendaCheck] = await sql`
    SELECT v.vendedor_id, u.role FROM alissonerp.vendas_erp v
    JOIN alissonerp.usuarios u ON u.id = ${user.id}::uuid
    WHERE v.id = ${vendaId}
  `;
  if (!vendaCheck) return NextResponse.json({ error: "Venda não encontrada" }, { status: 404 });
  const ROLES_COMPARTILHAR = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja"];
  const isVendedor = vendaCheck.vendedor_id && await sql`
    SELECT 1 FROM public.vendedores WHERE id_vendedor = ${vendaCheck.vendedor_id}
    AND id_vendedor = (SELECT vendedor_id FROM alissonerp.usuarios WHERE id = ${user.id}::uuid)
  `.then(r => r.length > 0).catch(() => false);
  if (!ROLES_COMPARTILHAR.includes(vendaCheck.role) && !isVendedor) {
    return NextResponse.json({ error: "Sem permissão para compartilhar esta venda" }, { status: 403 });
  }

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
