import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { getParametroNumber, PARAM } from "@/lib/parametros";
import { authOr401 } from "@/lib/auth-server";

// GET /api/pcp/[id]/resumo
// Retorna apontamentos agrupados por tipo com totais de metal e pedras
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [, errRes] = await authOr401(req);
  if (errRes) return errRes;

  const { id } = await params;
  const pcpId = parseInt(id);

  const metalCategoriaId = await getParametroNumber(PARAM.METAL_CATEGORIA_ID);
  const pedraCategoriaId = await getParametroNumber(PARAM.PEDRA_CATEGORIA_ID);

  const rows = await sql`
    SELECT
      ta.id        AS tipo_id,
      ta.descricao AS tipo_nome,
      COUNT(*)::int AS total_apontamentos,
      SUM(a.quantidade)   AS total_qtd,
      -- Metal: qtd já é gramas
      SUM(CASE WHEN i.categoria_id = ${metalCategoriaId} THEN a.quantidade ELSE 0 END) AS peso_metal,
      -- Pedras, peso em GRAMA. Dois fluxos:
      --   por peso (peso_ct preenchido): a.quantidade JA E a grama da balanca
      --   antigo  (peso_ct vazio):       a.quantidade e peca -> grama = qtd x peso da pedra
      -- Usar sempre a formula antiga fazia grama x grama (2,4 g virava 2,88 g).
      SUM(CASE WHEN i.categoria_id = ${pedraCategoriaId}
               THEN CASE WHEN COALESCE(a.peso_ct, 0) > 0
                         THEN a.quantidade
                         ELSE a.quantidade * COALESCE(i.peso_pedra, 0) END
               ELSE 0 END)                                      AS peso_pedras,
      -- Contagem de PECAS. No fluxo por peso ela e derivada do peso, arredondada
      -- pra baixo -- mesma regra da migration 368 ("sempre pra menos").
      SUM(CASE WHEN i.categoria_id = ${pedraCategoriaId}
               THEN CASE WHEN COALESCE(a.peso_ct, 0) > 0
                         THEN COALESCE(FLOOR(a.quantidade / NULLIF(i.peso_pedra, 0)), 0)
                         ELSE a.quantidade END
               ELSE 0 END)                                      AS qtd_pedras,
      -- Sprint 3: peso em quilates (ct)
      SUM(CASE WHEN i.categoria_id = ${pedraCategoriaId} THEN COALESCE(a.peso_ct, 0) ELSE 0 END) AS pedras_ct,
      COALESCE(MIN(i.categoria_id), 0)::int                    AS categoria_id
    FROM alissonerp.apontamentos_pcp a
    JOIN alissonerp.tipos_apontamento ta ON ta.id = a.tipo_apontamento_id
    LEFT JOIN alissonerp.insumos i ON i.id = a.insumo_id
    WHERE a.pcp_id = ${pcpId}
    GROUP BY ta.id, ta.descricao
    ORDER BY ta.id
  `;

  // Totais consolidados
  const totalMetalEntrada = rows
    .filter((r) => r.tipo_id === 1 || r.tipo_id === 2)
    .reduce((s, r) => s + Number(r.peso_metal ?? 0), 0);
  const totalMetalRetorno = rows
    .filter((r) => r.tipo_id === 5)
    .reduce((s, r) => s + Number(r.peso_metal ?? 0), 0);

  // Pedras: separar entrada (tipo 3) vs retorno (tipo 6) para calcular saldo real
  const pedrasEntradaQtd  = rows.filter((r) => r.tipo_id === 3).reduce((s, r) => s + Number(r.qtd_pedras ?? 0), 0);
  const pedrasRetornoQtd  = rows.filter((r) => r.tipo_id === 6).reduce((s, r) => s + Number(r.qtd_pedras ?? 0), 0);
  const pedrasEntradaPeso = rows.filter((r) => r.tipo_id === 3).reduce((s, r) => s + Number(r.peso_pedras ?? 0), 0);
  const pedrasRetornoPeso = rows.filter((r) => r.tipo_id === 6).reduce((s, r) => s + Number(r.peso_pedras ?? 0), 0);
  // Sprint 3: saldo em quilates
  const pedrasEntradaCT   = rows.filter((r) => r.tipo_id === 3).reduce((s, r) => s + Number(r.pedras_ct ?? 0), 0);
  const pedrasRetornoCT   = rows.filter((r) => r.tipo_id === 6).reduce((s, r) => s + Number(r.pedras_ct ?? 0), 0);

  return NextResponse.json({
    resumo: rows,
    totais: {
      metal_entrada: totalMetalEntrada,
      metal_retorno: totalMetalRetorno,
      metal_liquido: totalMetalEntrada - totalMetalRetorno,
      pedras_qtd:   pedrasEntradaQtd - pedrasRetornoQtd,
      pedras_peso:  pedrasEntradaPeso - pedrasRetornoPeso,
      pedras_ct:    parseFloat((pedrasEntradaCT - pedrasRetornoCT).toFixed(4)),
      pedras_entrada_qtd:  pedrasEntradaQtd,
      pedras_retorno_qtd:  pedrasRetornoQtd,
      pedras_entrada_ct:   parseFloat(pedrasEntradaCT.toFixed(4)),
      pedras_retorno_ct:   parseFloat(pedrasRetornoCT.toFixed(4)),
    },
  });
}
