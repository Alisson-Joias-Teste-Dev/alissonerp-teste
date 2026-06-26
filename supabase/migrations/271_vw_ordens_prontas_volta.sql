-- ═══════════════════════════════════════════════════════════════════════════════
-- 271_vw_ordens_prontas_volta.sql
-- Corrige vw_ordens_prontas_volta para incluir ordens regulares (service, fabricação)
-- além das ordens conversao_sku que foram adicionadas na migration 253.
--
-- Regra de negócio:
--   Protocolo Volta = ordens prontas para retornar fisicamente ao almoxarifado.
--   Antes: só listava conversao_sku (migration 253 sobrescreveu a view original).
--   Agora: lista ambos os casos via UNION ALL com filtros mutuamente exclusivos.
--
-- Impacto se alterado/removido:
--   Ordens service concluídas (PCP concluido + auditoria fabrica aprovada)
--   não aparecerão na aba "Volta" do módulo Protocolo, impedindo o motoboy
--   de buscar as peças nos operadores.
-- ═══════════════════════════════════════════════════════════════════════════════

SET search_path TO alissonerp;

DROP VIEW IF EXISTS alissonerp.vw_ordens_prontas_volta CASCADE;

CREATE VIEW alissonerp.vw_ordens_prontas_volta AS
-- 1) Ordens regulares prontas para volta:
--    PCP concluído + auditoria fábrica aprovada + sem protocolo volta ativo
SELECT DISTINCT o.id,
    o.numero_ordem,
    o.status::text AS status,
    o.tipo_ordem::text AS tipo_ordem
FROM alissonerp.ordens o
JOIN alissonerp.pcp p ON p.ordem_id = o.id AND p.etapas = 'concluido'
JOIN alissonerp.auditorias a
    ON a.ordem_id = o.id AND a.tipo_auditoria = 'fabrica' AND a.situacao = 'aprovado'
WHERE o.status::text NOT IN ('cancelado', 'entregue')
  AND o.id NOT IN (
    SELECT po.ordem_id
    FROM alissonerp.protocolo_ordens po
    JOIN alissonerp.protocolos p ON p.id = po.protocolo_id
    WHERE p.etapas::text != 'concluido'
      AND p.direcao::text = 'volta'
  )
UNION ALL
-- 2) Conversao_sku ordens prontas para volta (mantido da migration 253)
SELECT DISTINCT o.id,
    o.numero_ordem,
    o.status::text AS status,
    o.tipo_ordem::text AS tipo_ordem
FROM alissonerp.ordens o
JOIN alissonerp.conversoes_sku cs ON cs.ordem_id = o.id
WHERE o.tipo_ordem::text = 'conversao_sku'
  AND cs.status_conversao = 'aguardando_volta'
  AND o.status::text IN ('aguardando', 'em_andamento')
  AND o.id NOT IN (
    SELECT po.ordem_id
    FROM alissonerp.protocolo_ordens po
    JOIN alissonerp.protocolos p ON p.id = po.protocolo_id
    WHERE p.etapas::text != 'concluido'
      AND p.direcao::text = 'volta'
  )
ORDER BY id DESC;

GRANT SELECT ON alissonerp.vw_ordens_prontas_volta TO authenticated, anon;

SET search_path TO public;
