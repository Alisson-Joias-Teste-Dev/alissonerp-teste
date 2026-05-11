/**
 * PATCH /api/rotas-template/[id]  — edita nome / categoria / is_default / ativo
 * DELETE /api/rotas-template/[id] — soft delete (ativo=false)
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

async function checarPermissao() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { erro: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) };
  const [u] = await sql`SELECT role::text AS role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid`;
  const role = u?.role ?? null;
  if (!role || (!isFullAccess(role) && !hasRole(role, ROLES_PERMITIDOS))) {
    return { erro: NextResponse.json({ error: "Sem permissão" }, { status: 403 }) };
  }
  return { user, role };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await checarPermissao();
  if ("erro" in auth) return auth.erro;

  const { id } = await params;
  const tplId = parseId(id);
  if (!tplId) return NextResponse.json({ error: "id inválido" }, { status: 400 });

  let body: { nome?: unknown; categoria?: unknown; is_default?: unknown; ativo?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  try {
    const [tpl] = await sql<{ id: number; categoria: string | null; is_default: boolean; ativo: boolean }[]>`
      SELECT id, categoria, is_default, ativo FROM alissonerp.rotas_template WHERE id = ${tplId}
    `;
    if (!tpl) return NextResponse.json({ error: "Template não encontrado" }, { status: 404 });

    if (body.nome !== undefined) {
      const nome = typeof body.nome === "string" ? body.nome.trim() : "";
      if (!nome) return NextResponse.json({ error: "Nome não pode ser vazio" }, { status: 400 });
      if (nome.length > 120) return NextResponse.json({ error: "Nome muito longo (máx 120)" }, { status: 400 });
      await sql`UPDATE alissonerp.rotas_template SET nome = ${nome}, updated_at = NOW() WHERE id = ${tplId}`;
    }

    if (body.categoria !== undefined) {
      const cat = typeof body.categoria === "string" && body.categoria.trim()
        ? body.categoria.trim()
        : null;
      // Se vai virar default e a categoria mudou, garantir unicidade
      if (tpl.is_default && cat !== tpl.categoria) {
        await sql`
          UPDATE alissonerp.rotas_template
          SET is_default = false, updated_at = NOW()
          WHERE categoria = ${cat} AND is_default = true AND ativo = true AND id <> ${tplId}
        `;
      }
      await sql`UPDATE alissonerp.rotas_template SET categoria = ${cat}, updated_at = NOW() WHERE id = ${tplId}`;
    }

    if (body.is_default !== undefined) {
      const isDef = body.is_default === true;
      const catEfetiva = body.categoria !== undefined
        ? (typeof body.categoria === "string" && body.categoria.trim() ? body.categoria.trim() : null)
        : tpl.categoria;
      if (isDef && catEfetiva) {
        // Desativa default anterior da mesma categoria
        await sql`
          UPDATE alissonerp.rotas_template
          SET is_default = false, updated_at = NOW()
          WHERE categoria = ${catEfetiva} AND is_default = true AND ativo = true AND id <> ${tplId}
        `;
      }
      if (isDef && !catEfetiva) {
        return NextResponse.json({ error: "Não dá pra marcar como default sem definir categoria" }, { status: 400 });
      }
      await sql`UPDATE alissonerp.rotas_template SET is_default = ${isDef}, updated_at = NOW() WHERE id = ${tplId}`;
    }

    if (body.ativo !== undefined) {
      const ativo = body.ativo === true;
      // Reativando: garantir que não há outro default conflitante
      if (ativo && tpl.is_default && tpl.categoria) {
        await sql`
          UPDATE alissonerp.rotas_template
          SET is_default = false, updated_at = NOW()
          WHERE categoria = ${tpl.categoria} AND is_default = true AND ativo = true AND id <> ${tplId}
        `;
      }
      await sql`UPDATE alissonerp.rotas_template SET ativo = ${ativo}, updated_at = NOW() WHERE id = ${tplId}`;
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[PATCH /api/rotas-template/[id]]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await checarPermissao();
  if ("erro" in auth) return auth.erro;

  const { id } = await params;
  const tplId = parseId(id);
  if (!tplId) return NextResponse.json({ error: "id inválido" }, { status: 400 });

  try {
    await sql`UPDATE alissonerp.rotas_template SET ativo = false, is_default = false, updated_at = NOW() WHERE id = ${tplId}`;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/rotas-template/[id]]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
