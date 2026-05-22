import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { temPermissao } from "@/lib/permissoes";
import { isMasterAdmin } from "@/lib/master-admin";

// ─── PATCH /api/ordens/[id]/cancelar ───────────────────────────────────────────
// Cancela ordem de fabricação/serviço.
// Permissão: full-access (admin/dev/diretor) OU usuário com ação 'cancelar_ordem'
//            habilitada em permissoes_usuario.
//
// BLINDAGEM (migration 269): ordem que JÁ TEM apontamentos (ourives mexeu,
// ouro/pedra saíram do estoque) só pode ser cancelada pelo master admin.
// Outros usuários recebem 409 com mensagem clara pra solicitar autorização.
//
// Body opcional: { motivo?: string } — registrado em cancelado_motivo quando
// presente.
export async function PATCH(
  req: NextRequest,
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

  // Checa apontamentos. Se ordem tem apontamento e usuario nao eh master, bloqueia.
  const [apontInfo] = await sql<{ total: number; ouro_saiu: boolean }[]>`
    SELECT
      COUNT(ap.id)::int AS total,
      EXISTS(
        SELECT 1 FROM alissonerp.apontamentos_pcp ap2
        JOIN alissonerp.pcp p2 ON p2.id = ap2.pcp_id
        WHERE p2.ordem_id = ${ordemId} AND ap2.peso_metal > 0
      ) AS ouro_saiu
    FROM alissonerp.apontamentos_pcp ap
    JOIN alissonerp.pcp p ON p.id = ap.pcp_id
    WHERE p.ordem_id = ${ordemId}
  `;

  const temApontamento = Number(apontInfo?.total ?? 0) > 0;
  const ehMaster = await isMasterAdmin(user.id);

  if (temApontamento && !ehMaster) {
    return NextResponse.json(
      {
        error: "Esta ordem já tem apontamentos da fábrica" +
          (apontInfo?.ouro_saiu ? " (incluindo movimentações de ouro)" : "") +
          ". Apenas o administrador master pode cancelar — solicite autorização e tente novamente.",
        apontamentos: Number(apontInfo?.total ?? 0),
        ouro_movimentado: !!apontInfo?.ouro_saiu,
        requer_master: true,
      },
      { status: 409 },
    );
  }

  // Motivo opcional pra audit. Se master cancelando ordem com apontamento, motivo deveria ser obrigatorio.
  const body = await req.json().catch(() => ({})) as { motivo?: string };
  const motivo = (body?.motivo ?? "").trim() || null;

  if (temApontamento && ehMaster && !motivo) {
    return NextResponse.json(
      { error: "Master deve informar motivo ao cancelar ordem com apontamentos." },
      { status: 400 },
    );
  }

  await sql`
    UPDATE alissonerp.ordens
    SET situacao = 'cancelado',
        status = 'concluido',
        cancelado_por = ${user.id}::uuid,
        cancelado_em = NOW(),
        cancelado_motivo = ${motivo},
        updated_at = NOW()
    WHERE id = ${ordemId}
  `;

  return NextResponse.json({
    ok: true,
    apontamentos_existentes: Number(apontInfo?.total ?? 0),
    ouro_movimentado: !!apontInfo?.ouro_saiu,
  });
}
