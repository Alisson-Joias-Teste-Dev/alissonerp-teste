export interface ResultadoProcesso {
  perda: number;
  perdaPct: number;
  ehGanho: boolean;
  ganho: number;
  ganhoPct: number;
  perdaAlta: boolean;
  perdaBaixa: boolean;
}

/**
 * Calcula perda (ou ganho) de metal entre o peso esperado e o peso real
 * devolvido pelo processo (concluir Purificação ou concluir Ligação) —
 * mesma fórmula copiada nas duas telas, extraída na Etapa 5 do plano.
 *
 * REGRA DE NEGÓCIO: retornar MAIS que o esperado é "ganho de teor" (bom
 * resultado), NUNCA mostrado como "perda negativa". Perda > 2% acende alerta
 * pra revisar o processo; perda < 1% é destacada como rendimento ótimo
 * (regra de negócio de 15/06, libera ganho sem travar o salvamento).
 * IMPACTO SE ALTERADO: muda o texto/cor de alerta ao concluir purificação/ligação.
 */
export function calcularResultadoProcesso(pesoEsperado: number, pesoRealNum: number): ResultadoProcesso {
  const perda = pesoEsperado > 0 ? pesoEsperado - pesoRealNum : 0;
  const perdaPct = pesoEsperado > 0 ? (perda / pesoEsperado) * 100 : 0;
  const ehGanho = pesoRealNum > 0 && perda < 0;
  const ganho = -perda;
  const ganhoPct = -perdaPct;
  const perdaAlta = perdaPct > 2;
  const perdaBaixa = pesoRealNum > 0 && perdaPct >= 0 && perdaPct < 1;
  return { perda, perdaPct, ehGanho, ganho, ganhoPct, perdaAlta, perdaBaixa };
}
