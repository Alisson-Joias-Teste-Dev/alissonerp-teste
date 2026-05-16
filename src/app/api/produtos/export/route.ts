import { NextResponse } from "next/server";
import { headers } from "next/headers";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const authHeader = (await headers()).get("authorization");
    let user = null;
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      const { data, error } = await supabase.auth.getUser(token);
      if (error) return NextResponse.json({ error: error.message }, { status: 401 });
      user = data.user;
    } else {
      const { data } = await supabase.auth.getUser();
      user = data.user;
    }
    if (!user) return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });

    const produtos = await sql`
      SELECT id_produto, id_api_produto, sku, nome
      FROM public.produtos
      WHERE situacao = 'A'
      ORDER BY id_api_produto
    `;

    return NextResponse.json({
      produtos: produtos.map((p: any) => ({
        produto_id: Number(p.id_produto),
        id_api_produto: Number(p.id_api_produto),
        sku: p.sku ?? "",
        nome: p.nome ?? "",
      })),
    });
  } catch (e: any) {
    console.error("[produtos/export]", e);
    return NextResponse.json({ error: e?.message ?? "Erro interno" }, { status: 500 });
  }
}
