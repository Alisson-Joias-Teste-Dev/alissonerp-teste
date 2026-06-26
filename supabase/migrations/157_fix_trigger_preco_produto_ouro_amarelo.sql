-- ============================================================
-- Migration 157 — Fix trigger atualizar_preco_produto
-- Problemas corrigidos:
--   1. Trigger só reconhecia tipo_metal='ouro' literal. Após a
--      unificação para 'Ouro Amarelo 18k' (migration 137), o trigger
--      nunca mais calculou preco_sync porque nenhum produto casava
--      com o ELSIF literal 'ouro'.
--   2. Adiciona suporte para 'ouro amarelo', 'ouro branco', 'ouro rose'
--      (todos usam a mesma cotação base do ouro 18k em parametros.ouro).
--   3. Seta fator=1 em produtos ativos com fator NULL (default sensato).
--
-- Segurança:
--   - Função CREATE OR REPLACE (não DROP) mantendo o mesmo nome/args
--   - Lógica interna de cálculo e arredondamento preservada 100%
--   - Só mexe na resolução do tipo_metal (IF/ELSIF inicial)
-- ============================================================

-- ── 1. Fix função atualizar_preco_produto ─────────────────────────────
CREATE OR REPLACE FUNCTION public.atualizar_preco_produto()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    param_record RECORD;
    cotacao_metal NUMERIC;
    novo_custo NUMERIC;
    novo_preco_cotacao NUMERIC;
    novo_preco_sync INT;
    valor_base INT;
    resto NUMERIC;
    tipo_metal_norm TEXT;
BEGIN
    -- Buscar os parâmetros (ouro e prata)
    SELECT ouro, prata_manual INTO param_record FROM public.parametros LIMIT 1;

    -- Normaliza tipo_metal: trim + lowercase
    tipo_metal_norm := LOWER(TRIM(COALESCE(NEW.tipo_metal, '')));

    -- Resolução da cotação:
    --   'ouro', 'ouro amarelo', 'ouro branco', 'ouro rose', 'ouro xxk' → cotação ouro
    --   'prata'                                                          → cotação prata
    --   qualquer outro                                                   → NULL (não calcula)
    IF tipo_metal_norm LIKE '%ouro%' THEN
        cotacao_metal := param_record.ouro;
    ELSIF tipo_metal_norm LIKE '%prata%' THEN
        cotacao_metal := param_record.prata_manual;
    ELSE
        cotacao_metal := NULL;
    END IF;

    -- CONDIÇÃO PRINCIPAL: Verifica se TODOS os dados necessários para o cálculo são válidos.
    IF
        param_record IS NOT NULL AND
        cotacao_metal IS NOT NULL AND cotacao_metal > 0 AND
        NEW.tipo_metal IS NOT NULL AND
        NEW.fator IS NOT NULL AND NEW.fator > 0 AND
        NEW.peso_precificado IS NOT NULL AND NEW.peso_precificado > 0 AND
        NEW.markup IS NOT NULL AND NEW.markup > 0
    THEN
        -- SE TUDO FOR VÁLIDO, executa os cálculos:
        novo_custo := (cotacao_metal * NEW.fator) * NEW.peso_precificado;
        novo_preco_cotacao := novo_custo * NEW.markup;

        -- Lógica de arredondamento customizado
        valor_base := floor(novo_preco_cotacao / 10) * 10;
        resto := novo_preco_cotacao - valor_base;
        IF resto < 5 THEN
            novo_preco_sync := valor_base;
        ELSE
            novo_preco_sync := valor_base + 10;
        END IF;

        -- Atribui os novos valores calculados
        NEW.custo_na_cotacao := novo_custo;
        NEW.preco_na_cotacao := novo_preco_cotacao;
        NEW.preco_sync := novo_preco_sync;

        -- Data de atualização (INSERT sempre; UPDATE só se variação relevante vs preco_tiny)
        IF TG_OP = 'INSERT' AND NEW.preco_sync IS NOT NULL THEN
            NEW.data_atualizacao_preco := now();
        ELSIF TG_OP = 'UPDATE' AND NEW.preco_sync IS NOT NULL AND OLD.preco_tiny IS NOT NULL AND OLD.preco_tiny > 0 THEN
            IF NEW.preco_sync >= (OLD.preco_tiny * 1.02) OR NEW.preco_sync <= (OLD.preco_tiny * 0.95) THEN
                NEW.data_atualizacao_preco := now();
            END IF;
        END IF;

    ELSE
        -- SE QUALQUER DADO FOR INVÁLIDO OU NULO, define todos os campos de resultado como NULL.
        NEW.custo_na_cotacao := NULL;
        NEW.preco_na_cotacao := NULL;
        NEW.preco_sync := NULL;
        NEW.data_atualizacao_preco := NULL;
    END IF;

    RETURN NEW;
END;
$function$;

-- ── 2. Seta fator=1 em produtos ATIVOS com fator NULL ─────────────────
-- (Fator é um multiplicador do custo; default sensato é 1.0 = sem ajuste.)
UPDATE public.produtos
SET fator = 1
WHERE fator IS NULL
  AND situacao = 'A'
  AND peso_precificado IS NOT NULL
  AND peso_precificado > 0;
