import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";
import { creditarSaldo } from "@/lib/saldo-credito";
import { concluirVenda } from "@/lib/vendas-aprovar";

// ─── POST /api/vendas/[id]/pagamentos/[pagId]/confirmar ─────────────────────
// Registra recebimento de pagamento "A Receber".
// Se havia crédito do gerente, devolve ao saldo.
// Se todos os pagamentos estão confirmados, conclui a venda automaticamente.
export async function POST(
  _req: NextRequest,
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

  // 1. Confirmar pagamento
  await sql`
    UPDATE alissonerp.pagamentos_venda
    SET status = 'confirmado', data_confirmacao = NOW()
    WHERE id = ${pagamentoId}
  `;

  // 2. Se havia crédito do gerente usado nessa venda, devolver ao saldo
  const [venda] = await sql`
    SELECT credito_gerente_usado, situacao
    FROM alissonerp.vendas_erp WHERE id = ${vendaId}
  `;
  const creditoUsado = parseFloat(venda?.credito_gerente_usado ?? "0");
  let saldoDevolvido = false;

  if (creditoUsado > 0 && pagamento.forma === "A Receber") {
    const valorDevolver = Math.min(parseFloat(pagamento.valor), creditoUsado);
    try {
      await creditarSaldo(valorDevolver, vendaId, pagamentoId, user.id);
      saldoDevolvido = true;

      // Reduzir crédito usado na venda
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

  // 3. Marcar contas a receber vinculada como paga
  await sql`
    UPDATE alissonerp.contas_receber
    SET situacao = 'pago', data_recebimento = CURRENT_DATE, updated_at = NOW()
    WHERE venda_erp_id = ${vendaId} AND situacao = 'pendente'
    LIMIT 1
  `.catch(() => {});

  // 4. Checar se todos os pagamentos estão confirmados → concluir ou aprovar venda
  const [pendentes] = await sql`
    SELECT COUNT(*) AS cnt
    FROM alissonerp.pagamentos_venda
    WHERE venda_id = ${vendaId} AND status = 'pendente'
  `;
  const todosPagos = Number(pendentes.cnt) === 0;
  let vendaConcluida = false;
  let vendaAprovada = false;

  // Se venda em rascunho + crédito aprovado + todos os não-A Receber confirmados → aprovar
  if (!todosPagos && venda?.situacao === "rascunho") {
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
        const [temAltoDesc] = await sql`
          SELECT EXISTS(
            SELECT 1 FROM alissonerp.itens_venda_erp
            WHERE venda_id = ${vendaId} AND pct_desconto > 30
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

  if (todosPagos && venda?.situacao === "aprovado") {
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
  });
}
