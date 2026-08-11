// ═══════════════════════════════════════════════════════════════════════════
// Baixa automática do crediário disparada pela confirmação do Mercado Pago.
//
// Quando o cliente paga uma conta "A Receber" pelo fluxo VALIDADO do crediário
// (QR Pix / maquininha gerados pela tela do Crediário), o pagamento "A Receber"
// da venda é confirmado pelo WEBHOOK do MP. Esta função fecha, na MESMA
// transação do webhook, a `conta_receber` correspondente e devolve o saldo do
// gerente — espelhando o que o `verificar-mp` faz na baixa manual (porta única),
// mas disparado pela confirmação automática (decisão: webhook fecha a conta,
// robusto mesmo se a tela do operador já estiver fechada).
//
// PORTA ÚNICA: a baixa de "A Receber" continua nascendo de um único caminho
// lógico (o crediário). Aqui só completamos o fechamento quando o gateway
// confirma o dinheiro de verdade. NÃO altera o `verificar-mp` (que segue
// funcionando para a baixa por ID colado).
//
// Idempotente: se não houver conta pendente para a venda, é no-op.
// Seletiva: só age quando a forma confirmada é 'A Receber' — pagamentos comuns
// de Pix/Cartão em venda à vista não têm conta_receber e são ignorados.
// ═══════════════════════════════════════════════════════════════════════════
import { creditarSaldo } from "@/lib/saldo-credito";
import { logAudit } from "@/lib/audit";

export interface FecharContaMpParams {
  vendaId: number;
  /** Pagamento "A Receber" que o webhook acabou de confirmar. */
  pagamentoId: number;
  /** Forma do pagamento confirmado — a função só age se for 'A Receber'. */
  formaPagamento: string;
  /** Valor confirmado (usado p/ devolver saldo proporcional ao pago). */
  valorPago: number;
  /** Usuário-sistema (mp_system_user_id ou created_by da venda). */
  usuarioId: string;
  /**
   * Parcela que a cobrança mirava (`gateway_payload.conta_receber_id`, gravado
   * pelo cobrar-pix/cobrar-cartao). Quando vem, fecha ESSA parcela; sem ela,
   * cai na mais antiga em aberto. Importa em crediário parcelado: o cliente
   * pode pagar o QR da parcela 2 antes da 1.
   */
  contaReceberId?: number | null;
}

export interface FecharContaMpResult {
  fechou: boolean;
  contaId?: number;
  saldoDevolvido?: boolean;
  /** Sobrou crediário: o "A Receber" foi dividido (ver `precisaSplit`). */
  splitPagamento?: boolean;
  restanteAReceber?: number;
}

/**
 * Roda DENTRO da transação do webhook (recebe `tx`). Fecha a conta a receber
 * pendente da venda e devolve o saldo do gerente, tudo atômico com a
 * confirmação do pagamento.
 */
