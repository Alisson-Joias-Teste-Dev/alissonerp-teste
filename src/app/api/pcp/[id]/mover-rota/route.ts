/**
 * PATCH /api/pcp/[id]/mover-rota
 *
 * Move uma OF para outro setor da rota de fabricação (drag-and-drop manual).
 * Body: { setor_id: number }
 *
 * Lógica:
 *   1. Resolve produto_id da OF (produto_reposicao_id ou primeiro item da ordem)
 *   2. Busca em produto_rota qual `ordem` corresponde ao setor_id alvo
 *   3. Atualiza pcp.rota_etapa_atual com essa ordem
 *
 * Bloqueia se:
 *   - OF não tem produto vinculado (item livre)
 *   - Produto não tem rota cadastrada
 *   - Setor alvo não está na rota desse produto
 */

import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess, hasRole } from "@/lib/roles";

const ROLES_PERMITIDOS = [
  "admin", "desenvolvedor", "diretor",
  "gerente_fabrica", "gerente_loja", "pcp",
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

  let body: { setor_id?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  const setorId = Number(body.setor_id);
  if (!Number.isInteger(setorId) || setorId <= 0) {
    return NextResponse.json({ error: "setor_id inválido" }, { status: 400 });
  }

  try {
    // 1. Resolve produto_id da OF
    const [pcpRow] = await sql`
      SELECT
        pcp.id,
        pcp.ordem_id,
        COALESCE(
          o.produto_reposicao_id,
          (SELECT produto_id FROM alissonerp.itens_ordem WHERE ordem_id = o.id ORDER BY id ASC LIMIT 1)
        ) AS produto_id
      FROM alissonerp.pcp pcp
      JOIN alissonerp.ordens o ON o.id = pcp.ordem_id
      WHERE pcp.id = ${pcpId}
    `;
    if (!pcpRow) return NextResponse.json({ error: "PCP não encontrado" }, { status: 404 });
    if (pcpRow.produto_id == null) {
      return NextResponse.json({
        error: "OF sem produto vinculado — não há rota pra seguir",
      }, { status: 422 });
    }

    // 2. Busca a etapa do setor na rota do produto
    const [etapaRow] = await sql`
      SELECT ordem
      FROM alissonerp.produto_rota
      WHERE produto_id = ${pcpRow.produto_id}
        AND setor_id = ${setorId}
      ORDER BY ordem ASC
      LIMIT 1
    `;
    if (!etapaRow) {
      // Verifica se o produto sequer tem rota
      const [{ total }] = await sql`
        SELECT COUNT(*)::int AS total
        FROM alissonerp.produto_rota
        WHERE produto_id = ${pcpRow.produto_id}
      `;
      if (Number(total) === 0) {
        return NextResponse.json({
          error: "Produto sem rota cadastrada — configure a rota antes de mover",
        }, { status: 422 });
      }
      return NextResponse.json({
        error: "Setor alvo não está na rota desse produto",
      }, { status: 422 });
    }

    // 3. Atualiza a etapa atual
    await sql`
      UPDATE alissonerp.pcp
      SET rota_etapa_atual = ${Number(etapaRow.ordem)}, updated_at = NOW()
      WHERE id = ${pcpId}
    `;

    return NextResponse.json({
      ok: true,
      pcp_id: pcpId,
      setor_id: setorId,
      rota_etapa_atual: Number(etapaRow.ordem),
    });
  } catch (err) {
    console.error("[PATCH mover-rota]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
