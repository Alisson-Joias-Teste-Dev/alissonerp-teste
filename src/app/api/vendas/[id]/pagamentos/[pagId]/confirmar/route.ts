/**
 * POST /api/vendas/[id]/pagamentos/[pagId]/confirmar
 *
 * Confirmação inline de recebimento de pagamento "A Receber" direto
 * na tela de detalhe da venda (VendaDetalheClient.tsx).
 *
 * Mesma lógica do registrar-pagamento/route.ts do crediário, mas opera
 * pelo ID do pagamento_venda (não pelo ID da conta_receber).
 *
 * ⚠️ REGRA DE OURO #1: devolve saldo ao gerente se credito_gerente_usado > 0
 * ⚠️ REGRA DE OURO #2: sempre baixa contas_receber + registra comunicação
 * ⚠️ REGRA DE OURO #3: preenche o campo gateway com a forma de recebimento
 *   para que o card da venda mostre "via Dinheiro", "via Pix", etc.
 *
 * REGRA DE NEGÓCIO (Blindagem 2026-06 — correção C3 da análise):
 * O QUE: os passos financeiros (confirmar pagamento, split parcial, devolver
 *   crédito do gerente, baixar contas_receber, comunicação do crediário e
 *   auditoria) rodam em UMA transação sql.begin() — tudo ou nada.
 * POR QUE: dinheiro = ouro. Antes eram 7+ escritas soltas; uma falha no meio
 *   deixava pagamento confirmado sem baixar a conta a receber (ou vice-versa),
 *   e o erro era engolido em console.error.
 * IMPACTO SE ALTERADO: voltar a escrever fora da transação reabre o risco de
 *   estado financeiro inconsistente e silencioso.
 *
 * Fluxo:
 *   1. (tx) Confirma pagamento_venda com lock FOR UPDATE (anti corrida)
 *   2. (tx) Split do pagamento se parcial
 *   3. (tx) Devolve saldo proporcional ao gerente
 *   4. (tx) Baixa contas_receber (com split se parcial) + comunicação
 *   5. (tx) logAudit
 *   6. (fora da tx) Auto-aprova a venda (rascunho + crédito) — erros viram
 *      warning na resposta (não silenciosos), sem desfazer o financeiro já
 *      confirmado. Fluxo novo 06/2026: pagamento quitado NÃO conclui mais a
 *      venda — o status só muda na entrega (em_rota → entregue).
 */
