/**
 * POST /api/crediario/venda/[vendaId]/receber-cascata
 * [vendaId] = vendas_erp.id
 *
 * Recebe UM pagamento (valor livre ou Mercado Pago) que pode cobrir mais de
 * uma parcela pendente da mesma venda — distribui em cascata pela ordem de
 * vencimento (mais antiga primeiro), quitando parcelas inteiras e deixando
 * pagamento parcial na última tocada.
 *
 * NÃO SUBSTITUI /api/crediario/[id]/registrar-pagamento — aquela rota
 * continua servindo a baixa de UMA parcela por vez (Ouro e Vale-Troca só
 * existem lá). Esta é um atalho aditivo pra quando o cliente antecipa /
 * paga várias parcelas de uma vez.
 *
 * Formas aceitas: Dinheiro, Pix, Cartão de Crédito (manual), Manual (MP).
 *
 * REGRA DE NEGÓCIO (parcelamento em N meses — migration 317):
 * uma venda parcelada gera N linhas em contas_receber (uma por parcela),
 * mas continua tendo UM SÓ registro em pagamentos_venda com forma
 * 'A Receber' (representa o financiamento inteiro). Por isso reconciliamos
 * esse registro único pelo total efetivamente recebido nesta cascata,
 * fora do loop por parcela — nunca uma vez por conta.
 *
 * Rastreio do pagamento Mercado Pago (opção A combinada com o Jonathan):
 * o ID do pagamento MP é gravado uma única vez, no pagamento_venda
 * (não existe ambiguidade de "qual conta" porque só há um registro).
 * O histórico de cada parcela quitada por efeito cascata cita em qual
 * parcela está o comprovante real.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { creditarSaldo } from "@/lib/saldo-credito";
import { logAudit } from "@/lib/audit";
import { zodError } from "@/lib/schemas/common";
import { fetchPayment } from "@/lib/mercado-pago";
import { internalError } from "@/lib/api-error";
import { requireVendaOwnership, NotFoundError } from "@/lib/auth-vendas";
import { ForbiddenError } from "@/lib/auth-server";

// Mesma lista de papéis do registrar-pagamento.
//
// REGRA DE NEGÓCIO (Jonathan, 06/08/2026): a CONSULTORA pode receber, mas SÓ
// na venda DELA — garantido pelo requireVendaOwnership abaixo, nunca pela
// lista. Enquanto essa trava não existia aqui, o front escondia o botão
// "+ Receber pagamento" da consultora de propósito (`podeCascata`); com a
// trava no lugar, o botão volta a aparecer pra ela.
const PODE_BAIXAR = ["desenvolvedor", "admin", "gerente_loja", "diretor", "consultora"];

// Doc de regras de negócio (docs/regras-negocio/crediario.md §6): "a consultora
// registra o pagamento (TODAS AS FORMAS PERMITIDAS)" — sem restrição de Pix/
// Cartão manual a dev/comprovante. Isso diverge do que registrar-pagamento/
// route.ts faz hoje (FORMAS_MANUAL_RESTRITO); já sinalizado ao Jonathan como
// divergência doc x código, fora do escopo desta feature. Aqui seguimos o doc.
const FORMAS_ACEITAS = ["Dinheiro", "Pix", "Cartão de Crédito", "Manual (MP)"] as const;

const ReceberCascataSchema = z.object({
  forma_recebimento: z.enum(FORMAS_ACEITAS),
  valor_total: z.number().positive().optional(), // formas manuais
  payment_id: z.string().min(1).max(100).optional(), // Manual (MP)
  obs: z.string().max(5000).optional(),
});

interface ContaPendente {
  id: number;
  valor: string;
  descricao: string;
}

interface Aplicacao {
  contaId: number;
  descricao: string;
  valorConta: number;
  aplicado: number;
  quitada: boolean;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ vendaId: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { vendaId: vendaIdRaw } = await params;
  const vendaId = Number(vendaIdRaw);
  if (isNaN(vendaId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const [usuario] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario || !PODE_BAIXAR.includes(usuario.role as string)) {
    return NextResponse.json({ error: "Sem permissão para registrar baixa" }, { status: 403 });
  }

  // Trava de dono: papéis full passam direto; a consultora só recebe na venda
  // DELA. Aqui a chave é a VENDA (a cascata quita várias parcelas de uma vez),
  // por isso requireVendaOwnership e não requireCrediarioOwnership. NÃO REMOVER.
  try {
    await requireVendaOwnership(
      { id: user.id, role: usuario.role as string, email: user.email ?? "" },
      vendaId,
    );
  } catch (e) {
    if (e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = ReceberCascataSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const forma = parsed.data.forma_recebimento;
  const obsLimpo = (parsed.data.obs ?? "").trim() || null;

  // Contas pendentes da venda, mais antiga primeiro — é a ordem de quitação.
  const contas = await sql<ContaPendente[]>`
    SELECT id, valor, descricao
    FROM alissonerp.contas_receber
    WHERE venda_erp_id = ${vendaId} AND categoria = 'venda' AND situacao = 'pendente'
    ORDER BY data_vencimento ASC, id ASC
  `;
  if (contas.length === 0) {
    return NextResponse.json({ error: "Nenhuma parcela pendente para esta venda" }, { status: 404 });
  }
  const totalPendente = contas.reduce((s, c) => s + Number(c.valor), 0);

  // ═══ Determinar o valor a distribuir ═══════════════════════════════════
  let valorTotal: number;
  let mpPaymentId: string | null = null;

  if (forma === "Manual (MP)") {
    const paymentId = parsed.data.payment_id?.trim();
    if (!paymentId) {
      return NextResponse.json({ error: "Informe o ID do pagamento do Mercado Pago" }, { status: 400 });
    }

    const [duplicata] = await sql`
      SELECT id FROM alissonerp.pagamentos_venda WHERE gateway_id = ${paymentId} LIMIT 1
    `;
    if (duplicata) {
      return NextResponse.json({ error: "Este pagamento MP já está registrado em outra venda" }, { status: 409 });
    }

    let mpData: Awaited<ReturnType<typeof fetchPayment>>;
    try {
      mpData = await fetchPayment(paymentId);
    } catch (err) {
      return internalError(
        "[POST /api/crediario/venda/[vendaId]/receber-cascata] fetchPayment",
        err,
        "Erro ao consultar Mercado Pago",
        502,
      );
    }
    if (!mpData || mpData.status !== "approved") {
      return NextResponse.json(
        { error: `Pagamento MP não aprovado. Status atual: "${mpData?.status ?? "desconhecido"}"`, mp_status: mpData?.status },
        { status: 422 },
      );
    }
    valorTotal = Number(mpData.transaction_amount ?? 0);
    mpPaymentId = paymentId;
  } else {
    valorTotal = parsed.data.valor_total ?? 0;
    if (valorTotal <= 0) {
      return NextResponse.json({ error: "Informe o valor recebido" }, { status: 400 });
    }
  }

  if (valorTotal > totalPendente + 0.10) {
    return NextResponse.json(
      {
        error: `Valor recebido (R$ ${valorTotal.toFixed(2)}) é maior que o total pendente da venda (R$ ${totalPendente.toFixed(2)}).`,
        valor_recebido: valorTotal,
        total_pendente: totalPendente,
      },
      { status: 422 },
    );
  }

  // ═══ Distribuir em cascata (mais antiga primeiro) ══════════════════════
  let restante = Math.round(valorTotal * 100) / 100;
  const aplicacoes: Aplicacao[] = [];
  for (const c of contas) {
    if (restante <= 0.001) break;
    const valorConta = Number(c.valor);
    const aplicado = restante >= valorConta - 0.001 ? valorConta : restante;
    aplicacoes.push({
      contaId: c.id,
      descricao: c.descricao,
      valorConta,
      aplicado: Math.round(aplicado * 100) / 100,
      quitada: aplicado >= valorConta - 0.001,
    });
    restante = Math.round((restante - aplicado) * 100) / 100;
  }
  const primeiraDescricao = aplicacoes[0]?.descricao ?? "";

  // ═══ TRANSAÇÃO ATÔMICA (todas as contas + o pagamento único) ══════════
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await sql.begin(async (tx: any) => {
    for (const [idx, ap] of aplicacoes.entries()) {
      if (ap.quitada) {
        await tx`
          UPDATE alissonerp.contas_receber
          SET situacao = 'pago', data_recebimento = CURRENT_DATE, updated_at = NOW()
          WHERE id = ${ap.contaId}
        `;
      } else {
        // Última tocada, parcial: baixa o que entrou e deixa o resto
        // pendente numa NOVA conta (split) — igual ao registrar-pagamento avulso.
        const restanteConta = Math.round((ap.valorConta - ap.aplicado) * 100) / 100;
        await tx`
          UPDATE alissonerp.contas_receber
          SET valor = ${ap.aplicado}, situacao = 'pago', data_recebimento = CURRENT_DATE, updated_at = NOW()
          WHERE id = ${ap.contaId}
        `;
        await tx`
          INSERT INTO alissonerp.contas_receber
            (descricao, cliente_id, cliente_nome, venda_erp_id, valor,
             data_vencimento, situacao, categoria, obs, created_by)
          SELECT
            ${`Saldo restante — ${ap.descricao}`},
            cr.cliente_id, cr.cliente_nome, cr.venda_erp_id,
            ${restanteConta}, CURRENT_DATE, 'pendente', 'venda',
            ${`Parcial de R$ ${ap.aplicado.toFixed(2)} recebido via ${forma}${mpPaymentId ? ` (MP ${mpPaymentId})` : ""} — cascata da venda. Restante: R$ ${restanteConta.toFixed(2)}`},
            ${user.id}::uuid
          FROM alissonerp.contas_receber cr WHERE cr.id = ${ap.contaId}
        `;
      }

      // Histórico: a 1ª parcela leva o comprovante/ID de verdade; as demais,
      // quitadas por efeito cascata do MESMO pagamento, citam onde está o ID.
      const mensagem = idx === 0
        ? (obsLimpo ?? `Recebido via ${forma}${mpPaymentId ? ` (ID Mercado Pago ${mpPaymentId})` : ""} — R$ ${ap.aplicado.toFixed(2)} — ${ap.descricao}`)
        : `Quitada via cascata do mesmo pagamento (${forma}${mpPaymentId ? `, MP ${mpPaymentId}` : ""}) recebido na parcela "${primeiraDescricao}" — R$ ${ap.aplicado.toFixed(2)}`;

      await tx`
        INSERT INTO alissonerp.comunicacoes_crediario
          (conta_receber_id, tipo, mensagem, usuario_id)
        VALUES (${ap.contaId}, 'aviso_recebimento', ${mensagem}, ${user.id}::uuid)
      `;

      await logAudit(tx, {
        tabela: "contas_receber",
        operacao: "UPDATE",
        registro_id: ap.contaId,
        usuario_id: user.id,
        dados_antes: { situacao: "pendente", valor: ap.valorConta },
        dados_depois: {
          situacao: "pago",
          valor: ap.aplicado,
          pagamento_parcial: !ap.quitada || undefined,
          cascata_venda_id: vendaId,
        },
      });
    }

    // ═══ Reconciliar o pagamento_venda "A Receber" único da venda ═══════
    const [pagamento] = await tx`
      SELECT id, valor FROM alissonerp.pagamentos_venda
      WHERE venda_id = ${vendaId} AND forma = 'A Receber' AND status = 'pendente'
      LIMIT 1
    `;
    if (pagamento) {
      const valorPagamento = Number(pagamento.valor);
      const gateway = mpPaymentId ? "Mercado Pago (cascata)" : forma;
      const ehPagamentoParcial = valorTotal < valorPagamento - 0.01;

      if (!ehPagamentoParcial) {
        if (mpPaymentId) {
          await tx`
            UPDATE alissonerp.pagamentos_venda
            SET status = 'confirmado', data_confirmacao = NOW(),
                gateway = ${gateway}, gateway_id = ${mpPaymentId}
            WHERE id = ${pagamento.id}
          `;
        } else {
          await tx`
            UPDATE alissonerp.pagamentos_venda
            SET status = 'confirmado', data_confirmacao = NOW(), gateway = ${gateway}
            WHERE id = ${pagamento.id}
          `;
        }
      } else {
        const restantePagamento = Math.round((valorPagamento - valorTotal) * 100) / 100;
        if (mpPaymentId) {
          await tx`
            UPDATE alissonerp.pagamentos_venda
            SET valor = ${valorTotal}, status = 'confirmado', data_confirmacao = NOW(),
                gateway = ${gateway}, gateway_id = ${mpPaymentId}
            WHERE id = ${pagamento.id}
          `;
        } else {
          await tx`
            UPDATE alissonerp.pagamentos_venda
            SET valor = ${valorTotal}, status = 'confirmado', data_confirmacao = NOW(), gateway = ${gateway}
            WHERE id = ${pagamento.id}
          `;
        }
        await tx`
          INSERT INTO alissonerp.pagamentos_venda (venda_id, forma, valor, parcelas, status)
          VALUES (${vendaId}, 'A Receber', ${restantePagamento}, 1, 'pendente')
        `;
      }
    }
  });

  // ═══ PÓS-TRANSAÇÃO: devolver saldo ao gerente (fora da tx, evita lock) ══
  let saldoDevolvido = false;
  const [venda] = await sql`
    SELECT credito_gerente_usado FROM alissonerp.vendas_erp WHERE id = ${vendaId}
  `;
  const creditoUsado = parseFloat(venda?.credito_gerente_usado ?? "0");
  if (creditoUsado > 0) {
    const valorDevolver = Math.min(valorTotal, creditoUsado);
    try {
      await creditarSaldo(valorDevolver, vendaId, null, user.id);
      await sql`
        UPDATE alissonerp.vendas_erp
        SET credito_gerente_usado = GREATEST(credito_gerente_usado - ${valorDevolver}, 0), updated_at = NOW()
        WHERE id = ${vendaId}
      `;
      saldoDevolvido = true;
    } catch (err) {
      console.error("[crediario/receber-cascata] Erro ao devolver saldo:", err);
    }
  }

  return NextResponse.json({
    ok: true,
    valor_total: valorTotal,
    parcelas_quitadas: aplicacoes.filter((a) => a.quitada).length,
    parcelas_parcial: aplicacoes.filter((a) => !a.quitada).length,
    detalhe: aplicacoes,
    saldo_devolvido: saldoDevolvido,
  });
}
