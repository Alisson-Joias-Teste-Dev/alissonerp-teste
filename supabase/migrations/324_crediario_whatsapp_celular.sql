-- ─────────────────────────────────────────────────────────────────────────────
-- 324 — Crediário: usar CELULAR (não telefone fixo) no contato do cliente
--
-- PROBLEMA: vw_crediario expunha c.telefone como cliente_telefone. A cobrança
--   "Cobrar no WhatsApp" e o número exibido no drawer pegavam o telefone FIXO,
--   não o celular — o mesmo número que aparece no cadastro do cliente (Celular/
--   WhatsApp). Ex.: mostrava (85) 8931-0650 em vez de (85) 99412-8048.
--
-- CORREÇÃO: cliente_telefone passa a vir do CELULAR, com fallback pro telefone
--   só quando o celular estiver vazio/nulo. Não muda nenhuma outra coluna nem a
--   ordem (CREATE OR REPLACE exige a mesma lista de colunas).
--
-- IMPACTO: nenhum risco — só leitura; recria a view. Grants preservados.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW alissonerp.vw_crediario AS
 SELECT cr.id AS conta_receber_id,
    cr.descricao,
    cr.valor,
    cr.data_vencimento,
    cr.data_recebimento,
    cr.situacao,
    cr.obs,
    cr.created_at,
    cr.created_by AS criado_por_uuid,
    cr.venda_erp_id AS venda_id,
    v.numero_venda,
    v.total_venda,
    v.situacao AS venda_situacao,
    v.bloqueado AS venda_bloqueada,
    v.credito_gerente_usado,
    v.created_at AS venda_created_at,
    cr.cliente_id,
    COALESCE(cr.cliente_nome, c.nome) AS cliente_nome,
    -- usa o CELULAR (mesmo do cadastro/WhatsApp); cai pro fixo só se vazio
    COALESCE(NULLIF(btrim(c.celular), ''), c.telefone) AS cliente_telefone,
    c.email AS cliente_email,
    v.vendedor_id,
    vend.nome AS vendedor_nome,
    u_cons.id AS consultora_uuid,
    u_cons.nome AS consultora_nome,
        CASE
            WHEN cr.situacao::text = 'pago'::text THEN 'pago'::text
            WHEN cr.data_vencimento < CURRENT_DATE THEN 'vencido'::text
            WHEN cr.data_vencimento <= (CURRENT_DATE + '7 days'::interval) THEN 'vence_em_breve'::text
            ELSE 'em_dia'::text
        END AS status_aging,
        CASE
            WHEN cr.situacao::text <> 'pendente'::text THEN 0
            WHEN cr.data_vencimento IS NULL THEN 0
            ELSE GREATEST(0, CURRENT_DATE - cr.data_vencimento)
        END AS dias_atraso
   FROM alissonerp.contas_receber cr
     LEFT JOIN alissonerp.vendas_erp v ON v.id = cr.venda_erp_id
     LEFT JOIN public.contatos c ON c.id_contato = cr.cliente_id
     LEFT JOIN public.vendedores vend ON vend.id_vendedor = v.vendedor_id
     LEFT JOIN alissonerp.usuarios u_cons ON u_cons.id = v.created_by
  WHERE cr.categoria::text = 'venda'::text;

GRANT SELECT ON alissonerp.vw_crediario TO authenticated;
