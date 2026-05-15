import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { creditarSaldo } from "@/lib/saldo-credito";
import { concluirVenda } from "@/lib/vendas-aprovar";
import { logAudit } from "@/lib/audit";

// Rota de emergência — use verificar-mp para baixas com comprovante MP
const PODE_BAIXAR = ["desenvolvedor"];

// POST /api/crediario/[id]/registrar-pagamento
// [id] = conta_receber_id
// Registra o recebimento de um crédito "A Receber":
//   1. Marca contas_receber como 'pago'
//   2. Confirma o pagamento_venda correspondente
//   3. Devolve saldo ao gerente se crédito foi usado
//   4. Conclui venda se todos os pagamentos confirmados
//   5. Registra em comunicacoes_crediario
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const contaId = Number(id);
  if (isNaN(contaId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const [usuario] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario || !PODE_BAIXAR.includes(usuario.role as string)) {
    return NextResponse.json({ error: "Sem permissão para registrar baixa" }, { status: 403 });
  }

  // Carregar conta a receber
  const [conta] = await sql`
    SELECT id, situacao, valor, venda_erp_id, descricao
    FROM alissonerp.contas_receber
    WHERE id = ${contaId} AND categoria = 'venda'
  `;
  if (!conta) return NextResponse.json({ error: "Conta não encontrada" }, { status: 404 });
  if (conta.situacao === "pago") {
    return NextResponse.json({ ok: true, ja_pago: true, message: "Conta já estava paga" });
  }
  if (conta.situacao !== "pendente") {
    return NextResponse.json({ error: "Conta não está pendente" }, { status: 409 });
  }

  const vendaId = conta.venda_erp_id as number | null;

  // Buscar pagamento_venda "A Receber" pendente desta venda
  const [pagamento] = vendaId
    ? await sql`
        SELECT id, valor, forma FROM alissonerp.pagamentos_venda
        WHERE venda_id = ${vendaId} AND forma = 'A Receber' AND status = 'pendente'
        LIMIT 1
      `
    : [null];

  const body = await req.json().catch(() => ({})) as { obs?: string };
  const obs = (body?.obs ?? "").trim() || null;

  let saldoDevolvido = false;
  let vendaConcluida = false;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await sql.begin(async (tx: any) => {
    // 1. Marcar conta a receber como paga
    await tx`
      UPDATE alissonerp.contas_receber
      SET situacao = 'pago', data_recebimento = CURRENT_DATE, updated_at = NOW()
      WHERE id = ${contaId}
    `;

    // 2. Confirmar pagamento_venda se existir
    if (pagamento) {
      await tx`
        UPDATE alissonerp.pagamentos_venda
        SET status = 'confirmado', data_confirmacao = NOW()
        WHERE id = ${pagamento.id}
      `;
    }

    // 3. Registrar comunicação
    await tx`
      INSERT INTO alissonerp.comunicacoes_crediario
        (conta_receber_id, tipo, mensagem, usuario_id)
      VALUES (
        ${contaId},
        'aviso_recebimento',
        ${obs ?? `Pagamento de ${conta.descricao} registrado manualmente`},
        ${user.id}::uuid
      )
    `;

    await logAudit(tx, {
      tabela: "contas_receber",
      operacao: "UPDATE",
      registro_id: contaId,
      usuario_id: user.id,
      dados_antes: { situacao: "pendente" },
      dados_depois: { situacao: "pago", data_recebimento: new Date().toISOString().split("T")[0] },
    });
  });

  // 4. Devolver saldo ao gerente se crédito foi usado (fora da tx para evitar lock)
  if (vendaId && pagamento) {
    const [venda] = await sql`
      SELECT credito_gerente_usado FROM alissonerp.vendas_erp WHERE id = ${vendaId}
    `;
    const creditoUsado = parseFloat(venda?.credito_gerente_usado ?? "0");
    if (creditoUsado > 0) {
      const valorDevolver = Math.min(parseFloat(pagamento.valor), creditoUsado);
      try {
        await creditarSaldo(valorDevolver, vendaId, pagamento.id, user.id);
        await sql`
          UPDATE alissonerp.vendas_erp
          SET credito_gerente_usado = GREATEST(credito_gerente_usado - ${valorDevolver}, 0),
              updated_at = NOW()
          WHERE id = ${vendaId}
        `;
        saldoDevolvido = true;
      } catch (err) {
        console.error("[crediario/baixa] Erro ao devolver saldo:", err);
      }
    }
  }

  // 5. Verificar se todos os pagamentos estão confirmados e concluir venda
  if (vendaId) {
    const [pendentes] = await sql`
      SELECT COUNT(*) AS cnt FROM alissonerp.pagamentos_venda
      WHERE venda_id = ${vendaId} AND status = 'pendente'
    `;
    const [venda] = await sql`
      SELECT situacao FROM alissonerp.vendas_erp WHERE id = ${vendaId}
    `;
    if (Number(pendentes.cnt) === 0 && venda?.situacao === "aprovado") {
      try {
        await concluirVenda(vendaId, user.id, { tinyBestEffort: true });
        vendaConcluida = true;
      } catch (err) {
        console.error("[crediario/baixa] Erro ao concluir venda:", err);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    saldo_devolvido: saldoDevolvido,
    venda_concluida: vendaConcluida,
  });
}
