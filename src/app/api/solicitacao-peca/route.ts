import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";
import { logAudit } from "@/lib/audit";
import { zodError, IdSchema } from "@/lib/schemas/common";
import { LIMITS, checkArrayLength, payloadTooLargeResponse } from "@/lib/payload-limits";

/**
 * Movimentacao Interna / Solicitacao de Peca — criacao (passo 1).
 *
 * REGRA DE NEGOCIO: consultora solicita uma ou mais pecas do estoque da loja.
 * Pode informar produtos especificos (produto_ids) e/ou uma descricao livre
 * para lote grande ("todos os aneis da vitrine 3"). Sem foto neste passo — a
 * peca ainda esta no estoque. Sem checagem de role: qualquer usuario
 * autenticado solicita; o sistema so grava quem solicitou.
 */
const SolicitacaoPostSchema = z.object({
  produto_ids: z.array(IdSchema).max(LIMITS.ORDENS_LOTE_MAX).optional(),
  descricao: z.string().max(2000).optional(),
}).refine(
  (d) => (d.produto_ids && d.produto_ids.length > 0) || (d.descricao && d.descricao.trim().length > 0),
  { message: "Informe ao menos um produto ou uma descricao" }
);

export async function POST(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;

  const raw = await req.json().catch(() => ({}));
  const parsed = SolicitacaoPostSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { produto_ids, descricao } = parsed.data;

  try {
    if (produto_ids) checkArrayLength("produto_ids", produto_ids, LIMITS.ORDENS_LOTE_MAX);
  } catch (e) {
    const r = payloadTooLargeResponse(e);
    if (r) return r;
    throw e;
  }

  const [sol] = await sql`
    INSERT INTO alissonerp.solicitacoes_peca (status, descricao, solicitante_id)
    VALUES ('solicitado', ${descricao?.trim() || null}, ${user.id}::uuid)
    RETURNING id
  `;

  if (produto_ids && produto_ids.length > 0) {
    const rows = produto_ids.map((produto_id) => ({ solicitacao_id: sol.id, produto_id }));
    await sql`INSERT INTO alissonerp.solicitacao_peca_produtos ${sql(rows)}`;
  }

  await logAudit(sql, {
    tabela: "solicitacoes_peca",
    operacao: "INSERT",
    registro_id: sol.id,
    usuario_id: user.id,
    dados_depois: { produtos: (produto_ids ?? []).length, descricao: descricao ? true : false },
  });

  return NextResponse.json({ id: sol.id });
}
