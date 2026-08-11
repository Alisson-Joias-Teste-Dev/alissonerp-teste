/**
 * POST /api/precificacao/rejeitar
 *
 * Rejeita uma alteração de markup pendente.
 * NÃO altera markup nem preços — apenas registra o status e o motivo.
 *
 * Permissão: mesma autoridade do "aprovar" — aprovador_precificacao (config-first).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authOr401 } from "@/lib/auth-server";
import sql from "@/lib/db";
import { zodError } from "@/lib/schemas/common";
import { podeDecidir } from "@/lib/aprovacoes";

const RejeitarPostSchema = z.object({
  alteracao_id: z.coerce.number().int().positive(),
  motivo: z.string().min(1, "obrigatório"),
}).passthrough();

export async function POST(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  // REGRA DE NEGÓCIO: mesma autoridade do "aprovar" — aprovador_precificacao.
  const decisao = await podeDecidir({ id: user.id, role: user.role }, "precificacao");
  if (!decisao.pode) {
    return NextResponse.json({ error: "Sem permissão — apenas admin e desenvolvedor podem rejeitar" }, { status: 403 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = RejeitarPostSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { alteracao_id, motivo } = parsed.data;

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
