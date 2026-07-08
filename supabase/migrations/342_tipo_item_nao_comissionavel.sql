-- ============================================================
-- Migration 342 — tipo_item aceita 'nao_comissionavel'
--
-- O QUÊ: adiciona 'nao_comissionavel' ao CHECK de
--   fechamento_comissao_itens.tipo_item.
-- POR QUÊ: pagamentos Vale-Troca/Permuta/Ajuste Consultora (comissionavel=
--   false) passam a entrar no fechamento com comissao_calculada=0 em vez
--   de sumir silenciosamente da consulta — fica visível/auditável no
--   relatório (pedido do Jonathan, 08/07/2026, depois de uma confusão
--   com um item cancelado que parecia ativo na tela). Ver comercial.md §2.
-- IMPACTO SE REMOVIDO: INSERT desses itens falha (viola o CHECK) e o
--   fechamento inteiro quebra pra qualquer consultora com Vale-Troca/
--   Permuta/Ajuste Consultora no período.
-- ============================================================

ALTER TABLE alissonerp.fechamento_comissao_itens
  DROP CONSTRAINT fechamento_comissao_itens_tipo_item_check;

ALTER TABLE alissonerp.fechamento_comissao_itens
  ADD CONSTRAINT fechamento_comissao_itens_tipo_item_check
  CHECK (tipo_item = ANY (ARRAY['normal'::text, 'ajuste_positivo'::text, 'ajuste_negativo'::text, 'estorno'::text, 'nao_comissionavel'::text]));
