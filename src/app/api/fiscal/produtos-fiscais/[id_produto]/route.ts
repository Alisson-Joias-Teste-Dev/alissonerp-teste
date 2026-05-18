import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { hasRole, ROLES_FISCAL } from "@/lib/roles";
import { zodError } from "@/lib/schemas/common";

const ProdutoFiscalPutSchema = z.object({
  ncm: z.string().nullable().optional(),
  cest: z.string().nullable().optional(),
  cfop_saida: z.string().nullable().optional(),
  origem: z.coerce.number().int().optional(),
  unidade_comercial: z.string().optional(),
  ean: z.string().nullable().optional(),
}).passthrough();

async function getUserRole(userId: string): Promise<string | null> {
  const [row] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${userId}::uuid`;
  return row?.role ?? null;
}

// id_produto eh BIGINT — mantemos como string no path e passamos ::bigint no SQL.
// ─── GET /api/fiscal/produtos-fiscais/[id_produto] ─────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id_produto: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });

  const role = await getUserRole(user.id);
  if (!hasRole(role, ROLES_FISCAL)) {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }

  const { id_produto } = await params;
  if (!/^\d+$/.test(id_produto)) {
    return NextResponse.json({ error: "id_produto invalido" }, { status: 400 });
  }

  const [row] = await sql`
    SELECT id_produto, ncm, cest, cfop_saida, origem, unidade_comercial, ean, updated_at
    FROM alissonerp.produtos_fiscais
    WHERE id_produto = ${id_produto}::bigint
  `;
  if (!row) return NextResponse.json({ error: "Nao encontrado" }, { status: 404 });
  return NextResponse.json({ ...row, id_produto: String(row.id_produto) });
}

// ─── PUT /api/fiscal/produtos-fiscais/[id_produto] — upsert ────────────────
// Body: { ncm?, cest?, cfop_saida?, origem?, unidade_comercial?, ean? }
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id_produto: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });

  const role = await getUserRole(user.id);
  if (!hasRole(role, ROLES_FISCAL)) {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }

  const { id_produto } = await params;
  if (!/^\d+$/.test(id_produto)) {
    return NextResponse.json({ error: "id_produto invalido" }, { status: 400 });
  }

  const raw = await req.json().catch(() => null);
  if (raw === null) return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  const parsed = ProdutoFiscalPutSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data as Record<string, unknown>;

  // Validacoes
  const ncm = body.ncm != null && body.ncm !== "" ? String(body.ncm).replace(/\D/g, "") : null;
  if (ncm !== null && ncm.length !== 8) {
    return NextResponse.json({ error: "ncm deve ter 8 digitos" }, { status: 400 });
  }
  const cest = body.cest != null && body.cest !== "" ? String(body.cest).replace(/\D/g, "") : null;
  if (cest !== null && cest.length !== 7) {
    return NextResponse.json({ error: "cest deve ter 7 digitos" }, { status: 400 });
  }
  const cfopSaida = body.cfop_saida != null && body.cfop_saida !== "" ? String(body.cfop_saida).replace(/\D/g, "") : null;
  if (cfopSaida !== null && cfopSaida.length !== 4) {
    return NextResponse.json({ error: "cfop_saida deve ter 4 digitos" }, { status: 400 });
  }
  const origem = body.origem != null ? Number(body.origem) : 0;
  if (!Number.isInteger(origem) || origem < 0 || origem > 8) {
    return NextResponse.json({ error: "origem invalida (0-8)" }, { status: 400 });
  }
  const unidade = typeof body.unidade_comercial === "string" && body.unidade_comercial.length > 0
    ? body.unidade_comercial.slice(0, 6)
    : "UN";
  if (unidade.length > 6) {
    return NextResponse.json({ error: "unidade_comercial max 6 chars" }, { status: 400 });
  }
  let ean: string | null = null;
  if (body.ean != null && body.ean !== "") {
    ean = String(body.ean).replace(/\D/g, "");
    if (![8, 12, 13, 14].includes(ean.length)) {
      return NextResponse.json({ error: "ean deve ter 8, 12, 13 ou 14 digitos" }, { status: 400 });
    }
  }

  try {
    await sql`
      INSERT INTO alissonerp.produtos_fiscais (
        id_produto, ncm, cest, cfop_saida, origem, unidade_comercial, ean, updated_at
      ) VALUES (
        ${id_produto}::bigint,
        ${ncm},
        ${cest},
        ${cfopSaida},
        ${origem},
        ${unidade},
        ${ean},
        NOW()
      )
      ON CONFLICT (id_produto) DO UPDATE SET
        ncm               = EXCLUDED.ncm,
        cest              = EXCLUDED.cest,
        cfop_saida        = EXCLUDED.cfop_saida,
        origem            = EXCLUDED.origem,
        unidade_comercial = EXCLUDED.unidade_comercial,
        ean               = EXCLUDED.ean,
        updated_at        = NOW()
    `;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("PUT /api/fiscal/produtos-fiscais:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
