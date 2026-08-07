-- Protocolo de TRANSFERENCIA DE ESTOQUE (tipo_protocolo = 'transferencia')
--
-- O QUE FAZ:
--   1. Da trajeto ao protocolo (local_origem_id / local_destino_id), pra que ele
--      possa registrar o transporte de PRODUTO entre dois locais de estoque
--      quaisquer — Loja -> Fabrica, Reposicao -> Loja, Fabrica -> Loja etc.
--   2. Da quantidade ao item do protocolo (protocolo_produtos.quantidade), pra
--      que um mesmo protocolo leve varios SKUs com quantidades diferentes.
--   3. Amarra o movimento de estoque ao protocolo
--      (transferencias_estoque_comercial.protocolo_id) e a reserva ao protocolo
--      (reservas_estoque_comercial.protocolo_id).
--   4. Cria o estado 'cancelado' no enum de etapas + motivo de cancelamento.
--
-- O PORQUE (regra de negocio): mover joia entre locais ja era possivel pela tela
-- de estoque comercial, mas SEM rastreabilidade — ninguem assumia o caminho, nao
-- tinha foto e nao dava pra dizer quem transportou. A partir daqui a transferencia
-- de estoque comercial NASCE de um protocolo (porta unica), com o mesmo ritual de
-- foto e recebimento que ja vale pra ordem e pro ouro.
--   - A RESERVA existe porque entre a solicitacao e a coleta pode passar o dia
--     inteiro: sem ela a consultora vende no PDV uma peca ja prometida ao outro
--     local, e o conflito so aparece na entrega.
--   - O CANCELAMENTO existe porque solicitacao abandonada seguraria a reserva pra
--     sempre — o modulo ja tem 47 protocolos de ida parados em 'pendente' desde
--     marco, e esse mesmo modo de falha aqui tiraria peca do estoque disponivel.
--
-- MODELO: NENHUMA tabela nova. Reusa protocolos + protocolo_produtos (a junção
-- com produto ja existia, da v0 da Movimentacao Interna) + o par de triggers de
-- transferencias_estoque_comercial, que ja faz saida na origem ao criar e entrada
-- no destino ao concluir. O estado "em rota" NAO vira coluna: e derivado da
-- transferencia vinculada estar 'pendente' (a vw_saldo_estoque_comercial_v2 ja
-- expoe isso como em_transito). Ver docs/regras-negocio/protocolo.md §5.
--
-- IMPACTO SE ALTERADO/REMOVIDO: sem local_origem_id/local_destino_id a API de
-- solicitacao quebra (42703) e o protocolo perde o trajeto; sem protocolo_id nas
-- transferencias/reservas nao da pra saber o que concluir nem qual reserva soltar,
-- e a peca fica reservada pra sempre.
--
-- NAO MEXE NOS PROTOCOLOS EXISTENTES: todas as colunas novas sao nulas e as
-- constraints so valem quando tipo_protocolo = 'transferencia'. Ordem, service,
-- sangria e os 23 registros legados do tipo 'interno' continuam identicos.
--
-- ATENCAO AO DRY-RUN: o ALTER TYPE abaixo fica FORA do BEGIN de proposito (o novo
-- valor do enum precisa estar commitado antes de ser usado nas constraints). Como
-- este arquivo traz BEGIN/COMMIT proprio, "psql BEGIN; \i arquivo; ROLLBACK;" NAO
-- e dry-run de verdade — o COMMIT interno aplica. Pra ensaiar, rodar os statements
-- dentro do proprio BEGIN.

-- 1) Estado novo do ciclo de vida (aditivo — nenhum codigo existente compara com ele).
ALTER TYPE alissonerp.enum_etapas_protocolo ADD VALUE IF NOT EXISTS 'cancelado';

BEGIN;

-- 2) Trajeto e motivo de cancelamento no cabecalho do protocolo.
ALTER TABLE alissonerp.protocolos
  ADD COLUMN IF NOT EXISTS local_origem_id     INTEGER REFERENCES alissonerp.locais_estoque(id),
  ADD COLUMN IF NOT EXISTS local_destino_id    INTEGER REFERENCES alissonerp.locais_estoque(id),
  ADD COLUMN IF NOT EXISTS motivo_cancelamento TEXT;

COMMENT ON COLUMN alissonerp.protocolos.local_origem_id  IS 'Local de estoque de onde a peca sai (so tipo_protocolo=transferencia)';
COMMENT ON COLUMN alissonerp.protocolos.local_destino_id IS 'Local de estoque onde a peca entra (so tipo_protocolo=transferencia)';
COMMENT ON COLUMN alissonerp.protocolos.motivo_cancelamento IS 'Obrigatorio quando etapas=cancelado — por que a solicitacao foi abandonada';

