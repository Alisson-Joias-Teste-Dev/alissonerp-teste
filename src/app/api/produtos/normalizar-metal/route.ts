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
import { z } from "zod";
import { authOr401 } from "@/lib/auth-server";
import { temAcessoModulo } from "@/lib/permissoes";
import sql from "@/lib/db";
import { zodError } from "@/lib/schemas/common";

const NormalizarMetalSchema = z.object({
  regra: z.string().optional(),
}).passthrough();

async function auth(req: NextRequest | undefined, acao: "ler" | "escrever" = "ler") {
  const [user, errRes] = await authOr401(req);
  if (errRes) return { error: errRes };
  if (!(await temAcessoModulo(user.role, "produtos", acao))) {
    return { error: NextResponse.json({ error: "Sem permissão" }, { status: 403 }) };
  }
  return { user };
}

export async function GET(req: NextRequest) {
  const a = await auth(req, "ler");
  if ("error" in a) return a.error;

  const regra = req.nextUrl.searchParams.get("regra") ?? "ouro";
  if (regra !== "ouro") return NextResponse.json({ error: "Regra desconhecida" }, { status: 400 });

  const [{ total }] = await sql<{ total: string }[]>`
    -- Situacao/metal da verdade (erp_produtos) — a copia public só e preenchida no
    -- INSERT, entao a normalizacao mirava um conjunto desatualizado. Nome segue da
    -- copia (decisao do Jonathan, 21/08/2026).
    SELECT COUNT(*)::text AS total
    FROM public.produtos p
    LEFT JOIN alissonerp.erp_produtos e ON e.produto_id = p.id_produto
    WHERE p.situacao = 'A'
      AND (COALESCE(e.tipo_metal, p.tipo_metal) IS NULL OR TRIM(COALESCE(e.tipo_metal, p.tipo_metal)) = '')
      AND p.nome ILIKE '%ouro%'
  `;

  const amostra = await sql`
    SELECT p.id_produto,
           COALESCE(e.sku, p.sku) AS sku,
           p.nome,
           COALESCE(e.tipo_metal, p.tipo_metal) AS tipo_metal
    FROM public.produtos p
    LEFT JOIN alissonerp.erp_produtos e ON e.produto_id = p.id_produto
    WHERE p.situacao = 'A'
      AND (COALESCE(e.tipo_metal, p.tipo_metal) IS NULL OR TRIM(COALESCE(e.tipo_metal, p.tipo_metal)) = '')
      AND p.nome ILIKE '%ouro%'
    ORDER BY p.nome
    LIMIT 15
  `;

  return NextResponse.json({ regra, totalAfetados: Number(total), amostra });
}

export async function POST(req: NextRequest) {
  const a = await auth(req, "escrever");
  if ("error" in a) return a.error;

  const raw = await req.json().catch(() => ({}));
  const parsed = NormalizarMetalSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const regra = parsed.data.regra ?? "ouro";
  if (regra !== "ouro") return NextResponse.json({ error: "Regra desconhecida" }, { status: 400 });

  const rows = await sql<{ id_produto: number }[]>`
    UPDATE alissonerp.erp_produtos
    SET tipo_metal = 'Ouro 18k'
    WHERE situacao = 'A'
      AND (tipo_metal IS NULL OR TRIM(tipo_metal) = '')
      AND nome ILIKE '%ouro%'
    RETURNING id_produto
  `;

  return NextResponse.json({ regra, atualizados: rows.length });
}
