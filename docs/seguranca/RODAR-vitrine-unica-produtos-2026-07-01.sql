-- ═══════════════════════════════════════════════════════════════════════════
-- VITRINE ÚNICA DE PRODUTOS — alissonerp.vw_produtos_todos
-- ═══════════════════════════════════════════════════════════════════════════
-- O QUÊ: cria uma view de LEITURA que unifica as duas fontes de produto:
--   (1) alissonerp.produtos_compat  = janela da fonte de verdade (erp_produtos),
--       onde nascem TODOS os produtos novos (inclui os 295 que sumiram das telas)
--   (2) public.produtos             = cópia legada, mas SÓ os produtos que NÃO
--       existem na fonte de verdade (os 106 legados: variações antigas de
--       anéis/alianças). Sem duplicar (WHERE NOT EXISTS).
--
-- POR QUÊ: hoje as telas de produto leem public.produtos (cópia desatualizada) e
--   por isso escondem 295 produtos novos (pedra avulsa, joias recentes). Trocar
--   direto para erp_produtos esconderia os 106 legados que só existem em public.
--   A união mostra TUDO (16.093 ativos) — nada some.
--
-- IMPACTO SE REMOVIDA: as telas que passarem a ler desta view voltam a esconder
--   295 ou 106 produtos. É a fonte única de LEITURA das telas de produto
--   (Produtos, Gestão de Estoque, Nova Venda/busca, Orçamento-pedras, RFID).
--   NÃO afeta escrita: produto continua nascendo em erp_produtos. Site, Tiny e
--   Directus continuam lendo public.produtos (não são tocados).
--
-- MANUTENÇÃO: os campos só-erp (cor_metal, medidas, parent/variação, etc.) vêm
--   NULL para os 106 legados. Se produtos_compat mudar de colunas, recriar esta
--   view (o lado 1 usa SELECT * e o lado 2 mapeia coluna a coluna na mesma ordem).
--
-- Passo intermediário rumo à tabela única alissonerp.produtos (ver
--   docs/levantamento-produtos.md §3.1). Quando a tabela real existir, esta view
--   é trocada por ela.
-- ═══════════════════════════════════════════════════════════════════════════

-- Assinatura obrigatória (CLAUDE.md) — rastrear quem mexeu no banco de produção
SELECT alissonerp.assinar_mudanca_banco(
  'chefe',
  'claude-code',
  'Cria view alissonerp.vw_produtos_todos: une erp_produtos (fonte verdade, +295) com os 106 legados de public.produtos, sem duplicar. Fonte unica de leitura das telas de produto.',
  'CREATE OR REPLACE VIEW alissonerp.vw_produtos_todos AS SELECT * FROM alissonerp.produtos_compat UNION ALL SELECT <63 colunas mapeadas> FROM public.produtos pp WHERE NOT EXISTS (SELECT 1 FROM alissonerp.erp_produtos e WHERE e.produto_id = pp.id_produto)'
);

CREATE OR REPLACE VIEW alissonerp.vw_produtos_todos AS
-- Lado 1: fonte de verdade (erp_produtos via produtos_compat) — todos os produtos do ERP novo
SELECT * FROM alissonerp.produtos_compat
UNION ALL
-- Lado 2: só os legados que existem APENAS na cópia antiga (não duplica o que já está no ERP)
SELECT
  NULL::integer,      -- id (serial de erp_produtos) — legado não tem
  pp.id_produto,      -- produto_id
  pp.sku,
  pp.nome,
  NULL::varchar,      -- parent_sku
  NULL::integer,      -- parent_id
  NULL::boolean,      -- eh_variacao (legado sem flag; aparece como item normal)
  NULL::boolean,      -- eh_pai
  NULL::varchar,      -- sufixo_variacao
  NULL::varchar,      -- numeracao
  NULL::varchar,      -- cor_metal
  NULL::numeric,      -- comprimento
  NULL::numeric,      -- largura_aro
  NULL::numeric,      -- altura_aro
  NULL::numeric,      -- base
  NULL::text,         -- observacao_erp
  (pp.situacao = 'A'),-- ativo (derivado da situacao)
  NULL::timestamptz,  -- date_created
  NULL::timestamptz,  -- date_updated
  NULL::varchar,      -- fornecedor
  NULL::numeric,      -- preco_servico
  pp.id_api_produto,
  pp.tipo_metal,
  pp.tipo,
  pp.situacao,
  pp.unidade,
  pp.gtin,
  pp.categoria,
  pp.marca,
  pp.qtd_estoque,
  pp.estoque_minimo,
  pp.estoque_maximo,
  pp.sob_encomenda,
  pp.prazo_producao,
  pp.peso_precificado,
  pp.peso_real,
  pp.markup,
  pp.fator,
  pp.preco_tiny,
  pp.preco_promocional,
  pp.preco_custo,
  pp.preco_custo_medio,
  pp.preco_na_cotacao,
  pp.custo_na_cotacao,
  pp.preco_sync,
  pp.diferenca_percentual,
  pp.data_atualizacao_preco,
  pp.categoria_precificacao,
  pp.tem_pedra_preciosa,
  pp.tipo_de_pedra,
  pp.preco_pedras,
  pp.preco_total_sync,
  pp.imagem,
  pp.imagem_capa,
  pp.url_drive,
  pp.iframe,
  pp.prompt_imagem_ia,
  pp.fornecedor_etl,
  pp.fornecedor_id_api,
  pp.id_kommo,
  pp.data_ultima_compra,
  pp.data_atualizacao,
  pp.id_produto      -- id_produto (alias final, igual produtos_compat)
FROM public.produtos pp
WHERE NOT EXISTS (
  SELECT 1 FROM alissonerp.erp_produtos e WHERE e.produto_id = pp.id_produto
);

-- Conferência pós-criação (deve retornar ~16.093 ativos, 0 duplicatas):
-- SELECT COUNT(*) total, COUNT(DISTINCT id_produto) distintos
-- FROM alissonerp.vw_produtos_todos WHERE situacao='A';
