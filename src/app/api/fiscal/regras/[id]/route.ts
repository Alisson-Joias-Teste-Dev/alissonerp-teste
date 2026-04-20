import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { hasRole, ROLES_FISCAL } from "@/lib/roles";

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

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  if (body.origem !== undefined) {
    const o = Number(body.origem);
    if (!Number.isInteger(o) || o < 0 || o > 8) {
      return NextResponse.json({ error: "origem invalida (0-8)" }, { status: 400 });
    }
  }

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
