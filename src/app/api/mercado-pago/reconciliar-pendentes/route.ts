import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { getAccessToken } from "@/lib/mercado-pago";

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/mercado-pago/reconciliar-pendentes
//
// Busca todos pagamentos MP com status='pendente' no banco e consulta o MP
// via external_reference. Se o MP retornar algum payment 'approved', confirma
// o pagamento no ERP. Fluxo novo 06/2026: pagamento quitado NÃO conclui
// mais a venda (status só muda na entrega).
//
// Uso: quando webhooks foram perdidos (HMAC quebrado, deploy atrasado, etc).
// Apenas desenvolvedor/admin.
// ═══════════════════════════════════════════════════════════════════════════

export async function POST() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario || !["desenvolvedor", "admin"].includes(usuario.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const pendentes = await sql`
    SELECT id, venda_id, valor, gateway
    FROM alissonerp.pagamentos_venda
    WHERE status = 'pendente'
      AND gateway LIKE 'Mercado Pago%'
      AND created_at > NOW() - INTERVAL '30 days'
    ORDER BY id DESC
  `;

  const token = await getAccessToken();
  const resultados: Array<{
    pagamento_id: number;
    venda_id: number;
    acao: string;
    payment_id?: string;
    erro?: string;
  }> = [];

  for (const pag of pendentes) {
    const externalRef = `venda:${pag.venda_id}:pag:${pag.id}`;
    try {
      const r = await fetch(
        `https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(externalRef)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!r.ok) {
        resultados.push({ pagamento_id: pag.id, venda_id: pag.venda_id, acao: "erro_search", erro: `MP ${r.status}` });
        continue;
      }
      const data = await r.json() as { results?: Array<{ id?: number|string; status?: string; transaction_amount?: number; transaction_details?: { net_received_amount?: number|string } }> };
      const results = data.results ?? [];
      const approved = results.find(p => p.status === "approved");
      if (!approved) {
        resultados.push({ pagamento_id: pag.id, venda_id: pag.venda_id, acao: "nao_aprovado_no_mp" });
        continue;
      }

      const paymentId = String(approved.id);
      const txAmount = Number(approved.transaction_amount ?? pag.valor);
      const netReceived = approved.transaction_details?.net_received_amount != null
        ? Number(approved.transaction_details.net_received_amount)
        : txAmount;
      const taxas = Math.max(0, Number((txAmount - netReceived).toFixed(2)));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (sql as any).begin(async (tx: typeof sql) => {
        await tx`
          UPDATE alissonerp.pagamentos_venda
          SET status = 'confirmado',
              source = 'webhook_mp',
              data_confirmacao = NOW(),
              gateway_id = ${paymentId},
              valor_liquido = ${netReceived},
              taxas_mp = ${taxas},
              gateway_payload = COALESCE(gateway_payload, '{}'::jsonb) || ${JSON.stringify({
                reconciliado_em: new Date().toISOString(),
                reconciliado_por: user.id,
                payment_id: paymentId,
                status_mp: "approved",
              })}::text::jsonb
          WHERE id = ${pag.id}
        `;
        const [{ soma_confirmados, total_venda }] = await tx`
          SELECT
            COALESCE((SELECT SUM(valor) FROM alissonerp.pagamentos_venda WHERE venda_id = ${pag.venda_id} AND status = 'confirmado'), 0)::numeric AS soma_confirmados,
            (SELECT total_venda FROM alissonerp.vendas_erp WHERE id = ${pag.venda_id})::numeric AS total_venda
        `;
        return { quitada: Number(soma_confirmados) + 0.01 >= Number(total_venda) };
      });

      // Fluxo novo 06/2026: pagamento quitado NÃO conclui mais a venda.
      const acao = result.quitada ? "pagamento_quitado" : "pagamento_confirmado";

      resultados.push({ pagamento_id: pag.id, venda_id: pag.venda_id, acao, payment_id: paymentId });
    } catch (err) {
      console.error(`[reconciliar-pendentes] excecao pag=${pag.id} venda=${pag.venda_id}`, err);
      resultados.push({ pagamento_id: pag.id, venda_id: pag.venda_id, acao: "excecao" });
    }
  }

  return NextResponse.json({
    ok: true,
    total_verificados: pendentes.length,
    resultados,
  });
}
