// ═══════════════════════════════════════════════════════════════════════════
// Venda Guards — travas centrais que impedem venda em RASCUNHO de virar ação
// real no ERP (abrir ordem, emitir NFC-e, etc).
//
// REGRA DE NEGÓCIO:
//   O QUÊ: helper único (assertVendaForaDeRascunho) que verifica se uma venda
//     existe e se ela já saiu do estado 'rascunho' antes de qualquer ação que
//     dependa da venda estar firmada (pagamento confirmado).
//   POR QUÊ: rascunho é um orçamento não confirmado — sem pagamento, sem
//     compromisso do cliente. Se uma ordem de fabricação/serviço for aberta,
//     ou uma NFC-e emitida, a partir de um rascunho, o ERP passa a tratar
//     como venda real (reserva de estoque, fila PCP, nota fiscal) uma venda
//     que pode nunca se confirmar.
//   IMPACTO: se este helper for removido ou não for chamado nos pontos de
//     entrada (ex.: POST /api/ordens), consultoras voltam a conseguir abrir
//     ordem ou emitir nota fiscal a partir de um rascunho — reintroduzindo o
//     bug que motivou esta trava. Qualquer novo ponto de entrada que dependa
//     de uma venda_id confirmada DEVE chamar este mesmo helper (não duplicar
//     a checagem de situacao === 'rascunho' em outro lugar).
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Erro tipado retornado pela guarda de venda. O `motivo` permite ao chamador
 * (API route) mapear para o HTTP status correto sem parsear a mensagem:
 *   - "nao_encontrada" → 404
 *   - "rascunho"       → 422
 */
export class VendaGuardError extends Error {
  constructor(
    public readonly motivo: "nao_encontrada" | "rascunho",
    message: string,
  ) {
    super(message);
    this.name = "VendaGuardError";
  }
}

/**
 * assertVendaForaDeRascunho — lança VendaGuardError se a venda não existir
 * ou ainda estiver em 'rascunho'. Aceita tanto `sql` (conexão top-level)
 * quanto `tx` (dentro de uma transação sql.begin) — ambos implementam a
 * mesma interface de tagged-template do pacote `postgres`.
 *
 * REGRA DE NEGÓCIO: chamar SEMPRE dentro da mesma transação da ação que
 * depende da venda (ex.: criar ordem), para evitar race condition entre a
 * checagem e o INSERT (TOCTOU). Ver uso em src/app/api/ordens/route.ts.
 *
 * @param db      conexão `sql` ou `tx` do pacote postgres (tagged template)
 * @param vendaId id da venda em alissonerp.vendas_erp
 * @param acao    descrição da ação bloqueada, usada na mensagem de erro
 *                (ex.: "abrir ordem", "emitir NFC-e")
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function assertVendaForaDeRascunho(db: any, vendaId: number, acao: string): Promise<void> {
  const [venda] = await db`
    SELECT id, numero_venda, situacao
    FROM alissonerp.vendas_erp
    WHERE id = ${vendaId}
  `;

  if (!venda) {
    throw new VendaGuardError("nao_encontrada", "Venda não encontrada");
  }

  if (venda.situacao === "rascunho") {
    throw new VendaGuardError(
      "rascunho",
      `Venda ${venda.numero_venda} está em rascunho — rascunho não pode ${acao}. Confirme o pagamento para firmar a venda.`,
    );
  }
}
