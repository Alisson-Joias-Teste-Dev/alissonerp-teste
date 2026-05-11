-- Personalização de produto com MÚLTIPLOS campos configuráveis.
--
-- Antes: 1 produto = 1 campo (gravação de letras), com UNIQUE(produto_id).
-- Agora: 1 produto = N campos. Cada campo tem nome livre, tipo, validações
-- e (opcionalmente) preço/peso extra. Campos do tipo seleção têm opções em
-- tabela separada com preço/peso por opção.
--
-- Os 11 registros existentes (gravação de letras) continuam funcionando — só
-- ganham `ordem=0` e o tipo "nome" continua válido.

-- 1. Remover UNIQUE(produto_id) pra permitir múltiplos campos
ALTER TABLE alissonerp.produto_personalizacao
  DROP CONSTRAINT IF EXISTS produto_personalizacao_produto_id_key;

-- 2. Coluna `ordem` pra ordenar campos no formulário
ALTER TABLE alissonerp.produto_personalizacao
  ADD COLUMN IF NOT EXISTS ordem INTEGER NOT NULL DEFAULT 0;

-- 3. Min/max valor pra campos numéricos
ALTER TABLE alissonerp.produto_personalizacao
  ADD COLUMN IF NOT EXISTS min_valor NUMERIC,
  ADD COLUMN IF NOT EXISTS max_valor NUMERIC;

-- 4. Preço/peso extra fixo (somado quando campo preenchido).
--    Convive com `preco_por_letra`/`peso_por_letra` legados (texto).
--    Para tipos seleção, o extra fica nas opções (mais granular).
ALTER TABLE alissonerp.produto_personalizacao
  ADD COLUMN IF NOT EXISTS preco_extra NUMERIC,
  ADD COLUMN IF NOT EXISTS peso_extra  NUMERIC;

-- 5. Expandir constraint de `tipo` pra aceitar os novos valores.
ALTER TABLE alissonerp.produto_personalizacao
  DROP CONSTRAINT IF EXISTS produto_personalizacao_tipo_check;

ALTER TABLE alissonerp.produto_personalizacao
  ADD CONSTRAINT produto_personalizacao_tipo_check
  CHECK (tipo IN (
    -- Legados (continuam funcionando — todos viram "texto" na UI nova)
    'nome', 'iniciais', 'simbolo', 'livre',
    -- Novos tipos
    'texto', 'numero', 'selecao_unica', 'selecao_multipla',
    'data'  -- ainda não exposto na UI mas mantido por compat (já era válido)
  ));

-- 6. Tabela de opções (pra selecao_unica e selecao_multipla)
CREATE TABLE IF NOT EXISTS alissonerp.produto_personalizacao_opcao (
  id          SERIAL PRIMARY KEY,
  campo_id    INTEGER NOT NULL REFERENCES alissonerp.produto_personalizacao(id) ON DELETE CASCADE,
  ordem       INTEGER NOT NULL DEFAULT 0,
  valor       VARCHAR(120) NOT NULL,        -- texto exibido (ex: "Azul")
  preco_extra NUMERIC,                      -- soma ao preço se selecionada
  peso_extra  NUMERIC,                      -- soma ao peso se selecionada
  ativo       BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campo_id, valor)
);
CREATE INDEX IF NOT EXISTS idx_personalizacao_opcao_campo
  ON alissonerp.produto_personalizacao_opcao (campo_id, ordem);

-- 7. Tabela de valores preenchidos por item de venda
--    Snapshot — guarda o estado do campo no momento da venda. Mesmo se o
--    produto for editado depois, a venda preserva o que foi pedido.
CREATE TABLE IF NOT EXISTS alissonerp.itens_venda_personalizacao (
  id              SERIAL PRIMARY KEY,
  item_venda_id   INTEGER NOT NULL,           -- FK fraca pra alissonerp.itens_venda_erp.id
  campo_id        INTEGER REFERENCES alissonerp.produto_personalizacao(id) ON DELETE SET NULL,
  -- Snapshots (resilientes a edição/exclusão do campo original)
  nome_campo      VARCHAR(120) NOT NULL,
  tipo            VARCHAR(40)  NOT NULL,
  -- Valores (apenas o relevante pro tipo é preenchido)
  valor_texto     TEXT,
  valor_numero    NUMERIC,
  valores_selec   JSONB,                      -- array de strings pra selecao_*
  -- Snapshots de extras aplicados
  preco_extra     NUMERIC,
  peso_extra      NUMERIC,
  ordem           INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_itens_venda_personalizacao_item
  ON alissonerp.itens_venda_personalizacao (item_venda_id, ordem);

-- 8. Comentários explicativos
COMMENT ON TABLE alissonerp.produto_personalizacao IS
  'Campos personalizáveis configurados por produto (1:N). Tipos: texto/numero/selecao_unica/selecao_multipla.';
COMMENT ON TABLE alissonerp.produto_personalizacao_opcao IS
  'Opções dos campos do tipo seleção (única ou múltipla). Cada opção pode ter preço/peso extra.';
COMMENT ON TABLE alissonerp.itens_venda_personalizacao IS
  'Valores preenchidos pelo cliente/consultora durante a venda. Snapshot — guarda nome+tipo+extras pra preservar histórico.';
