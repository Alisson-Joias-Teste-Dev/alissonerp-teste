/**
 * POST /api/precificacao/rejeitar
 *
 * Rejeita uma alteração de markup pendente.
 * NÃO altera markup nem preços — apenas registra o status e o motivo.
 *
 * Permissão: somente admin e desenvolvedor (isFullAccess)
 */

import { NextRequest, NextResponse } from "next/server";
import { authOr401 } from "@/lib/auth-server";
import { isFullAccess } from "@/lib/roles";
import sql from "@/lib/db";

export async function POST(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!isFullAccess(user.role)) {
    return NextResponse.json({ error: "Sem permissão — apenas admin e desenvolvedor podem rejeitar" }, { status: 403 });
  }

  const body = await req.json() as { alteracao_id: number; motivo: string };
  const { alteracao_id, motivo } = body;

  if (!alteracao_id) {
    return NextResponse.json({ error: "alteracao_id é obrigatório" }, { status: 400 });
  }
  if (!motivo?.trim()) {
    return NextResponse.json({ error: "Motivo é obrigatório" }, { status: 400 });
  }

  try {
    const [alt] = await sql<{ id: number; faixa_nome: string; status: string }[]>`
      UPDATE alissonerp.markup_alteracoes
      SET status          = 'rejeitado',
          aprovado_por    = ${user.id}::uuid,
          data_aprovacao  = NOW(),
          motivo_rejeicao = ${motivo.trim()}
      WHERE id = ${alteracao_id} AND status = 'pendente'
      RETURNING id, faixa_nome, status
    `;

    if (!alt) {
      return NextResponse.json({ error: "Alteração não encontrada ou já processada" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, alteracao: alt });
  } catch (err) {
    console.error("[POST /api/precificacao/rejeitar]", err);
    return NextResponse.json({ error: "Erro ao rejeitar" }, { status: 500 });
  }
}
