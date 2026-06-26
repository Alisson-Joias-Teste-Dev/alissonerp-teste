import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * GET /api/rfid/produtos-disponiveis?categoria_base=X&q=TEXTO&limit=20
 *
 * Busca produtos ativos com estoque >= 1, opcionalmente filtrados por
 * categoria base e/ou texto (sku ou nome).
 *
 * Params:
 *   categoria_base (opcional) — filtra categoria ILIKE '{base}%'
 *                               (pega "Anel" e tambem "Anel -> Feminino")
 *   q              (opcional, >= 2 chars) — busca em sku ou nome
 *   limit          (opcional, default 20, max 50)
 *
 * Response 200:
 *   Array<{
 *     id_produto: number,
 *     sku: string,
 *     nome: string,
 *     categoria: string | null,
 *     qtd_estoque: number,
 *     imagem: string | null
 *   }>
 *
 * Errors:
 *   401 nao autenticado
 *   500 erro interno
 */
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const categoriaBase = searchParams.get("categoria_base")?.trim() || null;
  const q             = searchParams.get("q")?.trim() || "";
  const limitParam    = Number(searchParams.get("limit") ?? "20");
  const limit         = Math.max(1, Math.min(Number.isFinite(limitParam) ? limitParam : 20, 50));

  const aplicaQ = q.length >= 2;

  try {
    // 4 branches explicitos para evitar fragments dinamicos complicados.
    // Legivel e facil de debugar. Cada query e' simples e indexavel.
    let rows;

    if (categoriaBase && aplicaQ) {
      rows = await sql`
        SELECT
          id_produto,
          sku,
          nome,
          categoria,
          qtd_estoque,
          imagem
        FROM public.produtos
        WHERE qtd_estoque >= 1
          AND situacao = 'A'
          AND categoria ILIKE ${categoriaBase + "%"}
          AND (nome ILIKE ${"%" + q + "%"} OR sku ILIKE ${"%" + q + "%"})
        ORDER BY nome ASC
        LIMIT ${limit}
      `;
    } else if (categoriaBase) {
      rows = await sql`
        SELECT
          id_produto,
          sku,
          nome,
          categoria,
          qtd_estoque,
          imagem
        FROM public.produtos
        WHERE qtd_estoque >= 1
          AND situacao = 'A'
          AND categoria ILIKE ${categoriaBase + "%"}
        ORDER BY nome ASC
        LIMIT ${limit}
      `;
    } else if (aplicaQ) {
      rows = await sql`
        SELECT
          id_produto,
          sku,
          nome,
          categoria,
          qtd_estoque,
          imagem
        FROM public.produtos
        WHERE qtd_estoque >= 1
          AND situacao = 'A'
          AND (nome ILIKE ${"%" + q + "%"} OR sku ILIKE ${"%" + q + "%"})
        ORDER BY nome ASC
        LIMIT ${limit}
      `;
    } else {
      rows = await sql`
        SELECT
          id_produto,
          sku,
          nome,
          categoria,
          qtd_estoque,
          imagem
        FROM public.produtos
        WHERE qtd_estoque >= 1
          AND situacao = 'A'
        ORDER BY nome ASC
        LIMIT ${limit}
      `;
    }

    // Normaliza bigint -> number
    return NextResponse.json(
      rows.map((r) => ({
        id_produto:  Number(r.id_produto),
        sku:         r.sku as string | null,
        nome:        r.nome as string | null,
        categoria:   r.categoria as string | null,
        qtd_estoque: Number(r.qtd_estoque),
        imagem:      (r.imagem as string | null) ?? null,
      })),
    );
  } catch (err) {
    console.error("[GET /api/rfid/produtos-disponiveis] Erro:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
