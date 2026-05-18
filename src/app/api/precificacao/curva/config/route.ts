/**
 * GET   /api/precificacao/curva/config — retorna singleton alissonerp.curva_config
 * PATCH /api/precificacao/curva/config — atualiza campos (partial update)
 *
 * Permissoes:
 *   - GET: isPrecificacaoAccess
 *   - PATCH: isFullAccess
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authOr401 } from "@/lib/auth-server";
import { isFullAccess } from "@/lib/roles";
import sql from "@/lib/db";
import { normalizeConfigRow } from "@/lib/curva-precificacao";
import { zodError } from "@/lib/schemas/common";

const CurvaConfigPatchSchema = z.object({
  start_mkp: z.coerce.number().optional(),
  start_commission: z.coerce.number().optional(),
  gold_cost_percentage: z.coerce.number().optional(),
  sucata_compra_min_pct: z.coerce.number().optional(),
  sucata_compra_max_pct: z.coerce.number().optional(),
  arredondamento: z.string().optional(),
}).passthrough();

export async function GET(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  void user;

  try {
    const rows = await sql`
      SELECT id, start_mkp, start_commission, gold_cost_percentage,
             sucata_compra_min_pct, sucata_compra_max_pct, arredondamento,
             updated_at, updated_by
      FROM alissonerp.curva_config
      WHERE id = 1
      LIMIT 1
    `;

    if (rows.length === 0) {
      return NextResponse.json({ error: "Config não inicializada" }, { status: 404 });
    }

    const raw = rows[0] as unknown as Record<string, unknown>;
    const config = normalizeConfigRow(raw);

    return NextResponse.json({
      config,
      updated_at: raw.updated_at,
      updated_by: raw.updated_by,
    });
  } catch (err) {
    console.error("[GET /api/precificacao/curva/config]", err);
    return NextResponse.json({ error: "Erro ao buscar config" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!isFullAccess(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = CurvaConfigPatchSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data as Record<string, unknown>;
  const {
    start_mkp,
    start_commission,
    gold_cost_percentage,
    sucata_compra_min_pct,
    sucata_compra_max_pct,
    arredondamento,
  } = body;

  // Validacoes
  if (start_mkp !== undefined && Number(start_mkp) <= 0) {
    return NextResponse.json({ error: "start_mkp deve ser positivo" }, { status: 400 });
  }
  if (start_commission !== undefined && Number(start_commission) < 0) {
    return NextResponse.json({ error: "start_commission não pode ser negativo" }, { status: 400 });
  }
  if (gold_cost_percentage !== undefined && (Number(gold_cost_percentage) <= 0 || Number(gold_cost_percentage) > 200)) {
    return NextResponse.json({ error: "gold_cost_percentage deve estar entre 0 e 200" }, { status: 400 });
  }
  if (arredondamento !== undefined && !["dezena", "unidade", "centena"].includes(arredondamento as string)) {
    return NextResponse.json({ error: "arredondamento inválido" }, { status: 400 });
  }
  if (
    sucata_compra_min_pct !== undefined &&
    sucata_compra_max_pct !== undefined &&
    Number(sucata_compra_min_pct) > Number(sucata_compra_max_pct)
  ) {
    return NextResponse.json({ error: "sucata_compra_min_pct deve ser <= sucata_compra_max_pct" }, { status: 400 });
  }

  try {
    const [row] = await sql`
      UPDATE alissonerp.curva_config SET
        start_mkp             = COALESCE(${start_mkp != null ? Number(start_mkp) : null}, start_mkp),
        start_commission      = COALESCE(${start_commission != null ? Number(start_commission) : null}, start_commission),
        gold_cost_percentage  = COALESCE(${gold_cost_percentage != null ? Number(gold_cost_percentage) : null}, gold_cost_percentage),
        sucata_compra_min_pct = COALESCE(${sucata_compra_min_pct != null ? Number(sucata_compra_min_pct) : null}, sucata_compra_min_pct),
        sucata_compra_max_pct = COALESCE(${sucata_compra_max_pct != null ? Number(sucata_compra_max_pct) : null}, sucata_compra_max_pct),
        arredondamento        = COALESCE(${(arredondamento as string) ?? null}, arredondamento),
        updated_by            = ${user.id}::uuid
      WHERE id = 1
      RETURNING *
    `;

    if (!row) return NextResponse.json({ error: "Config não encontrada" }, { status: 404 });

    const config = normalizeConfigRow(row as unknown as Record<string, unknown>);
    return NextResponse.json({ config });
  } catch (err) {
    console.error("[PATCH /api/precificacao/curva/config]", err);
    return NextResponse.json({ error: "Erro ao atualizar config" }, { status: 500 });
  }
}
