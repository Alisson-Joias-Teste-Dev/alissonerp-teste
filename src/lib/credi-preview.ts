/**
 * Preview das parcelas/sinal do crediário (forma "A Receber").
 *
 * O QUÊ: dado o plano escolhido (tipo + parâmetros) e o valor a parcelar,
 * devolve a lista de parcelas que o cliente vai dever, com data e valor.
 *
 * POR QUE: a tela precisa MOSTRAR o que será gerado ANTES de salvar. Este
 * cálculo ESPELHA a geração real feita pelo gatilho fn_venda_gerar_conta_receber
 * (migrations 317 e 318). Mantê-los iguais evita o usuário ver um preview
 * diferente do que cai no Crediário depois da aprovação.
 *
 * IMPACTO SE ALTERADO: o preview deixa de bater com as contas a receber reais
 * geradas na aprovação. Se mudar a regra aqui, mudar também na migration 317/318.
 *
 * OBS sinal: aqui o vencimento é aproximado (7 dias úteis SEM feriados) — só
 * para exibir. O vencimento REAL é calculado pelo gatilho (mig 318). Igual ao
 * comportamento do wizard hoje, que também só manda credi_tipo/credi_param.
 */

export type CrediTipo = "meses" | "dias" | "sinal";

export interface CrediParcela {
  num: number;
  data: Date;
  valor: number;
}

export interface CrediPreviewParams {
  tipo: CrediTipo;
  /** Saldo a parcelar: total da venda (forma única) ou só o valor do "A Receber" (Múltiplas). */
  valorBase: number;
  /** Nº de parcelas mensais (só usado em tipo='meses'). */
  parcelas: number;
  /** Dia do vencimento mensal 1..31 (só usado em tipo='meses'). */
  diaVenc: number;
  /** Nº de dias até o pagamento único (só usado em tipo='dias'). */
  dias: number;
}

export function calcularCrediPreview({ tipo, valorBase, parcelas, diaVenc, dias }: CrediPreviewParams): CrediParcela[] {
  // Sem saldo = sem parcela (ex.: A Receber ainda sem valor digitado no Múltiplas).
  if (valorBase <= 0) return [];

  if (tipo === "sinal") {
    // Sinal: peça reservada, saldo vence em 7 dias úteis (aprox., sem feriados;
    // o backend usa o cálculo exato via gatilho).
    const d = new Date();
    let u = 0;
    while (u < 7) {
      d.setDate(d.getDate() + 1);
      const dow = d.getDay();
      if (dow !== 0 && dow !== 6) u++;
    }
    return [{ num: 1, data: d, valor: valorBase }];
  }

  if (tipo === "dias") {
    // 1 pagamento futuro, vencendo em X dias corridos.
    return [{ num: 1, data: new Date(Date.now() + dias * 86400000), valor: valorBase }];
  }

  // tipo='meses': N parcelas mensais, 1ª no mês seguinte, dia clampado ao fim do
  // mês; a última parcela absorve o centavo da divisão.
  const n = Math.max(1, parcelas);
  const base = Math.trunc((valorBase / n) * 100) / 100;
  const hoje = new Date();
  return Array.from({ length: n }, (_, i) => {
    const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 2 + i, 0).getDate();
    const dia = Math.min(diaVenc, ultimoDia);
    const data = new Date(hoje.getFullYear(), hoje.getMonth() + 1 + i, dia);
    const valor = i === n - 1 ? +(valorBase - base * (n - 1)).toFixed(2) : base;
    return { num: i + 1, data, valor };
  });
}
