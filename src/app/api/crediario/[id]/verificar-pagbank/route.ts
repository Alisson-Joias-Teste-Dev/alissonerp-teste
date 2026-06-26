/**
 * POST /api/crediario/[id]/verificar-pagbank
 *
 * Verifica um pagamento PagBank para baixa no crediário (contas_receber).
 * Recebe { payment_id } (order_id ou charge_id do PagBank).
 * Consulta a API PagBank — só confirma a baixa se o pagamento estiver PAID.
 *
 * REGRA DE OURO #1: devolve saldo ao gerente se credito_gerente_usado > 0
 * REGRA DE OURO #2: baixa contas_receber + registra comunicação
 * REGRA DE OURO #3: preenche gateway="PagBank" no pagamento_venda
 *
 * [id] = conta_receber_id
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { buscarPedido, buscarCobranca, centavosParaReais } from "@/lib/pagbank";
import { devolverSaldoGerente } from "@/lib/baixa-credito";
import { internalError } from "@/lib/api-error";
import { zodError } from "@/lib/schemas/common";

const PODE_VERIFICAR = ["desenvolvedor", "admin", "gerente_loja", "diretor"];

const VerificarSchema = z.object({
  payment_id: z.string().min(1, "Informe o ID do pedido ou cobrança do PagBank").max(100),
  obs: z.string().max(5000).optional(),
});

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
  const parsed = VerificarSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;
  const pbPaymentId = body.payment_id.trim();

  // Guard duplicata: já existe este payment_id em pagamentos_venda?
  const [duplicata] = await sql`
    SELECT id FROM alissonerp.pagamentos_venda
    WHERE gateway_id = ${pbPaymentId} LIMIT 1
  `;
  if (duplicata) {
    return NextResponse.json(
      { error: "Este pagamento PagBank já está registrado em outra venda" },
      { status: 409 },
    );
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

  // Verificar pagamento no PagBank
  let pbStatus: string | null = null;
  let pbValorCentavos = 0;
  let pbTipo = "";

  try {
    if (pbPaymentId.startsWith("ORDE_")) {
      const order = await buscarPedido(pbPaymentId);
      const charge = order.charges?.[0];
      pbStatus = charge?.status ?? order.status ?? null;
      pbValorCentavos = charge?.amount?.value ?? 0;
      pbTipo = charge?.payment_method?.type ?? "";
    } else {
      const charge = await buscarCobranca(pbPaymentId);
      pbStatus = charge.status ?? null;
      pbValorCentavos = charge.amount?.value ?? 0;
      pbTipo = charge.payment_method?.type ?? "";
    }
  } catch (err) {
    return internalError(
      "[POST /api/crediario/[id]/verificar-pagbank] buscarPagamento",
      err,
      "Erro ao consultar PagBank",
      502,
    );
  }

  if (!pbStatus || pbStatus !== "PAID") {
    return NextResponse.json(
      {
        error: `Pagamento PagBank não aprovado. Status atual: "${pbStatus ?? "desconhecido"}"`,
        pb_status: pbStatus,
      },
      { status: 422 },
    );
  }

  const valorPbReais = centavosParaReais(pbValorCentavos);
  const valorConta = Number(conta.valor);

  // Tolerância de R$0,10 para diferenças de centavo
  if (Math.abs(valorPbReais - valorConta) > 0.10) {
    return NextResponse.json(
      {
        error: `Valor do pagamento PagBank (R$ ${valorPbReais.toFixed(2)}) difere da conta (R$ ${valorConta.toFixed(2)})`,
        pb_valor: valorPbReais,
        conta_valor: valorConta,
      },
      { status: 422 },
    );
  }

  const obs =
    (body?.obs ?? "").trim() ||
    `Pagamento PagBank confirmado — ID ${pbPaymentId} (${pbTipo || "desconhecido"})`;
  const vendaId = conta.venda_erp_id as number | null;

  // Registrar baixa em transação
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await sql.begin(async (tx: any) => {
    // 1. Marcar conta a receber como paga
    await tx`
      UPDATE alissonerp.contas_receber
      SET situacao = 'pago', data_recebimento = CURRENT_DATE, updated_at = NOW()
      WHERE id = ${contaId}
    `;

    // 2. Confirmar pagamento_venda A Receber se existir
    if (vendaId) {
      await tx`
        UPDATE alissonerp.pagamentos_venda
        SET status = 'confirmado',
            data_confirmacao = NOW(),
            gateway_id = ${pbPaymentId},
            gateway = 'PagBank'
        WHERE venda_id = ${vendaId}
          AND forma = 'A Receber'
          AND status = 'pendente'
      `;
    }

    // 3. Registrar comunicação
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

  // Devolver saldo ao gerente se crédito foi usado
  let saldoDevolvido = false;
  if (vendaId) {
    const [venda] = await sql`
      SELECT credito_gerente_usado FROM alissonerp.vendas_erp WHERE id = ${vendaId}
    `;
    const creditoUsado = parseFloat(venda?.credito_gerente_usado ?? "0");
    if (creditoUsado > 0) {
      const [pagamento] = await sql`
        SELECT id FROM alissonerp.pagamentos_venda
        WHERE venda_id = ${vendaId} AND gateway_id = ${pbPaymentId} LIMIT 1
      `;
      const pagamentoId = pagamento?.id ?? null;
      try {
        const result = await devolverSaldoGerente(
          sql,
          vendaId,
          Math.min(valorConta, creditoUsado),
          pagamentoId,
          user.id,
        );
        saldoDevolvido = result.devolvido;
      } catch (err) {
        console.error("[crediario/verificar-pagbank] Erro ao devolver saldo:", err);
      }
    }
  }

  // Fluxo novo 06/2026: pagamento quitado NÃO conclui mais a venda —
  // o status só muda na entrega (em_rota → entregue).
  return NextResponse.json({
    ok: true,
    pb_status: pbStatus,
    pb_valor: valorPbReais,
    pb_tipo: pbTipo,
    saldo_devolvido: saldoDevolvido,
  });
}
