import { NextRequest, NextResponse } from "next/server";
import { authOr401 } from "@/lib/auth-server";
import { isFullAccess } from "@/lib/roles";
import sql from "@/lib/db";

/**
 * GET /api/precificacao/regras-pedras/[id]/produtos
 *
 * Lista os produtos (pedras) que estao sendo precificados por uma regra
 * especifica da tabela alissonerp.pedras_precificacao_regras.
 *
 * REGRA DE NEGOCIO:
 * - A auditoria da tela de precificacao precisa mostrar exatamente os produtos
 *   casados com a regra ativa/selecionada para evitar analise com base errada.
 * - O match oficial da regra e o mesmo da view alissonerp.vw_pedras_preco.
 *
 * IMPACTO SE ALTERAR/REMOVER:
 * - Se esta rota nao existir ou nao seguir a view oficial, o frontend quebra
 *   com 404/resultado inconsistente e a equipe perde visibilidade da auditoria
 *   por regra (diagnostico de preco incorreto fica comprometido).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!isFullAccess(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const regraId = Number(id);
  if (!Number.isFinite(regraId) || regraId <= 0) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }

  try {
    const [regra] = await sql<{
      id: number;
      categoria_pedra: string;
      nome_tabela: string;
    }[]>`
      SELECT id, categoria_pedra, nome_tabela
      FROM alissonerp.pedras_precificacao_regras
      WHERE id = ${regraId}
      LIMIT 1
    `;

    if (!regra) {
      return NextResponse.json({ error: "Regra não encontrada" }, { status: 404 });
    }

    // REGRA DE NEGOCIO: filtro por (categoria_pedra + nome_tabela) replica o
    // identificador funcional da regra usada na vw_pedras_preco para auditoria.
    const produtos = await sql<{
      id_produto: number;
      nome: string;
      sku: string;
      peso_ct: number | null;
      preco_venda: number | null;
      markup_calculado: number | null;
    }[]>`
      SELECT
        vp.id_produto,
        vp.nome,
        vp.sku,
        vp.peso_ct,
        vp.preco_venda,
        vp.markup_calculado
      FROM alissonerp.vw_pedras_preco vp
      WHERE vp.categoria_pedra = ${regra.categoria_pedra}
        AND vp.nome_tabela = ${regra.nome_tabela}
      ORDER BY vp.nome ASC
    `;

    return NextResponse.json({
      produtos: produtos.map((p) => ({
        id_produto: Number(p.id_produto),
        nome: String(p.nome),
        sku: String(p.sku),
        peso_ct: p.peso_ct != null ? Number(p.peso_ct) : null,
        preco_venda: p.preco_venda != null ? Number(p.preco_venda) : null,
        markup_calculado: p.markup_calculado != null ? Number(p.markup_calculado) : null,
      })),
    });
  } catch (err) {
    console.error("[GET /api/precificacao/regras-pedras/[id]/produtos]", err);
    return NextResponse.json({ error: "Erro ao buscar produtos da regra" }, { status: 500 });
  }
}
