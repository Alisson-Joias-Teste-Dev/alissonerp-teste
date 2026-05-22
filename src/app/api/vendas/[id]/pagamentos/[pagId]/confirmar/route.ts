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
 * Fluxo:
 *   1. Confirma pagamento_venda (com split se parcial)
 *   2. Devolve saldo proporcional ao gerente
 *   3. Baixa contas_receber (com split se parcial)
 *   4. Auto-aprova venda em rascunho se crédito aprovado
 *   5. Auto-conclui venda se todos pagamentos confirmados
 */
import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";
import { creditarSaldo } from "@/lib/saldo-credito";
import { concluirVenda } from "@/lib/vendas-aprovar";
import { getDescontoThreshold } from "@/lib/aprovacao-regras";

// ─── POST /api/vendas/[id]/pagamentos/[pagId]/confirmar ─────────────────────
// Registra recebimento de pagamento "A Receber".
// Se havia crédito do gerente, devolve ao saldo.
// Se todos os pagamentos estão confirmados, conclui a venda automaticamente.
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

  // Validar pagamento
  const [pagamento] = await sql`
    SELECT id, venda_id, forma, valor, status
    FROM alissonerp.pagamentos_venda
    WHERE id = ${pagamentoId} AND venda_id = ${vendaId}
  `;
  if (!pagamento) {
    return NextResponse.json({ error: "Pagamento não encontrado" }, { status: 404 });
  }
  if (pagamento.status === "confirmado") {
    return NextResponse.json({ ok: true, ja_confirmado: true, message: "Pagamento já confirmado" });
  }
  if (pagamento.status !== "pendente") {
    return NextResponse.json({ error: "Pagamento não está pendente" }, { status: 409 });
  }

  // PASSO 1 — Confirmar pagamento_venda
  // O valor pago default é o valor total do pagamento. Se o front enviar
  // valor_pago menor, entra no fluxo de split (pagamento parcial).
  //
  // O campo gateway é preenchido com a forma de recebimento (ex: "Dinheiro")
  // para alimentar o "via {gateway}" no card da venda (VendaDetalheClient.tsx:2573).
  //
  // Para Ouro: salva também ouro_peso, ouro_valor_grama, ouro_foto_path
  // que são exibidos como thumbnail no card de pagamento.
  const valorPagamento = Number(pagamento.valor);
  const valorEfetivo = valorPagoRaw && valorPagoRaw > 0 && valorPagoRaw < valorPagamento ? valorPagoRaw : valorPagamento;
  const ehPagamentoParcial = valorEfetivo < valorPagamento;
  const valorRestante = ehPagamentoParcial ? valorPagamento - valorEfetivo : 0;

  const temOuro = ouroPeso != null && ouroValorGrama != null && ouroFotoPath != null;

  if (temOuro) {
    await sql`
      UPDATE alissonerp.pagamentos_venda
      SET valor = ${valorEfetivo}, status = 'confirmado', data_confirmacao = NOW(),
          gateway = ${formaRecebimento ?? null},
          ouro_peso = ${ouroPeso},
          ouro_valor_grama = ${ouroValorGrama},
          ouro_foto_path = ${ouroFotoPath}
      WHERE id = ${pagamentoId}
    `;
  } else if (formaRecebimento) {
    await sql`
      UPDATE alissonerp.pagamentos_venda
      SET valor = ${valorEfetivo}, status = 'confirmado', data_confirmacao = NOW(),
          gateway = ${formaRecebimento}
      WHERE id = ${pagamentoId}
    `;
  } else {
    await sql`
      UPDATE alissonerp.pagamentos_venda
      SET valor = ${valorEfetivo}, status = 'confirmado', data_confirmacao = NOW()
      WHERE id = ${pagamentoId}
    `;
  }

  // PASSO 1b — SPLIT DO PAGAMENTO
  // Se parcial, cria novo pagamento_venda 'A Receber' pendente com o restante.
  // O original é atualizado com o valor pago e status 'confirmado'.
  // Isso mantém a soma dos pagamentos = total_venda.
  if (ehPagamentoParcial) {
    await sql`
      INSERT INTO alissonerp.pagamentos_venda
        (venda_id, forma, valor, parcelas, status)
      VALUES (${vendaId}, 'A Receber', ${valorRestante}, 1, 'pendente')
    `;
  }

  // PASSO 2 — Devolver saldo ao gerente
  // REGRA DE OURO #1: se a venda usou crédito do gerente, devolve
  // o valor pago proporcionalmente ao saldo rotativo.
  // Ex: venda de R$ 1.500 usou R$ 1.000 de crédito, cliente pagou R$ 800
  //     → devolve R$ 800 ao gerente, credito_gerente_usado reduz a R$ 200
  const [venda] = await sql`
    SELECT credito_gerente_usado, situacao
    FROM alissonerp.vendas_erp WHERE id = ${vendaId}
  `;
  const creditoUsado = parseFloat(venda?.credito_gerente_usado ?? "0");
  let saldoDevolvido = false;

  if (creditoUsado > 0 && pagamento.forma === "A Receber") {
    const valorDevolver = Math.min(valorEfetivo, creditoUsado);
    try {
      await creditarSaldo(valorDevolver, vendaId, pagamentoId, user.id);
      saldoDevolvido = true;

      await sql`
        UPDATE alissonerp.vendas_erp
        SET credito_gerente_usado = GREATEST(credito_gerente_usado - ${valorDevolver}, 0),
            updated_at = NOW()
        WHERE id = ${vendaId}
      `;
    } catch (err) {
      console.error(`[confirmarPagamento] Erro ao creditar saldo:`, err);
    }
  }

  // PASSO 3 — Baixar contas a receber (com split se parcial)
  // REGRA DE OURO #2: sempre baixar contas_receber ao confirmar A Receber.
  // Capturamos os IDs ANTES do UPDATE para registrar a comunicação depois.
  //
  // Se parcial: atualiza UMA conta com o valor pago e cria NOVA conta
  // com o restante (mesma lógica do registrar-pagamento).
  // Se total: marca todas as pendentes da venda como 'pago'.
  const contasParaComunicar = formaRecebimento
    ? await sql`
        SELECT id, descricao FROM alissonerp.contas_receber
        WHERE venda_erp_id = ${vendaId} AND situacao = 'pendente'
      `
    : [];

  let novoCreditoId: number | null = null;

  try {
    if (ehPagamentoParcial && contasParaComunicar.length > 0) {
      // Pega a primeira conta pendente e faz split
      const primeiraConta = contasParaComunicar[0];
      await sql`
        UPDATE alissonerp.contas_receber
        SET valor = ${valorEfetivo},
            situacao = 'pago', data_recebimento = CURRENT_DATE, updated_at = NOW()
        WHERE id = ${primeiraConta.id}
      `;
      const [nova] = await sql`
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
      await sql`
        UPDATE alissonerp.contas_receber
        SET situacao = 'pago', data_recebimento = CURRENT_DATE, updated_at = NOW()
        WHERE venda_erp_id = ${vendaId} AND situacao = 'pendente'
      `;
    }
  } catch (err) {
    console.error(`[confirmarPagamento] Erro ao baixar contas_receber venda=${vendaId}:`, err);
  }

  // PASSO 3a — Histórico de comunicação no crediário
  // REGRA DE OURO #3: toda baixa registra a forma usada no histórico.
  // Aparece na timeline do drawer de detalhe do crediário.
  if (contasParaComunicar.length > 0) {
    try {
      for (const cr of contasParaComunicar) {
        await sql`
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
    } catch (err) {
      console.error(`[confirmarPagamento] Erro ao registrar comunicação crediário:`, err);
    }
  }

  // 4. Checar se todos os pagamentos estão confirmados → concluir ou aprovar venda
  const [pendentes] = await sql`
    SELECT COUNT(*) AS cnt
    FROM alissonerp.pagamentos_venda
    WHERE venda_id = ${vendaId} AND status = 'pendente'
  `;
  const todosPagos = Number(pendentes.cnt) === 0;
  let vendaConcluida = false;
  let vendaAprovada = false;

  // Auto-aprovar quando venda em rascunho com crédito aprovado e:
  //   (a) ainda há pagamentos pendentes mas só do tipo "A Receber" — fluxo misto
  //   (b) ou TODOS os pagamentos foram confirmados — venda 100% A Receber
  // Antes só cobria (a) por causa do `!todosPagos`, o que deixava venda 100%
  // A Receber em rascunho mesmo após confirmação completa.
  if (venda?.situacao === "rascunho") {
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
          console.log(`[confirmarPagamento] auto-aprovando venda=${vendaId} tipo=${vendaCredito.aprovacao_credito_tipo} user=${user.id}`);
          try {
            const { approveVenda } = await import("@/lib/vendas-aprovar");
            await approveVenda(vendaId, user.id, { tinyBestEffort: true });
            vendaAprovada = true;
            console.log(`[confirmarPagamento] venda=${vendaId} aprovada automaticamente`);
          } catch (err) {
            console.error(`[confirmarPagamento] Erro ao aprovar venda ${vendaId}:`, err);
          }
        }
      }
    }
  }

  // Auto-concluir: situação efetiva é 'aprovado' (já estava OU acabou de ser aprovada)
  // e todos os pagamentos foram confirmados.
  const situacaoEfetiva = vendaAprovada ? "aprovado" : venda?.situacao;
  if (todosPagos && situacaoEfetiva === "aprovado") {
    try {
      await concluirVenda(vendaId, user.id, { tinyBestEffort: true });
      vendaConcluida = true;
    } catch (err) {
      console.error(`[confirmarPagamento] Erro ao concluir venda ${vendaId}:`, err);
    }
  }

  return NextResponse.json({
    ok: true,
    saldo_devolvido: saldoDevolvido,
    venda_aprovada: vendaAprovada,
    venda_concluida: vendaConcluida,
    todos_pagos: todosPagos,
    pagamento_parcial: ehPagamentoParcial || undefined,
    valor_pago: valorEfetivo,
    valor_restante: ehPagamentoParcial ? valorRestante : undefined,
    novo_credito_id: novoCreditoId ?? undefined,
  });
}
