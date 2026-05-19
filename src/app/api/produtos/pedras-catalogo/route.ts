import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";

/**
 * GET /api/produtos/pedras-catalogo
 *
 * Lista pedras cadastradas no catálogo (categoria='Pedras') com preço unitário
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
          id_produto      AS id,
          nome,
          preco_tiny      AS preco_unitario,
          peso_precificado AS peso_g
        FROM public.produtos
        WHERE LOWER(categoria) = 'pedras'
          AND situacao = 'A'
          AND preco_tiny IS NOT NULL
          AND preco_tiny > 0
          AND nome ILIKE ${"%" + q + "%"}
        ORDER BY nome
        LIMIT ${limit}
      `
    : await sql`
        SELECT
          id_produto      AS id,
          nome,
          preco_tiny      AS preco_unitario,
          peso_precificado AS peso_g
        FROM public.produtos
        WHERE LOWER(categoria) = 'pedras'
          AND situacao = 'A'
          AND preco_tiny IS NOT NULL
          AND preco_tiny > 0
        ORDER BY nome
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
