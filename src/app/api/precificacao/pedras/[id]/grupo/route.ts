import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authOr401 } from "@/lib/auth-server";
import { isFullAccess } from "@/lib/roles";
import sql from "@/lib/db";
import { zodError } from "@/lib/schemas/common";

/**
 * PATCH /api/precificacao/pedras/[id]/grupo
 *
 * REGRA DE NEGÓCIO (Jonathan 22/06): a pedra cai sozinha no grupo que casa por
 * tipo + tamanho, mas o usuário pode MOVER à mão. Mover = fixar grupo_precificacao_id
 * em alissonerp.produto_pedra_extras. NULL = volta ao automático.
 *
 * Body: { grupo_precificacao_id: number | null }
 *
 * IMPACTO SE ALTERADO: o preço da pedra (via vw_pedras_preco) passa a usar o
 *   markup do grupo fixado em vez do automático. Não toca o custo (que é da pedra).
 */
const Schema = z.object({
  grupo_precificacao_id: z.coerce.number().int().positive().nullable(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!isFullAccess(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const produtoId = Number(id);
  if (!Number.isFinite(produtoId) || produtoId <= 0) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const grupoId = parsed.data.grupo_precificacao_id;

  try {
    // Valida que o grupo existe (quando informado)
    if (grupoId != null) {
      const [g] = await sql`
        SELECT 1 FROM alissonerp.pedras_precificacao_regras WHERE id = ${grupoId} LIMIT 1
      `;
      if (!g) return NextResponse.json({ error: "Grupo não encontrado" }, { status: 404 });
    }

    // A pedra precisa ter a linha de extras (toda pedra cadastrada tem).
    const res = await sql`
      UPDATE alissonerp.produto_pedra_extras
      SET grupo_precificacao_id = ${grupoId}, updated_at = NOW()
      WHERE produto_id = ${produtoId}
    `;
    if ((res.count ?? 0) === 0) {
      return NextResponse.json({ error: "Pedra não encontrada (sem extras)" }, { status: 404 });
    }

    // Devolve o preço recalculado pela view (pode virar preço ou seguir aguardando).
    const [precoRow] = await sql<{
      preco_venda: number | null;
      nome_tabela: string | null;
      grupo_id: number | null;
    }[]>`
      SELECT preco_venda, nome_tabela, grupo_id
      FROM alissonerp.vw_pedras_preco
      WHERE id_produto = ${produtoId}
    `;

    return NextResponse.json({
      ok: true,
      id_produto: produtoId,
      grupo_precificacao_id: grupoId,
      preco_venda: precoRow?.preco_venda != null ? Number(precoRow.preco_venda) : null,
      grupo: precoRow?.nome_tabela ?? null,
      aguardando_markup: precoRow?.preco_venda == null,
    });
  } catch (err) {
    console.error("[PATCH /api/precificacao/pedras/[id]/grupo]", err);
    return NextResponse.json({ error: "Erro ao mover pedra de grupo" }, { status: 500 });
  }
}
