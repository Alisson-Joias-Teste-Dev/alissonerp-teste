/**
 * GET /api/rotas-template/[id]/etapas — etapas (sequência de setores) do template
 * PUT /api/rotas-template/[id]/etapas — sobrescreve etapas. Body: { setor_ids: number[] }
 *
 * A ordem é a posição no array (1-indexed).
 */

import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess, hasRole } from "@/lib/roles";

const ROLES_PERMITIDOS = [
  "admin", "desenvolvedor", "diretor", "gerente_fabrica", "gerente_loja", "pcp",
] as const;

function parseId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const tplId = parseId(id);
  if (!tplId) return NextResponse.json({ error: "id inválido" }, { status: 400 });

  const rows = await sql`
    SELECT e.id, e.ordem, e.setor_id, s.nome AS setor_nome, s.requer_peso
    FROM alissonerp.rotas_template_etapas e
    JOIN alissonerp.setores s ON s.id = e.setor_id
    WHERE e.template_id = ${tplId}
    ORDER BY e.ordem ASC
  `;
  return NextResponse.json(rows);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [u] = await sql`SELECT role::text AS role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid`;
  const role = u?.role ?? null;
  if (!role || (!isFullAccess(role) && !hasRole(role, ROLES_PERMITIDOS))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const tplId = parseId(id);
  if (!tplId) return NextResponse.json({ error: "id inválido" }, { status: 400 });

  let body: { setor_ids?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  const setorIdsRaw = body.setor_ids;
  if (!Array.isArray(setorIdsRaw)) {
    return NextResponse.json({ error: "setor_ids deve ser array" }, { status: 400 });
  }
  const setorIds: number[] = [];
  for (const v of setorIdsRaw) {
    const n = Number(v);
    if (!Number.isInteger(n) || n <= 0) {
      return NextResponse.json({ error: `setor_id inválido: ${v}` }, { status: 400 });
    }
    setorIds.push(n);
  }

  try {
    const [tpl] = await sql`SELECT id FROM alissonerp.rotas_template WHERE id = ${tplId}`;
    if (!tpl) return NextResponse.json({ error: "Template não encontrado" }, { status: 404 });

    if (setorIds.length > 0) {
      const setoresValidos = await sql<{ id: number }[]>`
        SELECT id FROM alissonerp.setores WHERE id = ANY(${setorIds})
      `;
      if (setoresValidos.length !== new Set(setorIds).size) {
        return NextResponse.json({ error: "Algum setor_id não existe" }, { status: 422 });
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await sql.begin(async (tx: any) => {
      await tx`DELETE FROM alissonerp.rotas_template_etapas WHERE template_id = ${tplId}`;
      for (let i = 0; i < setorIds.length; i++) {
        await tx`
          INSERT INTO alissonerp.rotas_template_etapas (template_id, ordem, setor_id)
          VALUES (${tplId}, ${i + 1}, ${setorIds[i]})
        `;
      }
      await tx`UPDATE alissonerp.rotas_template SET updated_at = NOW() WHERE id = ${tplId}`;
    });

    return NextResponse.json({ ok: true, etapas: setorIds.length });
  } catch (err) {
    console.error("[PUT /api/rotas-template/[id]/etapas]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
