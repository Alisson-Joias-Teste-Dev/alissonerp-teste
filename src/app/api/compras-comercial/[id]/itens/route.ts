import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { normalizeRow } from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";
import { zodError } from "@/lib/schemas/common";

type Params = Promise<{ id: string }>;

const ItemCompraComercialPostSchema = z.object({
  produto_id: z.coerce.number().int().positive(),
  qtd: z.coerce.number().positive(),
  cotacao_referencial: z.coerce.number().positive().optional(),
  fator_ouro: z.coerce.number().positive().optional(),
  valor_grama: z.coerce.number().positive(),
  peso_total: z.coerce.number().positive(),
  obs: z.string().nullable().optional(),
}).passthrough();

export async function GET(req: NextRequest, { params }: { params: Params }) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  void user;

  const { id } = await params;
  const compraId = parseInt(id);

  const rows = await sql`
    SELECT
      ic.*,
      p.nome AS produto_nome,
      p.sku AS produto_sku
    FROM alissonerp.itens_compra_comercial ic
    JOIN public.produtos p ON p.id_produto = ic.produto_id
    WHERE ic.compra_comercial_id = ${compraId}
    ORDER BY ic.id
  `;

  return NextResponse.json(rows.map((r) => normalizeRow(r as Record<string, unknown>, ["qtd", "valor_unitario", "valor_total", "cotacao_referencial", "fator_ouro", "valor_grama", "peso_total"])));
}

// REGRA DE NEGOCIO:
// - O que faz: adiciona item de produto na compra comercial com total calculado por trigger.
// - Por que: padroniza custo de entrada e evita divergencia de calculo no front.
// - Impacto se alterado/removido: total da compra e contas a pagar podem ficar incorretos.
export async function POST(req: NextRequest, { params }: { params: Params }) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  void user;

  const { id } = await params;
  const compraId = parseInt(id);

  const raw = await req.json().catch(() => ({}));
  const parsed = ItemCompraComercialPostSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { produto_id, qtd, cotacao_referencial, fator_ouro, valor_grama, peso_total, obs } = parsed.data;

  // REGRA DE NEGOCIO:
  // - O que faz: quando nao ha peso unitario confiavel, calcula por lote (peso_total) e nao por quantidade.
  // - Por que: compra de joias costuma ter variacao por peca, e o dado confiavel e o peso total aferido.
  // - Impacto se alterado/removido: custo da compra pode ser sub/superestimado e gerar financeiro errado.
  if (peso_total <= 0 || qtd <= 0 || valor_grama <= 0) {
    return NextResponse.json({ error: "peso_total, qtd e valor_grama devem ser maiores que zero" }, { status: 400 });
  }

  const [compra] = await sql`
    SELECT bloqueado FROM alissonerp.compras_comercial WHERE id = ${compraId} LIMIT 1
  `;
  if (!compra) return NextResponse.json({ error: "Compra não encontrada" }, { status: 404 });
  if (compra.bloqueado) return NextResponse.json({ error: "Compra bloqueada — não permite edição" }, { status: 409 });

  const [produto] = await sql`SELECT id_produto FROM public.produtos WHERE id_produto = ${produto_id} LIMIT 1`;
  if (!produto) return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 });

  const [hasCotacao] = await sql`
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'alissonerp'
      AND table_name = 'itens_compra_comercial'
      AND column_name = 'cotacao_referencial'
    LIMIT 1
  `;

  if (!hasCotacao) {
    return NextResponse.json(
      {
        error: "Banco desatualizado para compras comercial. Aplique a migration 273_compra_comercial_peso_total.sql para calcular por peso total.",
      },
      { status: 409 }
    );
  }

  // REGRA DE NEGOCIO:
  // - O que faz: suporta schema antigo e novo durante rollout de migration.
  // - Por que: evita parada operacional caso API suba antes da migration 273.
  // - Impacto se alterado/removido: insercao de itens pode quebrar em ambientes parcialmente atualizados.
  const [row] = await sql`
    INSERT INTO alissonerp.itens_compra_comercial
      (compra_comercial_id, produto_id, qtd, valor_unitario, cotacao_referencial, fator_ouro, valor_grama, peso_total, obs)
    VALUES
      (
        ${compraId},
        ${produto_id},
        ${qtd},
        ${valor_grama},
        ${cotacao_referencial ?? null},
        ${fator_ouro ?? null},
        ${valor_grama},
        ${peso_total},
        ${obs ?? null}
      )
    RETURNING *
  `;

  return NextResponse.json(
    normalizeRow(row as Record<string, unknown>, ["qtd", "valor_unitario", "valor_total", "cotacao_referencial", "fator_ouro", "valor_grama", "peso_total"]),
    { status: 201 }
  );
}