import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";
import { creditarSaldo } from "@/lib/saldo-credito";
import { getDescontoThreshold } from "@/lib/aprovacao-regras";
import { logAudit } from "@/lib/audit";
import { internalError } from "@/lib/api-error";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; pagId: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id, pagId } = await params;
  const vendaId = Number(id);
  const pagamentoId = Number(pagId);
  if (isNaN(vendaId) || isNaN(pagamentoId)) {
    return NextResponse.json({ error: "IDs inválidos" }, { status: 400 });
  }

  // Ler forma_recebimento e valor_pago opcionais do body
  const raw = await req.json().catch(() => ({}));
  const formaRecebimento = typeof raw.forma_recebimento === "string" ? raw.forma_recebimento.trim() : null;
  const valorPagoRaw = typeof raw.valor_pago === "number" ? raw.valor_pago : null;
  const ouroPeso = typeof raw.ouro_peso === "number" ? raw.ouro_peso : null;
  const ouroValorGrama = typeof raw.ouro_valor_grama === "number" ? raw.ouro_valor_grama : null;
  const ouroFotoPath = typeof raw.ouro_foto_path === "string" ? raw.ouro_foto_path.trim() : null;

  // Verificar permissão
  const [usuario] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 403 });

  const PODE_CONFIRMAR = ["desenvolvedor", "admin", "diretor", "gerente_fabrica", "gerente_loja"];
  if (!PODE_CONFIRMAR.includes(usuario.role) && !isFullAccess(usuario.role)) {
    return NextResponse.json({ error: "Sem permissão para confirmar pagamentos" }, { status: 403 });
  }

  // Pré-validação fora da transação (resposta rápida para casos óbvios).
  // A validação DEFINITIVA acontece dentro da tx com FOR UPDATE.
  const [pagamentoPre] = await sql`
    SELECT id, venda_id, forma, valor, status
    FROM alissonerp.pagamentos_venda
    WHERE id = ${pagamentoId} AND venda_id = ${vendaId}
  `;
  if (!pagamentoPre) {
    return NextResponse.json({ error: "Pagamento não encontrado" }, { status: 404 });
  }
  if (pagamentoPre.status === "confirmado") {
    return NextResponse.json({ ok: true, ja_confirmado: true, message: "Pagamento já confirmado" });
  }
  if (pagamentoPre.status !== "pendente") {
    return NextResponse.json({ error: "Pagamento não está pendente" }, { status: 409 });
  }

  let saldoDevolvido = false;
  let novoCreditoId: number | null = null;
  let valorEfetivo = 0;
  let valorRestante = 0;
  let ehPagamentoParcial = false;
  let vendaSituacao: string | null = null;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sql as any).begin(async (tx: typeof sql) => {
      // ── PASSO 1 — Confirmar pagamento_venda (com lock anti corrida) ─────────
      // FOR UPDATE garante que duas confirmações simultâneas do mesmo pagamento
      // não passem juntas: a segunda espera e encontra status='confirmado'.
      const [pagamento] = await tx`
        SELECT id, venda_id, forma, valor, status
        FROM alissonerp.pagamentos_venda
        WHERE id = ${pagamentoId} AND venda_id = ${vendaId}
        FOR UPDATE
      `;
      if (!pagamento) throw new Error("PAGAMENTO_NAO_ENCONTRADO");
      if (pagamento.status === "confirmado") throw new Error("JA_CONFIRMADO");
      if (pagamento.status !== "pendente") throw new Error("NAO_PENDENTE");

      // O valor pago default é o valor total do pagamento. Se o front enviar
      // valor_pago menor, entra no fluxo de split (pagamento parcial).
      //
      // O campo gateway é preenchido com a forma de recebimento (ex: "Dinheiro")
      // para alimentar o "via {gateway}" no card da venda.
      //
      // Para Ouro: salva também ouro_peso, ouro_valor_grama, ouro_foto_path.
      const valorPagamento = Number(pagamento.valor);
      valorEfetivo = valorPagoRaw && valorPagoRaw > 0 && valorPagoRaw < valorPagamento ? valorPagoRaw : valorPagamento;
      ehPagamentoParcial = valorEfetivo < valorPagamento;
      valorRestante = ehPagamentoParcial ? valorPagamento - valorEfetivo : 0;

      const temOuro = ouroPeso != null && ouroValorGrama != null && ouroFotoPath != null;

      if (temOuro) {
        await tx`
          UPDATE alissonerp.pagamentos_venda
          SET valor = ${valorEfetivo}, status = 'confirmado', data_confirmacao = NOW(),
              gateway = ${formaRecebimento ?? null},
              ouro_peso = ${ouroPeso},
              ouro_valor_grama = ${ouroValorGrama},
              ouro_foto_path = ${ouroFotoPath}
          WHERE id = ${pagamentoId}
        `;
      } else if (formaRecebimento) {
        await tx`
          UPDATE alissonerp.pagamentos_venda
          SET valor = ${valorEfetivo}, status = 'confirmado', data_confirmacao = NOW(),
              gateway = ${formaRecebimento}
          WHERE id = ${pagamentoId}
        `;
      } else {
        await tx`
          UPDATE alissonerp.pagamentos_venda
          SET valor = ${valorEfetivo}, status = 'confirmado', data_confirmacao = NOW()
          WHERE id = ${pagamentoId}
        `;
      }

      // ── PASSO 1b — SPLIT DO PAGAMENTO ────────────────────────────────────────
      // Se parcial, cria novo pagamento_venda 'A Receber' pendente com o restante.
      // Isso mantém a soma dos pagamentos = total_venda.
      if (ehPagamentoParcial) {
        await tx`
          INSERT INTO alissonerp.pagamentos_venda
            (venda_id, forma, valor, parcelas, status)
          VALUES (${vendaId}, 'A Receber', ${valorRestante}, 1, 'pendente')
        `;
      }

      // ── PASSO 2 — Devolver saldo ao gerente ─────────────────────────────────
      // REGRA DE OURO #1: se a venda usou crédito do gerente, devolve o valor
      // pago proporcionalmente ao saldo rotativo — na MESMA transação.
      const [venda] = await tx`
        SELECT credito_gerente_usado, situacao
        FROM alissonerp.vendas_erp WHERE id = ${vendaId}
        FOR UPDATE
      `;
      vendaSituacao = venda?.situacao ?? null;
      const creditoUsado = parseFloat(venda?.credito_gerente_usado ?? "0");

      if (creditoUsado > 0 && pagamento.forma === "A Receber") {
        const valorDevolver = Math.min(valorEfetivo, creditoUsado);
        await creditarSaldo(valorDevolver, vendaId, pagamentoId, user.id, tx);
        saldoDevolvido = true;

        await tx`
          UPDATE alissonerp.vendas_erp
          SET credito_gerente_usado = GREATEST(credito_gerente_usado - ${valorDevolver}, 0),
              updated_at = NOW()
          WHERE id = ${vendaId}
        `;
      }

      // ── PASSO 3 — Baixar contas a receber (com split se parcial) ────────────
      // REGRA DE OURO #2: sempre baixar contas_receber ao confirmar A Receber.
      const contasParaComunicar = formaRecebimento
        ? await tx`
            SELECT id, descricao FROM alissonerp.contas_receber
            WHERE venda_erp_id = ${vendaId} AND situacao = 'pendente'
            FOR UPDATE
          `
        : [];

      if (ehPagamentoParcial && contasParaComunicar.length > 0) {
        // Pega a primeira conta pendente e faz split
        const primeiraConta = contasParaComunicar[0];
        await tx`
          UPDATE alissonerp.contas_receber
          SET valor = ${valorEfetivo},
              situacao = 'pago', data_recebimento = CURRENT_DATE, updated_at = NOW()
          WHERE id = ${primeiraConta.id}
        `;
        const [nova] = await tx`
          INSERT INTO alissonerp.contas_receber
            (descricao, cliente_id, cliente_nome, venda_erp_id, valor,
             data_vencimento, situacao, categoria, obs, created_by)
          SELECT
            ${`Saldo restante — ${primeiraConta.descricao}`},
            cr.cliente_id, cr.cliente_nome, cr.venda_erp_id,
            ${valorRestante},
            CURRENT_DATE,
            'pendente',
            'venda',
            ${`Parcial de R$ ${valorEfetivo.toFixed(2)} pago via ${formaRecebimento ?? "não informado"}. Restante: R$ ${valorRestante.toFixed(2)}`},
            ${user.id}::uuid
          FROM alissonerp.contas_receber cr
          WHERE cr.id = ${primeiraConta.id}
          RETURNING id
        `;
        novoCreditoId = nova?.id ?? null;
      } else {
        // Pagamento total: marcar todas as pendentes como pago
        await tx`
          UPDATE alissonerp.contas_receber
          SET situacao = 'pago', data_recebimento = CURRENT_DATE, updated_at = NOW()
          WHERE venda_erp_id = ${vendaId} AND situacao = 'pendente'
        `;
      }

      // ── PASSO 3a — Histórico de comunicação no crediário ────────────────────
      // REGRA DE OURO #3: toda baixa registra a forma usada no histórico.
      for (const cr of contasParaComunicar) {
        await tx`
          INSERT INTO alissonerp.comunicacoes_crediario
            (conta_receber_id, tipo, mensagem, usuario_id)
          VALUES (
            ${cr.id},
            'aviso_recebimento',
            ${`Recebido via ${formaRecebimento} — ${cr.descricao ?? `Venda #${vendaId}`}`},
            ${user.id}::uuid
          )
        `;
      }

      // ── PASSO 4 — Auditoria (quem/o quê/quando, na mesma transação) ─────────
      await logAudit(tx, {
        tabela: "pagamentos_venda",
        operacao: "UPDATE",
        registro_id: pagamentoId,
        usuario_id: user.id,
        dados_antes: { status: "pendente", valor: Number(pagamentoPre.valor) },
        dados_depois: {
          status: "confirmado",
          valor: valorEfetivo,
          forma_recebimento: formaRecebimento,
          parcial: ehPagamentoParcial,
          valor_restante: ehPagamentoParcial ? valorRestante : undefined,
          saldo_gerente_devolvido: saldoDevolvido,
        },
      });
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg === "JA_CONFIRMADO") {
      return NextResponse.json({ ok: true, ja_confirmado: true, message: "Pagamento já confirmado" });
    }
    if (msg === "NAO_PENDENTE") {
      return NextResponse.json({ error: "Pagamento não está pendente" }, { status: 409 });
    }
    if (msg === "PAGAMENTO_NAO_ENCONTRADO") {
      return NextResponse.json({ error: "Pagamento não encontrado" }, { status: 404 });
    }
    // Qualquer outra falha: NADA foi persistido (rollback) — erro visível.
    return internalError(`[POST /api/vendas/${vendaId}/pagamentos/${pagamentoId}/confirmar]`, err, "Falha ao confirmar pagamento. Nada foi gravado — tente novamente.");
  }

  // ── Pós-transação: checar se todos os pagamentos estão confirmados ──────────
  // Auto-aprovação usa as libs (que têm transação e lock próprios). Falhas
  // aqui NÃO desfazem o financeiro já confirmado acima — viram warning
  // explícito na resposta (sem catch silencioso).
  const warnings: string[] = [];
  const [pendentes] = await sql`
    SELECT COUNT(*) AS cnt
    FROM alissonerp.pagamentos_venda
    WHERE venda_id = ${vendaId} AND status = 'pendente'
  `;
  const todosPagos = Number(pendentes.cnt) === 0;
  let vendaAprovada = false;

  // Auto-aprovar quando venda em rascunho com crédito aprovado e:
  //   (a) ainda há pagamentos pendentes mas só do tipo "A Receber" — fluxo misto
  //   (b) ou TODOS os pagamentos foram confirmados — venda 100% A Receber
  if (vendaSituacao === "rascunho") {
    const [vendaCredito] = await sql`
      SELECT aprovacao_credito_tipo FROM alissonerp.vendas_erp WHERE id = ${vendaId}
    `;
    if (vendaCredito?.aprovacao_credito_tipo) {
      const [outrosPend] = await sql`
        SELECT COUNT(*) AS cnt FROM alissonerp.pagamentos_venda
        WHERE venda_id = ${vendaId} AND forma != 'A Receber' AND status = 'pendente'
      `;
      if (Number(outrosPend.cnt) === 0) {
        const [vendaDesconto] = await sql`
          SELECT desconto_revalidacao_necessaria, desconto_aprovado_por
          FROM alissonerp.vendas_erp WHERE id = ${vendaId}
        `;
        const thresholdDesc = await getDescontoThreshold(vendaId);
        const [temAltoDesc] = await sql`
          SELECT EXISTS(
            SELECT 1 FROM alissonerp.itens_venda_erp
            WHERE venda_id = ${vendaId} AND pct_desconto > ${thresholdDesc}
          ) AS tem
        `;
        const bloqueadoPorDesconto =
          vendaDesconto?.desconto_revalidacao_necessaria === true ||
          (temAltoDesc?.tem && !vendaDesconto?.desconto_aprovado_por);

        if (!bloqueadoPorDesconto) {
          try {
            const { approveVenda } = await import("@/lib/vendas-aprovar");
            await approveVenda(vendaId, user.id, { tinyBestEffort: true });
            vendaAprovada = true;
          } catch (err) {
            const m = err instanceof Error ? err.message : String(err);
            console.error(`[confirmarPagamento] Erro ao aprovar venda ${vendaId}:`, err);
            warnings.push(`Pagamento confirmado, mas a aprovação automática da venda falhou: ${m}`);
          }
        }
      }
    }
  }

  // Fluxo novo 06/2026: pagamento quitado NÃO conclui mais a venda —
  // o status só muda na entrega (em_rota → entregue).
  return NextResponse.json({
    ok: true,
    saldo_devolvido: saldoDevolvido,
    venda_aprovada: vendaAprovada,
    todos_pagos: todosPagos,
    pagamento_parcial: ehPagamentoParcial || undefined,
    valor_pago: valorEfetivo,
    valor_restante: ehPagamentoParcial ? valorRestante : undefined,
    novo_credito_id: novoCreditoId ?? undefined,
    warnings: warnings.length > 0 ? warnings : undefined,
  });
}
