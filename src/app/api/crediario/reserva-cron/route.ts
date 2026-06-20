import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";
import { criarNotificacao } from "@/lib/notificacoes";
import { gerarValeCredito } from "@/lib/vale-troca";

/**
 * POST /api/crediario/reserva-cron
 *
 * Robô diário da RESERVA (crediário ③ — regra nova, aprovada 20/06).
 * Substitui o motor antigo do "sinal" para vendas NOVAS (criadas após o corte).
 *
 * REGRA (ver docs/regras-negocio/crediario.md §③):
 *  - Vale só para vendas criadas A PARTIR do corte (configuracoes_sistema
 *    'crediario_reserva_corte') — vendas antigas seguem o sinal-cron (legado).
 *  - Decisão VC × cobrança = SE A PEÇA SAIU DA LOJA:
 *      • peça ENTREGUE devendo → cobrança (aging-cron), NUNCA cai aqui.
 *      • peça NÃO entregue (venda 'aprovado', reservada) + tem "A Receber" pendente
 *        → este robô cuida do prazo.
 *  - O relógio dos 7 dias CORRIDOS começa quando a DATA DE ENTREGA já passou E
 *    NÃO há ordem (produção) aberta — conta a partir do FECHAMENTO da ordem
 *    (início = max(data_entrega, última conclusão de ordem de produção)).
 *  - Avisos à consultora: no início ("tem 7 dias"), todo dia nos últimos 3, e
 *    "amanhã vira VC" no último dia. (1 aviso por venda por dia — dedup via notificacoes.)
 *  - Estouro (passou 7 dias sem quitar 100%): o que foi pago vira VC- (proporcional),
 *    cancela as contas a receber pendentes da venda, notifica o estoque (peça volta).
 *    Igual ao sinal: a peça NÃO volta ao saldo sozinha — espera confirmação física.
 *
 * IMPACTO SE ALTERADO: mexe em conversão financeira (geração de VC) — testar sempre
 * em homolog com ROLLBACK antes. Zona sensível.
 *
 * Auth: header x-cron-secret OU admin/gerente autenticado (igual sinal-cron/aging-cron).
 */
