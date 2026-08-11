-- ═══════════════════════════════════════════════════════════════════════════
-- 364 — Contatos de TESTE: somem dos relatórios de frete grátis
--
-- MOTIVO (03/08/2026, pedido do Jonathan): o relatório do fechamento de frete
-- mostrava 9 corridas de 08/06 no nome dele — "Jonathan Araujo Chagas
-- ( Programador )", contato 224. São vendas de TESTE (todas canceladas, R$ 31-32)
-- feitas em produção no dia em que o módulo de entregas entrou no ar. Pedido:
-- *"cancela esses fretes no meu nome que eles são de teste, todos que estiverem
-- no nome devem sair desse relatório"*.
--
-- POR QUE CONFIG E NÃO LISTA NO CÓDIGO: a regra é "todos que estiverem no meu
-- nome", não "estes 9 lançamentos". Com a chave, um teste novo some do
-- relatório sozinho e o Jonathan ajusta a lista sem deploy — mesmo padrão de
-- `gerente_frete_gratis` / `aprovadores_fechamento_frete` (migration 356).
--
-- ⚠️ NÃO MEXE EM DINHEIRO. Esta migration é 100% de EXIBIÇÃO: os lançamentos
-- continuam no razão e o saldo da gerente não muda um centavo. O efeito de
-- +R$ 60,00 desses testes já foi neutralizado pela zeragem do fechamento #1
-- (o saldo do mês foi zerado antes da verba nova entrar), então estorná-los
-- AGORA tiraria R$ 60,00 da verba de agosto por um erro de junho que já se
-- resolveu sozinho. Ver docs/regras-negocio/entregas.md §10.9.
--
-- IDs semeados:
--   224     — Jonathan Araujo Chagas ( Programador ), o dono dos 12 lançamentos
--   394408  — "[mesclado -> 224] Jonathan Araujo", alias do mesmo contato
--   4549, 4550, 4552 — contatos literalmente chamados "jonathan teste"
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO alissonerp.configuracoes_sistema (chave, valor, descricao)
VALUES (
  'contatos_teste',
  '224,394408,4549,4550,4552',
  'IDs de public.contatos (id_contato) usados para TESTE em produção. Lançamentos de frete grátis vinculados a eles são ocultados do relatório de fechamento (exibição apenas — não altera saldo nem estorna nada). Separar por vírgula.'
)
ON CONFLICT (chave) DO NOTHING;
