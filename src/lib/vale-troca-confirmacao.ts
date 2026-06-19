// ════════════════════════════════════════════════════════════════════════════
// vale-troca-confirmacao.ts — 2a confirmacao do Vale-Troca no FRONT (brecha #1)
//
// O QUE: antes de aplicar um vale COM dono num pagamento, dispara o codigo de 6
//   digitos no WhatsApp do dono (/api/vale-troca/solicitar-codigo), pede o codigo
//   ao atendente (prompt) e devolve { vale_codigo } / { vale_excecao } pra ir no
//   corpo do POST de pagamentos. Vale SEM dono (promocional) volta vazio (segue
//   direto, sem pedir nada).
// POR QUE: era possivel usar vale alheio sem o consentimento do dono (2 usos
//   cruzados reais, R$3.410). Esta e a MESMA logica ja usada na nova venda
//   (NovaVendaClientV2.aplicarValeNaVenda) — extraida pra reuso (fonte unica), pra
//   tambem valer na tela de detalhe da venda (Adicionar pagamento).
// IMPACTO SE REMOVIDO/ALTERADO: a tela de detalhe da venda volta a aplicar vale
//   sem pedir o token; o backend ainda barra (precisa_codigo em
//   /api/vendas/[id]/pagamentos), mas o usuario fica sem caminho pra concluir.
//   NUNCA duplicar este fluxo — todas as telas devem chamar esta funcao.
// ════════════════════════════════════════════════════════════════════════════

export interface ConfirmacaoVale {
  vale_codigo?: string;
  vale_excecao?: boolean;
}

/**
 * Obtem a 2a confirmacao do dono do vale antes de aplica-lo num pagamento.
 * Lanca Error cuja mensagem COMECA com "Confirmacao" quando o atendente cancela
 * (sem codigo e sem excecao) — o chamador deve abortar o registro nesse caso.
 * Falha de REDE ao solicitar o codigo NAO interrompe: segue sem codigo e o
 * backend ainda barra a aplicacao se o codigo for obrigatorio.
 *
 * Retorno pronto pra injetar no corpo do POST com Object.assign(body, conf):
 * `vale_excecao` so vem quando true; `vale_codigo` ausente vira undefined (o
 * JSON.stringify omite). Assim o chamador nao repete os ifs de cada campo.
 */
export async function obterConfirmacaoVale(valeNumero: string): Promise<ConfirmacaoVale> {
  const valeNum = valeNumero.trim();
  let vale_codigo: string | undefined;
  let vale_excecao = false;

  // 1. Solicita o codigo ao dono. precisa_codigo=false => vale promocional (segue direto).
  try {
    const sres = await fetch(`/api/vale-troca/solicitar-codigo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vale_numero: valeNum }),
    });
    const sd = await sres.json() as {
      ok: boolean; precisa_codigo?: boolean; precisa_excecao?: boolean;
      telefone_mascarado?: string; erro?: string;
    };
    if (sres.ok && sd.precisa_codigo) {
      const onde = sd.telefone_mascarado ? ` (${sd.telefone_mascarado})` : "";
      const msg = sd.precisa_excecao
        ? `Não foi possível enviar o código pelo WhatsApp do dono${sd.erro ? ` — ${sd.erro}` : ""}.\n\nSe o dono recebeu mesmo assim, digite o código; ou deixe em branco para pedir liberação de um responsável.`
        : `Um código foi enviado ao WhatsApp do dono do vale${onde}.\n\nDigite o código informado pelo cliente:`;
      const cod = window.prompt(msg, "");
      if (cod && cod.trim()) {
        vale_codigo = cod.trim();
      } else if (sd.precisa_excecao) {
        vale_excecao = window.confirm(
          "Liberar o vale SEM o código? Exige autorização de um responsável (gerente/aprovador configurado). Continuar?",
        );
        if (!vale_excecao) throw new Error("Confirmação do vale cancelada.");
      } else {
        throw new Error("Confirmação do vale cancelada — código não informado.");
      }
    }
  } catch (e) {
    // So interrompe se for o cancelamento explicito; falha de rede ao solicitar
    // segue (o backend ainda barra a aplicacao se o codigo faltar).
    if (e instanceof Error && e.message.startsWith("Confirmação")) throw e;
  }

  // vale_excecao so no objeto quando true (evita mandar `false` a toa no body).
  return vale_excecao ? { vale_codigo, vale_excecao: true } : { vale_codigo };
}
