import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { temPermissao } from "@/lib/permissoes";

// ─── PATCH /api/ordens/[id]/cancelar ───────────────────────────────────────────
// Cancela ordem de fabricação/serviço.
// Permissão: full-access (admin/dev/diretor) OU usuário com ação 'cancelar_ordem'
//            habilitada em permissoes_usuario.
export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 403 });

  const podeCancelar = await temPermissao(user.id, "cancelar_ordem", usuario.role);
  if (!podeCancelar) {
    return NextResponse.json(
      { error: "Sem permissão para cancelar ordens. Solicite ao administrador." },
      { status: 403 },
    );
  }

  const { id } = await params;
  const ordemId = Number(id);
  if (isNaN(ordemId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const [ordem] = await sql`
    SELECT id, situacao FROM alissonerp.ordens WHERE id = ${ordemId}
  `;
  if (!ordem) return NextResponse.json({ error: "Ordem não encontrada" }, { status: 404 });
  if (ordem.situacao === "cancelado") {
    return NextResponse.json({ ok: true, message: "Ordem já estava cancelada" });
  }

  await sql`
    UPDATE alissonerp.ordens
    SET situacao = 'cancelado',
        status = 'concluido',
        cancelado_por = ${user.id}::uuid,
        cancelado_em = NOW(),
        updated_at = NOW()
    WHERE id = ${ordemId}
  `;

  return NextResponse.json({ ok: true });
}
