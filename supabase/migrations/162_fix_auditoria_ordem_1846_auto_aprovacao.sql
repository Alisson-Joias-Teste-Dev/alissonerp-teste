-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 162: Aprovação automática de auditoria loja para ordens ERP
--
-- Problema: ordens criadas via ERP (criarOrdemDoOrcamento) tinham auditoria
-- inserida com situacao='pendente'. O trigger fn_processar_auditoria só
-- dispara em UPDATE, nunca em INSERT. Resultado: ordem ficava presa.
--
-- Fix imediato: aprovar auditoria pendente da ordem 1846.
-- Fix estrutural: feito no código (vendas-aprovar.ts) — INSERT + UPDATE
--                 imediato dentro da mesma tx para disparar o trigger.
-- ═══════════════════════════════════════════════════════════════════════════

-- Fix urgente: aprovar auditoria pendente da ordem 1846
-- O trigger fn_processar_auditoria dispara automaticamente neste UPDATE,
-- criando saida_ordem + pcp (rota=pcp) ou marcando aguardando (rota=protocolo).
UPDATE alissonerp.auditorias a
SET
  situacao      = 'aprovado',
  data_conclusao = NOW(),
  parecer       = 'Aprovação automática corretiva (migration 162)'
FROM alissonerp.ordens o
WHERE a.ordem_id = o.id
  AND (
    o.id           = 1846
    OR o.numero_pedido::text = '1846'
    OR o.numero_ordem        = 'C-1846'
    OR o.numero_ordem LIKE   '%-1846'
  )
  AND a.situacao       = 'pendente'
  AND a.tipo_auditoria = 'loja';
