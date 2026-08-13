import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * GET /api/crediario/reserva-alertas
 *
 * Reservas (crediário ③) da CONSULTORA LOGADA que estão dentro do prazo dos
 * 7 dias corridos e perto de virar vale-crédito. Alimenta a faixa global
 * (ReservaAlarme no DashboardShell) — regra transversal: o alerta tem que
 * aparecer NA TELA, não só no sino.
 *
 * Espelha a SELEÇÃO do robô `reserva-cron` (mesmas guardas), mas:
 *  - escopo: só vendas onde created_by = usuário logado;
 *  - janela: só as que AINDA estão no prazo (1..7 dias restantes). As que já
 *    estouraram (>= 7 dias) são tratadas pelo robô (viram VC), não aqui.
 *  - ao vivo: não depende da cron ter rodado.
 */
const PRAZO_DIAS = 7; // dias CORRIDOS
const TIPOS_ORDEM_NAO_BLOQUEIA = ["servico", "garantia", "compra_fornecedor", "servico_interno", "servico_venda", "servico_loja"];
const TIPOS_ORDEM_PRODUCAO = ["fabricacao", "reposicao_venda", "reposicao_loja", "conversao", "conversao_sku"];

export async function GET(_req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  // Sem corte configurado = nenhuma venda nova entra na regra (segurança).
  const [corte] = await sql`SELECT valor FROM alissonerp.configuracoes_sistema WHERE chave = 'crediario_reserva_corte' LIMIT 1`;
  if (!corte?.valor) return NextResponse.json({ total: 0, itens: [] });

  const rows = await sql`
    SELECT
      v.id            AS venda_id,
      v.numero_venda  AS numero_venda,
      (CURRENT_DATE - GREATEST(
        v.data_entrega::date,
        COALESCE((
          SELECT MAX(o.data_conclusao)::date FROM alissonerp.ordens o
          WHERE o.venda_id = v.id AND o.tipo_ordem::text = ANY(${TIPOS_ORDEM_PRODUCAO})
        ), v.data_entrega::date)
      )) AS dias_passados,
      COALESCE((SELECT SUM(cr.valor) FROM alissonerp.contas_receber cr
                WHERE cr.venda_erp_id = v.id AND cr.categoria = 'venda' AND cr.situacao = 'pendente'), 0) AS valor_pendente
    FROM alissonerp.vendas_erp v
    WHERE v.created_at::date >= ${corte.valor}::date
      AND v.created_by = ${user.id}::uuid
      AND v.situacao = 'aprovado'
      AND v.data_entrega IS NOT NULL
      AND v.data_entrega::date < CURRENT_DATE
      AND EXISTS (SELECT 1 FROM alissonerp.pagamentos_venda p
                  WHERE p.venda_id = v.id AND p.forma = 'A Receber' AND p.status = 'pendente'
                    AND (p.credi_tipo IS DISTINCT FROM 'sinal'))
      AND EXISTS (SELECT 1 FROM alissonerp.contas_receber cr
                  WHERE cr.venda_erp_id = v.id AND cr.categoria = 'venda' AND cr.situacao = 'pendente')
      AND NOT EXISTS (SELECT 1 FROM alissonerp.ordens o
                      WHERE o.venda_id = v.id
                        AND o.tipo_ordem::text <> ALL(${TIPOS_ORDEM_NAO_BLOQUEIA})
                        AND o.status NOT IN ('concluido')
                        AND o.situacao NOT IN ('cancelado'))
    ORDER BY v.data_entrega::date ASC
  `;

  const itens = rows
    .map((r) => {
      const diasPassados = Number(r.dias_passados ?? 0);
      const diasRestantes = PRAZO_DIAS - diasPassados;
      return {
        venda_id: Number(r.venda_id),
        numero_venda: r.numero_venda as string,
        dias_restantes: diasRestantes,
        ultimo_dia: diasRestantes === 1,
        valor_pendente: parseFloat(r.valor_pendente ?? "0"),
      };
    })
    // Só dentro do prazo (1..7). Já estourado (>= 7 dias) é com o robô.
    .filter((i) => i.dias_restantes >= 1 && i.dias_restantes <= PRAZO_DIAS);

  return NextResponse.json({ total: itens.length, itens });
}
