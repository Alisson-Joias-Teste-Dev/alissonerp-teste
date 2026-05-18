import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { hasRole, ROLES_FISCAL } from "@/lib/roles";
import { zodError } from "@/lib/schemas/common";

const RegraFiscalPostSchema = z.object({
  empresa_emitente_id: z.coerce.number().int().nullable().optional(),
  ncm: z.string().min(1, "obrigatório"),
  uf_destino: z.string().nullable().optional(),
  cfop_saida: z.string().min(1, "obrigatório"),
  cfop_devolucao: z.string().nullable().optional(),
  csosn: z.string().nullable().optional(),
  cst_icms: z.string().nullable().optional(),
  origem: z.coerce.number().int().optional(),
  aliq_ibpt_federal: z.coerce.number().optional(),
  aliq_ibpt_estadual: z.coerce.number().optional(),
  aliq_ibpt_municipal: z.coerce.number().optional(),
  mva_st: z.coerce.number().nullable().optional(),
  aliq_icms_st: z.coerce.number().nullable().optional(),
}).passthrough();

async function getUserRole(userId: string): Promise<string | null> {
  const [row] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${userId}::uuid`;
  return row?.role ?? null;
}

type Row = {
  aliq_ibpt_federal: unknown;
  aliq_ibpt_estadual: unknown;
  aliq_ibpt_municipal: unknown;
  mva_st: unknown;
  aliq_icms_st: unknown;
};
function normalize(r: Row & Record<string, unknown>) {
  return {
    ...r,
    aliq_ibpt_federal: Number(r.aliq_ibpt_federal ?? 0),
    aliq_ibpt_estadual: Number(r.aliq_ibpt_estadual ?? 0),
    aliq_ibpt_municipal: Number(r.aliq_ibpt_municipal ?? 0),
    mva_st: r.mva_st != null ? Number(r.mva_st) : null,
    aliq_icms_st: r.aliq_icms_st != null ? Number(r.aliq_icms_st) : null,
  };
}

// ─── GET /api/fiscal/regras ─────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });

  const role = await getUserRole(user.id);
  if (!hasRole(role, ROLES_FISCAL)) {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const empresaIdRaw = searchParams.get("empresa_emitente_id");
  const empresaId = empresaIdRaw != null && empresaIdRaw !== "" ? Number(empresaIdRaw) : null;
  const ncm = searchParams.get("ncm");
  const uf = searchParams.get("uf");
  const ativoRaw = searchParams.get("ativo");
  const ativo = ativoRaw == null ? null : ativoRaw === "true";

  const rows = await sql`
    SELECT r.id, r.empresa_emitente_id, r.ncm, r.uf_destino, r.cfop_saida,
           r.cfop_devolucao, r.csosn, r.cst_icms, r.origem,
           r.aliq_ibpt_federal, r.aliq_ibpt_estadual, r.aliq_ibpt_municipal,
           r.mva_st, r.aliq_icms_st, r.ativo, r.created_at, r.updated_at,
           e.razao_social AS empresa_razao_social
    FROM alissonerp.regras_fiscais r
    LEFT JOIN alissonerp.empresas_emitentes e ON e.id = r.empresa_emitente_id
    WHERE (${empresaId}::int IS NULL OR r.empresa_emitente_id = ${empresaId})
      AND (${ncm}::text IS NULL OR r.ncm = ${ncm})
      AND (${uf}::text IS NULL OR r.uf_destino = ${uf})
      AND (${ativo}::boolean IS NULL OR r.ativo = ${ativo})
    ORDER BY r.ncm, r.uf_destino NULLS FIRST
  `;
  return NextResponse.json(rows.map((r) => normalize(r as Row & Record<string, unknown>)));
}

// ─── POST /api/fiscal/regras ────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });

  const role = await getUserRole(user.id);
  if (!hasRole(role, ROLES_FISCAL)) {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }

  const raw = await req.json().catch(() => null);
  if (raw === null) return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  const parsed = RegraFiscalPostSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data as Record<string, unknown>;

  const ncm = typeof body.ncm === "string" ? body.ncm.replace(/\D/g, "") : "";
  if (ncm.length !== 8) {
    return NextResponse.json({ error: "ncm deve ter 8 digitos" }, { status: 400 });
  }
  const cfopSaida = typeof body.cfop_saida === "string" ? body.cfop_saida.replace(/\D/g, "") : "";
  if (cfopSaida.length !== 4) {
    return NextResponse.json({ error: "cfop_saida deve ter 4 digitos" }, { status: 400 });
  }
  if (body.cfop_devolucao && String(body.cfop_devolucao).replace(/\D/g, "").length !== 4) {
    return NextResponse.json({ error: "cfop_devolucao deve ter 4 digitos" }, { status: 400 });
  }
  const origem = body.origem != null ? Number(body.origem) : 0;
  if (!Number.isInteger(origem) || origem < 0 || origem > 8) {
    return NextResponse.json({ error: "origem invalida (0-8)" }, { status: 400 });
  }
  if (body.uf_destino && String(body.uf_destino).length !== 2) {
    return NextResponse.json({ error: "uf_destino deve ter 2 caracteres" }, { status: 400 });
  }

  try {
    const [row] = await sql`
      INSERT INTO alissonerp.regras_fiscais (
        empresa_emitente_id, ncm, uf_destino, cfop_saida, cfop_devolucao,
        csosn, cst_icms, origem, aliq_ibpt_federal, aliq_ibpt_estadual,
        aliq_ibpt_municipal, mva_st, aliq_icms_st
      ) VALUES (
        ${body.empresa_emitente_id != null ? Number(body.empresa_emitente_id) : null},
        ${ncm},
        ${body.uf_destino ? String(body.uf_destino).toUpperCase() : null},
        ${cfopSaida},
        ${body.cfop_devolucao ? String(body.cfop_devolucao).replace(/\D/g, "") : null},
        ${body.csosn != null ? String(body.csosn) : null},
        ${body.cst_icms != null ? String(body.cst_icms) : null},
        ${origem},
        ${Number(body.aliq_ibpt_federal ?? 0)},
        ${Number(body.aliq_ibpt_estadual ?? 0)},
        ${Number(body.aliq_ibpt_municipal ?? 0)},
        ${body.mva_st != null ? Number(body.mva_st) : null},
        ${body.aliq_icms_st != null ? Number(body.aliq_icms_st) : null}
      )
      RETURNING id
    `;
    return NextResponse.json({ id: row.id }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("uq_regras_fiscais") || msg.includes("duplicate")) {
      return NextResponse.json({ error: "Regra ja existe para (empresa, NCM, UF)" }, { status: 400 });
    }
    console.error("POST /api/fiscal/regras:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
