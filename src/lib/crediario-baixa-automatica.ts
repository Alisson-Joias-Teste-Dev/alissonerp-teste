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
}

export interface FecharContaMpResult {
  fechou: boolean;
  contaId?: number;
  saldoDevolvido?: boolean;
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
  const [conta] = await tx`
    SELECT id, valor, situacao
    FROM alissonerp.contas_receber
    WHERE venda_erp_id = ${params.vendaId}
      AND categoria = 'venda'
      AND situacao = 'pendente'
    ORDER BY id
    LIMIT 1
    FOR UPDATE
  `;
  if (!conta) return { fechou: false };

  // 1. Baixa a conta
  await tx`
    UPDATE alissonerp.contas_receber
    SET situacao = 'pago', data_recebimento = CURRENT_DATE, updated_at = NOW()
    WHERE id = ${conta.id}
  `;

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
    },
  });

  return { fechou: true, contaId: Number(conta.id), saldoDevolvido };
}