-- REGRA: transferencia sem trajeto nao existe, e origem igual a destino nao e
-- transferencia. Os demais tipos (fabrica/service/ouro/interno) passam batido.
ALTER TABLE alissonerp.protocolos
  DROP CONSTRAINT IF EXISTS chk_protocolo_transferencia_trajeto;
ALTER TABLE alissonerp.protocolos
  ADD CONSTRAINT chk_protocolo_transferencia_trajeto CHECK (
    tipo_protocolo::text <> 'transferencia'
    OR (local_origem_id IS NOT NULL
        AND local_destino_id IS NOT NULL
        AND local_origem_id <> local_destino_id)
  );

-- REGRA: cancelar exige motivo escrito (mesmo padrao da Movimentacao Interna,
-- migration 347). NOT VALID porque nao ha linha 'cancelado' hoje — a checagem
-- vale dai pra frente sem varrer a tabela inteira.
ALTER TABLE alissonerp.protocolos
  DROP CONSTRAINT IF EXISTS chk_protocolo_cancelado_motivo;
ALTER TABLE alissonerp.protocolos
  ADD CONSTRAINT chk_protocolo_cancelado_motivo CHECK (
    etapas::text <> 'cancelado'
    OR (motivo_cancelamento IS NOT NULL AND btrim(motivo_cancelamento) <> '')
  ) NOT VALID;

-- 3) Item do protocolo. A tabela ja existe em PRODUCAO desde a v0 da Movimentacao
-- Interna (23 registros legados do tipo 'interno'), mas NAO existe em homolog nem
-- num banco limpo — por isso o CREATE IF NOT EXISTS, replicando a definicao de
-- producao coluna a coluna. Em producao este bloco e no-op.
CREATE TABLE IF NOT EXISTS alissonerp.protocolo_produtos (
  id           BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  protocolo_id INTEGER REFERENCES alissonerp.protocolos(id) ON DELETE SET NULL,
  produto_id   BIGINT  REFERENCES public.produtos(id_produto) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (protocolo_id, produto_id)
);

CREATE INDEX IF NOT EXISTS idx_protocolo_produtos_protocolo ON alissonerp.protocolo_produtos (protocolo_id);
CREATE INDEX IF NOT EXISTS idx_protocolo_produtos_produto   ON alissonerp.protocolo_produtos (produto_id);

-- Quantidade por item. Default 1 preserva os 23 registros legados do tipo
-- 'interno', que eram sempre 1 peca por linha.
-- REGRA: o UNIQUE (protocolo_id, produto_id) e proposital — o mesmo SKU entra uma
-- vez so por protocolo, e o "quantas pecas" vive nesta coluna, nunca em linhas
-- repetidas (senao a soma da reserva e da transferencia duplica).
ALTER TABLE alissonerp.protocolo_produtos
  ADD COLUMN IF NOT EXISTS quantidade INTEGER NOT NULL DEFAULT 1;

ALTER TABLE alissonerp.protocolo_produtos
  DROP CONSTRAINT IF EXISTS chk_protocolo_produtos_quantidade;
ALTER TABLE alissonerp.protocolo_produtos
  ADD CONSTRAINT chk_protocolo_produtos_quantidade CHECK (quantidade > 0);

-- 4) Vinculo do movimento de estoque com o protocolo que o autorizou.
ALTER TABLE alissonerp.transferencias_estoque_comercial
  ADD COLUMN IF NOT EXISTS protocolo_id INTEGER REFERENCES alissonerp.protocolos(id);

CREATE INDEX IF NOT EXISTS idx_transf_ec_protocolo
  ON alissonerp.transferencias_estoque_comercial (protocolo_id)
  WHERE protocolo_id IS NOT NULL;

COMMENT ON COLUMN alissonerp.transferencias_estoque_comercial.protocolo_id IS 'Protocolo de transferencia que gerou este movimento (NULL = transferencia antiga, criada direto pela tela de estoque)';

-- 5) Vinculo da reserva com o protocolo — e o que permite soltar a reserva certa
-- na coleta ou no cancelamento. Nulo em toda reserva de venda/ordem existente.
ALTER TABLE alissonerp.reservas_estoque_comercial
  ADD COLUMN IF NOT EXISTS protocolo_id INTEGER REFERENCES alissonerp.protocolos(id);

CREATE INDEX IF NOT EXISTS idx_reservas_ec_protocolo
  ON alissonerp.reservas_estoque_comercial (protocolo_id)
  WHERE protocolo_id IS NOT NULL;

COMMENT ON COLUMN alissonerp.reservas_estoque_comercial.protocolo_id IS 'Reserva criada por um protocolo de transferencia (segura a peca entre a solicitacao e a coleta)';

COMMIT;
