/**
 * PATCH /api/pcp/[id]/atribuir-operador-rota
 *
 * Override individual do operador responsável pela OF na rota de fabricação.
 * Body: { operador_atribuido_id: number | null }
 *   • número → operador específico (deposito_id) responde por essa OF
 *   • null   → libera (qualquer da lista de colaboradores do setor pode pegar)
 */

import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess, hasRole } from "@/lib/roles";

const ROLES_PERMITIDOS = [
  "admin", "desenvolvedor", "diretor",
  "gerente_fabrica", "gerente_loja",
] as const;

function parsePcpId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function PATCH(
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
  const pcpId = parsePcpId(id);
  if (!pcpId) return NextResponse.json({ error: "id inválido" }, { status: 400 });

  let body: { operador_atribuido_id?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  let opId: number | null = null;
  if (body.operador_atribuido_id !== null && body.operador_atribuido_id !== undefined) {
    const n = Number(body.operador_atribuido_id);
    if (!Number.isInteger(n) || n <= 0) {
      return NextResponse.json({ error: "operador_atribuido_id inválido (inteiro > 0 ou null)" }, { status: 400 });
    }
    opId = n;
  }

  try {
    const [pcp] = await sql`SELECT id FROM alissonerp.pcp WHERE id = ${pcpId}`;
    if (!pcp) return NextResponse.json({ error: "PCP não encontrado" }, { status: 404 });

    if (opId != null) {
      const [dep] = await sql`SELECT id FROM alissonerp.depositos WHERE id = ${opId}`;
      if (!dep) return NextResponse.json({ error: "Operador (depósito) não encontrado" }, { status: 422 });
    }

    await sql`
      UPDATE alissonerp.pcp
      SET operador_atribuido_id = ${opId}, updated_at = NOW()
      WHERE id = ${pcpId}
    `;
    return NextResponse.json({ ok: true, operador_atribuido_id: opId });
  } catch (err) {
    console.error("[PATCH atribuir-operador-rota]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
