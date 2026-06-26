-- ============================================================
-- Migration 310 — seeds de aprovadores (devolucao-estoque e vale-troca-excecao)
--
-- REGRA DE NEGOCIO:
-- O QUE: cria as chaves de configuracao para definir, na tela de Configuracoes,
--   QUEM aprova:
--     (1) aprovador_devolucao_estoque  — a movimentacao de estoque da devolucao
--         antes de gerar o vale-troca;
--     (2) aprovador_vale_troca_excecao — aplicar o vale quando a confirmacao por
--         WhatsApp falha ou o cliente nao tem celular cadastrado.
--   Seguem o padrao dos demais aprovadores (ex.: aprovador_devolucao_fora_prazo):
--   valor = UUID do usuario; vazio = cai no fallback por cargo no codigo.
-- POR QUE: aprovadores configuraveis (decisao Jonathan).
-- IMPACTO SE REMOVIDO: nao da para definir esses aprovadores pela tela.
--
-- Database Safety §2: INSERT idempotente (ON CONFLICT DO NOTHING).
-- ============================================================
SET search_path TO alissonerp;

INSERT INTO alissonerp.configuracoes_sistema (chave, valor, descricao)
VALUES
  ('aprovador_devolucao_estoque', '',
   'Usuario que aprova a movimentacao de estoque da devolucao antes de gerar o vale-troca'),
  ('aprovador_vale_troca_excecao', '',
   'Usuario que aprova aplicar vale-troca quando a confirmacao por WhatsApp falha ou o cliente nao tem celular')
ON CONFLICT (chave) DO NOTHING;

-- ============================================================
-- Fim migration 310
-- ============================================================
