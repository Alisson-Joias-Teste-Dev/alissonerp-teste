/**
 * GET  /api/produtos/rename-metal?from=A,B&to=C
 *      Preview — retorna qtd que seria alterada.
 *
 * POST /api/produtos/rename-metal
 *      body: { from: string[], to: string | null }
 *      Atualiza em massa tipo_metal = to onde tipo_metal ∈ from.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authOr401 } from "@/lib/auth-server";
import { temAcessoModulo } from "@/lib/permissoes";
import sql from "@/lib/db";
import { zodError } from "@/lib/schemas/common";

const RenameMetalSchema = z.object({
  from: z.array(z.string()).min(1, "from obrigatório"),
  to: z.string().nullable().optional(),
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
  const a = await auth(req, "escrever");
  if ("error" in a) return a.error;

  const raw = await req.json().catch(() => ({}));
  const parsed = RenameMetalSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { from, to } = parsed.data;

  const toValue = typeof to === "string" ? (to.trim() || null) : null;

  const rows = await sql<{ id_produto: number }[]>`
    UPDATE alissonerp.erp_produtos
    SET tipo_metal = ${toValue}
    WHERE tipo_metal = ANY(${from})
    RETURNING id_produto
  `;

  return NextResponse.json({ from, to: toValue, atualizados: rows.length });
}
