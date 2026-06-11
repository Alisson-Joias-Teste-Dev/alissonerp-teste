/**
 * baixa-credito.ts — Lógica compartilhada de baixa de pagamentos (REGRA DE OURO #1-#3)
 *
 * Centraliza a lógica de negócio duplicada entre:
 *   - confirmar/route.ts (inline na venda)
 *   - registrar-pagamento/route.ts (crediário manual)
 *   - verificar-mp/route.ts (crediário MP)
 *   - webhooks/mercado-pago/route.ts (webhook MP)
 *
 * Cada função representa uma regra de ouro extraída. Nenhuma função
 * depende de gateway específico (MP, PagBank, etc) — apenas operações no banco.
 *
 * Todas as funções aceitam um parâmetro `tx` para transações atômicas.
 *
 * IMPACTO se alterado: qualquer mudança aqui afeta TODOS os fluxos de baixa
 * (confirmar, registrar-pagamento, verificar-mp, webhook, verificar-pagbank, webhook-pagbank).
 * Alterar apenas com testes completos em todos os fluxos.
 */

import type { Sql } from "postgres";
import { creditarSaldo } from "@/lib/saldo-credito";
import { approveVenda } from "@/lib/vendas-aprovar";
import { getDescontoThreshold } from "@/lib/aprovacao-regras";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface ConfirmarPagamentoOptions {
  /** Valor efetivamente pago (pode ser menor que o valor original em split) */
  valorEfetivo: number;
  /** Forma de recebimento (ex: "Dinheiro", "Pix", "PagBank Pix") */
  formaRecebimento?: string | null;
  /** Nome do gateway (ex: "Mercado Pago", "PagBank") */
  gateway?: string | null;
  /** ID do pagamento no gateway (ex: payment_id MP, charge_id PagBank) */
  gatewayId?: string | null;
  /** Source do pagamento (ex: "webhook_pagbank", "manual_mp") */
  source?: string | null;
  /** Valor líquido recebido (após taxas do gateway) */
  valorLiquido?: number | null;
  /** Taxas cobradas pelo gateway */
  taxasGateway?: number | null;
  /** Campos de ouro */
  ouroPeso?: number | null;
  ouroValorGrama?: number | null;
  ouroFotoPath?: string | null;
}

// ─── REGRA DE OURO #1: Devolver saldo ao gerente ──────────────────────────────
//
// Se a venda usou crédito do gerente (credito_gerente_usado > 0), ao receber
// um pagamento "A Receber", devolve o valor pago proporcionalmente ao saldo
// rotativo do gerente.
//
// Ex: venda de R$ 1.500 usou R$ 1.000 de crédito, cliente pagou R$ 800
//     → devolve R$ 800 ao gerente, credito_gerente_usado reduz a R$ 200

export async function devolverSaldoGerente(
  sql: Sql,
  vendaId: number,
  valorPago: number,
  pagamentoId: number | null,
  userId: string,
): Promise<{ devolvido: boolean; valor: number }> {
  const [venda] = await sql`
    SELECT credito_gerente_usado FROM alissonerp.vendas_erp WHERE id = ${vendaId}
  `;
  const creditoUsado = parseFloat(venda?.credito_gerente_usado ?? "0");

  if (creditoUsado <= 0) {
    return { devolvido: false, valor: 0 };
  }

  const valorDevolver = Math.min(valorPago, creditoUsado);

  try {
    await creditarSaldo(valorDevolver, vendaId, pagamentoId, userId);

    await sql`
      UPDATE alissonerp.vendas_erp
      SET credito_gerente_usado = GREATEST(credito_gerente_usado - ${valorDevolver}, 0),
          updated_at = NOW()
      WHERE id = ${vendaId}
    `;

    return { devolvido: true, valor: valorDevolver };
  } catch (err) {
    console.error(`[baixa-credito] Erro ao devolver saldo venda=${vendaId}:`, err);
    return { devolvido: false, valor: 0 };
  }
}

// ─── REGRA DE OURO #3: Confirmar pagamento_venda ──────────────────────────────
//
// Atualiza o status do pagamento para 'confirmado' e preenche o campo `gateway`
// com a forma de recebimento para que o card da venda mostre "via {gateway}".
//
// Trata 3 casos: Ouro (com campos de peso/foto), forma genérica, e básico.
// Se for split (valorEfetivo < valor original), atualiza o valor.