const CRON_SECRET_ENV = "CREDIARIO_CRON_SECRET";
const PRAZO_DIAS = 7; // dias CORRIDOS (decisão Jonathan 20/06)
// Tipos de ordem que NÃO travam a entrega (não contam como "produção pendente").
const TIPOS_ORDEM_NAO_BLOQUEIA = ["servico", "garantia", "compra_fornecedor", "servico_interno", "servico_venda", "servico_loja"];
// Tipos de ordem de PRODUÇÃO (cuja conclusão inicia o relógio).
const TIPOS_ORDEM_PRODUCAO = ["fabricacao", "reposicao_venda", "reposicao_loja", "conversao", "conversao_sku"];

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

  // Sem corte configurado = não processa nada (segurança: não converter venda antiga).
  const [corte] = await sql`SELECT valor FROM alissonerp.configuracoes_sistema WHERE chave = 'crediario_reserva_corte' LIMIT 1`;
  if (!corte?.valor) return NextResponse.json({ ok: true, skipped: "sem corte configurado" });

  // Vendas RESERVADAS (não entregues) com "A Receber" pendente, criadas após o corte,
  // com a data de entrega já passada e SEM ordem de produção aberta. inicio = quando o
  // relógio começou; dias_passados = quantos dias corridos já se passaram.
  const reservas = await sql`
    SELECT
      v.id            AS venda_id,
      v.numero_venda  AS numero_venda,
      v.created_by    AS created_by,
      v.cliente_id    AS cliente_id,
      GREATEST(
        v.data_entrega::date,
        COALESCE((
          SELECT MAX(o.data_conclusao)::date FROM alissonerp.ordens o
          WHERE o.venda_id = v.id AND o.tipo_ordem::text = ANY(${TIPOS_ORDEM_PRODUCAO})
        ), v.data_entrega::date)
      ) AS inicio,
      (CURRENT_DATE - GREATEST(
        v.data_entrega::date,
        COALESCE((
          SELECT MAX(o.data_conclusao)::date FROM alissonerp.ordens o
          WHERE o.venda_id = v.id AND o.tipo_ordem::text = ANY(${TIPOS_ORDEM_PRODUCAO})
        ), v.data_entrega::date)
      )) AS dias_passados,
      COALESCE((SELECT SUM(cr.valor) FROM alissonerp.contas_receber cr
                WHERE cr.venda_erp_id = v.id AND cr.categoria = 'venda' AND cr.situacao = 'pendente'), 0) AS saldo,
      COALESCE((SELECT SUM(p.valor) FROM alissonerp.pagamentos_venda p
                WHERE p.venda_id = v.id AND p.status = 'confirmado'), 0) AS valor_pago,
      EXISTS (SELECT 1 FROM alissonerp.notificacoes n
              WHERE n.venda_id = v.id AND n.tipo = 'crediario_reserva') AS ja_avisou_antes,
      EXISTS (SELECT 1 FROM alissonerp.notificacoes n
              WHERE n.venda_id = v.id AND n.tipo = 'crediario_reserva' AND n.created_at::date = CURRENT_DATE) AS avisou_hoje
    FROM alissonerp.vendas_erp v
    WHERE v.created_at::date >= ${corte.valor}::date
      AND v.situacao = 'aprovado'
      AND v.data_entrega IS NOT NULL
      AND v.data_entrega::date < CURRENT_DATE
      -- tem "A Receber" pendente (e NÃO é sinal legado — esses ficam no sinal-cron)
      AND EXISTS (SELECT 1 FROM alissonerp.pagamentos_venda p
                  WHERE p.venda_id = v.id AND p.forma = 'A Receber' AND p.status = 'pendente'
                    AND (p.credi_tipo IS DISTINCT FROM 'sinal'))
      -- tem conta a receber pendente
      AND EXISTS (SELECT 1 FROM alissonerp.contas_receber cr
                  WHERE cr.venda_erp_id = v.id AND cr.categoria = 'venda' AND cr.situacao = 'pendente')
      -- NÃO tem ordem de produção aberta (se tiver, espera fechar)
      AND NOT EXISTS (SELECT 1 FROM alissonerp.ordens o
                      WHERE o.venda_id = v.id
                        AND o.tipo_ordem::text <> ALL(${TIPOS_ORDEM_NAO_BLOQUEIA})
                        AND o.status NOT IN ('concluido')
                        AND o.situacao NOT IN ('cancelado'))
  `;

  const estoque = await sql`
    SELECT id FROM alissonerp.usuarios
    WHERE role IN ('gerente_fabrica','gerente_loja','admin','desenvolvedor','pcp') AND id IS NOT NULL
  `;

  let convertidos = 0;
  let avisados = 0;
  const resultados: { venda: string; acao: string; detalhe?: string }[] = [];

  for (const r of reservas) {
    const diasPassados = Number(r.dias_passados ?? 0);
    if (diasPassados < 0) continue; // início no futuro (não deveria acontecer)
    const valorPago = parseFloat(r.valor_pago ?? "0");

    try {
      if (diasPassados >= PRAZO_DIAS) {
        // ── ESTOURO: vira VC + cancela as contas pendentes da venda + notifica estoque ──
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const out = await (sql as any).begin(async (tx: typeof sql) => {
          let valeNumero: string | null = null;
          if (valorPago > 0) {
            const vale = await gerarValeCredito(r.cliente_id, valorPago, r.created_by, r.venda_id, tx);
            valeNumero = vale.numero;
          }
          // Cancela TODAS as contas a receber pendentes da venda (parcelas incluídas):
          // enquanto reservada, a reserva manda — o parcelamento só valeria se a peça saísse.
          const canceladas = await tx`
            UPDATE alissonerp.contas_receber
            SET situacao = 'cancelado', updated_at = NOW()
            WHERE venda_erp_id = ${r.venda_id} AND categoria = 'venda' AND situacao = 'pendente'
            RETURNING id
          `;
          // Registra no histórico do crediário (usa uma das contas como âncora).
          if (canceladas.length > 0) {
            await tx`
              INSERT INTO alissonerp.comunicacoes_crediario (conta_receber_id, tipo, mensagem, usuario_id)
              VALUES (${canceladas[0].id}, 'observacao',
                ${`Reserva vencida (${PRAZO_DIAS} dias corridos) sem pagamento total. ${valeNumero ? `Gerado vale ${valeNumero} de R$ ${valorPago.toFixed(2)}.` : "Sem valor pago."} Peça precisa voltar ao estoque.`},
                ${r.created_by}::uuid)
            `;
          }
          return { valeNumero };
        });

        for (const u of estoque) {
          await criarNotificacao({
            usuarioId: u.id,
            tipo: "aviso",
            titulo: "Reserva vencida — peça voltar ao estoque",
            mensagem: `Venda ${r.numero_venda}: reserva não paga no prazo.${out.valeNumero ? ` Cliente ficou com vale ${out.valeNumero}.` : ""} Recoloque a peça no estoque.`,
            link: "/crediario",
          }).catch(() => {});
        }
        if (r.created_by) {
          await criarNotificacao({
            usuarioId: r.created_by,
            tipo: "crediario_reserva",
            titulo: "Reserva virou crédito",
            mensagem: `Venda ${r.numero_venda}: cliente não finalizou o pagamento no prazo.${out.valeNumero ? ` Gerado vale ${out.valeNumero}.` : ""}`,
            link: "/crediario",
            vendaId: r.venda_id,
          }).catch(() => {});
        }

        convertidos++;
        resultados.push({ venda: r.numero_venda, acao: "vc", detalhe: out.valeNumero ?? "sem valor pago" });
      } else {
        // ── DENTRO DO PRAZO: avisa a consultora (1x por dia por venda) ──
        if (r.avisou_hoje) { continue; }
        const diasRestantes = PRAZO_DIAS - diasPassados;
        let titulo: string | null = null;
        let mensagem: string | null = null;

        if (diasRestantes === 1) {
          titulo = "Reserva: amanhã vira crédito";
          mensagem = `Venda ${r.numero_venda}: se o pagamento não for constatado, amanhã o pedido vira vale-crédito e a peça volta ao estoque.`;
        } else if (diasRestantes <= 3) {
          titulo = "Reserva: prazo acabando";
          mensagem = `Venda ${r.numero_venda}: faltam ${diasRestantes} dias para o cliente finalizar o pagamento, senão vira vale-crédito.`;
        } else if (!r.ja_avisou_antes) {
          titulo = "Reserva: cliente tem 7 dias";
          mensagem = `Venda ${r.numero_venda}: o cliente tem ${PRAZO_DIAS} dias para finalizar o pagamento da peça reservada, senão vira vale-crédito.`;
        }

        if (titulo && r.created_by) {
          await criarNotificacao({
            usuarioId: r.created_by,
            tipo: "crediario_reserva",
            titulo,
            mensagem: mensagem!,
            link: "/crediario",
            vendaId: r.venda_id,
          }).catch(() => {});
          avisados++;
          resultados.push({ venda: r.numero_venda, acao: "aviso", detalhe: `${diasRestantes}d restantes` });
        }
      }
    } catch (err) {
      console.error("[reserva-cron] erro venda", r.venda_id, err);
    }
  }

  return NextResponse.json({ ok: true, reservas: reservas.length, convertidos, avisados, resultados });
}
