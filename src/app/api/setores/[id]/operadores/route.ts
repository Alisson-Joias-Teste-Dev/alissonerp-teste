/**
 * Colaboradores responsáveis por setor (N:N depositos↔setores).
 *
 *   GET /api/setores/[id]/operadores — lista { deposito_id, deposito_nome }
 *   PUT /api/setores/[id]/operadores — body { deposito_ids: number[] } sobrescreve a lista
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";
import { zodError } from "@/lib/schemas/common";

const OperadoresPutSchema = z.object({
  deposito_ids: z.array(z.number().int().positive()).default([]),
}).passthrough();

function parseSetorId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ─── GET ─────────────────────────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const setorId = parseSetorId(id);
  if (!setorId) return NextResponse.json({ error: "id inválido" }, { status: 400 });

  try {
    const rows = await sql`
      SELECT so.deposito_id, d.nome AS deposito_nome
      FROM alissonerp.setor_operadores so
      JOIN alissonerp.depositos d ON d.id = so.deposito_id
      WHERE so.setor_id = ${setorId}
      ORDER BY d.nome ASC
    `;
    return NextResponse.json({
      operadores: rows.map((r) => ({
        deposito_id: Number(r.deposito_id),
        deposito_nome: String(r.deposito_nome),
      })),
    });
  } catch (err) {
    console.error("[GET setores/[id]/operadores]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

// ─── PUT (sobrescreve a lista) ───────────────────────────────────────────────
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [u] = await sql`SELECT role::text AS role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid`;
  const role = u?.role ?? null;
  if (!role || !isFullAccess(role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const setorId = parseSetorId(id);
  if (!setorId) return NextResponse.json({ error: "id inválido" }, { status: 400 });

  const raw = await req.json().catch(() => ({}));
  const parsed = OperadoresPutSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const ids = parsed.data.deposito_ids;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sql as any).begin(async (tx: typeof sql) => {
      const [s] = await tx`SELECT id FROM alissonerp.setores WHERE id = ${setorId}`;
      if (!s) throw new Error("SETOR_NAO_ENCONTRADO");

      if (ids.length > 0) {
        const validos = await tx`
          SELECT id FROM alissonerp.depositos WHERE id = ANY(${ids}::int[])
        `;
        if (validos.length !== new Set(ids).size) {
          throw new Error("DEPOSITO_INVALIDO");
        }
      }

      await tx`DELETE FROM alissonerp.setor_operadores WHERE setor_id = ${setorId}`;
      for (const did of ids) {
        await tx`
          INSERT INTO alissonerp.setor_operadores (setor_id, deposito_id)
          VALUES (${setorId}, ${did})
          ON CONFLICT DO NOTHING
        `;
      }
    });
    return NextResponse.json({ ok: true, total: ids.length });
  } catch (err) {
    if (err instanceof Error && err.message === "SETOR_NAO_ENCONTRADO") {
      return NextResponse.json({ error: "Setor não encontrado" }, { status: 404 });
    }
    if (err instanceof Error && err.message === "DEPOSITO_INVALIDO") {
      return NextResponse.json({ error: "Algum colaborador (depósito) enviado não existe" }, { status: 422 });
    }
    console.error("[PUT setores/[id]/operadores]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
