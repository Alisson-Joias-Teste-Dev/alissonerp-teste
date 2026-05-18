import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { hasRole, ROLES_FISCAL } from "@/lib/roles";
import { zodError } from "@/lib/schemas/common";

const RegraFiscalPatchSchema = z.object({
  empresa_emitente_id: z.coerce.number().int().nullable().optional(),
  ncm: z.string().optional(),
  uf_destino: z.string().nullable().optional(),
  cfop_saida: z.string().optional(),
  cfop_devolucao: z.string().nullable().optional(),
  csosn: z.string().nullable().optional(),
  cst_icms: z.string().nullable().optional(),
  origem: z.coerce.number().int().min(0).max(8).optional(),
  aliq_ibpt_federal: z.coerce.number().optional(),
  aliq_ibpt_estadual: z.coerce.number().optional(),
  aliq_ibpt_municipal: z.coerce.number().optional(),
  mva_st: z.coerce.number().nullable().optional(),
  aliq_icms_st: z.coerce.number().nullable().optional(),
  ativo: z.boolean().optional(),
}).passthrough();

async function getUserRole(userId: string): Promise<string | null> {
  const [row] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${userId}::uuid`;
  return row?.role ?? null;
}

const s = (v: unknown): string | null => v == null ? null : String(v);
const n = (v: unknown): number | null => v == null ? null : Number(v);
const bo = (v: unknown): boolean | null => typeof v === "boolean" ? v : null;

// ─── GET /api/fiscal/regras/[id] ───────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });

  const role = await getUserRole(user.id);
  if (!hasRole(role, ROLES_FISCAL)) {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }

  const { id } = await params;
  const rid = Number(id);
  if (isNaN(rid)) return NextResponse.json({ error: "id invalido" }, { status: 400 });

  const [row] = await sql`
    SELECT r.*, e.razao_social AS empresa_razao_social
    FROM alissonerp.regras_fiscais r
    LEFT JOIN alissonerp.empresas_emitentes e ON e.id = r.empresa_emitente_id
    WHERE r.id = ${rid}
  `;
  if (!row) return NextResponse.json({ error: "Nao encontrada" }, { status: 404 });
  return NextResponse.json({
    ...row,
    aliq_ibpt_federal: Number(row.aliq_ibpt_federal ?? 0),
    aliq_ibpt_estadual: Number(row.aliq_ibpt_estadual ?? 0),
    aliq_ibpt_municipal: Number(row.aliq_ibpt_municipal ?? 0),
    mva_st: row.mva_st != null ? Number(row.mva_st) : null,
    aliq_icms_st: row.aliq_icms_st != null ? Number(row.aliq_icms_st) : null,
  });
}

// ─── PATCH /api/fiscal/regras/[id] ─────────────────────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });

  const role = await getUserRole(user.id);
  if (!hasRole(role, ROLES_FISCAL)) {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }

  const { id } = await params;
  const rid = Number(id);
  if (isNaN(rid)) return NextResponse.json({ error: "id invalido" }, { status: 400 });

  const raw = await req.json().catch(() => null);
  if (raw === null) return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  const parsed = RegraFiscalPatchSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data as Record<string, unknown>;

  try {
    const [row] = await sql`
      UPDATE alissonerp.regras_fiscais SET
        empresa_emitente_id = COALESCE(${n(body.empresa_emitente_id)}::int, empresa_emitente_id),
        ncm                 = COALESCE(${s(body.ncm)}::text, ncm),
        uf_destino          = COALESCE(${s(body.uf_destino)}::text, uf_destino),
        cfop_saida          = COALESCE(${s(body.cfop_saida)}::text, cfop_saida),
        cfop_devolucao      = COALESCE(${s(body.cfop_devolucao)}::text, cfop_devolucao),
        csosn               = COALESCE(${s(body.csosn)}::text, csosn),
        cst_icms            = COALESCE(${s(body.cst_icms)}::text, cst_icms),
        origem              = COALESCE(${n(body.origem)}::smallint, origem),
        aliq_ibpt_federal   = COALESCE(${n(body.aliq_ibpt_federal)}::numeric, aliq_ibpt_federal),
        aliq_ibpt_estadual  = COALESCE(${n(body.aliq_ibpt_estadual)}::numeric, aliq_ibpt_estadual),
        aliq_ibpt_municipal = COALESCE(${n(body.aliq_ibpt_municipal)}::numeric, aliq_ibpt_municipal),
        mva_st              = COALESCE(${n(body.mva_st)}::numeric, mva_st),
        aliq_icms_st        = COALESCE(${n(body.aliq_icms_st)}::numeric, aliq_icms_st),
        ativo               = COALESCE(${bo(body.ativo)}::boolean, ativo),
        updated_at          = NOW()
      WHERE id = ${rid}
      RETURNING id
    `;
    if (!row) return NextResponse.json({ error: "Nao encontrada" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("PATCH /api/fiscal/regras/[id]:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

// ─── DELETE /api/fiscal/regras/[id] — soft delete ──────────────────────────
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });

  const role = await getUserRole(user.id);
  if (!hasRole(role, ROLES_FISCAL)) {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }

  const { id } = await params;
  const rid = Number(id);
  if (isNaN(rid)) return NextResponse.json({ error: "id invalido" }, { status: 400 });

  const [row] = await sql`
    UPDATE alissonerp.regras_fiscais
       SET ativo = false, updated_at = NOW()
     WHERE id = ${rid}
     RETURNING id
  `;
  if (!row) return NextResponse.json({ error: "Nao encontrada" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
