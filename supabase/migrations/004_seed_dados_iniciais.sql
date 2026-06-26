-- =============================================
-- MIGRATION 004: SEED DE DADOS INICIAIS
-- Schema: alissonerp
-- =============================================

SET search_path TO alissonerp;

-- Depósitos (ID 1 DEVE ser Almoxarifado Central)
INSERT INTO depositos (id, nome, tipo) VALUES
  (1, 'Almoxarifado Central', 'administrativo'),
  (2, 'Depósito Ourives 1',   'producao'),
  (3, 'Depósito Ourives 2',   'producao'),
  (4, 'Depósito Ourives 3',   'producao'),
  (5, 'Depósito Fundição',    'producao'),
  (6, 'Depósito CNC',         'producao'),
  (7, 'Depósito Laser',       'producao'),
  (8, 'Depósito Banca',       'producao');
SELECT setval('depositos_id_seq', (SELECT MAX(id) FROM depositos));

-- Setores
INSERT INTO setores (nome) VALUES
  ('Fundição'), ('Alianças'), ('CNC'), ('Laser'),
  ('Banca'), ('Tamboreador'), ('EPG');

-- Tipos de apontamento (IDs 1-9 fixos — referenciados nos triggers)
INSERT INTO tipos_apontamento (id, descricao, scope) VALUES
  (1, 'Aditivo de Metal',          'ambos'),
  (2, 'Entrada de Metal',          'ambos'),
  (3, 'Entrada de Pedra',          'ambos'),
  (4, 'Baixa de Insumo',           'pcp'),
  (5, 'Retorno de Metal',          'ambos'),
  (6, 'Retorno de Pedra',          'ambos'),
  (7, 'Ocorrência',                'pcp'),
  (8, 'Entrada Outros Insumos',    'distribuicao'),
  (9, 'Ocorrência Distribuição',   'distribuicao');
SELECT setval('tipos_apontamento_id_seq', (SELECT MAX(id) FROM tipos_apontamento));

-- Categorias de insumo (IDs fixos — usados nos filtros de formulário)
INSERT INTO categorias_insumo (id, nome) VALUES
  (1, 'Metal / Ouro'),
  (2, 'Pedras Preciosas'),
  (3, 'Liga'),
  (4, 'Solda'),
  (5, 'Banho'),
  (6, 'Acabamento'),
  (7, 'Embalagem'),
  (8, 'Outros');
SELECT setval('categorias_insumo_id_seq', (SELECT MAX(id) FROM categorias_insumo));

-- Parâmetros globais (singleton)
INSERT INTO parametros (cotacao_ouro, cotacao_dolar, cotacao_euro, cotacao_prata)
VALUES (398.72, 5.85, 6.32, 4.95);

-- Insumo base: Ouro 18k Amarelo (ID=1 fixo — referenciado nos cálculos de PMC)
INSERT INTO insumos (id, sku, nome, categoria_id, saldo, custo_compra) VALUES
  (1, 'OURO-18K-AM', 'Ouro 18k Amarelo', 1, 127.45, 398.72);
SELECT setval('insumos_id_seq', (SELECT MAX(id) FROM insumos));
