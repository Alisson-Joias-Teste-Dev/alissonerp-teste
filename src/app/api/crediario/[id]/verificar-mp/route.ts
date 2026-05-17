import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { fetchPayment } from "@/lib/mercado-pago";
import { creditarSaldo } from "@/lib/saldo-credito";
import { concluirVenda } from "@/lib/vendas-aprovar";
import { internalError } from "@/lib/api-error";
import { zodError } from "@/lib/schemas/common";

const PODE_VERIFICAR = ["desenvolvedor", "admin", "gerente_loja", "diretor"];

const VerificarMpSchema = z.object({
  payment_id: z.string().min(1, "Informe o ID do pagamento do Mercado Pago").max(100),
  obs: z.string().max(5000).optional(),
});

// POST /api/crediario/[id]/verificar-mp
// [id] = conta_receber_id
// Recebe { payment_id } do Mercado Pago.
// Consulta a API do MP — só confirma a baixa se o pagamento estiver "approved".
// Garante que ninguém pode dar baixa sem dinheiro real no MP.
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
  if (!usuario || !PODE_VERIFICAR.includes(usuario.role as string)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = VerificarMpSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;
  const mpPaymentId = body.payment_id.trim();

  // Guard duplicata: já existe este payment_id em pagamentos_venda?
  const [duplicata] = await sql`
    SELECT id FROM alissonerp.pagamentos_venda
    WHERE gateway_id = ${mpPaymentId} LIMIT 1
  `;
  if (duplicata) {
    return NextResponse.json({ error: "Este pagamento MP já está registrado em outra venda" }, { status: 409 });
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

  // ── Verificar pagamento no Mercado Pago ───────────────────────────────────
  let mpData: Awaited<ReturnType<typeof fetchPayment>>;
  try {
    mpData = await fetchPayment(mpPaymentId);
  } catch (err) {
    return internalError("[POST /api/crediario/[id]/verificar-mp] fetchPayment", err, "Erro ao consultar Mercado Pago", 502);
  }

  if (!mpData || mpData.status !== "approved") {
    return NextResponse.json(
      {
        error: `Pagamento MP não aprovado. Status atual: "${mpData?.status ?? "desconhecido"}"`,
        mp_status: mpData?.status,
      },
      { status: 422 },
    );
  }

  const valorMp   = Number(mpData.transaction_amount ?? 0);
  const valorConta = Number(conta.valor);

  // Tolerância de R$0,10 para diferenças de centavo
  if (Math.abs(valorMp - valorConta) > 0.10) {
    return NextResponse.json(
      {
        error: `Valor do pagamento MP (${valorMp.toFixed(2)}) difere da conta (${valorConta.toFixed(2)})`,
        mp_valor: valorMp,
        conta_valor: valorConta,
      },
      { status: 422 },
    );
  }

  const obs = (body?.obs ?? "").trim() ||
    `Pagamento Mercado Pago confirmado — ID ${mpPaymentId}`;
  const vendaId = conta.venda_erp_id as number | null;

  // ── Registrar baixa em transação ─────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await sql.begin(async (tx: any) => {
    // 1. Marcar conta a receber como paga
    await tx`
      UPDATE alissonerp.contas_receber
      SET situacao = 'pago', data_recebimento = CURRENT_DATE, updated_at = NOW()
      WHERE id = ${contaId}
    `;

    // 2. Confirmar pagamento_venda A Receber se existir, grava o gateway_id MP
    if (vendaId) {
      await tx`
        UPDATE alissonerp.pagamentos_venda
        SET status = 'confirmado',
            data_confirmacao = NOW(),
            gateway_id = ${mpPaymentId},
            gateway = 'Mercado Pago'
        WHERE venda_id = ${vendaId}
          AND forma = 'A Receber'
          AND status = 'pendente'
      `;
    }

    // 3. Registrar comunicação com evidência MP
    await tx`
      INSERT INTO alissonerp.comunicacoes_crediario
        (conta_receber_id, tipo, mensagem, usuario_id)
      VALUES (
        ${contaId},
        'aviso_recebimento',
        ${obs},
        ${user.id}::uuid
      )
    `;
  });

  // ── Devolver saldo ao gerente se crédito foi usado ────────────────────────
  let saldoDevolvido = false;
  if (vendaId) {
    const [venda] = await sql`
      SELECT credito_gerente_usado FROM alissonerp.vendas_erp WHERE id = ${vendaId}
    `;
    const creditoUsado = parseFloat(venda?.credito_gerente_usado ?? "0");
    if (creditoUsado > 0) {
      const [pagamento] = await sql`
        SELECT id FROM alissonerp.pagamentos_venda
        WHERE venda_id = ${vendaId} AND gateway_id = ${mpPaymentId} LIMIT 1
      `;
      const pagamentoId = pagamento?.id ?? null;
      try {
        await creditarSaldo(Math.min(valorConta, creditoUsado), vendaId, pagamentoId, user.id);
        await sql`
          UPDATE alissonerp.vendas_erp
          SET credito_gerente_usado = GREATEST(credito_gerente_usado - ${Math.min(valorConta, creditoUsado)}, 0),
              updated_at = NOW()
          WHERE id = ${vendaId}
        `;
        saldoDevolvido = true;
      } catch (err) {
        console.error("[crediario/verificar-mp] Erro ao devolver saldo:", err);
      }
    }
  }

  // ── Concluir venda se todos os pagamentos confirmados ────────────────────
  let vendaConcluida = false;
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
        console.error("[crediario/verificar-mp] Erro ao concluir venda:", err);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    mp_status: mpData.status,
    mp_valor: valorMp,
    saldo_devolvido: saldoDevolvido,
    venda_concluida: vendaConcluida,
  });
}
