import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";

/**
 * GET /api/produtos/pedras-catalogo
 *
 * Lista pedras do catálogo com preço unitário dinâmico da vw_pedras_preco
 * pra uso como "pedra-componente" no cadastro de produtos novos.
 *
 * Filtros:
 * - q?      — busca por nome (opcional, mín 2 chars)
 * - limit?  — máx 200 (default 100)
 *
 * Regras:
 * - Só retorna pedras ATIVAS (situacao='A')
 * - Só retorna pedras COM preço (preco_tiny > 0) — evita precificação errada
 *   caso vendedora selecione pedra sem preço cadastrado
 *
 * Resposta: Array<{ id, nome, preco_unitario, peso_g }>
 */
export async function GET(req: NextRequest) {
  const [, errRes] = await authOr401(req);
  if (errRes) return errRes;

  const url   = new URL(req.url);
  const q     = url.searchParams.get("q")?.trim() ?? "";
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "100"), 200);

  // Busca opcional: se vier `q` com >=2 chars, filtra por nome.
  // Sem `q` retorna todas (pra dropdown estilo "selecione da lista").
  const rows = q.length >= 2
    ? await sql`
        SELECT
          vp.id_produto     AS id,
          vp.nome,
          vp.preco_venda    AS preco_unitario,
          p.peso_precificado AS peso_g
        FROM alissonerp.vw_pedras_preco vp
        JOIN public.produtos p ON p.id_produto = vp.id_produto
        WHERE vp.preco_venda IS NOT NULL
          AND vp.preco_venda > 0
          AND vp.nome ILIKE ${"%" + q + "%"}
        ORDER BY vp.nome
        LIMIT ${limit}
      `
    : await sql`
        SELECT
          vp.id_produto     AS id,
          vp.nome,
          vp.preco_venda    AS preco_unitario,
          p.peso_precificado AS peso_g
        FROM alissonerp.vw_pedras_preco vp
        JOIN public.produtos p ON p.id_produto = vp.id_produto
        WHERE vp.preco_venda IS NOT NULL
          AND vp.preco_venda > 0
        ORDER BY vp.nome
        LIMIT ${limit}
      `;

  return NextResponse.json(
    rows.map((r) => ({
      id: Number(r.id),
      nome: String(r.nome),
      preco_unitario: Number(r.preco_unitario ?? 0),
      peso_g: r.peso_g == null ? null : Number(r.peso_g),
    })),
  );
}
