/**
 * POST /api/produtos/[id]/aplicar-template
 *
 * Aplica manualmente um template de rota a um produto (sobrescreve a rota
 * atual). Usado pelo botão "Aplicar template…" no cadastro/edição de produto.
 *
 * Body: { template_id: number }
 */

import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess, hasRole } from "@/lib/roles";
import { aplicarRotaPadrao } from "@/lib/aplicar-rota-padrao";

const ROLES_PERMITIDOS = [
  "admin", "desenvolvedor", "diretor", "gerente_fabrica", "gerente_loja", "pcp",
] as const;

export async function POST(
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
  const produtoId = Number(id);
  if (!Number.isInteger(produtoId) || produtoId <= 0) {
    return NextResponse.json({ error: "produto_id inválido" }, { status: 400 });
  }

  let body: { template_id?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  const templateId = Number(body.template_id);
  if (!Number.isInteger(templateId) || templateId <= 0) {
    return NextResponse.json({ error: "template_id inválido" }, { status: 400 });
  }

  try {
    const r = await aplicarRotaPadrao(produtoId, { templateId, sobrescrever: true });
    if (!r.applied) {
      const msg =
        r.motivo === "produto_nao_encontrado" ? "Produto não encontrado" :
        r.motivo === "sem_template_default"   ? "Template não encontrado ou sem etapas" :
        `Não aplicado (${r.motivo ?? "desconhecido"})`;
      return NextResponse.json({ error: msg }, { status: 422 });
    }
    return NextResponse.json(r);
  } catch (err) {
    console.error("[POST /api/produtos/[id]/aplicar-template]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
