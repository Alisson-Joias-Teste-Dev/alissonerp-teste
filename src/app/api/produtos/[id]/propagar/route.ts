/**
 * POST /api/produtos/[id]/propagar
 *
 * Propaga dados de um produto pai para suas variações.
 *
 * Body:
 *   { campos: Array<"medidas" | "bom"> }
 *
 * - medidas: copia largura_aro, altura_aro, base do pai para cada variação (erp_produtos)
 * - bom:     copia produto_composicao do pai para cada variação (DELETE + INSERT)
 *
 * Retorna: { propagado: N, variacoes: number[] }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authOr401 } from "@/lib/auth-server";
import { temAcessoModulo } from "@/lib/permissoes";
import sql from "@/lib/db";
import { recalcularPrecoPedras } from "@/lib/recalcular-preco-pedras";
import { zodError } from "@/lib/schemas/common";

const PropagarSchema = z.object({
  campos: z.array(z.string()).optional(),
}).passthrough();

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const produtoId = Number(id);
  if (!produtoId) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!(await temAcessoModulo(user.role, "produtos", "escrever"))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = PropagarSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const campos = parsed.data.campos ?? ["medidas"];

  if (!Array.isArray(campos) || campos.length === 0) {
    return NextResponse.json({ error: "campos é obrigatório" }, { status: 400 });
  }

  const camposValidos = new Set(["medidas", "bom"]);
  if (campos.some((c) => !camposValidos.has(c))) {
    return NextResponse.json({ error: "campos inválidos. Use: medidas, bom" }, { status: 400 });
  }

  try {
    // ── Carregar registro ERP do pai ────────────────────────────────────────
    const [pai] = await sql`
      SELECT id, produto_id, eh_pai, largura_aro, altura_aro, base
      FROM alissonerp.erp_produtos
      WHERE produto_id = ${produtoId}
    `;

    if (!pai) {
      return NextResponse.json({ error: "Produto não encontrado em erp_produtos" }, { status: 404 });
    }
    if (!pai.eh_pai) {
      return NextResponse.json({ error: "Produto não é um pai — propagação não aplicável" }, { status: 400 });
    }

    // ── Carregar variações ──────────────────────────────────────────────────
    const variacoes = await sql`
      SELECT id, produto_id
      FROM alissonerp.erp_produtos
      WHERE parent_id = ${pai.id as number}
    `;

    if (variacoes.length === 0) {
      return NextResponse.json({ propagado: 0, variacoes: [], message: "Nenhuma variação encontrada" });
    }

    const variacaoIds    = variacoes.map((v) => v.id as number);
    const variacaoProdIds = variacoes.map((v) => v.produto_id as number);

    // ── MEDIDAS ─────────────────────────────────────────────────────────────
    if (campos.includes("medidas")) {
      await sql`
        UPDATE alissonerp.erp_produtos
        SET
          largura_aro  = ${pai.largura_aro  as number | null},
          altura_aro   = ${pai.altura_aro   as number | null},
          base         = ${pai.base         as number | null},
          date_updated = NOW()
        WHERE id = ANY(${variacaoIds})
      `;
    }

    // ── BOM (produto_composicao) ────────────────────────────────────────────
    if (campos.includes("bom")) {
      // Carregar composição do pai
      const bomPai = await sql`
        SELECT insumo_id, tipo, quantidade, tamanho, unidade_tamanho,
               preco_compra_usd, obrigatorio, observacao
        FROM alissonerp.produto_composicao
        WHERE produto_id = ${produtoId}
      `;

      if (bomPai.length > 0) {
        for (const variacao of variacoes) {
          const vProdId = variacao.produto_id as number;

          // Remove composição existente da variação
          await sql`
            DELETE FROM alissonerp.produto_composicao
            WHERE produto_id = ${vProdId}
          `;

          // Copia do pai
          for (const item of bomPai) {
            await sql`
              INSERT INTO alissonerp.produto_composicao
                (produto_id, insumo_id, tipo, quantidade, tamanho,
                 unidade_tamanho, preco_compra_usd, obrigatorio, observacao)
              VALUES
                (${vProdId},
                 ${item.insumo_id as number},
                 ${item.tipo as string},
                 ${item.quantidade as number},
                 ${item.tamanho as number | null},
                 ${item.unidade_tamanho as string | null},
                 ${item.preco_compra_usd as number | null},
                 ${item.obrigatorio as boolean},
                 ${item.observacao as string | null})
              ON CONFLICT (produto_id, insumo_id) DO UPDATE SET
                tipo              = EXCLUDED.tipo,
                quantidade        = EXCLUDED.quantidade,
                tamanho           = EXCLUDED.tamanho,
                unidade_tamanho   = EXCLUDED.unidade_tamanho,
                preco_compra_usd  = EXCLUDED.preco_compra_usd,
                obrigatorio       = EXCLUDED.obrigatorio,
                observacao        = EXCLUDED.observacao,
                updated_at        = NOW()
            `;
          }

          // Recalcular preço de pedras para cada variação
          await recalcularPrecoPedras(vProdId);
        }
      }
    }

    return NextResponse.json({
      propagado: variacoes.length,
      variacoes: variacaoProdIds,
      campos,
    });
  } catch (err) {
    console.error("[POST /api/produtos/[id]/propagar]", err);
    return NextResponse.json({ error: "Erro ao propagar" }, { status: 500 });
  }
}
