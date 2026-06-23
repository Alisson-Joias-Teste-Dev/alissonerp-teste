-- 333_produtos_compat_view.sql
-- Fase B do plano docs/plano-cortar-public-produtos-2026-06.md
--
-- View-ponte para a migracao das leituras de codigo: expoe alissonerp.erp_produtos
-- (fonte unica da verdade) com a coluna legada `id_produto` como alias de `produto_id`.
-- Assim as ~91 leituras que faziam `FROM/JOIN public.produtos ... p.id_produto`
-- passam a ler do erp trocando APENAS o nome da tabela (public.produtos -> esta view),
-- sem renomear colunas no codigo (zero risco de quebrar a chave id_produto no JS).
--
-- public.produtos deixa de ser lida pelo app e fica como HISTORICO (read-only).
-- Esta view e a interface de compatibilidade; pode ser inlined para erp_produtos no futuro.
CREATE OR REPLACE VIEW alissonerp.produtos_compat AS
  SELECT e.*, e.produto_id AS id_produto
  FROM alissonerp.erp_produtos e;
