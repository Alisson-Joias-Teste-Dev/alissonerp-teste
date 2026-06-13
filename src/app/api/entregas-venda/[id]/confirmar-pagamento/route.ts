import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";
import { fetchPayment } from "@/lib/mercado-pago";
import { buscarPedido, buscarCobranca, centavosParaReais } from "@/lib/pagbank";
import { logAudit } from "@/lib/audit";
import { internalError } from "@/lib/api-error";
import { zodError } from "@/lib/schemas/common";

/**
 * POST /api/entregas-venda/[id]/confirmar-pagamento
 *
 * ETAPA 1 (Pagamento na entrega pelo motoboy — decisão Jonathan 13/06).
 *
 * O QUE: o motoboy, no endereço do cliente, confirma o pagamento "Na Entrega"
 *   ANTES de poder confirmar a entrega (Código A). Formas:
 *     • Dinheiro / Ouro  → fica 'aguard_conferencia' (motoboy se responsabiliza;
 *       só entra no caixa/ouro quando o financeiro confere na Etapa 2). NÃO cria
 *       conta a receber ainda (gatilho de CR e de rastreio de ouro só disparam em
 *       status='confirmado').
 *     • Mercado Pago / PagBank → o motoboy digita o ID; o sistema VERIFICA NA API
 *       (reusa fetchPayment / buscarPedido-buscarCobranca). Aprovado → 'confirmado'
 *       (entra no financeiro como qualquer pagamento de gateway).
 *
 * POR QUE: o dinheiro do motoboy não pode entrar direto no caixa (precisa de
 *   conferência), mas o pagamento de gateway já está garantido na API. E a trava
 *   "não entrega sem pagar" (no Código A) só libera quando não há mais 'Na Entrega'
 *   pendente — então confirmar o pagamento aqui é o que destrava a entrega.
 *
 * IMPACTO SE REMOVIDO: motoboy fica travado no Código A sem como registrar o
 *   pagamento na rua; ou o dinheiro do motoboy entra no caixa sem conferência.
 *
 * PENDÊNCIA CONHECIDA (decisão Jonathan 13/06 — ADIADA, não é bug):
 *   A entrega ocorre com o pagamento ainda em 'aguard_conferencia'. O gatilho
 *   fn_venda_gerar_conta_receber (na entrega) só conta 'confirmado' como pago,
 *   então cria uma conta a receber pelo valor — e a conferência do caixa não baixa
 *   essa conta. Resultado: o valor pode aparecer no caixa E em "a receber" (duplo
 *   registro). NÃO corrigido de propósito: contas a receber não está em uso e será
 *   revisto junto com o financeiro. Correção planejada (Opção A): incluir
 *   'aguard_conferencia' no cálculo de "pago" do gatilho de entrega. Comissão e Caixa
 *   NÃO são afetados — ambos contam só 'confirmado', ignorando corretamente o
 *   'aguard_conferencia' até a conferência.
 */

const Schema = z.object({
  forma: z.enum(["Dinheiro", "Ouro", "Mercado Pago", "PagBank"]),
  payment_id: z.string().trim().min(1).max(120).optional(),
  ouro_gramas: z.coerce.number().positive().optional(),
  ouro_valor_grama: z.coerce.number().positive().optional(),
}).passthrough();

