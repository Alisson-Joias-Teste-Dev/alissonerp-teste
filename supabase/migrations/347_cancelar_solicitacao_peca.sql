-- Movimentacao Interna / Solicitacao de Peca — CANCELAMENTO
--
-- O QUE FAZ: adiciona o estado 'cancelado' ao ciclo da solicitacao de peca,
-- mais as colunas de quem cancelou, quando e por que.
--
-- O PORQUE (regra de negocio): a consultora solicita a peca e as vezes desiste
-- antes de a peca sair do estoque (cliente mudou de ideia, achou outra peca).
-- Ate aqui nao havia saida: a solicitacao ficava presa em 'solicitado' para
-- sempre, sujando o filtro "Em aberto" e mentindo sobre o que esta pendente no
-- estoque. Cancelar encerra a solicitacao sem fingir que a peca circulou.
--
-- LIMITE DELIBERADO: so se cancela a partir de 'solicitado' — enquanto a peca
-- ainda esta FISICAMENTE no estoque e nada aconteceu. Depois de 'entregue' a
-- peca saiu da mao do estoque, e o caminho honesto e a devolucao (que ja existe
-- e exige foto). Esse limite e aplicado na API (PATCH action='cancelar'); aqui
-- o CHECK apenas admite o estado.
--
-- NAO MOVIMENTA ESTOQUE: este modulo nunca movimentou estoque — ele so registra
-- quem esta com a peca dentro da loja. Cancelar, portanto, nao estorna nada,
-- nao mexe em reserva e nao gera movimentacoes_estoque. E um encerramento
-- puramente administrativo.
--
-- IMPACTO SE ALTERADO/REMOVIDO: sem 'cancelado' no CHECK, o UPDATE da API
-- falha e o botao Cancelar quebra (23514). Sem motivo_cancelamento, perde-se a
-- visibilidade de POR QUE as consultoras desistem — que e o motivo de o campo
-- ser obrigatorio na API.
--
-- Segue a Database Safety do CLAUDE.md: ADD COLUMN IF NOT EXISTS (nada e
-- removido) e o CHECK e recriado por DROP/ADD porque Postgres nao tem
-- "CREATE OR REPLACE CONSTRAINT" — a janela e atomica dentro da transacao e o
-- conjunto novo e um SUPERSET do antigo, entao nenhuma linha existente viola.

BEGIN;

-- Colunas do cancelamento. Ficam NULL em toda solicitacao nao cancelada.
ALTER TABLE alissonerp.solicitacoes_peca
  ADD COLUMN IF NOT EXISTS cancelado_por_id    UUID,        -- quem clicou em cancelar
  ADD COLUMN IF NOT EXISTS cancelado_em        TIMESTAMPTZ, -- quando
  ADD COLUMN IF NOT EXISTS motivo_cancelamento TEXT;        -- por que (obrigatorio pela API)

-- CHECK do status: acrescenta 'cancelado' ao conjunto ja existente.
-- Superset do anterior => as 84 linhas em prod continuam validas.
ALTER TABLE alissonerp.solicitacoes_peca
  DROP CONSTRAINT IF EXISTS chk_solic_peca_status;

ALTER TABLE alissonerp.solicitacoes_peca
  ADD CONSTRAINT chk_solic_peca_status CHECK (
    status IN ('solicitado','entregue','recebido','volta_solicitada','finalizado','cancelado')
  );

-- Blindagem: se esta cancelado, o motivo TEM que existir. Impede que uma
-- escrita manual (ou uma API futura) crie um cancelamento sem justificativa e
-- deixe um buraco no historico. NOT VALID: a regra vale para toda escrita nova,
-- sem varrer as linhas antigas (nenhuma esta cancelada hoje, mas NOT VALID
-- mantem o ALTER instantaneo e sem lock de leitura da tabela inteira).
ALTER TABLE alissonerp.solicitacoes_peca
  DROP CONSTRAINT IF EXISTS chk_solic_peca_cancelado_motivo;

ALTER TABLE alissonerp.solicitacoes_peca
  ADD CONSTRAINT chk_solic_peca_cancelado_motivo CHECK (
    status <> 'cancelado'
    OR (motivo_cancelamento IS NOT NULL AND btrim(motivo_cancelamento) <> '')
  ) NOT VALID;

COMMIT;
