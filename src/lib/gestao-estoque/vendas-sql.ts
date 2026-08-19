/**
 * Fragmentos SQL compartilhados — fonte UNICA de "vendas que contam" para as
 * analises da Gestao de Estoque (receita 12m/ABC, DIO 90d, ultima venda,
 * oportunidades de fabricacao, serie semanal).
 *
 * O QUE: une as duas origens de venda do negocio —
 *   1. legado (Tiny): public.vendas + public.itens_venda
 *   2. ERP nativo:    alissonerp.vendas_erp + alissonerp.itens_venda_erp
 *
 * O PORQUE (regra de negocio):
 *   - Venda cancelada nao e venda. Legado: v.status = 4 (cancelado) ou status
 *     nulo ficam fora (mesmo criterio canonico do Dashboard Comercial,
 *     dashboard-comercial/vendas-dashboard). ERP: so contam as situacoes
 *     'aprovado', 'enviado' e 'concluido'.
 *   - Desde 23/04/2026 as vendas nascem no ERP e NAO voltam mais para
 *     public.itens_venda (espelho n8n desativado em 15/06/2026 — ver
 *     docs/dashboard-comercial-vendas-duplicadas.md §2.3). Ler so o legado
 *     deixava TODA venda nova fora dos numeros do modulo.
 *   - Dedup: venda legada que e espelho de uma venda ERP contavel e excluida
 *     (mesmas 3 condicoes da view canonica alissonerp.vw_dash_vendas_todas,
 *     migrations 176/182) — senao a mesma venda contaria duas vezes.
 *
 * O IMPACTO se alterar/remover: receita, curva ABC, DIO e oportunidades
 * divergem do Dashboard Comercial, voltam a ignorar vendas do ERP ou a
 * contar canceladas (bugs graves nº3 e nº4 do pente-fino de 18/08/2026).
 */
import sql from "@/lib/db";

/**
 * Condicao que EXCLUI a venda legada quando ela e espelho de uma venda ERP
 * contavel (copia fiel da logica da vw_dash_vendas_todas). Usar dentro de um
 * WHERE que ja tenha `public.vendas v` no escopo.
 */
export function vendaLegadaNaoEspelhada() {
  return sql`
    NOT EXISTS (
      SELECT 1 FROM alissonerp.vendas_erp ve
      WHERE ve.situacao IN ('aprovado', 'enviado', 'concluido')
        AND ve.tiny_pedido_id IS NOT NULL
        AND ve.tiny_pedido_id = v.id_api_tiny
        AND ve.data_venda >= DATE '2026-04-23'
    )
    AND NOT EXISTS (
      SELECT 1 FROM alissonerp.vendas_erp ve2
      WHERE ve2.situacao IN ('aprovado', 'enviado', 'concluido')
        AND ve2.tiny_pedido_id IS NULL
        AND ve2.numero_venda = v.numero_pedido::text
        AND ve2.data_venda < DATE '2026-04-23'
        AND v.status <> 2
    )
    AND NOT EXISTS (
      SELECT 1 FROM alissonerp.vendas_erp ve3
      WHERE ve3.situacao IN ('aprovado', 'enviado', 'concluido')
        AND ve3.tiny_pedido_id IS NOT NULL
        AND ve3.tiny_pedido_id = v.id_api_tiny
        AND ve3.data_venda < DATE '2026-04-23'
        AND v.status <> 2
    )
  `;
}

/**
 * Itens de venda validos das duas origens, em formato unico:
 *   (produto_id, quantidade, preco_total, data_venda, venda_key)
 * venda_key e texto ('leg-<id>' / 'erp-<id>') para COUNT(DISTINCT) nunca
 * colidir ids de origens diferentes.
 */
export function itensVendaValidos() {
  return sql`
    SELECT
      iv.produto_id,
      iv.quantidade::numeric  AS quantidade,
      iv.preco_total::numeric AS preco_total,
      v.data_venda::date      AS data_venda,
      'leg-' || v.id          AS venda_key
    FROM public.itens_venda iv
    JOIN public.vendas v ON v.id = iv.venda_id
    WHERE iv.produto_id IS NOT NULL
      AND v.status IS NOT NULL AND v.status != 4
      AND ${vendaLegadaNaoEspelhada()}
    UNION ALL
    SELECT
      ive.produto_id,
      ive.quantidade::numeric AS quantidade,
      ive.total_item::numeric AS preco_total,
      ve.data_venda::date     AS data_venda,
      'erp-' || ve.id         AS venda_key
    FROM alissonerp.itens_venda_erp ive
    JOIN alissonerp.vendas_erp ve ON ve.id = ive.venda_id
    WHERE ive.produto_id IS NOT NULL
      AND ve.situacao IN ('aprovado', 'enviado', 'concluido')
  `;
}
