/**
 * GET  /api/produtos/rename-metal?from=A,B&to=C
 *      Preview — retorna qtd que seria alterada.
 *
 * POST /api/produtos/rename-metal
 *      body: { from: string[], to: string | null }
 *      Atualiza em massa tipo_metal = to onde tipo_metal ∈ from.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { temAcessoModulo } from "@/lib/permissoes";
import sql from "@/lib/db";

async function auth(acao: "ler" | "escrever" = "ler") {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) };
  const role = user.user_metadata?.role as string | undefined;
  if (!(await temAcessoModulo(role ?? "", "produtos", acao))) {
    return { error: NextResponse.json({ error: "Sem permissão" }, { status: 403 }) };
  }
  return { user };
}

export async function GET(req: NextRequest) {
  const a = await auth("ler");
  if ("error" in a) return a.error;

  const from = (req.nextUrl.searchParams.get("from") ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  const to = req.nextUrl.searchParams.get("to");
  if (from.length === 0) return NextResponse.json({ error: "from é obrigatório" }, { status: 400 });

  const [{ total }] = await sql<{ total: string }[]>`
    SELECT COUNT(*)::text AS total
    FROM public.produtos
    WHERE tipo_metal = ANY(${from})
  `;
  return NextResponse.json({ from, to, totalAfetados: Number(total) });
}

export async function POST(req: NextRequest) {
  const a = await auth("escrever");
  if ("error" in a) return a.error;

  const body = await req.json().catch(() => ({}));
  const from: unknown = body?.from;
  const to: unknown = body?.to;
  if (!Array.isArray(from) || from.length === 0 || !from.every((x) => typeof x === "string")) {
    return NextResponse.json({ error: "from deve ser array de strings não vazias" }, { status: 400 });
  }
  if (to !== null && typeof to !== "string") {
    return NextResponse.json({ error: "to deve ser string ou null" }, { status: 400 });
  }

  const toValue = typeof to === "string" ? (to.trim() || null) : null;

  const rows = await sql<{ id_produto: number }[]>`
    UPDATE public.produtos
    SET tipo_metal = ${toValue}
    WHERE tipo_metal = ANY(${from as string[]})
    RETURNING id_produto
  `;

  return NextResponse.json({ from, to: toValue, atualizados: rows.length });
}
