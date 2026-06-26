-- Migration 325: Expande fn_sync_erp_to_public_produto para sincronizar todos os campos
--
-- O QUE: Atualiza a funcao de sync erp_produtos -> public.produtos para copiar
--         todas as colunas (antes so sincronizava sku/nome/situacao).
-- POR QUE: O codigo agora escreve em erp_produtos. Os triggers de precificacao em
--           public.produtos precisam dos campos (markup, fator, peso_precificado, etc.)
--           para calcular preco_sync corretamente. Sem isso calcularia com NULL.
-- IMPACTO: public.produtos vira espelho de erp_produtos. FKs de directus/* e public/*
--           continuam integras. Sem loop: so vai de erp->public, nao tem sentido inverso.

CREATE OR REPLACE FUNCTION alissonerp.fn_sync_erp_to_public_produto()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'alissonerp', 'public'
AS $function$
BEGIN
  INSERT INTO public.produtos (
    id_produto, sku, nome, situacao, tipo, unidade,
    tipo_metal, categoria, marca,
    peso_precificado, peso_real, markup, fator,
    preco_tiny, preco_promocional, preco_custo, preco_custo_medio,
    preco_sync, preco_na_cotacao, custo_na_cotacao,
    diferenca_percentual, data_atualizacao_preco, categoria_precificacao,
    tem_pedra_preciosa, tipo_de_pedra, preco_pedras, preco_total_sync,
    imagem, imagem_capa, url_drive, iframe, prompt_imagem_ia,
    fornecedor_etl, fornecedor_id_api, id_api_produto, id_kommo,
    data_ultima_compra, data_atualizacao,
    sob_encomenda, prazo_producao, qtd_estoque, estoque_minimo, estoque_maximo, gtin
  )
  VALUES (
    NEW.produto_id,
    COALESCE(NEW.sku, ''),
    COALESCE(NEW.nome, ''),
    CASE WHEN NEW.ativo THEN 'A' ELSE 'I' END,
    'S', 'UN',
    NEW.tipo_metal, NEW.categoria, NEW.marca,
    NEW.peso_precificado, NEW.peso_real, NEW.markup, NEW.fator,
    NEW.preco_tiny, NEW.preco_promocional, NEW.preco_custo, NEW.preco_custo_medio,
    NEW.preco_sync, NEW.preco_na_cotacao, NEW.custo_na_cotacao,
    NEW.diferenca_percentual, NEW.data_atualizacao_preco, NEW.categoria_precificacao,
    NEW.tem_pedra_preciosa, NEW.tipo_de_pedra, NEW.preco_pedras, NEW.preco_total_sync,
    NEW.imagem, NEW.imagem_capa, NEW.url_drive, NEW.iframe, NEW.prompt_imagem_ia,
    NEW.fornecedor_etl, NEW.fornecedor_id_api, NEW.id_api_produto, NEW.id_kommo,
    NEW.data_ultima_compra, NEW.data_atualizacao,
    NEW.sob_encomenda, NEW.prazo_producao, NEW.qtd_estoque, NEW.estoque_minimo, NEW.estoque_maximo, NEW.gtin
  )
  ON CONFLICT (id_produto) DO UPDATE SET
    sku                    = EXCLUDED.sku,
    nome                   = EXCLUDED.nome,
    situacao               = EXCLUDED.situacao,
    tipo_metal             = EXCLUDED.tipo_metal,
    categoria              = EXCLUDED.categoria,
    marca                  = EXCLUDED.marca,
    peso_precificado       = EXCLUDED.peso_precificado,
    peso_real              = EXCLUDED.peso_real,
    markup                 = EXCLUDED.markup,
    fator                  = EXCLUDED.fator,
    preco_tiny             = EXCLUDED.preco_tiny,
    preco_promocional      = EXCLUDED.preco_promocional,
    preco_custo            = EXCLUDED.preco_custo,
    preco_custo_medio      = EXCLUDED.preco_custo_medio,
    preco_sync             = EXCLUDED.preco_sync,
    preco_na_cotacao       = EXCLUDED.preco_na_cotacao,
    custo_na_cotacao       = EXCLUDED.custo_na_cotacao,
    diferenca_percentual   = EXCLUDED.diferenca_percentual,
    data_atualizacao_preco = EXCLUDED.data_atualizacao_preco,
    categoria_precificacao = EXCLUDED.categoria_precificacao,
    tem_pedra_preciosa     = EXCLUDED.tem_pedra_preciosa,
    tipo_de_pedra          = EXCLUDED.tipo_de_pedra,
    preco_pedras           = EXCLUDED.preco_pedras,
    preco_total_sync       = EXCLUDED.preco_total_sync,
    imagem                 = EXCLUDED.imagem,
    imagem_capa            = EXCLUDED.imagem_capa,
    url_drive              = EXCLUDED.url_drive,
    iframe                 = EXCLUDED.iframe,
    prompt_imagem_ia       = EXCLUDED.prompt_imagem_ia,
    fornecedor_etl         = EXCLUDED.fornecedor_etl,
    fornecedor_id_api      = EXCLUDED.fornecedor_id_api,
    id_api_produto         = EXCLUDED.id_api_produto,
    id_kommo               = EXCLUDED.id_kommo,
    data_ultima_compra     = EXCLUDED.data_ultima_compra,
    data_atualizacao       = EXCLUDED.data_atualizacao,
    sob_encomenda          = EXCLUDED.sob_encomenda,
    prazo_producao         = EXCLUDED.prazo_producao,
    qtd_estoque            = EXCLUDED.qtd_estoque,
    estoque_minimo         = EXCLUDED.estoque_minimo,
    estoque_maximo         = EXCLUDED.estoque_maximo,
    gtin                   = EXCLUDED.gtin;

  INSERT INTO alissonerp.estoque_comercial_config (produto_id, estoque_minimo, ativo)
  VALUES (NEW.produto_id, 0, true)
  ON CONFLICT (produto_id) DO NOTHING;

  RETURN NEW;
END;
$function$;
