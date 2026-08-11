-- Migration 352: RFID — modelo de etiqueta PADRÃO (tag de joia, posição F1)
-- ─────────────────────────────────────────────────────────────────────────────
-- Semeia o modelo PADRÃO usado quando nenhum outro é escolhido (a rota de
-- impressão lê `posicao_rfid` do modelo padrão para montar o `^RS` do ZPL).
--
-- A posição de programação do chip (F1) foi achada na calibração de bancada
-- (`^HR`) e vale para a impressora física da loja (ZD500R, 192.168.3.97). O resto
-- do layout (^PW576, ~SD11, fontes, logo) está CRAVADO no código
-- (src/lib/rfid/zpl.ts) — aqui grava-se só a posição do chip, que é o único
-- campo do modelo lido em runtime. As dimensões (25×10mm) são documentação.
--
-- IDEMPOTÊNCIA: só insere se ainda NÃO houver um modelo padrão (o índice único
-- `rfid_etiqueta_modelo_um_padrao` garante no máximo 1). Não sobrescreve um
-- padrão que o usuário já tenha ajustado/salvo pela aba RFID em Configurações.
--
-- PGAPPNAME: rfid_migration_352

INSERT INTO alissonerp.rfid_etiqueta_modelo
  (nome, largura_mm, altura_mm, offset_x_mm, offset_y_mm, posicao_rfid, padrao, ativo)
SELECT 'Joia (bandeira colada)', 25, 10, 0, 0, 'F1', true, true
WHERE NOT EXISTS (
  SELECT 1 FROM alissonerp.rfid_etiqueta_modelo WHERE padrao = true
);
