import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { fetchPayment } from "@/lib/mercado-pago";
import { creditarSaldo } from "@/lib/saldo-credito";
import { internalError } from "@/lib/api-error";
import { zodError } from "@/lib/schemas/common";
import { requireCrediarioOwnership, NotFoundError } from "@/lib/auth-vendas";
import { ForbiddenError } from "@/lib/auth-server";

// consultora entra, mas SÓ na conta de venda dela (ownership abaixo).
const PODE_VERIFICAR = ["desenvolvedor", "admin", "gerente_loja", "diretor", "consultora"];

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

  // consultora só confirma pagamento de conta de uma venda DELA.
  try {
    await requireCrediarioOwnership(
      { id: user.id, role: usuario.role as string, email: user.email ?? "" },
      contaId,
    );
  } catch (e) {
    if (e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
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

  // O valor da baixa é o que o Mercado Pago REALMENTE aprovou (dinheiro real),
  // nunca o que o front diz. Regras (tolerância de R$0,10 p/ centavos):
  //  - MP > conta  → recusa (não baixa a mais; evitaria furar a trava de soma).
  //  - MP = conta  → baixa total.
  //  - MP < conta  → baixa PARCIAL: baixa o pago e abre nova conta com o restante
  //                  (mesma lógica do registrar-pagamento, já testada).
  if (valorMp > valorConta + 0.10) {
    return NextResponse.json(
      {
        error: `Pagamento MP (R$ ${valorMp.toFixed(2)}) é maior que a conta (R$ ${valorConta.toFixed(2)}). Confira se é a conta certa.`,
        mp_valor: valorMp,
        conta_valor: valorConta,
      },
      { status: 422 },
    );
  }

  const ehParcial = valorConta - valorMp > 0.10;
  const valorRestante = ehParcial ? Math.round((valorConta - valorMp) * 100) / 100 : 0;

  const obs = (body?.obs ?? "").trim() ||
    (ehParcial
      ? `Pagamento PARCIAL Mercado Pago — R$ ${valorMp.toFixed(2)} de R$ ${valorConta.toFixed(2)} (ID ${mpPaymentId}). Restante: R$ ${valorRestante.toFixed(2)}`
      : `Pagamento Mercado Pago confirmado — ID ${mpPaymentId}`);
  const vendaId = conta.venda_erp_id as number | null;

  // Pagamento "A Receber" pendente da venda — alvo do split parcial.
  const [pagamentoAReceber] = vendaId
    ? await sql`
        SELECT id FROM alissonerp.pagamentos_venda
        WHERE venda_id = ${vendaId} AND forma = 'A Receber' AND status = 'pendente'
        LIMIT 1
      `
    : [null];

  let novoCreditoId: number | null = null;

  // ── Registrar baixa em transação ─────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await sql.begin(async (tx: any) => {
    // 1. Baixar a conta. No total, mantém o valor original (comportamento
    //    de antes); no parcial, ajusta para o que foi pago no MP.
    const valorBaixaConta = ehParcial ? valorMp : valorConta;
    await tx`
      UPDATE alissonerp.contas_receber
      SET valor = ${valorBaixaConta}, situacao = 'pago', data_recebimento = CURRENT_DATE, updated_at = NOW()
      WHERE id = ${contaId}
    `;

    // 1b. SPLIT DE CRÉDITO (pagamento parcial) — nova conta_receber com o
    //     restante. Espelha o registrar-pagamento (PASSO 1b).
    if (ehParcial) {
      const [nova] = await tx`
        INSERT INTO alissonerp.contas_receber
          (descricao, cliente_id, cliente_nome, venda_erp_id, valor,
           data_vencimento, situacao, categoria, obs, created_by)
        SELECT
          ${`Saldo restante — ${conta.descricao}`},
          cr.cliente_id, cr.cliente_nome, cr.venda_erp_id,
          ${valorRestante}, CURRENT_DATE, 'pendente', 'venda',
          ${`Parcial de R$ ${valorMp.toFixed(2)} via Mercado Pago (ID ${mpPaymentId}). Restante: R$ ${valorRestante.toFixed(2)}`},
          ${user.id}::uuid
        FROM alissonerp.contas_receber cr WHERE cr.id = ${contaId}
        RETURNING id
      `;
      novoCreditoId = nova?.id ?? null;
    }

    // 2. pagamento_venda "A Receber": confirma (total) ou faz split (parcial).
    //    A soma dos pagamentos da venda continua = total (trava mig 333 ok).
    if (pagamentoAReceber) {
      if (!ehParcial) {
        await tx`
          UPDATE alissonerp.pagamentos_venda
          SET status = 'confirmado', data_confirmacao = NOW(),
              gateway_id = ${mpPaymentId}, gateway = 'Mercado Pago'
          WHERE id = ${pagamentoAReceber.id}
        `;
      } else {
        await tx`
          UPDATE alissonerp.pagamentos_venda
          SET valor = ${valorMp}, status = 'confirmado', data_confirmacao = NOW(),
              gateway_id = ${mpPaymentId}, gateway = 'Mercado Pago'
          WHERE id = ${pagamentoAReceber.id}
        `;
        await tx`
          INSERT INTO alissonerp.pagamentos_venda (venda_id, forma, valor, parcelas, status)
          VALUES (${vendaId}, 'A Receber', ${valorRestante}, 1, 'pendente')
        `;
      }
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
      // Devolve proporcional ao que foi REALMENTE pago (valorMp), não ao total
      // da conta — no parcial só volta o crédito do que entrou.
      const valorDevolver = Math.min(valorMp, creditoUsado);
      try {
        await creditarSaldo(valorDevolver, vendaId, pagamentoId, user.id);
        await sql`
          UPDATE alissonerp.vendas_erp
          SET credito_gerente_usado = GREATEST(credito_gerente_usado - ${valorDevolver}, 0),
              updated_at = NOW()
          WHERE id = ${vendaId}
        `;
        saldoDevolvido = true;
      } catch (err) {
        console.error("[crediario/verificar-mp] Erro ao devolver saldo:", err);
      }
    }
  }

  // Fluxo novo 06/2026: pagamento quitado NÃO conclui mais a venda —
  // o status só muda na entrega (em_rota → entregue).
  return NextResponse.json({
    ok: true,
    mp_status: mpData.status,
    mp_valor: valorMp,
    saldo_devolvido: saldoDevolvido,
    pagamento_parcial: ehParcial || undefined,
    valor_pago: valorMp,
    valor_restante: ehParcial ? valorRestante : undefined,
    novo_credito_id: novoCreditoId ?? undefined,
  });
}
