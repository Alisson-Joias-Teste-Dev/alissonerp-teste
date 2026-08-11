import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { internalError } from "@/lib/api-error";

export async function GET(req: NextRequest) {
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

    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const idApiParam = req.nextUrl.searchParams.get("id_api");
    if (!idApiParam) {
      return NextResponse.json({ error: "id_api requerido" }, { status: 400 });
    }
    const idApi = Number(idApiParam);
    if (!Number.isFinite(idApi)) {
      return NextResponse.json({ error: "id_api invalido" }, { status: 400 });
    }

    // REGRA DE NEGOCIO (11/07 — Jonathan): resolve o produto pelo id_api olhando
    // a erp_produtos (via produtos_compat) ALEM da public.produtos — mesmo motivo
    // do export: o id gravado por UPDATE nao chega no public, entao o app nao achava
    // o produto (SKU vazio). Erp primeiro; onde as duas tem, o numero e identico.
    const rows = await sql`
      SELECT id_produto, id_api_produto, sku, nome
      FROM (
        SELECT produto_id AS id_produto, id_api_produto, sku, nome, 1 AS pri
          FROM alissonerp.produtos_compat WHERE id_api_produto = ${idApi}
        UNION ALL
        SELECT id_produto, id_api_produto, sku, nome, 2 AS pri
          FROM public.produtos WHERE id_api_produto = ${idApi}
      ) t
      ORDER BY pri
      LIMIT 1
    `;

    if (rows.length === 0) {
      return NextResponse.json({ error: "Produto nao encontrado" }, { status: 404 });
    }

    const p = rows[0] as any;
    return NextResponse.json({
      produto_id: Number(p.id_produto),
      id_api_produto: Number(p.id_api_produto),
      sku: p.sku ?? "",
      nome: p.nome ?? "",
    });
  } catch (err) {
    return internalError("[GET /api/produtos/lookup]", err);
  }
}
