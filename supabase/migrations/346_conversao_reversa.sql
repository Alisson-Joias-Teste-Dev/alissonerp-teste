-- Migration 346: Conversão Reversa (ouro/metal → joia acabada, retirando do cofre)
-- ─────────────────────────────────────────────────────────────────────────────
-- O QUÊ:
--   Cria a estrutura de dados para a "Conversão Reversa": o caminho inverso da
--   Conversão de Estoque (migration 242). Em vez de uma peça de estoque virar
--   metal (entrando no cofre), a Conversão Reversa tira metal já registrado no
--   cofre (de uma conversão anterior ou de uma compra de metal) e o transforma
--   de volta em uma peça pronta, dando ENTRADA no estoque comercial.
--
-- PORQUÊ:
--   O cofre de ouro acumula saldo vindo de conversões (tipo 'conversao') e de
--   compras de metal (tipo 'compra_metal'). Quando esse metal é usado para
--   fabricar/liberar uma peça pronta para a loja, é preciso: (1) abrir uma
--   ordem de tipo 'conversao_reversa' vinculada à origem do metal, (2) criar
--   tarefa de aprovação (mesmo padrão da conversão normal), (3) na aprovação,
--   registrar uma BAIXA no cofre (destino='estoque', novo valor) e uma ENTRADA
--   em movimentacoes_estoque_comercial para o produto final.
--
-- IMPACTO SE REMOVIDO:
--   Fica impossível abrir/rastrear ordens de conversão reversa; a Fase 2
--   (fluxo de aprovação/baixa) desta feature não tem onde persistir dados.
--
-- ROLLBACK (documentado, não é trivial):
--   - DROP TRIGGER trg_criar_tarefa_conversao_reversa ON alissonerp.conversoes_reversas;
--   - DROP FUNCTION alissonerp.fn_processar_conversao_reversa();
--   - DROP TABLE alissonerp.conversoes_reversas; (perde qualquer dado já gravado)
--   - Reverter os CASE das views (vw_ordens_completa/vw_ordens_por_tipo/
--     vw_ordem_detalhe) para a versão sem o WHEN 'conversao_reversa' (basta
--     rodar CREATE OR REPLACE VIEW novamente sem essa linha).
--   - Remover 'estoque' do CHECK de cofre_ouro_baixas.destino: recriar a
--     constraint só com ('alisson','fabrica','service') — SÓ FAZER se nenhuma
--     linha em cofre_ouro_baixas já usa destino='estoque' (senão a constraint
--     não aplica e/ou existem dados órfãos).
--   - Remover valor de enum (enum_tipo_ordem 'conversao_reversa') NÃO é
--     suportado pelo Postgres de forma simples (não existe DROP VALUE) —
--     precisaria recriar o tipo inteiro. Não fazer isso a não ser que seja
--     estritamente necessário.
-- ─────────────────────────────────────────────────────────────────────────────

SET search_path TO alissonerp;

-- ════════════════════════════════════════════════════════════
-- PARTE 1 — ALTER TYPE (roda FORA de transação/isolado — ver
-- instruções de aplicação; ADD VALUE não pode ser usado na mesma
-- transação em que foi criado)
-- ════════════════════════════════════════════════════════════

-- REGRA DE NEGÓCIO: 'conversao_reversa' é o tipo de ordem que representa a
-- retirada de metal do cofre para virar peça pronta (fluxo inverso da
-- 'conversao'). Sem esse valor no enum não é possível criar a ordem.
ALTER TYPE alissonerp.enum_tipo_ordem ADD VALUE IF NOT EXISTS 'conversao_reversa';

-- ════════════════════════════════════════════════════════════
-- PARTE 2 — RESTANTE DA MIGRATION (roda em transação única)
-- ════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────
-- 2.1 cofre_ouro_baixas.destino — adicionar valor 'estoque'
-- REGRA DE NEGÓCIO: destino hoje descreve PARA QUEM a baixa do cofre vai
-- ('alisson','fabrica','service' — pessoas/rotas físicas). A conversão
-- reversa não manda o metal para uma pessoa: ela o transforma em peça e
-- manda para o ESTOQUE comercial. Precisa de um destino próprio para não
-- forçar um valor que não representa a realidade (relatórios de cofre
-- ficariam errados se usássemos 'fabrica' por exemplo).
-- IMPACTO SE REMOVIDO: a baixa da conversão reversa não pode ser registrada
-- (INSERT falha na constraint).
-- ────────────────────────────────────────────────────────────
ALTER TABLE alissonerp.cofre_ouro_baixas
  DROP CONSTRAINT IF EXISTS cofre_ouro_baixas_destino_check;

