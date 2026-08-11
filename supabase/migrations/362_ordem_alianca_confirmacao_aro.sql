-- ============================================================
-- 362 — Ordem de aliança só nasce com o ARO CONFIRMADO
--
-- O QUE: acrescenta em alissonerp.orcamentos o registro de QUEM confirmou a
--        numeração do aro e QUANDO. A ordem de fabricação de aliança deixa de
--        ser criada automaticamente na aprovação da venda; passa a nascer só
--        quando alguém clica "Abrir ordem para a fábrica" e confirma o aro de
--        cada aliança (endpoint POST /api/vendas/[id]/abrir-ordem).
--
-- POR QUE: a numeração do aro é obrigatória no orçamento, mas na hora da venda
--        o cliente muitas vezes ainda não sabe o tamanho do dedo. A consultora
--        digitava QUALQUER número só para conseguir fechar a venda — e, como a
--        ordem nascia dentro da própria aprovação (vendas-aprovar.ts), esse
--        número chutado chegava na fábrica no mesmo segundo, sem ninguém
--        conferir. A peça saía no tamanho errado. (Relato do Jonathan,
--        27/07/2026.)
--
-- IMPACTO SE REMOVIDO/REVERTIDO: sem estas colunas o sistema perde o rastro de
--        quem confirmou o aro (o dado volta a ser anônimo). A trava em si vive
--        no código (criarOrdemDoOrcamento só cria aliança com aroConfirmado),
--        então derrubar a migration NÃO reabre a criação automática — mas deixa
--        a auditoria cega. Nenhum gatilho/view depende destas colunas.
--
-- NÃO MEXE: orcamentos.peso e orcamentos.valor continuam intocados — são a base
--        do valor negociado com o cliente (snapshot travado). Trocar o aro muda
--        o peso da FICHA (produção) e o peso da ORDEM, nunca o preço da venda.
-- ============================================================

ALTER TABLE alissonerp.orcamentos
  ADD COLUMN IF NOT EXISTS aro_confirmado_por UUID REFERENCES alissonerp.usuarios(id),
  ADD COLUMN IF NOT EXISTS aro_confirmado_em  TIMESTAMPTZ;

COMMENT ON COLUMN alissonerp.orcamentos.aro_confirmado_por IS
  'Quem confirmou a numeração do aro na abertura da ordem (migration 362). NULL = ordem de aliança ainda não pode ser aberta.';
COMMENT ON COLUMN alissonerp.orcamentos.aro_confirmado_em IS
  'Quando o aro foi confirmado (migration 362). Preenchido junto com aro_confirmado_por pelo endpoint /api/vendas/[id]/abrir-ordem.';

-- Índice parcial: a tela de vendas lista "aliança vendida sem ordem aberta"
-- filtrando orçamento de aliança com venda gerada e sem ordem. Sem o índice o
-- filtro varre a tabela inteira de orçamentos.
CREATE INDEX IF NOT EXISTS idx_orcamentos_alianca_sem_ordem
  ON alissonerp.orcamentos (venda_gerada_id)
  WHERE tipo = 'alianca' AND ordem_gerada_id IS NULL;
