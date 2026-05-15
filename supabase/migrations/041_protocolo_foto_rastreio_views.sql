-- =============================================
-- MIGRATION 041: PROTOCOLO — FOTO + RASTREIO + VIEWS DEDUPLICAÇÃO
-- 1. Colunas de foto na tabela protocolos
-- 2. protocolo_fotos.arquivo_id: NOT NULL → nullable
-- 3. vw_ordens_prontas_ida: excluir ordens já em protocolo ativo
-- 4. vw_ordens_prontas_volta: idem
-- NÃO MEXER: fn_concluir_protocolo
-- =============================================

-- ─── 1. Colunas de foto ──────────────────────────────────────────────────────
ALTER TABLE alissonerp.protocolos
  ADD COLUMN IF NOT EXISTS foto_criacao  TEXT,
  ADD COLUMN IF NOT EXISTS foto_conclusao TEXT;

COMMENT ON COLUMN alissonerp.protocolos.foto_criacao  IS 'Path no Storage (protocolo-fotos) da foto tirada na criação';
COMMENT ON COLUMN alissonerp.protocolos.foto_conclusao IS 'Path no Storage (protocolo-fotos) da foto tirada na conclusão';

-- ─── 2. protocolo_fotos.arquivo_id: tornar nullable ──────────────────────────
ALTER TABLE alissonerp.protocolo_fotos
  ALTER COLUMN arquivo_id DROP NOT NULL;

-- ─── 3. vw_ordens_prontas_ida — excluir ordens em protocolo ativo ─────────────
-- Protocolo ativo = etapas != 'concluido' E direcao = 'ida'
CREATE OR REPLACE VIEW alissonerp.vw_ordens_prontas_ida AS
SELECT DISTINCT o.id,
    o.numero_ordem,
    o.status::text AS status
   FROM alissonerp.ordens o
     JOIN alissonerp.auditorias a
       ON a.ordem_id = o.id
      AND a.tipo_auditoria::text = 'loja'::text
      AND a.situacao::text     = 'aprovado'::text
  WHERE o.rota::text = 'protocolo'::text
    AND o.status::text <> ALL (ARRAY['cancelado','entregue','concluido'])
    AND o.id NOT IN (
      SELECT po.ordem_id
      FROM alissonerp.protocolo_ordens po
      JOIN alissonerp.protocolos p ON p.id = po.protocolo_id
      WHERE p.etapas::text != 'concluido'
        AND p.direcao::text   = 'ida'
    )
  ORDER BY o.id DESC;

GRANT SELECT ON alissonerp.vw_ordens_prontas_ida TO authenticated, anon;

-- ─── 4. vw_ordens_prontas_volta — excluir ordens em protocolo ativo ───────────
CREATE OR REPLACE VIEW alissonerp.vw_ordens_prontas_volta AS
SELECT DISTINCT o.id,
    o.numero_ordem,
    o.status::text AS status
   FROM alissonerp.ordens o
     JOIN alissonerp.pcp p2
       ON p2.ordem_id = o.id
      AND p2.etapas   = 'concluido'::alissonerp.enum_etapas_pcp
     JOIN alissonerp.auditorias a
       ON a.ordem_id = o.id
      AND a.tipo_auditoria::text = 'fabrica'::text
      AND a.situacao::text       = 'aprovado'::text
  WHERE o.status::text <> ALL (ARRAY['cancelado','entregue'])
    AND o.id NOT IN (
      SELECT po.ordem_id
      FROM alissonerp.protocolo_ordens po
      JOIN alissonerp.protocolos p ON p.id = po.protocolo_id
      WHERE p.etapas::text != 'concluido'
        AND p.direcao::text   = 'volta'
    )
  ORDER BY o.id DESC;

GRANT SELECT ON alissonerp.vw_ordens_prontas_volta TO authenticated, anon;