ALTER TABLE alissonerp.cofre_ouro_baixas
  ADD CONSTRAINT cofre_ouro_baixas_destino_check
  CHECK (destino::text = ANY (ARRAY[
    'alisson'::character varying,
    'fabrica'::character varying,
    'service'::character varying,
    'estoque'::character varying
  ]::text[]));

-- ────────────────────────────────────────────────────────────
-- 2.2 cofre_ouro_baixa_itens.origem_tipo — NADA A FAZER
-- A baixa de uma conversão reversa referencia a ORIGEM ORIGINAL do metal
-- (uma 'conversao' ou uma 'compra_metal'), que já são valores aceitos pela
-- constraint cofre_ouro_baixa_itens_origem_tipo_check. Não é necessário
-- (e não é correto) adicionar 'conversao_reversa' aqui.
-- ────────────────────────────────────────────────────────────

-- ────────────────────────────────────────────────────────────
-- 2.3 movimentacoes_estoque_comercial.motivo — NADA A FAZER
-- Coluna é VARCHAR livre (sem CHECK/enum na coluna motivo). O motivo
-- 'entrada_conversao_reversa' pode ser usado livremente pela Fase 2 sem
-- alteração de schema.
-- ────────────────────────────────────────────────────────────

-- ────────────────────────────────────────────────────────────
-- 2.4 TABELA: conversoes_reversas (cabeçalho da conversão reversa)
-- REGRA DE NEGÓCIO: uma linha por ordem de conversão reversa. origem_tipo/
-- origem_id apontam (sem FK, mesmo padrão de cofre_ouro_baixa_itens) para a
-- conversoes_estoque ou compras_metal que originou o metal usado. baixa_id e
-- movimento_entrada_id só são preenchidos na APROVAÇÃO (Fase 2) — antes disso
-- ficam NULL porque a ordem ainda está pendente.
-- IMPACTO SE REMOVIDO: nenhuma ordem de conversão reversa pode ser aberta.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alissonerp.conversoes_reversas (
  id                    SERIAL PRIMARY KEY,
  ordem_id              INTEGER NOT NULL REFERENCES alissonerp.ordens(id),
  origem_tipo           VARCHAR(20) NOT NULL
                        CHECK (origem_tipo IN ('conversao','compra_metal')),
  origem_id             INTEGER NOT NULL,
  produto_id            BIGINT NOT NULL REFERENCES public.produtos(id_produto),
  quantidade            NUMERIC(10,3) NOT NULL CHECK (quantidade > 0),
  peso_saida            NUMERIC(10,3) NOT NULL CHECK (peso_saida > 0),
  foto_abertura         TEXT,
  foto_recusa           TEXT,
  motivo                TEXT,
  motivo_recusa         TEXT,
  status_conversao      VARCHAR(20) NOT NULL DEFAULT 'pendente'
                        CHECK (status_conversao IN ('pendente','concluido','recusado')),
  baixa_id              INTEGER REFERENCES alissonerp.cofre_ouro_baixas(id),
  movimento_entrada_id  INTEGER REFERENCES alissonerp.movimentacoes_estoque_comercial(id),
  created_by            UUID REFERENCES auth.users(id),
  aprovado_por          UUID REFERENCES auth.users(id),
  aprovado_em           TIMESTAMPTZ,
  recusado_por          UUID REFERENCES auth.users(id),
  recusado_em           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversoes_reversas_ordem  ON alissonerp.conversoes_reversas(ordem_id);
CREATE INDEX IF NOT EXISTS idx_conversoes_reversas_status ON alissonerp.conversoes_reversas(status_conversao);
CREATE INDEX IF NOT EXISTS idx_conversoes_reversas_origem ON alissonerp.conversoes_reversas(origem_tipo, origem_id);

-- ────────────────────────────────────────────────────────────
-- 2.5 TRIGGER updated_at — mesmo padrão de fn_updated_at_conversoes (242)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION alissonerp.fn_updated_at_conversoes_reversas()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_updated_at_conversoes_reversas ON alissonerp.conversoes_reversas;
CREATE TRIGGER trg_updated_at_conversoes_reversas
  BEFORE UPDATE ON alissonerp.conversoes_reversas
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_updated_at_conversoes_reversas();

-- ────────────────────────────────────────────────────────────
-- 2.6 FUNÇÃO: fn_processar_conversao_reversa
-- Trigger AFTER INSERT em conversoes_reversas.
-- REGRA DE NEGÓCIO: copia o padrão EXATO de fn_processar_conversao (242) —
-- toda conversão (nos dois sentidos) abre uma tarefa 'aguardando_aprovacao'
-- para o Alisson aprovar antes de qualquer baixa/entrada acontecer.
-- IMPACTO SE REMOVIDO: a ordem de conversão reversa fica criada mas sem
-- tarefa de aprovação — ninguém é notificado para aprovar/recusar.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION alissonerp.fn_processar_conversao_reversa()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_ordem     RECORD;
  v_produto   RECORD;
  v_origem_lb TEXT;
BEGIN
  SELECT numero_ordem, created_by INTO v_ordem
  FROM alissonerp.ordens WHERE id = NEW.ordem_id;

  SELECT p.nome, p.sku INTO v_produto
  FROM public.produtos p WHERE p.id_produto = NEW.produto_id;

  v_origem_lb := CASE NEW.origem_tipo
    WHEN 'conversao'     THEN 'conversão'
    WHEN 'compra_metal'  THEN 'compra de metal'
    ELSE NEW.origem_tipo
  END;

  INSERT INTO alissonerp.tarefas (
    titulo, descricao, responsavel_id, criado_por,
    prioridade, status, tipo, ordem_id, tags
  ) VALUES (
    'Aprovação de Conversão Reversa — Ordem ' || COALESCE(v_ordem.numero_ordem, '#' || NEW.ordem_id),
    '🔁 **Conversão Reversa — Metal do Cofre para Peça Pronta**' || E'\n\n' ||
    'Conversão reversa ' || COALESCE(v_ordem.numero_ordem, '#' || NEW.ordem_id) || ': ' ||
    COALESCE(v_produto.nome, 'Produto #' || NEW.produto_id) ||
    ' (SKU: ' || COALESCE(v_produto.sku, 'N/D') || ') — ' ||
    NEW.peso_saida || 'g x ' || NEW.quantidade || E'\n' ||
    'Saindo do cofre (origem: ' || v_origem_lb || ' #' || NEW.origem_id || ')' || E'\n\n' ||
    '🔴 **Aprovação necessária para liberar a baixa do cofre e a entrada no estoque.**' || E'\n' ||
    '✅ **Aprovar** → baixa o metal do cofre e dá entrada na peça no estoque' || E'\n' ||
    '❌ **Rejeitar** → nenhuma movimentação é feita',
    COALESCE(
      (SELECT id FROM alissonerp.usuarios WHERE role = 'admin' AND email LIKE '%alisson%' LIMIT 1),
      (SELECT id FROM alissonerp.usuarios WHERE role = 'admin' LIMIT 1)
    ),
    NEW.created_by,
    'alta',
    'aguardando_aprovacao',
    'conversao_reversa',
    NEW.ordem_id,
    ARRAY['conversao_reversa', 'estoque', 'cofre', 'aprovacao']
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_criar_tarefa_conversao_reversa ON alissonerp.conversoes_reversas;
CREATE TRIGGER trg_criar_tarefa_conversao_reversa
  AFTER INSERT ON alissonerp.conversoes_reversas
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_processar_conversao_reversa();

-- ────────────────────────────────────────────────────────────
-- 2.7 GRANTS — mesmo padrão da migration 242
-- ────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE ON alissonerp.conversoes_reversas TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE alissonerp.conversoes_reversas_id_seq TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 2.8 LABELS de tipo_ordem — adicionar 'Conversão Reversa' só nas views
-- que já rotulam 'conversao_sku' (mesmo conjunto tocado pela migration 253).
-- Usa CREATE OR REPLACE VIEW (não DROP+CREATE) para preservar GRANTs e
-- objetos dependentes — só acrescenta um WHEN a mais no CASE, sem mudar
-- colunas/tipos/ordem. NÃO tocar vw_ordens_prontas_ida (conversão reversa
-- nunca vai para protocolo) nem nenhuma view de saldo do cofre.
-- ────────────────────────────────────────────────────────────

-- 2.8.1 vw_ordens_completa
CREATE OR REPLACE VIEW alissonerp.vw_ordens_completa AS
SELECT o.id,
    o.numero_ordem,
    o.numero_pedido,
    o.venda_id,
    o.situacao::text AS situacao_cod,
        CASE o.situacao::text
            WHEN 'cancelado' THEN 'Cancelado'
            WHEN 'criado'    THEN 'Criado'
            WHEN 'rascunho'  THEN 'Rascunho'
            ELSE 'Desconhecido'
        END AS situacao,
    o.status::text AS status_cod,
        CASE o.status::text
            WHEN 'aguardando'   THEN 'Aguardando'
            WHEN 'em_andamento' THEN 'Em Andamento'
            WHEN 'concluido'    THEN 'Concluído'
            WHEN 'cancelado'    THEN 'Cancelado'
            ELSE 'Desconhecido'
        END AS status,
    o.rota::text AS rota_cod,
        CASE o.rota::text
            WHEN 'pcp'       THEN 'PCP'
            WHEN 'protocolo' THEN 'Protocolo'
            ELSE '—'
        END AS rota,
    o.tipo_ordem::text AS tipo_ordem_cod,
        CASE o.tipo_ordem::text
            WHEN 'servico_venda'      THEN 'Serviço Venda'
            WHEN 'servico_loja'       THEN 'Serviço Loja'
            WHEN 'fabricacao'         THEN 'Fabricação'
            WHEN 'reposicao_venda'    THEN 'Reposição Venda'
            WHEN 'reposicao_loja'     THEN 'Reposição Loja'
            WHEN 'compra_fornecedor'  THEN 'Compra de Fornecedor'
            WHEN 'garantia'           THEN 'Garantia'
            WHEN 'servico_interno'    THEN 'Serviço Interno'
            WHEN 'conversao'          THEN 'Conversão Estoque'
            WHEN 'conversao_sku'      THEN 'Conversão SKU'
            WHEN 'conversao_reversa'  THEN 'Conversão Reversa'
            ELSE '—'
        END AS tipo_ordem,
    o.setor_atual AS setor_id,
    s.nome AS setor_nome,
    o.local_atual AS deposito_id,
    d.nome AS deposito_nome,
    o.vendedor_id,
    v.nome AS vendedor_nome,
    o.cliente_id,
    c.nome AS cliente_nome,
    o.peso_metal_negociado,
    o.peso_metal_externo,
    o.data_entrega,
    o.data_conclusao,
    o.distribuicao_id,
    o.protocolo_loja,
    o.id_asana,
    o.created_at AS date_created,
    o.updated_at AS date_updated
FROM alissonerp.ordens o
LEFT JOIN alissonerp.setores s ON s.id = o.setor_atual
LEFT JOIN alissonerp.depositos d ON d.id = o.local_atual
LEFT JOIN vendedores v ON v.id_vendedor = o.vendedor_id
LEFT JOIN contatos c ON c.id_contato = o.cliente_id;

-- 2.8.2 vw_ordens_por_tipo
CREATE OR REPLACE VIEW alissonerp.vw_ordens_por_tipo AS
SELECT
    CASE o.tipo_ordem::text
        WHEN 'servico_venda'      THEN 'Serviço Venda'
        WHEN 'servico_loja'       THEN 'Serviço Loja'
        WHEN 'fabricacao'         THEN 'Fabricação'
        WHEN 'reposicao_venda'    THEN 'Reposição Venda'
        WHEN 'reposicao_loja'     THEN 'Reposição Loja'
        WHEN 'compra_fornecedor'  THEN 'Compra de Fornecedor'
        WHEN 'garantia'           THEN 'Garantia'
        WHEN 'servico_interno'    THEN 'Serviço Interno'
        WHEN 'conversao'          THEN 'Conversão Estoque'
        WHEN 'conversao_sku'      THEN 'Conversão SKU'
        WHEN 'conversao_reversa'  THEN 'Conversão Reversa'
        ELSE 'N/D'
    END AS tipo,
    COUNT(*) AS total
FROM alissonerp.ordens o
WHERE o.created_at > NOW() - INTERVAL '6 months'
GROUP BY o.tipo_ordem
ORDER BY COUNT(*) DESC;

-- 2.8.3 vw_ordem_detalhe
CREATE OR REPLACE VIEW alissonerp.vw_ordem_detalhe AS
SELECT o.id,
    o.numero_ordem,
    o.numero_pedido,
    o.situacao::text AS situacao_cod,
        CASE o.situacao::text
            WHEN 'cancelado' THEN 'Cancelado'
            WHEN 'criado'    THEN 'Criado'
            WHEN 'rascunho'  THEN 'Rascunho'
            ELSE 'Desconhecido'
        END AS situacao,
    o.status::text AS status_cod,
        CASE o.status::text
            WHEN 'aguardando'   THEN 'Aguardando'
            WHEN 'em_andamento' THEN 'Em Andamento'
            WHEN 'concluido'    THEN 'Concluído'
            WHEN 'cancelado'    THEN 'Cancelado'
            ELSE 'Desconhecido'
        END AS status,
    o.rota::text AS rota_cod,
        CASE o.rota::text
            WHEN 'pcp'       THEN 'PCP'
            WHEN 'protocolo' THEN 'Protocolo'
            ELSE '—'
        END AS rota,
    o.tipo_ordem::text AS tipo_ordem_cod,
        CASE o.tipo_ordem::text
            WHEN 'servico_venda'      THEN 'Serviço Venda'
            WHEN 'servico_loja'       THEN 'Serviço Loja'
            WHEN 'fabricacao'         THEN 'Fabricação'
            WHEN 'reposicao_venda'    THEN 'Reposição Venda'
            WHEN 'reposicao_loja'     THEN 'Reposição Loja'
            WHEN 'compra_fornecedor'  THEN 'Compra de Fornecedor'
            WHEN 'garantia'           THEN 'Garantia'
            WHEN 'servico_interno'    THEN 'Serviço Interno'
            WHEN 'conversao'          THEN 'Conversão Estoque'
            WHEN 'conversao_sku'      THEN 'Conversão SKU'
            WHEN 'conversao_reversa'  THEN 'Conversão Reversa'
            ELSE '—'
        END AS tipo_ordem,
    o.setor_atual AS setor_id,
    s.nome AS setor_nome,
    o.local_atual AS deposito_id,
    d.nome AS deposito_nome,
    o.vendedor_id,
    v.nome AS vendedor_nome,
    o.cliente_id,
    c.nome AS cliente_nome,
    o.peso_metal_negociado,
    o.peso_metal_externo,
    o.data_entrega,
    o.data_conclusao,
    o.distribuicao_id,
    o.protocolo_loja,
    o.id_asana,
    o.detalhes_ordem,
    o.created_at AS date_created,
    o.updated_at AS date_updated,
    o.foto_peca_servico,
    o.peso_peca_servico,
    o.video_observacao,
    p.id AS pcp_id,
    p.etapas::text AS pcp_etapas_cod,
        CASE p.etapas::text
            WHEN 'novas_ordens' THEN 'Novas Ordens'
            WHEN 'pendencia'    THEN 'Pendência'
            WHEN 'aguardando'   THEN 'Aguardando'
            WHEN 'em_andamento' THEN 'Em Andamento'
            WHEN 'concluido'    THEN 'Concluído'
            WHEN 'cancelado'    THEN 'Cancelado'
            ELSE '—'
        END AS pcp_etapas,
    p.total_metal AS pcp_total_metal,
    p.retorno_metal AS pcp_retorno_metal,
    p.total_pedras_un AS pcp_total_pedras_un,
    p.total_pedras_g AS pcp_total_pedras_g,
    p.total_geral_outros_pesos AS pcp_total_outros,
    p.pmc AS pcp_pmc,
    p.quebra AS pcp_quebra,
    p.porcentagem_de_quebra AS pcp_quebra_pct,
    p.peso_final AS pcp_peso_final,
    p.metal_externo AS pcp_metal_externo,
    p.bloqueado AS pcp_bloqueado,
    p.data_conclusao AS pcp_data_conclusao,
    p.local_atual AS pcp_local_atual,
    COALESCE(NULLIF(TRIM(BOTH FROM up.name), ''), au.email::text, 'Sem operador') AS pcp_operador_nome,
    dist.id AS dist_id,
    dist.setor::text AS dist_setor,
    dist.etapas::text AS dist_etapas_cod,
        CASE dist.etapas::text
            WHEN 'em_andamento' THEN 'Em Andamento'
            WHEN 'concluido'    THEN 'Concluído'
            ELSE NULL
        END AS dist_etapas,
    dist.pmc AS dist_pmc,
    dist.quebra AS dist_quebra,
    dist.porcentagem_de_quebra AS dist_quebra_pct
FROM alissonerp.ordens o
LEFT JOIN alissonerp.setores s ON s.id = o.setor_atual
LEFT JOIN alissonerp.depositos d ON d.id = o.local_atual
LEFT JOIN vendedores v ON v.id_vendedor = o.vendedor_id
LEFT JOIN contatos c ON c.id_contato = o.cliente_id
LEFT JOIN alissonerp.pcp p ON p.ordem_id = o.id
LEFT JOIN auth.users au ON au.id = p.operador
LEFT JOIN user_profiles up ON up.id_user = au.id
LEFT JOIN alissonerp.distribuicoes dist ON dist.id = o.distribuicao_id;
