/**
 * GET /api/rotas-template     — lista templates de rota
 * POST /api/rotas-template    — cria template
 *
 * Templates ativos por padrão; pode-se filtrar com ?incluir_inativos=1.
 */

import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess, hasRole } from "@/lib/roles";

const ROLES_PERMITIDOS = [
  "admin", "desenvolvedor", "diretor", "gerente_fabrica", "gerente_loja", "pcp",
] as const;

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const incluirInativos = req.nextUrl.searchParams.get("incluir_inativos") === "1";

  const rows = incluirInativos
    ? await sql`
        SELECT
          t.id, t.nome, t.categoria, t.is_default, t.ativo,
          t.created_at, t.updated_at,
          (SELECT COUNT(*)::int FROM alissonerp.rotas_template_etapas e WHERE e.template_id = t.id) AS qtd_etapas
        FROM alissonerp.rotas_template t
        ORDER BY t.ativo DESC, COALESCE(t.categoria, '~') ASC, t.nome ASC
      `
    : await sql`
        SELECT
          t.id, t.nome, t.categoria, t.is_default, t.ativo,
          t.created_at, t.updated_at,
          (SELECT COUNT(*)::int FROM alissonerp.rotas_template_etapas e WHERE e.template_id = t.id) AS qtd_etapas
        FROM alissonerp.rotas_template t
        WHERE t.ativo = true
        ORDER BY COALESCE(t.categoria, '~') ASC, t.nome ASC
      `;

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [u] = await sql`SELECT role::text AS role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid`;
  const role = u?.role ?? null;
  if (!role || (!isFullAccess(role) && !hasRole(role, ROLES_PERMITIDOS))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  let body: { nome?: unknown; categoria?: unknown; is_default?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  const nome = typeof body.nome === "string" ? body.nome.trim() : "";
  if (!nome) return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 });
  if (nome.length > 120) return NextResponse.json({ error: "Nome muito longo (máx 120)" }, { status: 400 });

  const categoria = typeof body.categoria === "string" && body.categoria.trim()
    ? body.categoria.trim()
    : null;
  const isDefault = body.is_default === true;

  try {
    if (isDefault && categoria) {
      // Garante que só haverá 1 default ativo por categoria — desativa o atual
      // (se houver) antes de inserir o novo. Sem isso, a unique partial barra.
      await sql`
        UPDATE alissonerp.rotas_template
        SET is_default = false, updated_at = NOW()
        WHERE categoria = ${categoria} AND is_default = true AND ativo = true
      `;
    }

    const [row] = await sql<{ id: number }[]>`
      INSERT INTO alissonerp.rotas_template (nome, categoria, is_default, created_by)
      VALUES (${nome}, ${categoria}, ${isDefault}, ${user.id}::uuid)
      RETURNING id
    `;
    return NextResponse.json({ id: row.id }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/rotas-template]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
