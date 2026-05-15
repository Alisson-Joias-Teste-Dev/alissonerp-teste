import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET(_req: NextRequest) {
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

  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const inventarios = await sql`
    SELECT
      i.id, i.local_estoque_id, le.nome AS local_nome,
      i.status, i.categoria, i.data_abertura, i.obs, i.created_at,
      (SELECT COUNT(*) FROM alissonerp.itens_inventario_comercial WHERE inventario_id = i.id) AS total_itens,
      (SELECT COUNT(*) FROM alissonerp.itens_inventario_comercial WHERE inventario_id = i.id AND quantidade_contada IS NOT NULL) AS itens_contados
    FROM alissonerp.inventarios_comercial i
    JOIN alissonerp.locais_estoque le ON le.id = i.local_estoque_id
    WHERE i.status IN ('aberto', 'em_contagem')
    ORDER BY
      CASE i.status WHEN 'em_contagem' THEN 0 ELSE 1 END,
      i.created_at DESC
  `;

  if (inventarios.length === 0) {
    return NextResponse.json({ inventarios: [] });
  }

  const ids = inventarios.map((inv: any) => inv.id);
  const itens = await sql`
    SELECT
      ii.id, ii.inventario_id, ii.produto_id,
      p.sku, p.nome, ii.quantidade_sistema,
      ii.quantidade_contada, ii.conferido
    FROM alissonerp.itens_inventario_comercial ii
    JOIN public.produtos p ON p.id_produto = ii.produto_id
    WHERE ii.inventario_id = ANY(${ids}::int[])
    ORDER BY ii.id
  `;

  const itensPorInventario = new Map<number, any[]>();
  for (const item of itens) {
    const list = itensPorInventario.get(item.inventario_id) ?? [];
    list.push({
      id: item.id,
      produto_id: Number(item.produto_id),
      sku: item.sku ?? "",
      nome: item.nome ?? "",
      quantidade_sistema: Number(item.quantidade_sistema),
      quantidade_contada: item.quantidade_contada != null ? Number(item.quantidade_contada) : null,
      conferido: item.conferido ?? false,
    });
    itensPorInventario.set(item.inventario_id, list);
  }

  const resultado = inventarios.map((inv: any) => ({
    id: inv.id,
    local_estoque_id: inv.local_estoque_id,
    local_nome: inv.local_nome,
    categoria: inv.categoria,
    status: inv.status,
    obs: inv.obs,
    data_abertura: inv.data_abertura,
    total_itens: Number(inv.total_itens),
    itens_contados: Number(inv.itens_contados),
    itens: itensPorInventario.get(inv.id) ?? [],
  }));

  return NextResponse.json({ inventarios: resultado });
  } catch (e: any) {
    console.error("[inventario/app]", e);
    return NextResponse.json({ error: e?.message ?? "Erro interno" }, { status: 500 });
  }
}
