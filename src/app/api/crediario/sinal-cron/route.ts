import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";
import { criarNotificacao } from "@/lib/notificacoes";
import { gerarValeCredito } from "@/lib/vale-troca";

/**
 * POST /api/crediario/sinal-cron
 *
 * Robô diário do SINAL (crediário Fase 3). Para cada sinal VENCIDO e não pago:
 *   1. o que o cliente já pagou vira vale VC- (gerarValeCredito);
 *   2. a conta a receber do sinal é cancelada;
 *   3. notifica o ESTOQUE (peça precisa voltar) + a consultora da venda.
 *
 * REGRA I2: a peça NÃO volta ao saldo automaticamente — fica reservada até o
 * estoque confirmar a devolução física (passo futuro). Por isso o robô NÃO
 * cancela a venda aqui (cancelar dispararia a devolução automática do estoque).
 *
 * Auth: header x-cron-secret OU admin/gerente autenticado (igual aging-cron).
 */
const CRON_SECRET_ENV = "CREDIARIO_CRON_SECRET";

export async function POST(req: NextRequest) {
  const cronSecret = req.headers.get("x-cron-secret");
  const expectedSecret = process.env[CRON_SECRET_ENV] ?? null;

  let autenticado = false;
  if (cronSecret && expectedSecret && cronSecret === expectedSecret) {
    autenticado = true;
  } else {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const [u] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
      if (u && (isFullAccess(u.role as string) || u.role === "gerente_loja")) autenticado = true;
    }
  }
  if (!autenticado) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  // Sinais vencidos: conta a receber pendente e vencida, de venda ainda 'aprovado'
  // (não entregue/cancelada), cujo pagamento "A Receber" é do tipo 'sinal'.
  const vencidos = await sql`
    SELECT cr.id AS cr_id, cr.valor, cr.cliente_id, cr.cliente_nome,
           v.id AS venda_id, v.numero_venda, v.created_by,
           COALESCE((SELECT SUM(p.valor) FROM alissonerp.pagamentos_venda p
                     WHERE p.venda_id = v.id AND p.status = 'confirmado'), 0) AS valor_pago
    FROM alissonerp.contas_receber cr
    JOIN alissonerp.vendas_erp v ON v.id = cr.venda_erp_id
    WHERE cr.categoria = 'venda' AND cr.status = 'pendente'
      AND cr.data_vencimento < CURRENT_DATE
      AND v.status = 'aprovado'
      AND EXISTS (SELECT 1 FROM alissonerp.pagamentos_venda p
                  WHERE p.venda_id = v.id AND p.forma = 'A Receber' AND p.credi_tipo = 'sinal')
  `;

  const estoque = await sql`
    SELECT id FROM alissonerp.usuarios
    WHERE role IN ('gerente_fabrica','gerente_loja','admin','desenvolvedor','pcp') AND id IS NOT NULL
  `;

  let processados = 0;
  const resultados: { venda: string; vale: string | null; valor_pago: number }[] = [];

  for (const s of vencidos) {
    const valorPago = parseFloat(s.valor_pago ?? "0");
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const out = await (sql as any).begin(async (tx: typeof sql) => {
        let valeNumero: string | null = null;
        if (valorPago > 0) {
          const vale = await gerarValeCredito(s.cliente_id, valorPago, s.created_by, s.venda_id, tx);
          valeNumero = vale.numero;
        }
        await tx`UPDATE alissonerp.contas_receber SET status='cancelado', updated_at=NOW() WHERE id=${s.cr_id}`;
        await tx`
          INSERT INTO alissonerp.comunicacoes_crediario (conta_receber_id, tipo, mensagem, usuario_id)
          VALUES (${s.cr_id}, 'observacao',
            ${`Sinal vencido sem pagamento. ${valeNumero ? `Gerado vale ${valeNumero} de R$ ${valorPago.toFixed(2)}.` : "Sem valor pago."} Peça precisa voltar ao estoque.`},
            ${s.created_by}::uuid)
        `;
        return { valeNumero };
      });

      for (const u of estoque) {
        await criarNotificacao({
          usuarioId: u.id,
          tipo: "aviso",
          titulo: "Sinal vencido — peça voltar ao estoque",
          mensagem: `Venda ${s.numero_venda}: sinal vencido.${out.valeNumero ? ` Cliente ficou com vale ${out.valeNumero}.` : ""} Recoloque a peça no estoque.`,
          link: "/crediario",
        }).catch(() => {});
      }
      if (s.created_by) {
        await criarNotificacao({
          usuarioId: s.created_by,
          tipo: "aviso",
          titulo: "Sinal virou crédito",
          mensagem: `Venda ${s.numero_venda}: cliente não pagou o sinal no prazo.${out.valeNumero ? ` Gerado vale ${out.valeNumero}.` : ""}`,
          link: "/crediario",
        }).catch(() => {});
      }

      processados++;
      resultados.push({ venda: s.numero_venda, vale: out.valeNumero, valor_pago: valorPago });
    } catch (err) {
      console.error("[sinal-cron] erro venda", s.venda_id, err);
    }
  }

  return NextResponse.json({ ok: true, sinais_vencidos: vencidos.length, processados, resultados });
}
