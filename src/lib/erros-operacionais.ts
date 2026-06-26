/**
 * Tradutor de erros OPERACIONAIS — deixa a mensagem clara pro usuário.
 *
 * REGRA DE NEGÓCIO:
 * O QUE: troca os prefixos técnicos que vêm dos gatilhos/validações do banco
 *   (STOCK_NEGATIVE, ENTREGA_BLOCKED, TRANSICAO_INVALIDA, NA_ENTREGA_PENDENTE)
 *   por frases em português claro, antes de mostrar na tela.
 * POR QUE: esses erros NÃO são bugs — são bloqueios de operação propositais
 *   (uma etapa não foi feita: reposição não concluída, peça não voltou, pagamento
 *   na entrega não registrado, status não pode voltar). O usuário só precisa
 *   entender o que falta fazer, sem ver jargão técnico (Item=, Warehouse=, etc.).
 * IMPACTO SE REMOVIDO: o atendente volta a ver mensagens cruas tipo
 *   "STOCK_NEGATIVE: Saldo insuficiente no almoxarifado. Item=..., Warehouse=2"
 *   e não sabe que o problema é a reposição que não voltou.
 *
 * É ADITIVO: não muda nenhuma regra; só reescreve o texto. Se a mensagem não
 * casar com nenhum padrão conhecido, devolve ela mesma (intacta).
 */
export function traduzErroOperacional(msg: string): string {
  if (!msg) return msg;
  const limpa = msg.trim();

  // Estoque insuficiente = a peça (geralmente de reposição) ainda não entrou no
  // estoque. Reescreve por completo (o original cita almoxarifado/warehouse/item).
  if (limpa.startsWith("STOCK_NEGATIVE")) {
    return "A peça ainda não está no estoque. Se for de reposição, conclua a volta da reposição (ou conclua a ordem) antes de entregar.";
  }

  // Entrega bloqueada por reposição não concluída. O texto após o prefixo já é
  // claro ("Venda #X possui N ordem(ns) de reposição não concluída(s). Conclua
  // ou cancele antes de marcar como entregue.") — só remove o prefixo técnico.
  if (limpa.startsWith("ENTREGA_BLOCKED:")) {
    return semPrefixo(limpa, "ENTREGA_BLOCKED:");
  }

  // Pagamento "Na Entrega" não registrado. Texto após o prefixo já é claro.
  if (limpa.startsWith("NA_ENTREGA_PENDENTE:")) {
    return capitaliza(semPrefixo(limpa, "NA_ENTREGA_PENDENTE:"));
  }

  // Transição de status não permitida (ex.: reabrir venda já entregue).
  // Original: "TRANSICAO_INVALIDA: entregue → aprovado (venda 30114)".
  if (limpa.startsWith("TRANSICAO_INVALIDA:")) {
    return "Não é possível mudar a venda para esse status nesta etapa.";
  }
  // Variante antiga sem prefixo padronizado.
  if (limpa.startsWith("Transição inválida")) {
    return "Não é possível mudar a venda para esse status nesta etapa.";
  }

  return msg;
}

function semPrefixo(msg: string, prefixo: string): string {
  return msg.slice(prefixo.length).trim();
}

function capitaliza(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}
