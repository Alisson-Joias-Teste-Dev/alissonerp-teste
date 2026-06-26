/**
 * PATCH /api/promocoes/[id]/cancelar
 * Cancela promocao. So permitido se situacao_manual='agendada'.
 *
 * Permissao: admin, desenvolvedor.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError, ForbiddenError } from "@/lib/auth-server";
import sql from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { isFullAccess } from "@/lib/roles";

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  let user;
  try { user = await requireAuth(req); }
  catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }
  if (!isFullAccess(user.role)) {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const idNum = Number(id);
  if (!Number.isFinite(idNum) || idNum <= 0) {
    return NextResponse.json({ error: "ID invalido" }, { status: 400 });
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updated = await (sql as any).begin(async (tx: any) => {
      const [camp] = await tx<{ situacao_manual: string }[]>`
        SELECT situacao_manual FROM alissonerp.promocoes_produtos
        WHERE id = ${idNum} FOR UPDATE
      `;
      if (!camp) return { ok: false, status: 404, error: "Promocao nao encontrada" };
      if (camp.situacao_manual !== "agendada") {
        return { ok: false, status: 422, error: `Situacao atual '${camp.situacao_manual}' nao permite cancelar` };
      }

      await tx`
        UPDATE alissonerp.promocoes_produtos
        SET situacao_manual = 'cancelada', atualizado_em = NOW()
        WHERE id = ${idNum}
      `;

      await logAudit(tx, {
        tabela: "promocoes_produtos",
        operacao: "UPDATE",
        registro_id: idNum,
        usuario_id: user.id,
        dados_antes: { situacao_manual: camp.situacao_manual },
        dados_depois: { situacao_manual: "cancelada" },
      });

      return { ok: true };
    });

    if (!updated.ok) return NextResponse.json({ error: updated.error }, { status: updated.status });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[PATCH /api/promocoes/:id/cancelar]", err);
    return NextResponse.json({ error: "Erro ao cancelar promocao" }, { status: 500 });
  }
}
