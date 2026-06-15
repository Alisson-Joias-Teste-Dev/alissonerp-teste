// ═══════════════════════════════════════════════════════════════════════════
// Prazo de devolução — avalia se a venda ainda pode gerar vale-troca normal
//
// REGRA DE NEGÓCIO:
//   O QUE: lê a data REAL da entrega ao cliente (data_entrega_realizada [motoboy]
//     ou data_retirada [loja] da entrega confirmada mais recente) e conta dias
//     úteis até hoje. Até 7 dias úteis = dentro do prazo; passou = precisa de
//     aprovação configurável.
//   POR QUE: o prazo conta a partir do dia em que o cliente RECEBEU (deu o
//     código), não do `data_entrega` planejado da venda (decisão Jonathan 15/06).
//   IMPACTO SE REMOVIDO: volta a permitir vale-troca de qualquer venda, sem prazo.
//
// NÃO substitui a trava de 'entregue' (continua no POST /api/devolucoes e no
// front). Aqui assume-se que a venda já passou por aquela trava.
//
// Segurança: se NÃO houver data real de entrega registrada, NÃO bloqueia
// (dentroPrazo=true) — só bloqueia quando der pra PROVAR que passou do prazo.
// Assim, preserva o comportamento atual em casos de dado faltante.
//
// Entrega parcial: usa a entrega CONFIRMADA mais recente como referência.
// ═══════════════════════════════════════════════════════════════════════════

import sql from "@/lib/db";
import { diasUteisDecorridos, PRAZO_DEVOLUCAO_DIAS_UTEIS } from "@/lib/dias-uteis";

export interface AvaliacaoPrazoDevolucao {
  temEntrega: boolean;
  dataEntregaReal: string | null; // ISO
  diasUteis: number | null;
  dentroPrazo: boolean;
  motivo: string | null; // explicação quando fora do prazo
}

export async function avaliarPrazoDevolucao(vendaId: number): Promise<AvaliacaoPrazoDevolucao> {
  const [row] = await sql<{ data_real: string | null }[]>`
    SELECT COALESCE(data_entrega_realizada, data_retirada) AS data_real
    FROM alissonerp.entregas_venda
    WHERE venda_id = ${vendaId}
      AND COALESCE(data_entrega_realizada, data_retirada) IS NOT NULL
    ORDER BY COALESCE(data_entrega_realizada, data_retirada) DESC
    LIMIT 1
  `;

  // Sem data real → não dá pra medir; não bloqueia (preserva comportamento atual).
  if (!row?.data_real) {
    return { temEntrega: false, dataEntregaReal: null, diasUteis: null, dentroPrazo: true, motivo: null };
  }

  const dataEntrega = new Date(row.data_real);
  const dias = diasUteisDecorridos(dataEntrega, new Date());
  const dentro = dias <= PRAZO_DEVOLUCAO_DIAS_UTEIS;

  return {
    temEntrega: true,
    dataEntregaReal: dataEntrega.toISOString(),
    diasUteis: dias,
    dentroPrazo: dentro,
    motivo: dentro
      ? null
      : `Esta venda foi entregue ao cliente há ${dias} dias úteis — passou do prazo de ${PRAZO_DEVOLUCAO_DIAS_UTEIS} dias úteis para devolução. ` +
        `Para gerar o vale-troca mesmo assim, é necessário solicitar aprovação.`,
  };
}
