import { NextRequest, NextResponse } from "next/server";
import { authOr401 } from "@/lib/auth-server";
import { isFullAccess } from "@/lib/roles";
import sql from "@/lib/db";

/**
 * GET /api/precificacao/pedras
 *
 * REGRA DE NEGÓCIO (Jonathan 22/06): toda pedra cadastrada tem que APARECER na
 * precificação — nenhuma invisível. As que não casaram nenhum grupo ficam SEM
 * preço ("aguardando markup") e precisam ser mostradas em destaque pra serem
 * colocadas num grupo.
 *
 * Retorna:
 *   - aguardando: pedras ativas (insumo, categoria Pedras) com preco_venda NULL
 *   - resumo: total de pedras, quantas com preço, quantas aguardando
 *
 * Fonte: alissonerp.vw_pedras_preco (mesma da venda/auditoria — fonte única).
 *
 * IMPACTO SE REMOVIDO: a tela de precificação perde o bucket "aguardando markup"
 *   e pedras sem grupo voltam a sumir (não aparecem sob nenhuma regra).
 */
export async function GET(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!isFullAccess(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  try {
    const [resumo] = await sql<{ total: number; com_preco: number; aguardando: number }[]>`
      SELECT
        COUNT(*)::int                                          AS total,
        COUNT(*) FILTER (WHERE preco_venda IS NOT NULL)::int   AS com_preco,
        COUNT(*) FILTER (WHERE preco_venda IS NULL)::int       AS aguardando
      FROM alissonerp.vw_pedras_preco
    `;

    const aguardando = await sql<{
      id_produto: number;
      sku: string;
      nome: string;
      tipo_de_pedra: string | null;
      tamanho_mm: number | null;
      peso_ct: number | null;
      custo_proprio_usd: number | null;
      grupo_precificacao_id: number | null;
    }[]>`
      SELECT id_produto, sku, nome, tipo_de_pedra, tamanho_mm, peso_ct,
             custo_proprio_usd, grupo_precificacao_id
      FROM alissonerp.vw_pedras_preco
      WHERE preco_venda IS NULL
      ORDER BY tipo_de_pedra NULLS LAST, nome
    `;

    return NextResponse.json({
      resumo: {
        total: Number(resumo?.total ?? 0),
        com_preco: Number(resumo?.com_preco ?? 0),
        aguardando: Number(resumo?.aguardando ?? 0),
      },
      aguardando: aguardando.map((p) => ({
        id_produto: Number(p.id_produto),
        sku: String(p.sku),
        nome: String(p.nome),
        tipo_de_pedra: p.tipo_de_pedra ?? null,
        tamanho_mm: p.tamanho_mm != null ? Number(p.tamanho_mm) : null,
        peso_ct: p.peso_ct != null ? Number(p.peso_ct) : null,
        custo_proprio_usd: p.custo_proprio_usd != null ? Number(p.custo_proprio_usd) : null,
        grupo_precificacao_id: p.grupo_precificacao_id != null ? Number(p.grupo_precificacao_id) : null,
      })),
    });
  } catch (err) {
    console.error("[GET /api/precificacao/pedras]", err);
    return NextResponse.json({ error: "Erro ao listar pedras" }, { status: 500 });
  }
}
