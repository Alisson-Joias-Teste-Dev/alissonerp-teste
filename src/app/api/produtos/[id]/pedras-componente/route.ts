import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";
import { temAcessoModulo } from "@/lib/permissoes";
import { zodError } from "@/lib/schemas/common";

/**
 * PUT /api/produtos/[id]/pedras-componente
 *
 * Substitui a lista de pedras-componente de um produto pelo array enviado.
 *
 * Body: { pedras: Array<{ pedra_produto_id: number, quantidade: number }> }
 *
 * Regras de segurança:
 * - preco_unitario_snapshot é lido da vw_pedras_preco (preço dinâmico)
 *   — nunca aceita do cliente. Evita vendedora forjar preço errado.
 * - Pedra precisa constar na vw_pedras_preco com preco_venda > 0.
 * - Quantidade >= 1, inteira.
 *
 * Tabela: alissonerp.produto_pedras_componente
 *
 * GET /api/produtos/[id]/pedras-componente
 * Lista as pedras-componente atuais do produto com preço dinâmico da vw_pedras_preco.
 */

const Schema = z.object({
  pedras: z.array(
    z.object({
      pedra_produto_id: z.number().int().positive(),
      quantidade: z.number().int().positive(),
    }),
  ).max(50),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;

  // Mesma permissão de criar/editar produto
  if (!(await temAcessoModulo(user.role, "produtos", "escrever"))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const produtoId = Number(id);
  if (!Number.isFinite(produtoId) || produtoId <= 0) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { pedras } = parsed.data;

  // Valida que o produto existe
  const [produto] = await sql<{ id_produto: number }[]>`
    SELECT id_produto FROM public.produtos WHERE id_produto = ${produtoId} LIMIT 1
  `;
  if (!produto) return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 });

  // Valida que TODAS as pedras existem, são da categoria certa e têm preço
  if (pedras.length > 0) {
    const ids = pedras.map((p) => p.pedra_produto_id);
    const validas = await sql<{ id_produto: number; preco_tiny: number }[]>`
      SELECT vp.id_produto, vp.preco_venda AS preco_tiny
      FROM alissonerp.vw_pedras_preco vp
      WHERE vp.id_produto = ANY(${ids}::bigint[])
        AND vp.preco_venda IS NOT NULL
        AND vp.preco_venda > 0
    `;
    if (validas.length !== ids.length) {
      const validasIds = new Set(validas.map((v) => Number(v.id_produto)));
      const invalidas = ids.filter((id) => !validasIds.has(id));
      return NextResponse.json(
        { error: `Pedras inválidas ou sem preço: ${invalidas.join(", ")}` },
        { status: 400 },
      );
    }

    // Mapa id → preco_tiny (snapshot)
    const precoMap = new Map(validas.map((v) => [Number(v.id_produto), Number(v.preco_tiny)]));

    // Substitui tudo em transação
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sql as any).begin(async (tx: typeof sql) => {
      await tx`
        DELETE FROM alissonerp.produto_pedras_componente
        WHERE produto_id = ${produtoId}
      `;
      for (const p of pedras) {
        const preco = precoMap.get(p.pedra_produto_id) ?? 0;
        await tx`
          INSERT INTO alissonerp.produto_pedras_componente
            (produto_id, pedra_produto_id, quantidade, preco_unitario_snapshot)
          VALUES
            (${produtoId}, ${p.pedra_produto_id}, ${p.quantidade}, ${preco})
        `;
      }
    });
  } else {
    // Lista vazia → só limpa
    await sql`
      DELETE FROM alissonerp.produto_pedras_componente
      WHERE produto_id = ${produtoId}
    `;
  }

  // SINCRONIZA preco_pedras com o subtotal das pedras-componente (16/06/2026 —
  // Jonathan). Antes, o PUT gravava as pedras mas NÃO atualizava preco_pedras, então
  // o preço da peça ficava defasado/zerado — foi por isso que as variações do 1829
  // (que TÊM as pedras-componente) apareciam com pedra = R$0. Recalcula a partir do
  // que foi efetivamente gravado. IMPACTO SE REMOVIDO: preco_pedras volta a divergir.
  const [{ subtotal }] = await sql<{ subtotal: string }[]>`
    SELECT COALESCE(SUM(quantidade * preco_unitario_snapshot), 0)::numeric AS subtotal
    FROM alissonerp.produto_pedras_componente
    WHERE produto_id = ${produtoId}
  `;
  await sql`
    UPDATE alissonerp.erp_produtos
    SET preco_pedras     = ${Number(subtotal)},
        preco_total_sync = COALESCE(preco_sync, 0) + ${Number(subtotal)}
    WHERE produto_id = ${produtoId}
  `;

  return NextResponse.json({ ok: true, count: pedras.length });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [, errRes] = await authOr401(_req);
  if (errRes) return errRes;

  const { id } = await params;
  const produtoId = Number(id);
  if (!Number.isFinite(produtoId) || produtoId <= 0) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const rows = await sql`
    SELECT
      pc.id,
      pc.pedra_produto_id,
      pc.quantidade::int       AS quantidade,
      COALESCE(vp.preco_venda, 0)::numeric AS preco_unitario,
      pe.nome                  AS pedra_nome
    FROM alissonerp.produto_pedras_componente pc
    JOIN public.produtos pe ON pe.id_produto = pc.pedra_produto_id
    LEFT JOIN alissonerp.erp_produtos erpv ON erpv.produto_id = pe.id_produto
    LEFT JOIN alissonerp.vw_pedras_preco vp ON vp.id_produto = pc.pedra_produto_id
    WHERE pc.produto_id = ${produtoId}
    ORDER BY pe.nome
  `;

  return NextResponse.json(
    rows.map((r) => ({
      id: Number(r.id),
      pedra_produto_id: Number(r.pedra_produto_id),
      nome: String(r.pedra_nome),
      quantidade: Number(r.quantidade),
      preco_unitario: Number(r.preco_unitario),
    })),
  );
}