export async function confirmarPagamentoVenda(
  sql: Sql,
  pagamentoId: number,
  options: ConfirmarPagamentoOptions,
): Promise<void> {
  const temOuro =
    options.ouroPeso != null &&
    options.ouroValorGrama != null &&
    options.ouroFotoPath != null;

  if (temOuro) {
    const ouroPeso = options.ouroPeso ?? null;
    const ouroValorGrama = options.ouroValorGrama ?? null;
    const ouroFotoPath = options.ouroFotoPath ?? null;
    await sql`
      UPDATE alissonerp.pagamentos_venda
      SET valor = ${options.valorEfetivo},
          status = 'confirmado',
          data_confirmacao = NOW(),
          gateway = ${options.formaRecebimento ?? options.gateway ?? null},
          ouro_peso = ${ouroPeso},
          ouro_valor_grama = ${ouroValorGrama},
          ouro_foto_path = ${ouroFotoPath}
      WHERE id = ${pagamentoId}
    `;
  } else if (options.formaRecebimento || options.gateway) {
    await sql`
      UPDATE alissonerp.pagamentos_venda
      SET valor = ${options.valorEfetivo},
          status = 'confirmado',
          data_confirmacao = NOW(),
          gateway = ${options.formaRecebimento ?? options.gateway ?? null}
      WHERE id = ${pagamentoId}
    `;
  } else {
    await sql`
      UPDATE alissonerp.pagamentos_venda
      SET valor = ${options.valorEfetivo},
          status = 'confirmado',
          data_confirmacao = NOW()
      WHERE id = ${pagamentoId}
    `;
  }

  // Campos adicionais para confirmação via webhook (automática)
  if (options.gatewayId || options.source || options.valorLiquido != null) {
    const sets: string[] = [];
    const vals: unknown[] = [];
    if (options.gatewayId) {
      sets.push(`gateway_id = $${vals.length + 1}`);
      vals.push(options.gatewayId);
    }
    if (options.source) {
      sets.push(`source = $${vals.length + 1}`);
      vals.push(options.source);
    }
    if (options.valorLiquido != null) {
      sets.push(`valor_liquido = $${vals.length + 1}`);
      vals.push(options.valorLiquido);
    }
    if (options.taxasGateway != null) {
      sets.push(`taxas_mp = $${vals.length + 1}`);
      vals.push(options.taxasGateway);
    }
    if (sets.length > 0) {
      // REGRA DE NEGÓCIO: webhooks/gateways preenchem campos complementares
      // sem reabrir a baixa principal do pagamento já confirmado.
      // O QUE: UPDATE dinâmico só dos metadados recebidos.
      // POR QUE: MP/PagBank podem enviar gateway_id, source, líquido e taxa em momentos diferentes.
      // IMPACTO SE ALTERADO: pode apagar metadados de gateway ou quebrar conciliação.
      await sql.unsafe(
        `UPDATE alissonerp.pagamentos_venda SET ${sets.join(", ")} WHERE id = $${vals.length + 1}`,
        [...vals, pagamentoId] as any[],
      );
    }
  }
}

// ─── Split: Criar novo pagamento "A Receber" pendente ─────────────────────────
//
// Quando o pagamento é parcial (valorEfetivo < valor original), cria um novo
// pagamento_venda "A Receber" com o valor restante.

export async function criarPagamentoSplit(
  sql: Sql,
  vendaId: number,
  valorRestante: number,
): Promise<number> {
  const [novo] = await sql`
    INSERT INTO alissonerp.pagamentos_venda
      (venda_id, forma, valor, parcelas, status)
    VALUES (${vendaId}, 'A Receber', ${valorRestante}, 1, 'pendente')
    RETURNING id
  `;
  return Number(novo.id);
}

// ─── REGRA DE OURO #2: Baixar contas_receber ──────────────────────────────────
//
// Marca contas_receber como 'pago'. Se for pagamento parcial, cria uma nova
// conta_receber com o valor restante (INSERT ... SELECT FROM ...).
// Se for pagamento total, marca TODAS as pendentes da venda como 'pago'.

export interface BaixarContaReceberResult {
  quitada: boolean;
  novaContaId?: number;
}

export async function baixarContaReceber(
  sql: Sql,
  vendaId: number,
  options: {
    valorPago: number;
    valorRestante: number;
    userId: string;
    formaRecebimento?: string | null;
  },
): Promise<BaixarContaReceberResult> {
  const ehParcial = options.valorRestante > 0;

  // Captura IDs das contas pendentes ANTES do UPDATE para comunicação
  const contas = await sql<{ id: number; descricao: string }[]>`
    SELECT id, descricao FROM alissonerp.contas_receber
    WHERE venda_erp_id = ${vendaId} AND situacao = 'pendente'
  `;

  if (contas.length === 0) {
    return { quitada: true };
  }

  if (ehParcial) {
    const primeiraConta = contas[0];

    await sql`
      UPDATE alissonerp.contas_receber
      SET valor = ${options.valorPago},
          situacao = 'pago',
          data_recebimento = CURRENT_DATE,
          updated_at = NOW()
      WHERE id = ${primeiraConta.id}
    `;

    const [nova] = await sql`
      INSERT INTO alissonerp.contas_receber
        (descricao, cliente_id, cliente_nome, venda_erp_id, valor,
         data_vencimento, situacao, categoria, obs, created_by)
      SELECT
        ${`Saldo restante — ${primeiraConta.descricao}`},
        cr.cliente_id, cr.cliente_nome, cr.venda_erp_id,
        ${options.valorRestante},
        CURRENT_DATE,
        'pendente',
        'venda',
        ${`Parcial de R$ ${options.valorPago.toFixed(2)} pago via ${options.formaRecebimento ?? "não informado"}. Restante: R$ ${options.valorRestante.toFixed(2)}`},
        ${options.userId}::uuid
      FROM alissonerp.contas_receber cr
      WHERE cr.id = ${primeiraConta.id}
      RETURNING id
    `;

    return { quitada: false, novaContaId: nova?.id ?? undefined };
  }

  // Pagamento total: marcar todas as pendentes como pago
  await sql`
    UPDATE alissonerp.contas_receber
    SET situacao = 'pago', data_recebimento = CURRENT_DATE, updated_at = NOW()
    WHERE venda_erp_id = ${vendaId} AND situacao = 'pendente'
  `;

  return { quitada: true };
}

