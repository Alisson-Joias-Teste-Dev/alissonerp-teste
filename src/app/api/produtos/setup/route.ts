/**
 * GET /api/produtos/setup
 * Dados de inicialização para o modal de cadastro de produto:
 *   nextSku       — próximo SKU numérico disponível
 *   categorias    — lista de public."categoria_precificação"
 *   cotacao       — ouro (BRL/g) e dollar (BRL/USD) de public.parametros
 */

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isProdutosAccess } from "@/lib/roles";
import sql from "@/lib/db";

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const role = user.user_metadata?.role as string | undefined;
  if (!isProdutosAccess(role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  try {
    const [skuRow] = await sql<{ next: string }[]>`
      SELECT (COALESCE(MAX(sku::integer), 1603) + 1)::text AS next
      FROM public.produtos
      WHERE sku ~ '^[0-9]+$'
    `;

    const [skuAJRow] = await sql<{ next: string }[]>`
      SELECT 'AJ' || (COALESCE(MAX(CAST(REPLACE(sku, 'AJ', '') AS INTEGER)), 1000) + 1)::text AS next
      FROM public.produtos
      WHERE sku ~ '^AJ[0-9]+$'
    `;

    const categorias = await sql`
      SELECT id::integer AS id,
             "categoryName" AS nome,
             "range"        AS faixa,
             "curvePoints"  AS "curvePoints"
      FROM public."categoria_precificação"
      ORDER BY id
    `;

    const [cotacao] = await sql<{ ouro: number; dollar: number }[]>`
      SELECT ouro, dollar FROM public.parametros LIMIT 1
    `;

    return NextResponse.json({
      nextSku: skuRow?.next ?? "1604",
      nextSkuAJ: skuAJRow?.next ?? "AJ1001",
      categorias,
      cotacao: { ouro: cotacao?.ouro ?? 860, dollar: cotacao?.dollar ?? 5.24 },
    });
  } catch (err) {
    console.error("[GET /api/produtos/setup]", err);
    return NextResponse.json({ error: "Erro ao carregar setup" }, { status: 500 });
  }
}
