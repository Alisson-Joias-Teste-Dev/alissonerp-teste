/**
 * GET  /api/produtos/normalizar-metal?regra=ouro
 *      Preview: quantos produtos SERIAM afetados e amostra.
 *
 * POST /api/produtos/normalizar-metal
 *      body: { regra: 'ouro' }
 *      Aplica UPDATE em massa. Retorna qtd atualizada.
 *
 * Regra 'ouro':
 *   Produtos ativos com tipo_metal vazio/null cujo NOME contém "ouro"
 *   (case-insensitive) → tipo_metal = 'Ouro 18k'.
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

  const regra = req.nextUrl.searchParams.get("regra") ?? "ouro";
  if (regra !== "ouro") return NextResponse.json({ error: "Regra desconhecida" }, { status: 400 });

  const [{ total }] = await sql<{ total: string }[]>`
    SELECT COUNT(*)::text AS total
    FROM public.produtos
    WHERE situacao = 'A'
      AND (tipo_metal IS NULL OR TRIM(tipo_metal) = '')
      AND nome ILIKE '%ouro%'
  `;

  const amostra = await sql`
    SELECT id_produto, sku, nome, tipo_metal
    FROM public.produtos
    WHERE situacao = 'A'
      AND (tipo_metal IS NULL OR TRIM(tipo_metal) = '')
      AND nome ILIKE '%ouro%'
    ORDER BY nome
    LIMIT 15
  `;

  return NextResponse.json({ regra, totalAfetados: Number(total), amostra });
}

export async function POST(req: NextRequest) {
  const a = await auth("escrever");
  if ("error" in a) return a.error;

  const body = await req.json().catch(() => ({}));
  const regra = body?.regra ?? "ouro";
  if (regra !== "ouro") return NextResponse.json({ error: "Regra desconhecida" }, { status: 400 });

  const rows = await sql<{ id_produto: number }[]>`
    UPDATE public.produtos
    SET tipo_metal = 'Ouro 18k'
    WHERE situacao = 'A'
      AND (tipo_metal IS NULL OR TRIM(tipo_metal) = '')
      AND nome ILIKE '%ouro%'
    RETURNING id_produto
  `;

  return NextResponse.json({ regra, atualizados: rows.length });
}
