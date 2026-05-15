-- Migration 190: Módulo Crediário — VIEW + tabela de comunicações
-- v2.36.0 — Central de A Receber: vw_crediario + comunicacoes_crediario

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. Índice de suporte em contas_receber (venda_erp_id filtrado por categoria)
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_cr_venda_erp_id
  ON alissonerp.contas_receber(venda_erp_id)
  WHERE categoria = 'venda';

CREATE INDEX IF NOT EXISTS idx_cr_situacao_venda
  ON alissonerp.contas_receber(situacao, venda_erp_id)
  WHERE categoria = 'venda';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. VIEW principal: vw_crediario
--    Cada linha = 1 conta a receber de categoria 'venda' (A Receber crediário)
--    Junta: contas_receber + vendas_erp + contatos + vendedores + consultora
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW alissonerp.vw_crediario AS
SELECT
  -- ── Conta a receber ─────────────────────────────────────────────────────────
  cr.id                    AS conta_receber_id,
  cr.descricao,
  cr.valor,
  cr.data_vencimento,
  cr.data_recebimento,
  cr.situacao,             -- 'pendente' | 'pago' | 'cancelado'
  cr.obs,
  cr.created_at,
  cr.created_by            AS criado_por_uuid,

  -- ── Venda vinculada ──────────────────────────────────────────────────────────
  cr.venda_erp_id          AS venda_id,
  v.numero_venda,
  v.total_venda,
  v.situacao               AS venda_situacao,
  v.bloqueado              AS venda_bloqueada,
  v.credito_gerente_usado,
  v.created_at             AS venda_created_at,

  -- ── Cliente ─────────────────────────────────────────────────────────────────
  cr.cliente_id,
  COALESCE(cr.cliente_nome, c.nome) AS cliente_nome,
  c.telefone               AS cliente_telefone,
  c.email                  AS cliente_email,

  -- ── Vendedor (consultora que vendeu) ─────────────────────────────────────────
  v.vendedor_id,
  vend.nome                AS vendedor_nome,

  -- ── Consultora (usuária ERP que criou a venda) ────────────────────────────────
  u_cons.id                AS consultora_uuid,
  u_cons.nome              AS consultora_nome,

  -- ── Campos calculados ───────────────────────────────────────────────────────
  CASE
    WHEN cr.situacao = 'pago'      THEN 'pago'
    WHEN cr.data_vencimento < CURRENT_DATE THEN 'vencido'
    WHEN cr.data_vencimento <= CURRENT_DATE + INTERVAL '7 days' THEN 'vence_em_breve'
    ELSE 'em_dia'
  END                      AS status_aging,

  CASE
    WHEN cr.situacao != 'pendente' THEN 0
    WHEN cr.data_vencimento IS NULL THEN 0
    ELSE GREATEST(0, CURRENT_DATE - cr.data_vencimento)
  END                      AS dias_atraso

FROM alissonerp.contas_receber cr
LEFT JOIN alissonerp.vendas_erp       v     ON v.id           = cr.venda_erp_id
LEFT JOIN public.contatos             c     ON c.id_contato   = cr.cliente_id
LEFT JOIN public.vendedores           vend  ON vend.id_vendedor = v.vendedor_id
LEFT JOIN alissonerp.usuarios         u_cons ON u_cons.id     = v.created_by
WHERE cr.categoria = 'venda';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. Tabela de comunicações do crediário (append-only)
--    Usado para: avisos de recebimento, cobranças, observações internas
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS alissonerp.comunicacoes_crediario (
  id                SERIAL PRIMARY KEY,
  conta_receber_id  INTEGER       NOT NULL REFERENCES alissonerp.contas_receber(id) ON DELETE CASCADE,
  tipo              VARCHAR(30)   NOT NULL CHECK (tipo IN ('aviso_recebimento', 'cobranca', 'observacao')),
  mensagem          TEXT          NOT NULL,
  usuario_id        UUID          REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_com_cr_conta
  ON alissonerp.comunicacoes_crediario(conta_receber_id, created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. Grants
-- ═══════════════════════════════════════════════════════════════════════════════
GRANT SELECT ON alissonerp.vw_crediario                TO authenticated;
GRANT SELECT, INSERT ON alissonerp.comunicacoes_crediario TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE alissonerp.comunicacoes_crediario_id_seq TO authenticated;
