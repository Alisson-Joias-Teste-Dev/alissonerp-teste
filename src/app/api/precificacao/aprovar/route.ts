/**
 * POST /api/precificacao/aprovar
 *
 * Aprova uma alteração de markup pendente e aplica imediatamente:
 *   - Ouro: UPDATE alissonerp.erp_produtos SET markup = markup_novo WHERE categoria_precificacao = faixa_nome
 *           → trigger_atualizar_preco_produto recalcula preço de cada produto automaticamente
 *   - Pedra: UPDATE alissonerp.markup_pedras SET markup = markup_novo
 *            → recalcularPrecoPedras chamado para cada produto afetado (após commit)
 *
 * Permissão: somente admin e desenvolvedor (isFullAccess)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authOr401 } from "@/lib/auth-server";
import { isFullAccess } from "@/lib/roles";
import sql from "@/lib/db";
import { recalcularPrecoPedras } from "@/lib/recalcular-preco-pedras";
import { internalError } from "@/lib/api-error";
import { zodError, IdSchema } from "@/lib/schemas/common";

const AprovarSchema = z.object({
  alteracao_id: IdSchema,
});

export async function POST(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!isFullAccess(user.role)) {
    return NextResponse.json(
      { error: "Sem permissão — apenas admin e desenvolvedor podem aprovar" },
      { status: 403 }
    );
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = AprovarSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { alteracao_id } = parsed.data;

  const startTime = Date.now();

  try {
    // ── Buscar alteração pendente ──────────────────────────────────────────────
    const [alt] = (await sql`
      SELECT id, tipo, faixa_id, faixa_nome, markup_novo, produtos_afetados
      FROM alissonerp.markup_alteracoes
      WHERE id = ${alteracao_id} AND status = 'pendente'
    `) as unknown as {
      id: number;
      tipo: string;
      faixa_id: number;
      faixa_nome: string;
      markup_novo: string;
      produtos_afetados: number;
    }[];

    if (!alt) {
      return NextResponse.json(
        { error: "Alteração não encontrada ou já processada" },
        { status: 404 }
      );
    }

    let produtosAtualizados = 0;

    // ── Aplicar mudança de markup ──────────────────────────────────────────────
    if (alt.tipo === "ouro") {
      // Atualizar markup de todos os produtos desta categoria.
      // O trigger trigger_atualizar_preco_produto recalcula preco_sync automaticamente.
      const res = await sql`
        UPDATE alissonerp.erp_produtos
        SET markup = ${Number(alt.markup_novo)}
        WHERE categoria_precificacao = ${alt.faixa_nome}
          AND situacao = 'A'
      `;
      produtosAtualizados = res.count;

    } else if (alt.tipo === "pedra") {
      // Atualizar o markup da faixa de pedra
      await sql`
        UPDATE alissonerp.markup_pedras
        SET markup     = ${Number(alt.markup_novo)},
            updated_at = NOW()
        WHERE id = ${Number(alt.faixa_id)}
      `;
      produtosAtualizados = Number(alt.produtos_afetados);
    }

    // ── Marcar como aprovado ───────────────────────────────────────────────────
    await sql`
      UPDATE alissonerp.markup_alteracoes
      SET status         = 'aprovado',
          aprovado_por   = ${user.id}::uuid,
          data_aprovacao = NOW(),
          aplicado       = true,
          data_aplicacao = NOW()
      WHERE id = ${alteracao_id}
    `;

    // ── Pós-commit pedra: recalcular preco_pedras dos produtos afetados ────────
    if (alt.tipo === "pedra") {
      const faixas = (await sql`
        SELECT tamanho_min, tamanho_max
        FROM alissonerp.markup_pedras
        WHERE id = ${Number(alt.faixa_id)}
      `) as unknown as { tamanho_min: string; tamanho_max: string }[];

      if (faixas.length > 0) {
        const { tamanho_min, tamanho_max } = faixas[0];
        const afetados = (await sql`
          SELECT DISTINCT produto_id
          FROM alissonerp.produto_composicao
          WHERE tipo = 'pedra'
            AND preco_compra_usd IS NOT NULL
            AND preco_compra_usd > 0
            AND COALESCE(tamanho, 0) >= ${Number(tamanho_min)}
            AND COALESCE(tamanho, 0) < ${Number(tamanho_max)}
        `) as unknown as { produto_id: number }[];

        for (const p of afetados) {
          await recalcularPrecoPedras(p.produto_id);
        }
        produtosAtualizados = afetados.length;
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    return NextResponse.json({
      ok: true,
      produtos_atualizados: produtosAtualizados,
      tipo: alt.tipo,
      faixa_nome: alt.faixa_nome,
      markup_novo: Number(alt.markup_novo),
      elapsed_s: elapsed,
    });
  } catch (err) {
    return internalError("[POST /api/precificacao/aprovar]", err, "Erro ao aprovar");
  }
}
