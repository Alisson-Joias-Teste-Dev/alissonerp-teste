-- ============================================================
-- Migration 306 — Codigo de confirmacao do Vale-Troca (WhatsApp)
--
-- REGRA DE NEGOCIO:
-- O QUE: cria a tabela que guarda o codigo de 6 digitos enviado por WhatsApp
--   ao DONO do vale na hora de aplicar o vale numa venda. So apos o dono
--   informar o codigo (2a confirmacao) o vale e aplicado. Espelha a trava de
--   tentativas das entregas (migration 295: 5 erros = bloqueia).
-- POR QUE: hoje o vale e aplicado sem validar o dono (brecha #1 da auditoria
--   16/06) — houve 2 usos cruzados reais (R$3.410). O codigo no WhatsApp do
--   dono garante consentimento e identidade.
-- IMPACTO SE REMOVIDO: volta a ser possivel aplicar vale de um cliente na
--   venda de outro sem autorizacao.
--
-- Database Safety §2: CREATE TABLE IF NOT EXISTS — sem DROP, sem alterar
--   colunas existentes. Reversivel com seguranca.
-- ============================================================
SET search_path TO alissonerp;

CREATE TABLE IF NOT EXISTS alissonerp.vale_troca_codigo (
  id            SERIAL PRIMARY KEY,
  vale_troca_id INTEGER NOT NULL REFERENCES alissonerp.vale_troca(id) ON DELETE CASCADE,
  venda_id      INTEGER REFERENCES alissonerp.vendas_erp(id) ON DELETE SET NULL,
  codigo        TEXT NOT NULL,                 -- 6 digitos enviados ao dono
  telefone      TEXT,                          -- celular do dono (contatos.celular), para rastro
  tentativas    INTEGER NOT NULL DEFAULT 0,    -- erros de digitacao; 5 = bloqueia (padrao migration 295)
  bloqueado_em  TIMESTAMPTZ,                   -- preenchido = travado para confirmacao (5 erros)
  confirmado_em TIMESTAMPTZ,                   -- preenchido = codigo validado, aplicacao liberada
  expira_em     TIMESTAMPTZ NOT NULL,          -- validade do codigo (ex.: agora + 15 min)
  created_by    UUID,                          -- usuario (caixa) que solicitou o codigo
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vale_codigo_vale  ON alissonerp.vale_troca_codigo(vale_troca_id);
CREATE INDEX IF NOT EXISTS idx_vale_codigo_venda ON alissonerp.vale_troca_codigo(venda_id);

COMMENT ON TABLE alissonerp.vale_troca_codigo IS
  'Codigos de 2a confirmacao (WhatsApp) para aplicar vale-troca ao dono. Brecha #1 da auditoria 16/06.';

GRANT SELECT, INSERT, UPDATE ON alissonerp.vale_troca_codigo TO authenticated;
GRANT USAGE ON SEQUENCE alissonerp.vale_troca_codigo_id_seq TO authenticated;

-- ============================================================
-- Fim migration 306
-- ============================================================