export async function fecharContaReceberAposPagamentoMp(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  params: FecharContaMpParams,
): Promise<FecharContaMpResult> {
  // Só baixa de crédito "A Receber" interessa aqui.
  if (params.formaPagamento !== "A Receber") return { fechou: false };

  // Conta a receber pendente da venda (categoria 'venda'). FOR UPDATE evita
  // corrida com outra confirmação/baixa concorrente.
  // Preferimos a parcela que a cobrança mirava; só caímos na mais antiga se o
  // pagamento não trouxer essa referência (cobranças antigas).
  const [conta] = params.contaReceberId
    ? await tx`
        SELECT id, valor, status AS situacao
        FROM alissonerp.contas_receber
        WHERE id = ${params.contaReceberId}
          AND venda_erp_id = ${params.vendaId}
          AND categoria = 'venda'
          AND status = 'pendente'
        FOR UPDATE
      `
    : await tx`
        SELECT id, valor, status AS situacao
        FROM alissonerp.contas_receber
        WHERE venda_erp_id = ${params.vendaId}
          AND categoria = 'venda'
          AND status = 'pendente'
        ORDER BY id
        LIMIT 1
        FOR UPDATE
      `;
  if (!conta) return { fechou: false };

  // 1. Baixa a conta
  await tx`
    UPDATE alissonerp.contas_receber
    SET status = 'pago', data_recebimento = CURRENT_DATE, updated_at = NOW()
    WHERE id = ${conta.id}
  `;

  /**
   * 1b. SPLIT DO "A RECEBER" — crediário PARCELADO.
   *
   * O QUÊ: o webhook confirma o pagamento 'A Receber' INTEIRO, mas o QR/
   * maquininha cobrou só UMA parcela. Se o crediário vale mais do que entrou,
   * reduzimos o pagamento ao valor recebido e devolvemos o resto como um novo
   * 'A Receber' pendente.
   *
   * O PORQUÊ: N parcelas viram N linhas em contas_receber e UMA só em
   * pagamentos_venda (mig 317). Sem isto, pagar a parcela 1/4 pelo QR marca a
   * venda como 100% paga com 3 parcelas em aberto e joga a comissão (regime de
   * caixa) sobre a venda toda — exatamente o bug corrigido nas baixas manuais
   * em 06/08/2026 (venda 15678: R$ 279,00 em vez de R$ 111,60).
   *
   * ⚠️ A ORDEM IMPORTA: reduzir o confirmado ANTES de inserir o pendente —
   * ao contrário, a soma passa do total_venda e o trigger
   * fn_pagamento_nao_exceder_total (mig 333) derruba a transação do webhook.
   *
   * Crediário de 1 parcela: pagamento.valor == valor pago, `precisaSplit` dá
   * false e nada muda.
   */
  const [pagamento] = await tx`
    SELECT id, valor FROM alissonerp.pagamentos_venda
    WHERE id = ${params.pagamentoId}
    FOR UPDATE
  `;
  const valorAReceber = pagamento ? Number(pagamento.valor) : 0;
  const precisaSplit = !!pagamento && valorAReceber > params.valorPago + 0.005;
  const restanteAReceber = precisaSplit
    ? Math.round((valorAReceber - params.valorPago) * 100) / 100
    : 0;

  if (precisaSplit) {
    await tx`
      UPDATE alissonerp.pagamentos_venda
      SET valor = ${params.valorPago}
      WHERE id = ${params.pagamentoId}
    `;
    await tx`
      INSERT INTO alissonerp.pagamentos_venda
        (venda_id, forma, valor, parcelas, status)
      VALUES (${params.vendaId}, 'A Receber', ${restanteAReceber}, 1, 'pendente')
    `;
  }

  // 2. Devolve saldo do gerente se a venda usou crédito (Regra de Ouro #1).
  let saldoDevolvido = false;
  const [venda] = await tx`
    SELECT credito_gerente_usado FROM alissonerp.vendas_erp WHERE id = ${params.vendaId}
  `;
  const creditoUsado = parseFloat(venda?.credito_gerente_usado ?? "0");
  if (creditoUsado > 0) {
    const valorDevolver = Math.min(params.valorPago, creditoUsado);
    await creditarSaldo(valorDevolver, params.vendaId, params.pagamentoId, params.usuarioId, tx);
    await tx`
      UPDATE alissonerp.vendas_erp
      SET credito_gerente_usado = GREATEST(credito_gerente_usado - ${valorDevolver}, 0), updated_at = NOW()
      WHERE id = ${params.vendaId}
    `;
    saldoDevolvido = true;
  }

  // 3. Timeline do crediário
  await tx`
    INSERT INTO alissonerp.comunicacoes_crediario
      (conta_receber_id, tipo, mensagem, usuario_id)
    VALUES (
      ${conta.id},
      'aviso_recebimento',
      ${`Recebido via Mercado Pago — R$ ${params.valorPago.toFixed(2)} (confirmação automática do gateway).`},
      ${params.usuarioId}::uuid
    )
  `;

  await logAudit(tx, {
    tabela: "contas_receber",
    operacao: "UPDATE",
    registro_id: conta.id,
    usuario_id: params.usuarioId,
    dados_antes: { situacao: "pendente", valor: Number(conta.valor) },
    dados_depois: {
      situacao: "pago",
      valor: params.valorPago,
      fonte: "webhook_mp",
      saldo_devolvido: saldoDevolvido,
      ...(precisaSplit ? { split_a_receber: restanteAReceber } : {}),
    },
  });

  return {
    fechou: true,
    contaId: Number(conta.id),
    saldoDevolvido,
    splitPagamento: precisaSplit || undefined,
    restanteAReceber: precisaSplit ? restanteAReceber : undefined,
  };
}
