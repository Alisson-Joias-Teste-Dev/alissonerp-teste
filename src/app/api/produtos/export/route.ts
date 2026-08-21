import { NextResponse } from "next/server";
import { headers } from "next/headers";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { internalError } from "@/lib/api-error";

export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const authHeader = (await headers()).get("authorization");
    let user = null;
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      const { data, error } = await supabase.auth.getUser(token);
      if (error) return NextResponse.json({ error: "Token inválido" }, { status: 401 });
      user = data.user;
    } else {
      const { data } = await supabase.auth.getUser();
      user = data.user;
    }
    if (!user) return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });

    // REGRA DE NEGOCIO (11/07 — Jonathan): o app baixa os produtos por aqui e os
    // guarda pela chave id_api_produto (o numero gravado na etiqueta). Esse id fica
    // na alissonerp.erp_produtos, mas o espelho pro public.produtos so propaga no
    // INSERT — quando o id chega depois por UPDATE (sync Tiny pos-cadastro) nunca
    // alcanca o public. Lendo so do public, o produto vinha com id_api NULL e o app
    // nao casava a etiqueta lida com o SKU (ex.: 1840-18). Resolve pela erp
    // (view produtos_compat) com fallback pro public; onde as duas tem, e identico.
    const produtos = await sql`
      SELECT p.id_produto,
             COALESCE(pc.id_api_produto, COALESCE(erpv.id_api_produto, p.id_api_produto)) AS id_api_produto,
             COALESCE(erpv.sku, p.sku) AS sku, p.nome
      FROM public.produtos p
      LEFT JOIN alissonerp.erp_produtos erpv ON erpv.produto_id = p.id_produto
      LEFT JOIN alissonerp.produtos_compat pc ON pc.id_produto = p.id_produto
      WHERE p.situacao = 'A'
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
  } catch (err) {
    return internalError("[GET /api/produtos/export]", err);
  }
}
