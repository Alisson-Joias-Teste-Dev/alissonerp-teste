// ═══════════════════════════════════════════════════════════════════════════
// Prazo de devolução — avalia se a venda ainda pode gerar vale-troca normal
//
// REGRA DE NEGÓCIO:
//   O QUE: conta dias úteis até hoje a partir da DATA DE REFERÊNCIA da entrega,
//     escolhida nesta ordem de prioridade:
//       1. Entrega REAL ao cliente (entregas_venda.data_entrega_realizada [motoboy]
//          / data_retirada [loja]) — pedidos NOVOS, que passaram pelo módulo de
//          entregas.
//       2. Data de entrega da própria venda (vendas_erp.data_entrega) — pedidos
//          ANTIGOS, de antes do módulo de entregas (a "data de entregar do PDV").
//       3. Data da venda (vendas_erp.data_venda) — último caso, se não houver as
//          outras.
//   POR QUE: sem o fallback (2 e 3), os ~159 pedidos antigos (entregues mas sem
//     registro de entrega) NÃO teriam trava de prazo. Decisão Jonathan 15/06:
//     "regra pra trás" — usar a data de entrega do PDV pros antigos.
//   IMPACTO SE REMOVIDO: pedidos antigos voltam a poder gerar vale-troca sem prazo.
//
// NÃO substitui a trava de 'entregue' (continua no POST /api/devolucoes e no front).
// Segurança: se NÃO houver NENHUMA data, NÃO bloqueia (só bloqueia quando dá pra
// PROVAR que passou do prazo).
//
// Entrega parcial (novos): usa a entrega CONFIRMADA mais recente como referência.
// ═══════════════════════════════════════════════════════════════════════════

import sql from "@/lib/db";
import { diasUteisDecorridos, PRAZO_DEVOLUCAO_DIAS_UTEIS } from "@/lib/dias-uteis";

export type FontePrazo = "entrega_real" | "data_entrega_venda" | "data_venda" | null;

export interface AvaliacaoPrazoDevolucao {
  temData: boolean;
  fonte: FontePrazo;
  dataReferencia: string | null; // ISO
  diasUteis: number | null;
  dentroPrazo: boolean;
  motivo: string | null; // explicação quando fora do prazo
}

export async function avaliarPrazoDevolucao(vendaId: number): Promise<AvaliacaoPrazoDevolucao> {
  const [row] = await sql<{ data_real: string | null; fonte: FontePrazo }[]>`
    SELECT
      COALESCE(
        -- 1. Entrega real (novos): entrega confirmada mais recente
        (SELECT COALESCE(ev.data_entrega_realizada, ev.data_retirada)
           FROM alissonerp.entregas_venda ev
          WHERE ev.venda_id = v.id
            AND COALESCE(ev.data_entrega_realizada, ev.data_retirada) IS NOT NULL
          ORDER BY COALESCE(ev.data_entrega_realizada, ev.data_retirada) DESC
          LIMIT 1),
        -- 2. Data de entrega da venda (antigos / PDV)
        v.data_entrega::timestamptz,
        -- 3. Data da venda (último caso)
        v.data_venda::timestamptz
      ) AS data_real,
      CASE
        WHEN EXISTS (
          SELECT 1 FROM alissonerp.entregas_venda ev2
          WHERE ev2.venda_id = v.id
            AND COALESCE(ev2.data_entrega_realizada, ev2.data_retirada) IS NOT NULL
        ) THEN 'entrega_real'
        WHEN v.data_entrega IS NOT NULL THEN 'data_entrega_venda'
        WHEN v.data_venda IS NOT NULL THEN 'data_venda'
        ELSE NULL
      END AS fonte
    FROM alissonerp.vendas_erp v
    WHERE v.id = ${vendaId}
  `;

  // Sem NENHUMA data → não dá pra medir; não bloqueia (preserva comportamento seguro).
  if (!row?.data_real) {
    return { temData: false, fonte: null, dataReferencia: null, diasUteis: null, dentroPrazo: true, motivo: null };
  }

  const dataRef = new Date(row.data_real);
  const dias = diasUteisDecorridos(dataRef, new Date());
  const dentro = dias <= PRAZO_DEVOLUCAO_DIAS_UTEIS;

  return {
    temData: true,
    fonte: row.fonte,
    dataReferencia: dataRef.toISOString(),
    diasUteis: dias,
    dentroPrazo: dentro,
    motivo: dentro
      ? null
      : `Esta venda foi entregue ao cliente há ${dias} dias úteis — passou do prazo de ${PRAZO_DEVOLUCAO_DIAS_UTEIS} dias úteis para devolução. ` +
        `Para gerar o vale-troca mesmo assim, é necessário solicitar aprovação.`,
  };
}
