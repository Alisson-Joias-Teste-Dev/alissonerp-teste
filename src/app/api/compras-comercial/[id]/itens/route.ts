import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { normalizeRow } from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";
import { zodError } from "@/lib/schemas/common";
import { calcularCustoPorCtPedra, calcularQtdPecasPedra } from "@/lib/compras-pedras";

type Params = Promise<{ id: string }>;

const ItemCompraComercialPostSchema = z.object({
  produto_id: z.coerce.number().int().positive(),
  qtd: z.coerce.number().nullable().optional(),
  cotacao_referencial: z.coerce.number().positive().optional(),
  fator_ouro: z.coerce.number().positive().optional(),
  valor_grama: z.coerce.number().nullable().optional(),
  custo_total: z.coerce.number().nullable().optional(),
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
      p.sku AS produto_sku,
      p.categoria AS produto_categoria,
      p.categoria_precificacao AS produto_categoria_precificacao,
      p.tem_pedra_preciosa,
      ppe.peso_ct AS peso_pedra_ct
    FROM alissonerp.itens_compra_comercial ic
    JOIN public.produtos p ON p.id_produto = ic.produto_id
    LEFT JOIN alissonerp.produto_pedra_extras ppe ON ppe.produto_id = p.id_produto
    WHERE ic.compra_comercial_id = ${compraId}
    ORDER BY ic.id
  `;

  // REGRA DE NEGOCIO:
  // - O que faz: retorna quantidade exata estimada para pedras sem duplicar regra no front.
  // - Por que: visualizacao operacional precisa mostrar estimativa e referencia no mesmo criterio da API.
  // - Impacto se alterado/removido: tela pode exibir quantidade divergente do calculo oficial.
  const rowsComEstimativa = rows.map((row) => {
    const categoria = String((row as Record<string, unknown>).produto_categoria ?? "").toLowerCase();
    const categoriaPrecificacao = String((row as Record<string, unknown>).produto_categoria_precificacao ?? "").toLowerCase();
    const nomeProduto = String((row as Record<string, unknown>).produto_nome ?? "").toLowerCase();
    const pesoPedraCt = Number((row as Record<string, unknown>).peso_pedra_ct ?? 0);
    const ehPedra = categoria.startsWith("pedras")
      || categoriaPrecificacao.startsWith("pedras")
      || Boolean((row as Record<string, unknown>).tem_pedra_preciosa)
      || pesoPedraCt > 0
      || nomeProduto.includes("diamante")
      || nomeProduto.includes("zirc")
      || nomeProduto.includes("rubi")
      || nomeProduto.includes("esmeralda")
      || nomeProduto.includes("safira");
    if (!ehPedra) return { ...row, qtd_exata: null };
    const qtdAtual = Number((row as Record<string, unknown>).qtd ?? 0);
    const pesoTotalCt = Number((row as Record<string, unknown>).peso_total ?? 0);
    const estimativa = calcularQtdPecasPedra(pesoTotalCt, pesoPedraCt);
    return {
      ...row,
      qtd: qtdAtual > 0 ? qtdAtual : (estimativa?.qtdEstimada ?? qtdAtual),
      qtd_exata: estimativa?.qtdExata ?? null,
    };
  });

  return NextResponse.json(rowsComEstimativa.map((r) => normalizeRow(r as Record<string, unknown>, ["qtd", "qtd_exata", "valor_unitario", "valor_total", "cotacao_referencial", "fator_ouro", "valor_grama", "peso_total", "peso_pedra_ct"])));
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
  const { produto_id, qtd, cotacao_referencial, fator_ouro, valor_grama, custo_total, peso_total, obs } = parsed.data;

  const [compra] = await sql`
    SELECT bloqueado FROM alissonerp.compras_comercial WHERE id = ${compraId} LIMIT 1
  `;
  if (!compra) return NextResponse.json({ error: "Compra não encontrada" }, { status: 404 });
  if (compra.bloqueado) return NextResponse.json({ error: "Compra bloqueada — não permite edição" }, { status: 409 });

  const [produto] = await sql`
    SELECT p.id_produto, p.categoria, p.categoria_precificacao, p.nome, p.tem_pedra_preciosa, ppe.peso_ct AS peso_pedra_ct
    FROM public.produtos p
    LEFT JOIN alissonerp.produto_pedra_extras ppe ON ppe.produto_id = p.id_produto
    WHERE p.id_produto = ${produto_id}
    LIMIT 1
  `;
  if (!produto) return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 });

  const categoriaProduto = String(produto.categoria ?? "").toLowerCase();
  const categoriaPrecificacaoProduto = String(produto.categoria_precificacao ?? "").toLowerCase();
  const nomeProduto = String(produto.nome ?? "").toLowerCase();
  const ehPedra = categoriaProduto.startsWith("pedras")
    || categoriaPrecificacaoProduto.startsWith("pedras")
    || Boolean(produto.tem_pedra_preciosa)
    || Number(produto.peso_pedra_ct ?? 0) > 0
    || nomeProduto.includes("diamante")
    || nomeProduto.includes("zirc")
    || nomeProduto.includes("rubi")
    || nomeProduto.includes("esmeralda")
    || nomeProduto.includes("safira");

  let qtdFinal = Number(qtd ?? 0);
  let valorGramaFinal = Number(valor_grama ?? 0);

  if (ehPedra) {
    // REGRA DE NEGOCIO:
    // - O que faz: para pedras, operador informa ct total e custo total; API calcula custo/ct e quantidade estimada.
    // - Por que: pedras pequenas nao sao contadas com confiabilidade operacional no ato da compra.
    // - Impacto se alterado/removido: operador volta a informar quantidade manual imprecisa e gerar inconsistencia.
    if (!peso_total || peso_total <= 0) {
      return NextResponse.json({ error: "Para pedras: informe o ct total" }, { status: 400 });
    }

    const custoPorCt = calcularCustoPorCtPedra(peso_total, custo_total ?? null);
    valorGramaFinal = custoPorCt ?? Number(valor_grama ?? 0);
    if (!Number.isFinite(valorGramaFinal) || valorGramaFinal <= 0) {
      return NextResponse.json({ error: "Para pedras: informe custo total ou valor por ct" }, { status: 400 });
    }

    if (!Number.isFinite(qtdFinal) || qtdFinal <= 0) {
      const pesoPedraCt = Number(produto.peso_pedra_ct ?? 0);
      const estimativa = calcularQtdPecasPedra(peso_total, pesoPedraCt);
      if (!estimativa) {
        return NextResponse.json(
          { error: "Para pedras: cadastre o peso padrão (ct) do produto para calcular a quantidade estimada" },
          { status: 409 }
        );
      }
      qtdFinal = estimativa.qtdEstimada;
    }
  } else {
    // REGRA DE NEGOCIO:
    // - O que faz: para joias/produtos gerais, mantem regra atual com quantidade inteira e valor por grama informado.
    // - Por que: fluxo comercial atual ja opera com pecas inteiras e nao pode quebrar o comportamento existente.
    // - Impacto se alterado/removido: compras atuais podem falhar ou gerar entrada incorreta de estoque.
    if (!Number.isFinite(qtdFinal) || qtdFinal < 1 || !Number.isInteger(qtdFinal) || !Number.isFinite(valorGramaFinal) || valorGramaFinal <= 0 || peso_total <= 0) {
      return NextResponse.json({ error: "peso_total, qtd inteira e valor_grama devem ser maiores que zero" }, { status: 400 });
    }
  }

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
        ${qtdFinal},
        ${valorGramaFinal},
        ${cotacao_referencial ?? null},
        ${fator_ouro ?? null},
        ${valorGramaFinal},
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