// Quem pode confirmar o pagamento na entrega: motoboy/entregador na rua + loja.
const PODE = ["desenvolvedor", "admin", "gerente_loja", "gerente_fabrica", "diretor", "consultora", "entregador", "motoboy"];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  if (!usuario || (!PODE.includes(usuario.role) && !isFullAccess(usuario.role))) {
    return NextResponse.json({ error: "Sem permissão para confirmar pagamento na entrega" }, { status: 403 });
  }

  const { id } = await params;
  const entregaId = Number(id);
  if (isNaN(entregaId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const raw = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;

  // Entrega → venda
  const [entrega] = await sql`SELECT id, venda_id FROM alissonerp.entregas_venda WHERE id = ${entregaId} LIMIT 1`;
  if (!entrega) return NextResponse.json({ error: "Entrega não encontrada" }, { status: 404 });
  const vendaId = Number(entrega.venda_id);

  // Pré-checagem (UX rápida): a venda tem "Na Entrega" pendente?
  // A leitura AUTORITATIVA é refeita DENTRO da transação com FOR UPDATE (abaixo),
  // pra não haver janela entre ler e gravar (TOCTOU). Bug pego no code-review 13/06.
  const preCheck = await sql`
    SELECT 1 FROM alissonerp.pagamentos_venda
    WHERE venda_id = ${vendaId} AND forma = 'Na Entrega' AND status = 'pendente' LIMIT 1
  `;
  if (preCheck.length === 0) {
    return NextResponse.json({ error: "Esta venda não tem pagamento na entrega pendente." }, { status: 409 });
  }

  try {
    // ── DINHEIRO / OURO: aguardando conferência do caixa ────────────────────
    if (body.forma === "Dinheiro" || body.forma === "Ouro") {
      const ehOuro = body.forma === "Ouro";
      if (ehOuro && (!body.ouro_gramas || !body.ouro_valor_grama)) {
        return NextResponse.json({ error: "Informe os gramas e o valor por grama do ouro." }, { status: 400 });
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- sql.begin: pitfall de tipo do postgres.js (ver CLAUDE.md §3)
      const resultado = await (sql as any).begin(async (tx: any) => {
        // Trava as linhas pendentes DENTRO da tx (autoritativo)
        const pendentes = await tx`
          SELECT id, valor FROM alissonerp.pagamentos_venda
          WHERE venda_id = ${vendaId} AND forma = 'Na Entrega' AND status = 'pendente'
          FOR UPDATE
        `;
        if (pendentes.length === 0) return { erro: "Esta venda não tem pagamento na entrega pendente.", status: 409 };
        const totalPendente = pendentes.reduce((s: number, p: Record<string, unknown>) => s + Number(p.valor ?? 0), 0);
        const ids = pendentes.map((p: Record<string, unknown>) => Number(p.id));
        await tx`
          UPDATE alissonerp.pagamentos_venda
          SET forma = ${body.forma},
              status = 'aguard_conferencia',
              source = ${ehOuro ? "ouro" : "dinheiro"},
              data_confirmacao = now(),
              ouro_gramas = ${ehOuro ? body.ouro_gramas! : null},
              ouro_peso = ${ehOuro ? body.ouro_gramas! : null},
              ouro_valor_grama = ${ehOuro ? body.ouro_valor_grama! : null}
          WHERE id = ANY(${ids}::int[])
        `;
        await logAudit(tx, {
          tabela: "pagamentos_venda", operacao: "UPDATE", registro_id: vendaId, usuario_id: user.id,
          dados_antes: { forma: "Na Entrega", status: "pendente" },
          dados_depois: { forma: body.forma, status: "aguard_conferencia", contexto: "pagamento_motoboy", valor: totalPendente },
        });
        return { ok: true, forma: body.forma, status: "aguard_conferencia", valor: totalPendente };
      });
      if (resultado?.erro) return NextResponse.json({ error: resultado.erro }, { status: resultado.status ?? 500 });
      return NextResponse.json(resultado);
    }

    // ── MERCADO PAGO / PAGBANK: verifica na API, confirma direto ────────────
    if (!body.payment_id) {
      return NextResponse.json({ error: "Informe o ID do pagamento." }, { status: 400 });
    }
    const paymentId = body.payment_id;

    // Pré-checagem de duplicidade (a autoritativa é refeita dentro da tx).
    const [dupPre] = await sql`SELECT id FROM alissonerp.pagamentos_venda WHERE gateway_id = ${paymentId} LIMIT 1`;
    if (dupPre) return NextResponse.json({ error: "Este pagamento já está registrado no sistema." }, { status: 409 });

    let aprovado = false;
    let valorPago = 0;
    let formaErp = "Pix";
    let gatewayNome = "";
    let payload: Record<string, unknown> = {};

    if (body.forma === "Mercado Pago") {
      let mp: Awaited<ReturnType<typeof fetchPayment>>;
      try { mp = await fetchPayment(paymentId); }
      catch (e) { return internalError("[confirmar-pagamento] fetchPayment", e, "Erro ao consultar Mercado Pago", 502); }
      aprovado = mp?.status === "approved";
      if (!aprovado) {
        return NextResponse.json({ error: `Pagamento não aprovado no Mercado Pago (status: ${mp?.status ?? "desconhecido"}).` }, { status: 422 });
      }
      const m = mp as { transaction_amount?: number; payment_type_id?: string; payment_method_id?: string };
      valorPago = Number(m.transaction_amount ?? 0);
      const ptype = String(m.payment_type_id ?? "").toLowerCase();
      formaErp = ptype === "credit_card" || ptype === "debit_card" ? "Cartão de Crédito" : "Pix";
      gatewayNome = "Mercado Pago Manual";
      payload = { mp_id: paymentId, mp_status: mp?.status, mp_valor: valorPago, mp_payment_type: ptype, via: "motoboy" };
    } else {
      // PagBank
      let pbStatus: string | null = null, pbCentavos = 0, pbTipo = "";
      try {
        if (paymentId.startsWith("ORDE_")) {
          const order = await buscarPedido(paymentId);
          const charge = order.charges?.[0];
          pbStatus = charge?.status ?? order.status ?? null;
          pbCentavos = charge?.amount?.value ?? 0;
          pbTipo = charge?.payment_method?.type ?? "";
        } else {
          const charge = await buscarCobranca(paymentId);
          pbStatus = charge.status ?? null;
          pbCentavos = charge.amount?.value ?? 0;
          pbTipo = charge.payment_method?.type ?? "";
        }
      } catch (e) { return internalError("[confirmar-pagamento] PagBank", e, "Erro ao consultar PagBank", 502); }
      aprovado = pbStatus === "PAID";
      if (!aprovado) {
        return NextResponse.json({ error: `Pagamento PagBank não aprovado (status: ${pbStatus ?? "desconhecido"}).` }, { status: 422 });
      }
      valorPago = centavosParaReais(pbCentavos);
      formaErp = pbTipo.toUpperCase().includes("CREDIT") || pbTipo.toUpperCase().includes("DEBIT") ? "Cartão de Crédito" : "Pix";
      gatewayNome = "PagBank Manual";
      payload = { pb_id: paymentId, pb_status: pbStatus, pb_valor: valorPago, pb_tipo: pbTipo, via: "motoboy" };
    }

    const sourceErp = body.forma === "Mercado Pago" ? "manual_mp" : "manual_pagbank";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- sql.begin: pitfall de tipo do postgres.js (ver CLAUDE.md §3)
    const resultado = await (sql as any).begin(async (tx: any) => {
      // Trava + lê os pendentes DENTRO da tx (autoritativo)
      const pendentes = await tx`
        SELECT id, valor FROM alissonerp.pagamentos_venda
        WHERE venda_id = ${vendaId} AND forma = 'Na Entrega' AND status = 'pendente'
        FOR UPDATE
      `;
      if (pendentes.length === 0) return { erro: "Esta venda não tem pagamento na entrega pendente.", status: 409 };
      const totalPendente = pendentes.reduce((s: number, p: Record<string, unknown>) => s + Number(p.valor ?? 0), 0);
      const ids = pendentes.map((p: Record<string, unknown>) => Number(p.id));

      // Valor da API precisa cobrir o que falta (tolerância de 1 centavo)
      if (valorPago + 0.01 < totalPendente) {
        return { erro: `O pagamento (R$${valorPago.toFixed(2)}) é menor que o valor na entrega (R$${totalPendente.toFixed(2)}).`, status: 422 };
      }

      // Duplicidade autoritativa (gateway_id tem índice UNIQUE global)
      const [dup] = await tx`SELECT id FROM alissonerp.pagamentos_venda WHERE gateway_id = ${paymentId} LIMIT 1`;
      if (dup) return { erro: "Este pagamento já está registrado no sistema.", status: 409 };

      // gateway_id é UNIQUE global → não pode repetir em várias linhas. Quando há
      // 2+ saldos "Na Entrega", o ID do gateway fica só na 1ª linha; as demais
      // entram como 'confirmado' do mesmo pagamento, sem gateway_id (senão viola o
      // índice uq_pagamentos_gateway_id → 500). Bug pego no code-review 13/06.
      const [primeiroId, ...demaisIds] = ids;
      await tx`
        UPDATE alissonerp.pagamentos_venda
        SET forma = ${formaErp},
            gateway = ${gatewayNome},
            gateway_id = ${paymentId},
            gateway_payload = ${JSON.stringify(payload)}::jsonb,
            status = 'confirmado',
            source = ${sourceErp},
            data_confirmacao = now()
        WHERE id = ${primeiroId}
      `;
      if (demaisIds.length > 0) {
        await tx`
          UPDATE alissonerp.pagamentos_venda
          SET forma = ${formaErp},
              gateway = ${gatewayNome},
              gateway_payload = ${JSON.stringify({ ...payload, parcela_de: primeiroId })}::jsonb,
              status = 'confirmado',
              source = ${sourceErp},
              data_confirmacao = now()
          WHERE id = ANY(${demaisIds}::int[])
        `;
      }
      await logAudit(tx, {
        tabela: "pagamentos_venda", operacao: "UPDATE", registro_id: vendaId, usuario_id: user.id,
        dados_antes: { forma: "Na Entrega", status: "pendente" },
        dados_depois: { forma: formaErp, status: "confirmado", gateway: gatewayNome, gateway_id: paymentId, contexto: "pagamento_motoboy" },
      });
      return { ok: true, forma: formaErp, status: "confirmado", gateway: gatewayNome, valor: valorPago };
    });

    if (resultado?.erro) return NextResponse.json({ error: resultado.erro }, { status: resultado.status ?? 500 });
    return NextResponse.json(resultado);
  } catch (e) {
    return internalError(`[POST /api/entregas-venda/${entregaId}/confirmar-pagamento]`, e, "Erro ao confirmar pagamento na entrega.");
  }
}