// ─── Registrar comunicação no crediário ───────────────────────────────────────
//
// REGRA DE OURO #3: toda baixa registra a forma usada no histórico de
// comunicação do crediário. Aparece na timeline do drawer de detalhe.

export async function registrarComunicacaoRecebimento(
  sql: Sql,
  contaId: number,
  options: {
    tipo?: string;
    mensagem: string;
    userId: string;
  },
): Promise<void> {
  await sql`
    INSERT INTO alissonerp.comunicacoes_crediario
      (conta_receber_id, tipo, mensagem, usuario_id)
    VALUES (
      ${contaId},
      ${options.tipo ?? "aviso_recebimento"},
      ${options.mensagem},
      ${options.userId}::uuid
    )
  `;
}

// ─── Auto-aprovar venda em rascunho com crédito ──────────────────────────────
//
// Se a venda está em rascunho com aprovacao_credito_tipo definido e todos os
// pagamentos não-A-Receber estão confirmados, aprova automaticamente.
// Verifica também bloqueio por desconto alto.

export async function autoAprovarVendaRascunho(
  sql: Sql,
  vendaId: number,
  userId: string,
): Promise<boolean> {
  const [venda] = await sql`
    SELECT situacao, aprovacao_credito_tipo,
           desconto_revalidacao_necessaria, desconto_aprovado_por
    FROM alissonerp.vendas_erp WHERE id = ${vendaId}
  `;

  if (venda?.situacao !== "rascunho") return false;
  if (!venda?.aprovacao_credito_tipo) return false;

  // Verifica se há pagamentos não-A-Receber pendentes
  const [outrosPend] = await sql`
    SELECT COUNT(*) AS cnt FROM alissonerp.pagamentos_venda
    WHERE venda_id = ${vendaId} AND forma != 'A Receber' AND status = 'pendente'
  `;

  if (Number(outrosPend.cnt) > 0) return false;

  // Verifica bloqueio por desconto alto
  const thresholdDesc = await getDescontoThreshold(vendaId);
  const [temAltoDesc] = await sql`
    SELECT EXISTS(
      SELECT 1 FROM alissonerp.itens_venda_erp
      WHERE venda_id = ${vendaId} AND pct_desconto > ${thresholdDesc}
    ) AS tem
  `;

  const bloqueadoPorDesconto =
    venda.desconto_revalidacao_necessaria === true ||
    (temAltoDesc?.tem && !venda.desconto_aprovado_por);

  if (bloqueadoPorDesconto) return false;

  try {
    await approveVenda(vendaId, userId, { tinyBestEffort: true });
    return true;
  } catch (err) {
    console.error(`[baixa-credito] Erro ao aprovar venda ${vendaId}:`, err);
    return false;
  }
}

// ─── Contar pendentes por venda ───────────────────────────────────────────────
//
// Helper para verificar quantos pagamentos ainda estão pendentes em uma venda.

export async function contarPagamentosPendentes(
  sql: Sql,
  vendaId: number,
): Promise<number> {
  const [row] = await sql`
    SELECT COUNT(*) AS cnt FROM alissonerp.pagamentos_venda
    WHERE venda_id = ${vendaId} AND status = 'pendente'
  `;
  return Number(row?.cnt ?? 0);
}

// ─── Buscar pagamento "A Receber" pendente ────────────────────────────────────
//
// Usado pelo fluxo de confirmação via gateway (verificar-mp, verificar-pagbank)
// para encontrar o pagamento_venda "A Receber" a ser confirmado.

export async function buscarPagamentoAReceberPendente(
  sql: Sql,
  vendaId: number,
): Promise<{ id: number; valor: number; forma: string } | null> {
  const [pag] = await sql`
    SELECT id, valor, forma FROM alissonerp.pagamentos_venda
    WHERE venda_id = ${vendaId}
      AND forma = 'A Receber'
      AND status = 'pendente'
    ORDER BY id
    LIMIT 1
  `;
  return pag ? { id: Number(pag.id), valor: Number(pag.valor), forma: String(pag.forma) } : null;
}
