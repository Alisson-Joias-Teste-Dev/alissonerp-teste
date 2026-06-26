# `public` — Funções e Procedures

> 69 entradas | gerado 2026-04-29

## Índice

- [`arredondar_peso_para_cima()`](#arredondar_peso_para_cima)
- [`atualiza_obs_produto()`](#atualiza_obs_produto) 🛡️
- [`atualizar_item_comissao(p_id uuid, p_preco_tabela numeric, p_desconto_percentual numeric, p_desconto_val)`](#atualizar_item_comissao) 🛡️
- [`atualizar_metas_horarias_fortaleza()`](#atualizar_metas_horarias_fortaleza)
- [`atualizar_preco_produto()`](#atualizar_preco_produto) 🛡️
- [`atualizar_saldo_estoque()`](#atualizar_saldo_estoque)
- [`atualizar_total_metal_pcp()`](#atualizar_total_metal_pcp)
- [`buscar_pedido(p_numero_pedido text)`](#buscar_pedido) 🛡️
- [`calcular_diferenca_percentual()`](#calcular_diferenca_percentual) 🛡️
- [`chamar_atualizacao_de_metas_trigger_func()`](#chamar_atualizacao_de_metas_trigger_func)
- [`criar_notificacao_mencao()`](#criar_notificacao_mencao)
- [`crm_adicionar_mensagem(p_conversa_id uuid, p_papel text, p_conteudo text, p_canal_message_id text, p_ti)`](#crm_adicionar_mensagem)
- [`crm_atribuir_vendedor(p_conversa_id uuid, p_vendedor_id bigint)`](#crm_atribuir_vendedor)
- [`crm_buscar_ou_criar_contato_dm(p_canal text, p_canal_id text, p_nome text, p_username text, p_foto_url text, p_)`](#crm_buscar_ou_criar_contato_dm)
- [`crm_criar_conversa_se_necessario(p_canal text, p_canal_thread_id text, p_canal_contato_id text, p_contato_id bigi)`](#crm_criar_conversa_se_necessario)
- [`crm_criar_oportunidade(p_contato_id bigint, p_titulo text, p_funil_id uuid, p_etapa_id uuid, p_vendedor)`](#crm_criar_oportunidade)
- [`crm_marcar_conversa_lida(p_conversa_id uuid)`](#crm_marcar_conversa_lida)
- [`crm_mover_etapa_funil(p_conversa_id uuid, p_etapa_para_id uuid, p_motivo text)`](#crm_mover_etapa_funil)
- [`crm_mover_oportunidade_etapa(p_oportunidade_id uuid, p_etapa_destino_id uuid, p_motivo text)`](#crm_mover_oportunidade_etapa)
- [`crm_processar_webhook_unipile(p_payload jsonb)`](#crm_processar_webhook_unipile) 🛡️
- [`crm_user_eh_admin()`](#crm_user_eh_admin)
- [`crm_user_vendedor_id()`](#crm_user_vendedor_id)
- [`definir_meta_acumulada_inicial()`](#definir_meta_acumulada_inicial)
- [`disparar_atualizacao_produtos()`](#disparar_atualizacao_produtos) 🛡️
- [`disparar_webhook_n8n()`](#disparar_webhook_n8n)
- [`fin_auto_conciliar(p_extrato_id bigint)`](#fin_auto_conciliar)
- [`fn_atualizar_ordem_por_entrega()`](#fn_atualizar_ordem_por_entrega)
- [`fn_gerar_numero_orcamento()`](#fn_gerar_numero_orcamento)
- [`fn_gerar_venda_sequencial()`](#fn_gerar_venda_sequencial)
- [`fn_gerar_venda_sequencial_manual()`](#fn_gerar_venda_sequencial_manual)
- [`fn_inicializar_orcamento()`](#fn_inicializar_orcamento)
- [`fn_proteger_delete_itens_venda()`](#fn_proteger_delete_itens_venda) 🛡️
- [`fn_proteger_preco_itens_venda()`](#fn_proteger_preco_itens_venda)
- [`fn_users_profile_updated_date_column()`](#fn_users_profile_updated_date_column)
- [`gerar_metas_por_hora_final()`](#gerar_metas_por_hora_final)
- [`get_auditoria_completa(data_inicio timestamp without time zone, data_fim timestamp without time zone)`](#get_auditoria_completa)
- [`get_auditoria_operadores(data_inicio timestamp without time zone, data_fim timestamp without time zone)`](#get_auditoria_operadores)
- [`get_auditoria_v4(data_inicio timestamp without time zone, data_fim timestamp without time zone)`](#get_auditoria_v4)
- [`get_consolidado_estoque(data_inicio timestamp without time zone, data_fim timestamp without time zone)`](#get_consolidado_estoque)
- [`get_quebra_por_periodo(data_inicio timestamp without time zone, data_fim timestamp without time zone)`](#get_quebra_por_periodo)
- [`get_saldo_absoluto_cofre()`](#get_saldo_absoluto_cofre)
- [`get_saldo_real_cofre()`](#get_saldo_real_cofre)
- [`handle_new_user()`](#handle_new_user) 🛡️
- [`handle_updated_at()`](#handle_updated_at)
- [`n8n_trigger_function_240c32bc_cedc_46cd_a8e7_e2f6e780268f()`](#n8n_trigger_function_240c32bc_cedc_46cd_a8e7_e2f6e780268f)
- [`n8n_trigger_function_be0584e3_2e2d_424a_b038_a20d0519b999()`](#n8n_trigger_function_be0584e3_2e2d_424a_b038_a20d0519b999)
- [`n8n_trigger_function_e82b0522_503c_44a5_9c54_a4c9e621379d()`](#n8n_trigger_function_e82b0522_503c_44a5_9c54_a4c9e621379d)
- [`notificar_apenas_mudanca_situacao()`](#notificar_apenas_mudanca_situacao)
- [`notificar_mudanca_estoque()`](#notificar_mudanca_estoque)
- [`notificar_n8n_nova_venda()`](#notificar_n8n_nova_venda) 🛡️
- [`notificar_nova_ordem()`](#notificar_nova_ordem) 🛡️
- [`notify_n8n_solicitacao_vale_troca()`](#notify_n8n_solicitacao_vale_troca)
- [`obter_saldo_pote_geral()`](#obter_saldo_pote_geral)
- [`preencher_numero_ordem()`](#preencher_numero_ordem) 🛡️
- [`processar_aprovacao_orcamento()`](#processar_aprovacao_orcamento)
- [`recalcular_diferenca_produto(produto_id integer)`](#recalcular_diferenca_produto) 🛡️
- [`registrar_modificacao_contatos()`](#registrar_modificacao_contatos) 🛡️
- [`registrar_modificacao_produtos()`](#registrar_modificacao_produtos) 🛡️
- [`registrar_mudanca_situacao()`](#registrar_mudanca_situacao)
- [`set_updated_at()`](#set_updated_at)
- [`sync_venda_entregue()`](#sync_venda_entregue)
- [`texto_para_numeric(p_texto text)`](#texto_para_numeric)
- [`unaccent(regdictionary, text)`](#unaccent)
- [`unaccent(text)`](#unaccent)
- [`unaccent_init(internal)`](#unaccent_init)
- [`unaccent_lexize(internal, internal, internal, internal)`](#unaccent_lexize)
- [`update_data_atualizacao()`](#update_data_atualizacao)
- [`update_entregas_updated_at()`](#update_entregas_updated_at)
- [`update_timestamp_columns()`](#update_timestamp_columns)

_🛡️ = SECURITY DEFINER_

---

## arredondar_peso_para_cima

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION public.arredondar_peso_para_cima()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Verifica se a coluna 'peso_precificado' não é nula para evitar erros.
  IF NEW.peso_precificado IS NOT NULL THEN
    -- Aplica a lógica de arredondamento para a próxima dezena superior.
    NEW.peso_precificado := CEIL(NEW.peso_precificado * 10) / 10.0;
  END IF;
  
  -- Retorna a linha modificada para que a operação (INSERT/UPDATE) possa continuar.
  RETURN NEW;
END;
$function$

```

</details>

**Uso no código:**
- `public.arredondar_peso_para_cima` — 5 ocorrência(s)
  - `src/app/(dashboard)/produtos/ProdutosClient.tsx:693`
  - `src/app/api/produtos/pedras-bulk/route.ts:198`
  - `src/app/api/produtos/route.ts:267`
  - `supabase/migrations/173_pedra_peso_ct.sql:5`
  - `supabase/migrations/173_pedra_peso_ct.sql:21`

---

## atualiza_obs_produto

- **Tipo:** FUNCTION (plpgsql) — SECURITY DEFINER
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION public.atualiza_obs_produto()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    payload JSONB;
    changes JSONB;
BEGIN
    -- Verifica se houve alteração em alguma das colunas de interesse
    IF (
        NEW.tipo_metal IS DISTINCT FROM OLD.tipo_metal OR
        NEW.peso_precificado IS DISTINCT FROM OLD.peso_precificado OR
        NEW.fornecedor_etl IS DISTINCT FROM OLD.fornecedor_etl OR
        NEW.tipo_de_pedra IS DISTINCT FROM OLD.tipo_de_pedra
    ) THEN
        -- Inicializa o objeto de alterações
        changes := '{}'::jsonb;

        -- Adiciona ao objeto 'changes' apenas as colunas que foram modificadas
        IF NEW.tipo_metal IS DISTINCT FROM OLD.tipo_metal THEN
            changes := changes ||
                jsonb_build_object('tipo_metal', jsonb_build_object('old', OLD.tipo_metal, 'new', NEW.tipo_metal));
        END IF;

        IF NEW.peso_precificado IS DISTINCT FROM OLD.peso_precificado THEN
            changes := changes ||
                jsonb_build_object('peso_precificado', jsonb_build_object('old', OLD.peso_precificado, 'new', NEW.peso_precificado));
        END IF;

        IF NEW.fornecedor_etl IS DISTINCT FROM OLD.fornecedor_etl THEN
            changes := changes ||
                jsonb_build_object('fornecedor_etl', jsonb_build_object('old', OLD.fornecedor_etl, 'new', NEW.fornecedor_etl));
        END IF;

        IF NEW.tipo_de_pedra IS DISTINCT FROM OLD.tipo_de_pedra THEN
            changes := changes ||
                jsonb_build_object('tipo_de_pedra', jsonb_build_object('old', OLD.tipo_de_pedra, 'new', NEW.tipo_de_pedra));
        END IF;

        -- Constrói o payload final com o id_api_produto
        payload := jsonb_build_object(
            'event_type', 'UPDATE',
            'table', TG_TABLE_NAME,
            'schema', TG_TABLE_SCHEMA,
            'record_id', NEW.id_api_produto,
            'timestamp', now(),
            'changes', changes
        );

        -- Envia o payload via POST para o webhook
        PERFORM net.http_post(
            url := 'https://etl.alissonranyel.com.br/webhook/53f71eda-0259-46fc-8431-546577c2654e',
            body := payload,
            headers := '{"Content-Type": "application/json"}'::jsonb
        );
    END IF;

    RETURN NEW;
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## atualizar_item_comissao

- **Tipo:** FUNCTION (plpgsql) — SECURITY DEFINER
- **Argumentos:** `p_id uuid, p_preco_tabela numeric, p_desconto_percentual numeric, p_desconto_valor numeric, p_comissao_percentual numeric, p_comissao_valor numeric`
- **Retorno:** `json`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION public.atualizar_item_comissao(p_id uuid, p_preco_tabela numeric, p_desconto_percentual numeric, p_desconto_valor numeric, p_comissao_percentual numeric, p_comissao_valor numeric)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  UPDATE alissonerp.itens_vendas SET preco_tabela=p_preco_tabela, desconto_percentual=p_desconto_percentual, desconto_valor=p_desconto_valor, comissao_percentual=p_comissao_percentual, comissao_valor=p_comissao_valor WHERE id=p_id;
  IF NOT FOUND THEN RETURN json_build_object('error','Item não encontrado'); END IF;
  RETURN json_build_object('success', true);
END; $function$

```

</details>

_Sem referência identificada no código._

---

## atualizar_metas_horarias_fortaleza

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `void`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION public.atualizar_metas_horarias_fortaleza()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
    hora_atual_fortaleza TIMESTAMP;
    inicio_do_mes_atual TIMESTAMP;
    fim_do_mes_atual TIMESTAMP;
BEGIN
    hora_atual_fortaleza := date_trunc('hour', NOW() AT TIME ZONE 'America/Fortaleza');
    inicio_do_mes_atual := date_trunc('month', hora_atual_fortaleza);
    
    -- OTIMIZAÇÃO 1: Calculamos o fim do mês para usar um filtro mais rápido.
    fim_do_mes_atual := inicio_do_mes_atual + interval '1 month';

    UPDATE public.metas_por_hora
    SET 
        meta_acumulada = CASE
            WHEN data_hora < hora_atual_fortaleza + interval '1 hour' THEN
                valor_meta
            ELSE -- Futuro
                0
        END
    WHERE 
        -- OTIMIZAÇÃO 2: Este formato de filtro é MUITO mais rápido com um índice.
        data_hora >= inicio_do_mes_atual AND data_hora < fim_do_mes_atual
        
        -- OTIMIZAÇÃO 3 (A MAIS IMPORTANTE): Só atualiza as linhas que REALMENTE precisam mudar.
        -- Isso evita reescrever centenas de linhas que já estão com o valor correto.
        AND meta_acumulada IS DISTINCT FROM (
            CASE
                WHEN data_hora < hora_atual_fortaleza + interval '1 hour' THEN
                    valor_meta
                ELSE
                    0
            END
        );
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## atualizar_preco_produto

- **Tipo:** FUNCTION (plpgsql) — SECURITY DEFINER
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
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
BEGIN
    -- Buscar os parâmetros (ouro e prata)
    SELECT ouro, prata_manual INTO param_record FROM public.parametros LIMIT 1;

    -- Obter a cotação correta baseada no tipo_metal (ignorando maiúsculas/minúsculas)
    IF LOWER(NEW.tipo_metal) = 'ouro' THEN
        cotacao_metal := param_record.ouro;
    ELSIF LOWER(NEW.tipo_metal) = 'prata' THEN
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

        -- =====================================================================
        -- INÍCIO DA LÓGICA DE ATUALIZAÇÃO DE DATA REFINADA
        -- =====================================================================

        -- REGRA 1: Se é uma nova inserção (INSERT) e um preço foi calculado, define a data.
        -- Isso acontece apenas uma vez na vida do produto.
        IF TG_OP = 'INSERT' AND NEW.preco_sync IS NOT NULL THEN
            NEW.data_atualizacao_preco := now();

        -- REGRA 2: Se é uma atualização (UPDATE), a lógica de comparação é sempre aplicada.
        -- Isso cobre tanto o caso onde o preço era NULL quanto o caso onde já tinha um valor.
        ELSIF TG_OP = 'UPDATE' AND NEW.preco_sync IS NOT NULL AND OLD.preco_tiny IS NOT NULL AND OLD.preco_tiny > 0 THEN
            -- Compara o novo preco_sync com o preco_tiny (preço de referência).
            -- A data é atualizada se a variação for >= 2% para cima ou <= 5% para baixo.
            IF NEW.preco_sync >= (OLD.preco_tiny * 1.02) OR NEW.preco_sync <= (OLD.preco_tiny * 0.95) THEN
                NEW.data_atualizacao_preco := now();
            END IF;
        END IF;
        
        -- =====================================================================
        -- FIM DA LÓGICA DE ATUALIZAÇÃO
        -- =====================================================================

    ELSE
        -- SE QUALQUER DADO FOR INVÁLIDO OU NULO, define todos os campos de resultado como NULL.
        NEW.custo_na_cotacao := NULL;
        NEW.preco_na_cotacao := NULL;
        NEW.preco_sync := NULL;
        NEW.data_atualizacao_preco := NULL;
    END IF;

    RETURN NEW;
END;
$function$

```

</details>

**Uso no código:**
- `public.atualizar_preco_produto` — 4 ocorrência(s)
  - `src/app/api/produtos/pedras-bulk/route.ts:9`
  - `src/app/api/produtos/pedras-bulk/route.ts:174`
  - `supabase/migrations/157_fix_trigger_preco_produto_ouro_amarelo.sql:2`
  - `supabase/migrations/157_fix_trigger_preco_produto_ouro_amarelo.sql:18`

---

## atualizar_saldo_estoque

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION public.atualizar_saldo_estoque()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Calcula o saldo somando todas as colunas de estoque
  -- Trata valores NULL como 0 usando COALESCE
  NEW.saldo := ROUND(
      COALESCE(NEW.estoque_loja, 0) +
      COALESCE(NEW.estoque_reposicao_srvc, 0) +
      COALESCE(NEW.estoque_marketing, 0) +
      COALESCE(NEW.estoque_alisson, 0) +  -- <-- CORRIGIDO (1 'L')
      COALESCE(NEW.estoque_dara, 0) +     -- <-- CORRIGIDO (para 'dara')
      COALESCE(NEW.estoque_service, 0) +
      COALESCE(NEW.estoque_fabrica, 0)
  , 0); -- Arredonda para 0 casas decimais para converter para int8

  -- Retorna a linha modificada para ser inserida/atualizada
  RETURN NEW; 
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## atualizar_total_metal_pcp

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION public.atualizar_total_metal_pcp()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$BEGIN
    -- 1. SE FOR UMA INSERÇÃO: Soma apenas o valor novo ao que já existe na coluna
    IF (TG_OP = 'INSERT') THEN
        IF (NEW.insumo = 1 AND NEW.tipo_apontamento IN (1, 2)) THEN
            UPDATE pcp
            SET total_metal = COALESCE(total_metal, 0) + NEW.qtd
            WHERE id = NEW.pcp_id;
        END IF;

    -- 2. SE FOR UMA EXCLUSÃO: Subtrai o valor antigo do total da coluna
    ELSIF (TG_OP = 'DELETE') THEN
        IF (OLD.insumo = 1 AND OLD.tipo_apontamento IN (1, 2)) THEN
            UPDATE pcp
            SET total_metal = COALESCE(total_metal, 0) - OLD.qtd
            WHERE id = OLD.pcp_id;
        END IF;

    -- 3. SE FOR UMA ATUALIZAÇÃO: Ajusta a diferença
    ELSIF (TG_OP = 'UPDATE') THEN
        -- Se o valor mudou, ou se o insumo/tipo mudou, precisamos ajustar o saldo
        
        -- Primeiro, retira o valor antigo (se ele era do Insumo 1)
        IF (OLD.insumo = 1 AND OLD.tipo_apontamento IN (1, 2)) THEN
            UPDATE pcp SET total_metal = COALESCE(total_metal, 0) - OLD.qtd WHERE id = OLD.pcp_id;
        END IF;

        -- Depois, soma o valor novo (se ele for do Insumo 1)
        IF (NEW.insumo = 1 AND NEW.tipo_apontamento IN (1, 2)) THEN
            UPDATE pcp SET total_metal = COALESCE(total_metal, 0) + NEW.qtd WHERE id = NEW.pcp_id;
        END IF;
    END IF;

    RETURN NEW;
END;$function$

```

</details>

_Sem referência identificada no código._

---

## buscar_pedido

- **Tipo:** FUNCTION (plpgsql) — SECURITY DEFINER
- **Argumentos:** `p_numero_pedido text`
- **Retorno:** `json`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION public.buscar_pedido(p_numero_pedido text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE v_venda record; v_itens json;
BEGIN
  SELECT id, numero_pedido INTO v_venda FROM alissonerp.vendas WHERE numero_pedido = p_numero_pedido LIMIT 1;
  IF v_venda IS NULL THEN RETURN json_build_object('error', 'Pedido não encontrado'); END IF;
  SELECT json_agg(row_to_json(t)) INTO v_itens FROM (
    SELECT id, venda_id, descricao, sku, preco_unitario_final::numeric, quantidade::numeric, preco_tabela::numeric, desconto_percentual::numeric, desconto_valor::numeric, comissao_percentual::numeric, comissao_valor::numeric
    FROM alissonerp.itens_vendas WHERE venda_id = v_venda.id ORDER BY id
  ) t;
  RETURN json_build_object('venda', json_build_object('id', v_venda.id, 'numero_pedido', v_venda.numero_pedido), 'itens', COALESCE(v_itens, '[]'::json));
END; $function$

```

</details>

_Sem referência identificada no código._

---

## calcular_diferenca_percentual

- **Tipo:** FUNCTION (plpgsql) — SECURITY DEFINER
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION public.calcular_diferenca_percentual()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    -- Verifica se preco_sync é nulo ou zero para evitar erro de divisão
    IF NEW.preco_sync IS NOT NULL AND NEW.preco_sync > 0 THEN
        -- --- MUDANÇA PRINCIPAL AQUI ---
        -- Usamos ABS() para obter o valor absoluto (sempre positivo) da diferença.
        NEW.diferenca_percentual := (ABS(NEW.preco_tiny - NEW.preco_sync) / NEW.preco_sync) * 100;
    ELSE
        NEW.diferenca_percentual := 0;
    END IF;

    RETURN NEW;
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## chamar_atualizacao_de_metas_trigger_func

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION public.chamar_atualizacao_de_metas_trigger_func()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- Chama a sua função principal que contém toda a lógica.
    PERFORM public.atualizar_metas_horarias_fortaleza();
    
    RETURN NULL; -- O retorno é ignorado para triggers de nível de instrução.
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## criar_notificacao_mencao

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION public.criar_notificacao_mencao()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Insere uma notificação para cada menção criada
  INSERT INTO notificacoes (
    user_id,
    tipo,
    entidade_tipo,
    entidade_id,
    dados_contexto,
    lida
  )
  SELECT
    NEW.user_id_mencionado,
    'mencao_comentario',
    'comentario',
    NEW.comentario_id,
    jsonb_build_object(
      'ordem_id', NEW.ordem_id,
      'comentario_id', NEW.comentario_id,
      'mencao_id', NEW.id,
      'user_id_autor', NEW.user_id_mencionador,
      'preview_texto', COALESCE(LEFT(c.conteudo_texto, 100), '')
    ),
    false
  FROM directus.ordem_comentarios c
  WHERE c.id = NEW.comentario_id
    AND c.deleted_at IS NULL; -- Só cria se o comentário não estiver deletado
  
  RETURN NEW;
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## crm_adicionar_mensagem

- **Tipo:** FUNCTION (sql)
- **Argumentos:** `p_conversa_id uuid, p_papel text, p_conteudo text, p_canal_message_id text, p_tipo_midia text, p_midia_url text, p_midia_storage_path text, p_instagram_media_id text, p_metadata jsonb`
- **Retorno:** `uuid`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION public.crm_adicionar_mensagem(p_conversa_id uuid, p_papel text, p_conteudo text, p_canal_message_id text DEFAULT NULL::text, p_tipo_midia text DEFAULT NULL::text, p_midia_url text DEFAULT NULL::text, p_midia_storage_path text DEFAULT NULL::text, p_instagram_media_id text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE sql
AS $function$
  SELECT crm.adicionar_mensagem(
    p_conversa_id, p_papel, p_conteudo, p_canal_message_id,
    p_tipo_midia, p_midia_url, p_midia_storage_path,
    p_instagram_media_id, p_metadata
  );
$function$

```

</details>

_Sem referência identificada no código._

---

## crm_atribuir_vendedor

- **Tipo:** FUNCTION (sql)
- **Argumentos:** `p_conversa_id uuid, p_vendedor_id bigint`
- **Retorno:** `void`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION public.crm_atribuir_vendedor(p_conversa_id uuid, p_vendedor_id bigint)
 RETURNS void
 LANGUAGE sql
AS $function$
  SELECT crm.atribuir_vendedor(p_conversa_id, p_vendedor_id);
$function$

```

</details>

_Sem referência identificada no código._

---

## crm_buscar_ou_criar_contato_dm

- **Tipo:** FUNCTION (sql)
- **Argumentos:** `p_canal text, p_canal_id text, p_nome text, p_username text, p_foto_url text, p_telefone text`
- **Retorno:** `bigint`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION public.crm_buscar_ou_criar_contato_dm(p_canal text, p_canal_id text, p_nome text, p_username text DEFAULT NULL::text, p_foto_url text DEFAULT NULL::text, p_telefone text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE sql
AS $function$
  SELECT crm.buscar_ou_criar_contato_dm(p_canal, p_canal_id, p_nome, p_username, p_foto_url, p_telefone);
$function$

```

</details>

_Sem referência identificada no código._

---

## crm_criar_conversa_se_necessario

- **Tipo:** FUNCTION (sql)
- **Argumentos:** `p_canal text, p_canal_thread_id text, p_canal_contato_id text, p_contato_id bigint`
- **Retorno:** `uuid`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION public.crm_criar_conversa_se_necessario(p_canal text, p_canal_thread_id text, p_canal_contato_id text, p_contato_id bigint)
 RETURNS uuid
 LANGUAGE sql
AS $function$
  SELECT crm.criar_conversa_se_necessario(p_canal, p_canal_thread_id, p_canal_contato_id, p_contato_id);
$function$

```

</details>

_Sem referência identificada no código._

---

## crm_criar_oportunidade

- **Tipo:** FUNCTION (sql)
- **Argumentos:** `p_contato_id bigint, p_titulo text, p_funil_id uuid, p_etapa_id uuid, p_vendedor_id bigint, p_valor numeric, p_produto_interesse text, p_notas text, p_origem_lead text, p_conversa_id uuid`
- **Retorno:** `uuid`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION public.crm_criar_oportunidade(p_contato_id bigint, p_titulo text, p_funil_id uuid, p_etapa_id uuid DEFAULT NULL::uuid, p_vendedor_id bigint DEFAULT NULL::bigint, p_valor numeric DEFAULT NULL::numeric, p_produto_interesse text DEFAULT NULL::text, p_notas text DEFAULT NULL::text, p_origem_lead text DEFAULT NULL::text, p_conversa_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE sql
AS $function$
  SELECT crm.criar_oportunidade(p_contato_id, p_titulo, p_funil_id, p_etapa_id,
    p_vendedor_id, p_valor, p_produto_interesse, p_notas, p_origem_lead, p_conversa_id);
$function$

```

</details>

_Sem referência identificada no código._

---

## crm_marcar_conversa_lida

- **Tipo:** FUNCTION (sql)
- **Argumentos:** `p_conversa_id uuid`
- **Retorno:** `void`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION public.crm_marcar_conversa_lida(p_conversa_id uuid)
 RETURNS void
 LANGUAGE sql
AS $function$
  SELECT crm.marcar_conversa_lida(p_conversa_id);
$function$

```

</details>

_Sem referência identificada no código._

---

## crm_mover_etapa_funil

- **Tipo:** FUNCTION (sql)
- **Argumentos:** `p_conversa_id uuid, p_etapa_para_id uuid, p_motivo text`
- **Retorno:** `void`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION public.crm_mover_etapa_funil(p_conversa_id uuid, p_etapa_para_id uuid, p_motivo text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE sql
AS $function$
  SELECT crm.mover_etapa_funil(p_conversa_id, p_etapa_para_id, p_motivo);
$function$

```

</details>

_Sem referência identificada no código._

---

## crm_mover_oportunidade_etapa

- **Tipo:** FUNCTION (sql)
- **Argumentos:** `p_oportunidade_id uuid, p_etapa_destino_id uuid, p_motivo text`
- **Retorno:** `void`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION public.crm_mover_oportunidade_etapa(p_oportunidade_id uuid, p_etapa_destino_id uuid, p_motivo text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE sql
AS $function$
  SELECT crm.mover_oportunidade_etapa(p_oportunidade_id, p_etapa_destino_id, p_motivo);
$function$

```

</details>

_Sem referência identificada no código._

---

## crm_processar_webhook_unipile

- **Tipo:** FUNCTION (plpgsql) — SECURITY DEFINER
- **Argumentos:** `p_payload jsonb`
- **Retorno:** `jsonb`
- **Volatility:** VOLATILE
- **Comentário:** Ingestão completa de webhook Unipile sem precisar de service_role. SECURITY DEFINER.

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION public.crm_processar_webhook_unipile(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'crm', 'pg_temp'
AS $function$
DECLARE
  v_log_id uuid;
  v_event text := p_payload->>'event';
  v_account_id text := p_payload->>'account_id';
  v_account_type text := upper(coalesce(p_payload->>'account_type', ''));
  v_chat_id text := p_payload->>'chat_id';
  v_message_id text := coalesce(
    p_payload->>'message_id',
    p_payload->>'provider_message_id',
    'unipile-' || extract(epoch from now())::text
  );
  v_text text := coalesce(p_payload->>'message', p_payload->>'text', '');
  v_is_sender boolean := coalesce(nullif(p_payload->>'is_sender', '')::boolean, false);

  v_sender jsonb := p_payload->'sender';
  v_sender_provider_id text := coalesce(
    v_sender->>'attendee_provider_id',
    v_sender->>'attendee_id'
  );
  v_sender_username text := v_sender->'attendee_specifics'->>'public_identifier';
  v_sender_name text := coalesce(
    v_sender->>'attendee_name',
    v_sender_username,
    'Unipile:' || coalesce(v_sender_provider_id, '?')
  );

  v_attachment jsonb := (p_payload->'attachments')->0;
  v_att_type text := lower(coalesce(v_attachment->>'attachment_type', v_attachment->>'type', ''));
  v_voice_note boolean := coalesce(nullif(v_attachment->>'voice_note', '')::boolean, false);
  v_tipo_midia text;
  v_midia_url text := coalesce(v_attachment->>'attachment_url', v_attachment->>'url');

  v_canal text;
  v_contato_id bigint;
  v_conversa_id uuid;
  v_msg_id uuid;
  v_cfg_account_id text;
BEGIN
  -- LOG (escopo principal — persiste sempre)
  INSERT INTO crm.webhook_log (source, event, payload)
  VALUES ('unipile', v_event, p_payload)
  RETURNING id INTO v_log_id;

  -- ============================================================
  -- BLOCO ANINHADO: processamento (em caso de erro, só ele é revertido)
  -- ============================================================
  BEGIN
    -- Filtros
    IF v_event !~* 'message_(received|created|new)|new_message' THEN
      UPDATE crm.webhook_log SET processado = true, processado_em = now(),
        resultado = jsonb_build_object('ignored', 'event_type')
      WHERE id = v_log_id;
      RETURN jsonb_build_object('ok', true, 'ignored', 'event', 'log_id', v_log_id);
    END IF;

    IF v_is_sender THEN
      UPDATE crm.webhook_log SET processado = true, processado_em = now(),
        resultado = jsonb_build_object('ignored', 'is_sender')
      WHERE id = v_log_id;
      RETURN jsonb_build_object('ok', true, 'ignored', 'is_sender', 'log_id', v_log_id);
    END IF;

    IF v_sender_provider_id IS NULL OR v_sender_provider_id = '' THEN
      UPDATE crm.webhook_log SET processado = true, processado_em = now(),
        resultado = jsonb_build_object('ignored', 'no_sender'), erro = 'sem sender_provider_id'
      WHERE id = v_log_id;
      RETURN jsonb_build_object('ok', true, 'ignored', 'no_sender', 'log_id', v_log_id);
    END IF;

    -- Confere conta cadastrada
    SELECT account_id INTO v_cfg_account_id
    FROM crm.unipile_config WHERE ativo ORDER BY created_at DESC LIMIT 1;

    IF v_cfg_account_id IS NOT NULL AND v_cfg_account_id <> ''
       AND v_account_id IS NOT NULL AND v_cfg_account_id <> v_account_id THEN
      UPDATE crm.webhook_log SET processado = true, processado_em = now(),
        resultado = jsonb_build_object('ignored', 'wrong_account')
      WHERE id = v_log_id;
      RETURN jsonb_build_object('ok', true, 'ignored', 'wrong_account', 'log_id', v_log_id);
    END IF;

    -- Tipo mídia + canal
    v_tipo_midia := CASE
      WHEN v_voice_note THEN 'audio'
      WHEN v_att_type = 'image' THEN 'imagem'
      WHEN v_att_type = 'document' THEN 'documento'
      WHEN v_att_type IN ('audio','video','imagem','documento','sticker') THEN v_att_type
      ELSE NULL
    END;

    v_canal := CASE
      WHEN v_account_type = 'INSTAGRAM' THEN 'instagram_dm'
      WHEN v_account_type IN ('WHATSAPP','WHATSAPP_BUSINESS') THEN 'whatsapp'
      ELSE 'instagram_dm'
    END;

    -- Cria contato + conversa + mensagem
    v_contato_id := crm.buscar_ou_criar_contato_dm(
      v_canal, v_sender_provider_id, v_sender_name, v_sender_username
    );

    v_conversa_id := crm.criar_conversa_se_necessario(
      v_canal,
      coalesce(v_chat_id, v_message_id),
      v_sender_provider_id,
      v_contato_id
    );

    v_msg_id := crm.adicionar_mensagem(
      v_conversa_id, 'user', v_text, v_message_id,
      v_tipo_midia, v_midia_url, NULL, NULL,
      jsonb_build_object('sender', v_sender, 'attachment', v_attachment)
    );

    UPDATE crm.webhook_log SET
      processado = true, processado_em = now(),
      conversa_id = v_conversa_id, mensagem_id = v_msg_id,
      resultado = jsonb_build_object(
        'contato_id', v_contato_id,
        'conversa_id', v_conversa_id,
        'mensagem_id', v_msg_id
      )
    WHERE id = v_log_id;

    RETURN jsonb_build_object(
      'ok', true,
      'log_id', v_log_id,
      'contato_id', v_contato_id,
      'conversa_id', v_conversa_id,
      'mensagem_id', v_msg_id
    );

  EXCEPTION WHEN OTHERS THEN
    -- Erro no bloco de processamento — log permanece
    UPDATE crm.webhook_log SET
      erro = SQLERRM,
      processado = false,
      resultado = jsonb_build_object('exception', SQLERRM, 'state', SQLSTATE)
    WHERE id = v_log_id;

    RETURN jsonb_build_object(
      'ok', false,
      'erro', SQLERRM,
      'log_id', v_log_id
    );
  END;
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## crm_user_eh_admin

- **Tipo:** FUNCTION (sql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `boolean`
- **Volatility:** STABLE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION public.crm_user_eh_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  SELECT crm.user_eh_admin();
$function$

```

</details>

_Sem referência identificada no código._

---

## crm_user_vendedor_id

- **Tipo:** FUNCTION (sql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `bigint`
- **Volatility:** STABLE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION public.crm_user_vendedor_id()
 RETURNS bigint
 LANGUAGE sql
 STABLE
AS $function$
  SELECT crm.user_vendedor_id();
$function$

```

</details>

_Sem referência identificada no código._

---

## definir_meta_acumulada_inicial

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION public.definir_meta_acumulada_inicial()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- CORREÇÃO: A condição agora verifica se a data/hora da NOVA linha é menor
    -- que o INÍCIO DA PRÓXIMA HORA. Isso garante que a hora atual (18:00-18:59)
    -- seja incluída e tratada como 'ativa'.
    -- Exemplo: Às 18:43, o limite é 19:00. O registro de 18:00 é < 19:00, então ele é preenchido.
    IF NEW.data_hora < (date_trunc('hour', NOW() AT TIME ZONE 'America/Fortaleza') + interval '1 hour') THEN
        -- Se for passado OU presente, a meta_acumulada já nasce com o valor da meta.
        NEW.meta_acumulada := NEW.valor_meta;
    ELSE
        -- Se for estritamente futuro, a meta_acumulada já nasce como zero.
        NEW.meta_acumulada := 0;
    END IF;

    -- Retorna a linha modificada para que ela seja salva corretamente na tabela.
    RETURN NEW;
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## disparar_atualizacao_produtos

- **Tipo:** FUNCTION (plpgsql) — SECURITY DEFINER
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION public.disparar_atualizacao_produtos()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    -- Se o valor do ouro mudou, força uma atualização em todos os produtos de ouro.
    IF NEW.ouro IS DISTINCT FROM OLD.ouro THEN
        UPDATE public.produtos
        SET fator = fator -- Atualização 'dummy' para acionar o trigger da tabela produtos
        WHERE LOWER(tipo_metal) = 'ouro';
    END IF;

    -- Se o valor da prata mudou, força uma atualização em todos os produtos de prata.
    IF NEW.prata_manual IS DISTINCT FROM OLD.prata_manual THEN
        UPDATE public.produtos
        SET fator = fator -- Atualização 'dummy'
        WHERE LOWER(tipo_metal) = 'prata';
    END IF;

    RETURN NEW;
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## disparar_webhook_n8n

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION public.disparar_webhook_n8n()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    PERFORM net.http_post(
        url     := 'https://etl.alissonranyel.com.br/webhook/c7a73365-9dd3-4540-9203-b5ee4d8d22c6',
        body    := jsonb_build_object('id_produto', NEW.produto_id),
        headers := '{"Content-Type": "application/json"}'::jsonb
    );
    RETURN NEW;
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## fin_auto_conciliar

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `p_extrato_id bigint`
- **Retorno:** `TABLE(lancamento_id bigint, conta_pagar_id bigint, conta_tiny_id text, status_conciliacao text, diferenca_valor numeric, diferenca_dias integer, data_lancamento date)`
- **Volatility:** VOLATILE
- **Comentário:** Faz o match automatico entre lancamentos bancarios e contas_a_pagar. Retorna apenas os itens conciliados (confirmados e divergentes). Itens sem match sao ignorados e ficam sem conciliacao.

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION public.fin_auto_conciliar(p_extrato_id bigint)
 RETURNS TABLE(lancamento_id bigint, conta_pagar_id bigint, conta_tiny_id text, status_conciliacao text, diferenca_valor numeric, diferenca_dias integer, data_lancamento date)
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_lanc   RECORD;
    v_conta  RECORD;
    v_tol    NUMERIC;
    v_status TEXT;
BEGIN
    FOR v_lanc IN
        SELECT lb.id, lb.data_lancamento, lb.valor
        FROM   fin_lancamentos_bancarios lb
        WHERE  lb.extrato_id = p_extrato_id
          AND  lb.tipo       = 'debito'
          AND  NOT EXISTS (
                SELECT 1 FROM fin_conciliacoes fc
                WHERE  fc.lancamento_id = lb.id
               )
    LOOP
        v_tol := GREATEST(v_lanc.valor * 0.01, 0.5);

        SELECT cp.id, cp.valor::NUMERIC, cp.data_vencimento, cp.id_api_conta::TEXT
        INTO   v_conta
        FROM   contas_a_pagar cp
        WHERE  cp.situacao = 'aberto'
          AND  ABS(cp.valor::NUMERIC - v_lanc.valor) <= v_tol
          AND  cp.data_vencimento BETWEEN (v_lanc.data_lancamento - INTERVAL '5 days')
                                      AND (v_lanc.data_lancamento + INTERVAL '5 days')
          AND  NOT EXISTS (
                SELECT 1 FROM fin_conciliacoes fc2
                WHERE  fc2.conta_pagar_id = cp.id
               )
        ORDER BY ABS(cp.valor::NUMERIC - v_lanc.valor) ASC,
                 ABS(cp.data_vencimento - v_lanc.data_lancamento) ASC
        LIMIT 1;

        IF FOUND THEN
            v_status := CASE
                WHEN ABS(v_conta.valor - v_lanc.valor) < 0.01 THEN 'confirmado'
                ELSE 'divergente'
            END;

            INSERT INTO fin_conciliacoes
                (lancamento_id, conta_pagar_id, status, diferenca_valor, diferenca_dias)
            VALUES
                (v_lanc.id, v_conta.id, v_status,
                 v_conta.valor - v_lanc.valor,
                 v_conta.data_vencimento - v_lanc.data_lancamento);

            IF v_status = 'confirmado' THEN
                UPDATE contas_a_pagar SET situacao = 'pago' WHERE id = v_conta.id;
            END IF;

            lancamento_id      := v_lanc.id;
            conta_pagar_id     := v_conta.id;
            conta_tiny_id      := v_conta.id_api_conta;
            status_conciliacao := v_status;
            diferenca_valor    := v_conta.valor - v_lanc.valor;
            diferenca_dias     := v_conta.data_vencimento - v_lanc.data_lancamento;
            data_lancamento    := v_lanc.data_lancamento;
            RETURN NEXT;
        END IF;
    END LOOP;
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## fn_atualizar_ordem_por_entrega

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION public.fn_atualizar_ordem_por_entrega()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    id_concluido text := TG_ARGV[0]; 
BEGIN
    -- 1. Verifica se a entrega mudou para concluído
    IF NEW.etapas::text = id_concluido AND (OLD.etapas::text IS DISTINCT FROM id_concluido) THEN
        
        -- 2. Atualiza a tabela 'ordens' no schema 'directus'
        UPDATE directus.ordens
        SET data_conclusao = CURRENT_TIMESTAMP
        -- ATENÇÃO: Substitua 'ordem_id' pelo nome da coluna que faz o vínculo
        WHERE id = NEW.ordem_id; 

    END IF;

    RETURN NEW;
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## fn_gerar_numero_orcamento

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION public.fn_gerar_numero_orcamento()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- Verifica se o número do orçamento já não foi preenchido manualmente
    IF NEW.numero_orcamento IS NULL THEN
        -- Formata o ID com o prefixo 'CO-' e 4 dígitos (ex: CO-0001)
        -- O uso de LPAD garante que o número tenha zeros à esquerda
        NEW.numero_orcamento := 'CO-' || LPAD(nextval(pg_get_serial_sequence('public.orcamento', 'id'))::text, 4, '0');
    END IF;
    RETURN NEW;
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## fn_gerar_venda_sequencial

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION public.fn_gerar_venda_sequencial()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    registro_existe INTEGER;
BEGIN
    -- Procuramos se o id_api_tiny já existe
    SELECT 1 INTO registro_existe FROM vendas WHERE id_api_tiny = NEW.id_api_tiny LIMIT 1;

    -- SE NÃO EXISTIR: É um insert novo, então geramos o número
    IF registro_existe IS NULL THEN
        NEW.numero_pedido := nextval('seq_vendas_numero_pedido');
    -- SE JÁ EXISTIR: É um UPSERT (Update), mantemos o número que já está lá
    ELSE
        SELECT numero_pedido INTO NEW.numero_pedido FROM vendas WHERE id_api_tiny = NEW.id_api_tiny;
    END IF;

    RETURN NEW;
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## fn_gerar_venda_sequencial_manual

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION public.fn_gerar_venda_sequencial_manual()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    novo_num INTEGER;
BEGIN
    -- 1. Verifica se o pedido já existe
    IF EXISTS (SELECT 1 FROM vendas WHERE id_api_tiny = NEW.id_api_tiny) THEN
        -- Se já existe, recupera o número atual para não mudar nada
        SELECT numero_pedido INTO NEW.numero_pedido FROM vendas WHERE id_api_tiny = NEW.id_api_tiny;
    ELSE
        -- 2. Se for NOVO, bloqueia a tabela de controle e incrementa
        -- Isso impede que dois processos peguem o mesmo número ou pulem
        UPDATE controle_sequencia 
        SET ultimo_numero = ultimo_numero + 1 
        WHERE nome_tabela = 'vendas'
        RETURNING ultimo_numero INTO novo_num;
        
        NEW.numero_pedido := novo_num;
    END IF;
    
    RETURN NEW;
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## fn_inicializar_orcamento

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION public.fn_inicializar_orcamento()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    proximo_id bigint;
BEGIN
    -- 1. Garante que o status seja sempre 3 na criação
    NEW.status := 3;

    -- 2. Gera o numero_orcamento baseado na sequência da tabela
    -- Buscamos o próximo valor da sequence para garantir unicidade
    proximo_id := nextval(pg_get_serial_sequence('public.orcamento', 'id'));
    
    -- Atribui o ID manualmente para que o numero_orcamento e a PK coincidam
    NEW.id := proximo_id;
    
    -- Formata o número (Ex: CO-0001)
    NEW.numero_orcamento := 'CO-' || LPAD(proximo_id::text, 4, '0');

    RETURN NEW;
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## fn_proteger_delete_itens_venda

- **Tipo:** FUNCTION (plpgsql) — SECURITY DEFINER
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION public.fn_proteger_delete_itens_venda()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RAISE EXCEPTION 'Itens de venda não podem ser removidos. Contate o administrador.'
    USING ERRCODE = 'P0001';
  RETURN NULL;
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## fn_proteger_preco_itens_venda

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION public.fn_proteger_preco_itens_venda()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
      DECLARE
        v_status INTEGER;
      BEGIN
        -- Buscar status da venda
        SELECT status INTO v_status
        FROM public.vendas
        WHERE id = NEW.venda_id;

        -- So proteger se status = 2
        IF v_status = 2 THEN
          IF NEW.preco_tabela IS NOT DISTINCT FROM OLD.preco_tabela
             AND NEW.preco_unitario_final IS NOT DISTINCT FROM OLD.preco_unitario_final
             AND NEW.preco_total IS NOT DISTINCT FROM OLD.preco_total
             AND NEW.desconto_percentual IS NOT DISTINCT FROM OLD.desconto_percentual
             AND NEW.desconto_valor IS NOT DISTINCT FROM OLD.desconto_valor
             AND NEW.comissao_percentual IS NOT DISTINCT FROM OLD.comissao_percentual
             AND NEW.comissao_valor IS NOT DISTINCT FROM OLD.comissao_valor
          THEN
            RETURN NEW;
          END IF;

          RAISE EXCEPTION 'Itens de venda protegidos. Preços e comissões não podem ser alterados para vendas com status 2. Contate o administrador.'
            USING ERRCODE = 'P0001';
          RETURN NULL;
        END IF;

        -- Status diferente de 2: permitir alteracao
        RETURN NEW;
      END;
      $function$

```

</details>

_Sem referência identificada no código._

---

## fn_users_profile_updated_date_column

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION public.fn_users_profile_updated_date_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN 
 NEW.updated_at = NOW();
 RETURN NEW;
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## gerar_metas_por_hora_final

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION public.gerar_metas_por_hora_final()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$DECLARE
    -- ETAPA 1: DECLARAÇÃO DE VARIÁVEIS (fuso_horario não é mais necessário)
    data_inicial DATE;
    data_final DATE;
    
    dias_nao_trabalhados_array INT[];
    dias_trabalhados_calculado INT;
    
    valor_por_hora_ouro NUMERIC;
    valor_por_hora_prata NUMERIC;
    valor_por_hora_diamante NUMERIC;
BEGIN
    -- ETAPA 2: TRATAMENTO DAS DATAS
    data_inicial := date_trunc('month', NEW.mes_ano)::DATE;
    data_final := (data_inicial + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

    -- ETAPA 3: CÁLCULO DINÂMICO DOS DIAS TRABALHADOS
    SELECT COALESCE(array_agg(dia::INT), ARRAY[]::INT[])
    INTO dias_nao_trabalhados_array
    FROM regexp_split_to_table(TRIM(COALESCE(NEW.dias_nao_trabalhados, '')), ',\s*') AS dia
    WHERE dia ~ '^[0-9]+$';

    dias_trabalhados_calculado := ((data_final - data_inicial) + 1) - COALESCE(array_length(dias_nao_trabalhados_array, 1), 0);
    
    -- ETAPA 4: CÁLCULO DO VALOR POR HORA
    IF dias_trabalhados_calculado > 0 AND NEW.horas_dia > 0 THEN
        valor_por_hora_ouro     := (NEW.valor_ouro / dias_trabalhados_calculado) / NEW.horas_dia;
        valor_por_hora_prata    := (NEW.valor_prata / dias_trabalhados_calculado) / NEW.horas_dia;
        valor_por_hora_diamante := (NEW.valor_diamante / dias_trabalhados_calculado) / NEW.horas_dia;
    ELSE
        valor_por_hora_ouro     := 0;
        valor_por_hora_prata    := 0;
        valor_por_hora_diamante := 0;
    END IF;

    -- ETAPA 5: LIMPEZA DOS DADOS ANTIGOS
    DELETE FROM public.metas_por_hora WHERE meta_mensal_id = NEW.id;

    -- ETAPA 6: INSERÇÃO EM MASSA COM GERAÇÃO DE HORA LOCAL (TIMESTAMP)
    INSERT INTO public.metas_por_hora (meta_mensal_id, data_hora, consultora, tipo_meta, valor_meta)
    SELECT
        NEW.id,
        -- =================================================================================
        -- CORREÇÃO FINAL: Usando make_timestamp para gerar um timestamp local (sem fuso),
        -- que corresponde exatamente ao tipo de dado da sua coluna.
        make_timestamp(
            EXTRACT(YEAR FROM dias.dia_mes)::INT,
            EXTRACT(MONTH FROM dias.dia_mes)::INT,
            EXTRACT(DAY FROM dias.dia_mes)::INT,
            (NEW.hora_inicio + horas.offset_hora), -- Hora a ser construída
            0, -- Minuto
            0.0 -- Segundo
        ),
        -- =================================================================================
        NEW.consultora,
        metas.tipo,
        CASE
            WHEN EXTRACT(DAY FROM dias.dia_mes) = ANY(dias_nao_trabalhados_array) THEN 0
            ELSE metas.valor_por_hora
        END AS valor_meta
    FROM
        generate_series(data_inicial::TIMESTAMP, data_final::TIMESTAMP, '1 day'::interval) AS dias(dia_mes)
    CROSS JOIN
        generate_series(0, NEW.horas_dia - 1) AS horas(offset_hora)
    CROSS JOIN
        (VALUES
            ('Ouro',     valor_por_hora_ouro),
            ('Prata',    valor_por_hora_prata),
            ('Diamante', valor_por_hora_diamante)
        ) AS metas(tipo, valor_por_hora);

    RETURN NEW;
END;$function$

```

</details>

_Sem referência identificada no código._

---

## get_auditoria_completa

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `data_inicio timestamp without time zone, data_fim timestamp without time zone`
- **Retorno:** `TABLE(dep_id integer, dep_nome character varying, setor_nome character varying, cat_nome character varying, ent real, ret real, quebra real)`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION public.get_auditoria_completa(data_inicio timestamp without time zone, data_fim timestamp without time zone)
 RETURNS TABLE(dep_id integer, dep_nome character varying, setor_nome character varying, cat_nome character varying, ent real, ret real, quebra real)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        d.id as dep_id,
        d.nome::varchar as dep_nome,
        s.descricao::varchar as setor_nome,
        cat.nome::varchar as cat_nome,
        SUM(COALESCE(ce.entrada, 0))::real as ent,
        SUM(COALESCE(ce.saida, 0))::real as ret,
        -- REGRA: Quebra só calcula se houve entrada E saída no período
        CASE 
            WHEN SUM(COALESCE(ce.entrada, 0)) > 0 AND SUM(COALESCE(ce.saida, 0)) > 0 
            THEN (SUM(COALESCE(ce.entrada, 0)) - SUM(COALESCE(ce.saida, 0)))::real
            ELSE 0::real
        END as quebra
    FROM directus.controle_estoque ce
    LEFT JOIN directus.deposito d ON ce.deposito_id = d.id
    LEFT JOIN directus.insumos i ON ce.insumo_id = i.id
    LEFT JOIN directus.categoria_insumo cat ON i.categoria_id = cat.id
    LEFT JOIN directus.setor s ON ce.setor = s.id
    WHERE ce.date_created >= data_inicio AND ce.date_created <= data_fim
      AND d.id <> 1 
    GROUP BY d.id, d.nome, s.descricao, cat.nome;
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## get_auditoria_operadores

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `data_inicio timestamp without time zone, data_fim timestamp without time zone`
- **Retorno:** `TABLE(deposito_id integer, deposito_nome character varying, setor_nome character varying, categoria_id integer, categoria_nome character varying, total_ent real, total_sai real, valor_quebra real)`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION public.get_auditoria_operadores(data_inicio timestamp without time zone, data_fim timestamp without time zone)
 RETURNS TABLE(deposito_id integer, deposito_nome character varying, setor_nome character varying, categoria_id integer, categoria_nome character varying, total_ent real, total_sai real, valor_quebra real)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        d.id as deposito_id,
        d.nome::varchar as deposito_nome,
        s.descricao::varchar as setor_nome,
        cat.id as categoria_id,
        cat.nome::varchar as categoria_nome,
        SUM(COALESCE(ce.entrada, 0))::real as total_ent,
        SUM(COALESCE(ce.saida, 0))::real as total_sai,
        -- REGRA: Quebra só existe se houver Entrada E Saída no período
        CASE 
            WHEN SUM(COALESCE(ce.entrada, 0)) > 0 AND SUM(COALESCE(ce.saida, 0)) > 0 
            THEN (SUM(COALESCE(ce.entrada, 0)) - SUM(COALESCE(ce.saida, 0)))::real
            ELSE 0::real
        END as valor_quebra
    FROM directus.controle_estoque ce
    LEFT JOIN directus.insumos i ON ce.insumo_id = i.id
    LEFT JOIN directus.categoria_insumo cat ON i.categoria_id = cat.id
    LEFT JOIN directus.deposito d ON ce.deposito_id = d.id
    LEFT JOIN directus.setor s ON ce.setor = s.id
    WHERE ce.date_created >= data_inicio AND ce.date_created <= data_fim
      AND d.id <> 1 -- EXCLUI O GERAL DA TABELA DE OPERADORES
    GROUP BY d.id, d.nome, s.descricao, cat.id, cat.nome;
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## get_auditoria_v4

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `data_inicio timestamp without time zone, data_fim timestamp without time zone`
- **Retorno:** `TABLE(dep_id integer, dep_nome character varying, setor_nome character varying, cat_nome character varying, ent real, ret real, quebra real)`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION public.get_auditoria_v4(data_inicio timestamp without time zone, data_fim timestamp without time zone)
 RETURNS TABLE(dep_id integer, dep_nome character varying, setor_nome character varying, cat_nome character varying, ent real, ret real, quebra real)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        d.id as dep_id,
        d.nome::varchar as dep_nome,
        s.descricao::varchar as setor_nome,
        cat.nome::varchar as cat_nome,
        SUM(COALESCE(ce.entrada, 0))::real as ent,
        SUM(COALESCE(ce.saida, 0))::real as ret,
        -- REGRA: Só calcula quebra se houver entrada E saída no período selecionado
        CASE 
            WHEN SUM(COALESCE(ce.entrada, 0)) > 0 AND SUM(COALESCE(ce.saida, 0)) > 0 
            THEN (SUM(COALESCE(ce.entrada, 0)) - SUM(COALESCE(ce.saida, 0)))::real
            ELSE 0::real
        END as quebra
    FROM directus.controle_estoque ce
    LEFT JOIN directus.deposito d ON ce.deposito_id = d.id
    LEFT JOIN directus.insumos i ON ce.insumo_id = i.id
    LEFT JOIN directus.categoria_insumo cat ON i.categoria_id = cat.id
    LEFT JOIN directus.setor s ON ce.setor = s.id
    WHERE ce.date_created >= data_inicio AND ce.date_created <= data_fim
      AND d.id <> 1 
    GROUP BY d.id, d.nome, s.descricao, cat.nome;
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## get_consolidado_estoque

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `data_inicio timestamp without time zone, data_fim timestamp without time zone`
- **Retorno:** `TABLE(deposito_id integer, deposito_nome character varying, setor_nome character varying, categoria_id integer, categoria_nome character varying, total_entrada real, total_saida_total real, quebra_identificada real, ultima_movimentacao timestamp with time zone)`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION public.get_consolidado_estoque(data_inicio timestamp without time zone, data_fim timestamp without time zone)
 RETURNS TABLE(deposito_id integer, deposito_nome character varying, setor_nome character varying, categoria_id integer, categoria_nome character varying, total_entrada real, total_saida_total real, quebra_identificada real, ultima_movimentacao timestamp with time zone)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        d.id as deposito_id,
        d.nome::varchar as deposito_nome,
        s.descricao::varchar as setor_nome,
        cat.id as categoria_id,
        cat.nome::varchar as categoria_nome,
        SUM(COALESCE(ce.entrada, 0))::real as total_entrada,
        SUM(COALESCE(ce.saida, 0))::real as total_saida_total,
        -- SOMA APENAS SE TIVER OS MARCADORES QUE VOCÊ DEFINIU
        SUM(
            CASE 
                WHEN ce.marcador IN ('TED', 'SM', 'SP') THEN COALESCE(ce.saida, 0) 
                ELSE 0 
            END
        )::real as quebra_identificada,
        MAX(ce.date_created) as ultima_movimentacao
    FROM directus.controle_estoque ce
    LEFT JOIN directus.insumos i ON ce.insumo_id = i.id
    LEFT JOIN directus.categoria_insumo cat ON i.categoria_id = cat.id
    LEFT JOIN directus.deposito d ON ce.deposito_id = d.id
    LEFT JOIN directus.setor s ON ce.setor = s.id
    WHERE 
        (ce.date_created >= data_inicio AND ce.date_created <= data_fim)
        AND (ce.insumo_id = 1 OR i.categoria_id = 2)
    GROUP BY 
        d.id, d.nome, s.descricao, cat.id, cat.nome;
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## get_quebra_por_periodo

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `data_inicio timestamp without time zone, data_fim timestamp without time zone`
- **Retorno:** `TABLE(categoria_id integer, categoria_nome character varying, deposito_id integer, deposito_nome character varying, setor_nome character varying, total_entrada real, total_saida real, saldo_quebra real, ultima_movimentacao timestamp with time zone)`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION public.get_quebra_por_periodo(data_inicio timestamp without time zone, data_fim timestamp without time zone)
 RETURNS TABLE(categoria_id integer, categoria_nome character varying, deposito_id integer, deposito_nome character varying, setor_nome character varying, total_entrada real, total_saida real, saldo_quebra real, ultima_movimentacao timestamp with time zone)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        cat.id as categoria_id,
        cat.nome::varchar as categoria_nome,
        d.id as deposito_id,
        d.nome::varchar as deposito_nome,
        s.descricao::varchar as setor_nome,
        SUM(COALESCE(ce.entrada, 0))::real as total_entrada,
        SUM(COALESCE(ce.saida, 0))::real as total_saida,
        SUM(COALESCE(ce.entrada, 0) - COALESCE(ce.saida, 0))::real as saldo_quebra,
        MAX(ce.date_created) as ultima_movimentacao
    FROM directus.controle_estoque ce
    LEFT JOIN directus.insumos i ON ce.insumo_id = i.id
    LEFT JOIN directus.categoria_insumo cat ON i.categoria_id = cat.id
    LEFT JOIN directus.deposito d ON ce.deposito_id = d.id
    LEFT JOIN directus.setor s ON ce.setor = s.id
    WHERE 
        (ce.date_created >= data_inicio AND ce.date_created <= data_fim)
        AND (ce.insumo_id = 1 OR i.categoria_id = 2)
    GROUP BY 
        cat.id, cat.nome, d.id, d.nome, s.descricao;
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## get_saldo_absoluto_cofre

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `real`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION public.get_saldo_absoluto_cofre()
 RETURNS real
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN (
        SELECT SUM(COALESCE(entrada, 0) - COALESCE(saida, 0))::float4
        FROM directus.controle_estoque
        WHERE deposito_id = 1 
        AND insumo_id = '1'
    );
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## get_saldo_real_cofre

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `real`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION public.get_saldo_real_cofre()
 RETURNS real
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN (
        SELECT SUM(COALESCE(entrada, 0) - COALESCE(saida, 0))::float4
        FROM directus.controle_estoque
        WHERE deposito_id = 1 -- ID do Geral
        AND insumo_id = '1' -- ID do Ouro18k conforme sua planilha
    );
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## handle_new_user

- **Tipo:** FUNCTION (plpgsql) — SECURITY DEFINER
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'auth, public'
AS $function$ 
BEGIN
  -- no-op para não quebrar o signup
  RETURN NEW;
END;
$function$

```

</details>

**Uso no código:**
- `public.handle_new_user` — 1 ocorrência(s)
  - `supabase/migrations/080_sync_user_profiles_id_user.sql:6`

---

## handle_updated_at

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION public.handle_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## n8n_trigger_function_240c32bc_cedc_46cd_a8e7_e2f6e780268f

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION public.n8n_trigger_function_240c32bc_cedc_46cd_a8e7_e2f6e780268f()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$ begin perform pg_notify('n8n_channel_240c32bc_cedc_46cd_a8e7_e2f6e780268f', row_to_json(new)::text); return null; end; $function$

```

</details>

_Sem referência identificada no código._

---

## n8n_trigger_function_be0584e3_2e2d_424a_b038_a20d0519b999

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION public.n8n_trigger_function_be0584e3_2e2d_424a_b038_a20d0519b999()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$ begin perform pg_notify('n8n_channel_be0584e3_2e2d_424a_b038_a20d0519b999', row_to_json(new)::text); return null; end; $function$

```

</details>

_Sem referência identificada no código._

---

## n8n_trigger_function_e82b0522_503c_44a5_9c54_a4c9e621379d

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION public.n8n_trigger_function_e82b0522_503c_44a5_9c54_a4c9e621379d()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$ begin perform pg_notify('n8n_channel_e82b0522_503c_44a5_9c54_a4c9e621379d', row_to_json(new)::text); return null; end; $function$

```

</details>

_Sem referência identificada no código._

---

## notificar_apenas_mudanca_situacao

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION public.notificar_apenas_mudanca_situacao()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- 1. COMPARA a situação antiga com a nova.
    IF NEW.situacao IS DISTINCT FROM OLD.situacao THEN
        -- 2. SE mudou, envia uma notificação para o canal 'n8n_situacao_mudou'.
        -- O payload é um JSON contendo os dados antigos (OLD) e novos (NEW).
        PERFORM pg_notify(
            'n8n_situacao_mudou',
            json_build_object(
                'table', TG_TABLE_NAME,
                'action', TG_OP,
                'old_record', row_to_json(OLD),
                'new_record', row_to_json(NEW)
            )::text
        );
    END IF;

    RETURN NEW;
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## notificar_mudanca_estoque

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION public.notificar_mudanca_estoque()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$DECLARE
  -- Adapte a URL para o seu endpoint de webhook real.
  webhook_url TEXT := 'https://etl.alissonranyel.com.br/webhook/cbc077e1-1c46-46c6-8bf4-515ecfd7349c';
  payload JSONB;
BEGIN
  -- A verificação principal: dispara se o estoque MÍNIMO, MÁXIMO ou sob_encomenda mudar.
  IF NEW.estoque_minimo IS DISTINCT FROM OLD.estoque_minimo OR
     NEW.estoque_maximo IS DISTINCT FROM OLD.estoque_maximo OR
     NEW.sob_encomenda IS DISTINCT FROM OLD.sob_encomenda -- NOVO: Detecta mudança em sob_encomenda
  THEN

    -- Monta a base do payload com os campos comuns.
    payload := jsonb_build_object(
      'tipo_evento', 'mudanca_produto', -- Nome mais genérico
      'sku', NEW.sku,
      'id_api_produto', NEW.id_api_produto,
      'nome', NEW.nome,
      'tipo', NEW.tipo,
      'atualizado_em', now()
    );

    -- Se o estoque MÍNIMO mudou, adiciona os detalhes.
    IF NEW.estoque_minimo IS DISTINCT FROM OLD.estoque_minimo THEN
      payload := payload || jsonb_build_object(
        'estoque_minimo_antigo', OLD.estoque_minimo,
        'estoque_minimo_novo', NEW.estoque_minimo
      );
    END IF;

    -- Se o estoque MÁXIMO mudou, adiciona os detalhes.
    IF NEW.estoque_maximo IS DISTINCT FROM OLD.estoque_maximo THEN
      payload := payload || jsonb_build_object(
        'estoque_maximo_antigo', OLD.estoque_maximo,
        'estoque_maximo_novo', NEW.estoque_maximo
      );
    END IF;
    
    -- NOVO: Se sob_encomenda mudou, adiciona os detalhes.
    IF NEW.sob_encomenda IS DISTINCT FROM OLD.sob_encomenda THEN
        payload := payload || jsonb_build_object(
            'sob_encomenda_antigo', OLD.sob_encomenda,
            'sob_encomenda_novo', NEW.sob_encomenda
        );
    END IF;

    -- Tenta fazer a requisição POST para a URL do webhook com o payload completo.
    PERFORM http(
        (
          'POST',
          webhook_url,
          ARRAY[http_header('Content-Type', 'application/json')],
          'application/json',
          payload::text
        )::http_request
    );

  END IF;

  -- Sempre retorna NEW para que a operação de UPDATE continue.
  RETURN NEW;
END;$function$

```

</details>

_Sem referência identificada no código._

---

## notificar_n8n_nova_venda

- **Tipo:** FUNCTION (plpgsql) — SECURITY DEFINER
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION public.notificar_n8n_nova_venda()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'extensions', 'public', 'pg_temp'
AS $function$
BEGIN
  -- LÓGICA DE DISPARO:
  IF (TG_OP = 'INSERT' AND NEW.status = 2) OR 
     (TG_OP = 'UPDATE' AND NEW.status = 2 AND OLD.status IS DISTINCT FROM 2) THEN
      
      -- Executa o POST (agora com o caminho e permissões corretas)
      PERFORM http_post(
        'https://etl.alissonranyel.com.br/webhook/97332ec0-3697-4cc2-a633-46a90b72a69e'::text,
        json_build_object(
            'id', NEW.id,
            'origem', 'supabase_trigger',
            'timestamp', now()
        )::text,
        'application/json'::text
      );
      
  END IF;
  RETURN NEW;
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## notificar_nova_ordem

- **Tipo:** FUNCTION (plpgsql) — SECURITY DEFINER
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION public.notificar_nova_ordem()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'extensions', 'public', 'pg_temp'
AS $function$
BEGIN
  -- LÓGICA DE DISPARO REFINADA:
  -- Dispara APENAS se a nova situação for '2' E (for um cadastro novo OU a situação antiga não era '2')
  -- Isso impede que o webhook dispare se você editar o nome do cliente mas a situação já era 2.
  
  IF (TRIM(NEW.situacao) = '2') AND 
     (TG_OP = 'INSERT' OR TRIM(OLD.situacao) IS DISTINCT FROM '2') THEN
      
      -- Executa o POST para a URL correta
      PERFORM http_post(
        'https://etl.alissonranyel.com.br/webhook/f9353be3-cdaa-4aa1-b8a5-b2a4eb2c63b2'::text,
        json_build_object(
            'id', NEW.id,
            'numero_ordem', NEW.numero_ordem,
            'origem', 'mudanca_status_2',
            'timestamp', now(),
            'situacao_anterior', OLD.situacao,
            'situacao_nova', NEW.situacao
        )::text,
        'application/json'::text
      );
      
  END IF;
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Se a URL estiver fora do ar ou der erro de rede, loga o erro mas não trava o sistema
  RAISE LOG 'ERRO AO DISPARAR WEBHOOK: %', SQLERRM;
  RETURN NEW;
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## notify_n8n_solicitacao_vale_troca

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION public.notify_n8n_solicitacao_vale_troca()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Na versão 0.14.0, a função correta geralmente é net.http_post
  -- E ela retorna um ID de requisição, por isso o PERFORM funciona.
  PERFORM
    net.http_post(
      url := 'https://etl.alissonranyel.com.br/webhook/solicitacao-vale-troca',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := json_build_object(
        'id', NEW.id,
        'valor', NEW.valor,
        'venda_id', NEW.venda_id,
        'cliente_id', NEW.cliente_id,
        'vale_origem_id', NEW.vale_origem_id,
        'id_asana', NEW.id_asana
      )::jsonb
    );
  RETURN NEW;
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## obter_saldo_pote_geral

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `numeric`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION public.obter_saldo_pote_geral()
 RETURNS numeric
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_saldo numeric;
BEGIN
    SELECT 
        -- Calcula (Entradas - Saídas)
        COALESCE(SUM(entrada), 0) - COALESCE(SUM(saida), 0)
    INTO v_saldo
    FROM directus.controle_estoque -- Nota: A tabela continua no schema directus!
    WHERE deposito_id = 1       -- ID DO DEPÓSITO GERAL
      AND insumo_id = 1;        -- SÓ OURO 18K

    -- Retorna com 2 casas decimais
    RETURN ROUND(v_saldo, 2);
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## preencher_numero_ordem

- **Tipo:** FUNCTION (plpgsql) — SECURITY DEFINER
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION public.preencher_numero_ordem()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    next_id INTEGER;
BEGIN
    IF NEW.numero_ordem IS NULL THEN
        next_id := nextval('directus.seq_ordens_numero');
        NEW.numero_ordem := 'C - ' || TO_CHAR(next_id, 'FM0000');
    END IF;
    RETURN NEW;
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## processar_aprovacao_orcamento

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION public.processar_aprovacao_orcamento()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_novo_sku       VARCHAR;
    v_sufixo_max     INT;
    v_id_produto     BIGINT;
    v_ficha_orc      RECORD;
BEGIN
    IF NEW.status IS DISTINCT FROM 2 THEN
        RETURN NEW;
    END IF;

    IF OLD.status IS NOT DISTINCT FROM 2 THEN
        RETURN NEW;
    END IF;

    SELECT COALESCE(
        MAX(SUBSTRING(sku FROM 'FP1037-(\d+)$')::INT), 0
    )
    INTO v_sufixo_max
    FROM public.produtos
    WHERE sku ~ '^FP1037-\d+$';

    v_novo_sku := 'FP1037-' || (v_sufixo_max + 1)::TEXT;

    NEW.sku := v_novo_sku;

    INSERT INTO public.produtos (
        sku, nome, peso_precificado, preco_tiny,
        tipo, situacao, unidade, marca, tipo_metal
    ) VALUES (
        v_novo_sku,
        'Aliança Personalizada - ' || (v_sufixo_max + 1)::TEXT,
        NEW.peso::DOUBLE PRECISION,
        NEW.valor,
        'S', 'A', 'UN', 'Alisson', 'OURO'
    )
    RETURNING id_produto INTO v_id_produto;

    IF NEW."fichaTecnica_id" IS NOT NULL THEN
        SELECT * INTO v_ficha_orc
        FROM public.ficha_tecnica_orcamento
        WHERE id = NEW."fichaTecnica_id";

        IF FOUND THEN
            INSERT INTO public.ficha_tecnica_produto (
                produto_id, modelo, largura, espessura, peso_estimado,
                tipo_fonte, texto, qtd_pedras, tamanho_pedra,
                tipo_apilicacao_pedra, aro_numeracao
            ) VALUES (
                v_id_produto,
                v_ficha_orc.modelo,
                texto_para_numeric(v_ficha_orc.largura),
                texto_para_numeric(v_ficha_orc.espessura),
                texto_para_numeric(v_ficha_orc.peso_estimado),
                v_ficha_orc.tipo_fonte,
                v_ficha_orc.texto,
                texto_para_numeric(v_ficha_orc.qtd_pedras),
                texto_para_numeric(v_ficha_orc.tamanho_pedra),
                texto_para_numeric(v_ficha_orc.tipo_aplicacao_pedra),
                v_ficha_orc.aro_numeracao
            );
        END IF;
    END IF;

    INSERT INTO public.fila_webhooks_n8n (produto_id)
    VALUES (v_id_produto);

    PERFORM pg_notify('novo_produto_aprovado', json_build_object(
        'id_produto', v_id_produto,
        'sku', v_novo_sku
    )::TEXT);

    RETURN NEW;
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## recalcular_diferenca_produto

- **Tipo:** FUNCTION (plpgsql) — SECURITY DEFINER
- **Argumentos:** `produto_id integer`
- **Retorno:** `void`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION public.recalcular_diferenca_produto(produto_id integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    produto_record RECORD;
    nova_diferenca float8;
BEGIN
    -- 1. Pega os dados atuais do produto da tabela
    SELECT * INTO produto_record FROM public.produtos WHERE id = produto_id;

    -- 2. Faz o mesmo cálculo da nossa função de trigger
    IF produto_record.preco_sync IS NOT NULL AND produto_record.preco_sync > 0 THEN
        nova_diferenca := (ABS(produto_record.preco_tiny - produto_record.preco_sync) / produto_record.preco_sync) * 100;
    ELSE
        nova_diferenca := 0;
    END IF;

    -- 3. Atualiza a tabela com o valor correto
    UPDATE public.produtos
    SET diferenca_percentual = nova_diferenca
    WHERE id = produto_id;

END;
$function$

```

</details>

_Sem referência identificada no código._

---

## registrar_modificacao_contatos

- **Tipo:** FUNCTION (plpgsql) — SECURITY DEFINER
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE
- **Comentário:** Função para atualizar o timestamp da coluna data_atualizacao na tabela de contatos.

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION public.registrar_modificacao_contatos()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- 1. Pega o tempo atual em UTC (padrão do NOW()).
  -- 2. Converte para o fuso horário 'America/Fortaleza'.
  -- 3. Atribui o resultado à coluna.
  NEW.data_atualizacao := timezone('America/Fortaleza', now());
  
  RETURN NEW;
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## registrar_modificacao_produtos

- **Tipo:** FUNCTION (plpgsql) — SECURITY DEFINER
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION public.registrar_modificacao_produtos()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- Atualiza a coluna 'data_atualizacao' com o timestamp atual
  NEW.data_atualizacao = now();
  
  -- Retorna a linha modificada
  RETURN NEW;
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## registrar_mudanca_situacao

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION public.registrar_mudanca_situacao()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- Compara o valor antigo da coluna 'situação' com o novo valor.
    -- A cláusula "IS DISTINCT FROM" lida corretamente com valores NULOS.
    IF NEW.situacao IS DISTINCT FROM OLD.situacao THEN
        -- Se forem diferentes, insere um registro na tabela de log.
        INSERT INTO log_produtos (id_produto, situacao_antiga, situacao_nova)
        VALUES (OLD.id, OLD.situacao, NEW.situacao);
    END IF;

    -- Retorna a linha modificada para que a operação de UPDATE continue.
    RETURN NEW;
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## set_updated_at

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$

```

</details>

_Sem referência identificada no código._

---

## sync_venda_entregue

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION public.sync_venda_entregue()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Marca a VENDA como entregue ao criar entrega
    UPDATE public.vendas 
    SET entregue = TRUE 
    WHERE id = NEW.pedido_id;
    
  ELSIF TG_OP = 'DELETE' THEN
    -- Desmarca a VENDA como entregue ao deletar entrega
    UPDATE public.vendas 
    SET entregue = FALSE 
    WHERE id = OLD.pedido_id;
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## texto_para_numeric

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `p_texto text`
- **Retorno:** `numeric`
- **Volatility:** IMMUTABLE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION public.texto_para_numeric(p_texto text)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
    v_limpo TEXT;
BEGIN
    IF p_texto IS NULL OR TRIM(p_texto) = '' THEN
        RETURN NULL;
    END IF;

    -- Remove tudo que não é dígito, ponto ou vírgula
    v_limpo := REGEXP_REPLACE(p_texto, '[^0-9.,]', '', 'g');

    -- Se tiver vírgula como decimal (padrão BR), troca por ponto
    -- Lógica: se tem vírgula E ponto, assume ponto=milhar e vírgula=decimal
    -- Se tem só vírgula, assume vírgula=decimal
    IF v_limpo ~ ',' THEN
        v_limpo := REPLACE(v_limpo, '.', '');  -- remove ponto de milhar
        v_limpo := REPLACE(v_limpo, ',', '.');  -- vírgula vira decimal
    END IF;

    IF v_limpo = '' OR v_limpo = '.' THEN
        RETURN NULL;
    END IF;

    RETURN v_limpo::NUMERIC;
EXCEPTION
    WHEN OTHERS THEN
        RETURN NULL;
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## unaccent

- **Tipo:** FUNCTION (c)
- **Argumentos:** `regdictionary, text`
- **Retorno:** `text`
- **Volatility:** STABLE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION public.unaccent(regdictionary, text)
 RETURNS text
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/unaccent', $function$unaccent_dict$function$

```

</details>

**Uso no código:**
- `public.unaccent` — 38 ocorrência(s) _(amostra abaixo)_
  - `src/app/(dashboard)/ordens/page.tsx:73`
  - `src/app/(dashboard)/ordens/page.tsx:74`
  - `src/app/(dashboard)/ordens/page.tsx:77`
  - `src/app/(dashboard)/ordens/page.tsx:79`
  - `src/app/(dashboard)/ordens/page.tsx:80`

---

## unaccent

- **Tipo:** FUNCTION (c)
- **Argumentos:** `text`
- **Retorno:** `text`
- **Volatility:** STABLE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION public.unaccent(text)
 RETURNS text
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/unaccent', $function$unaccent_dict$function$

```

</details>

**Uso no código:**
- `public.unaccent` — 38 ocorrência(s) _(amostra abaixo)_
  - `src/app/(dashboard)/ordens/page.tsx:73`
  - `src/app/(dashboard)/ordens/page.tsx:74`
  - `src/app/(dashboard)/ordens/page.tsx:77`
  - `src/app/(dashboard)/ordens/page.tsx:79`
  - `src/app/(dashboard)/ordens/page.tsx:80`

---

## unaccent_init

- **Tipo:** FUNCTION (c)
- **Argumentos:** `internal`
- **Retorno:** `internal`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION public.unaccent_init(internal)
 RETURNS internal
 LANGUAGE c
 PARALLEL SAFE
AS '$libdir/unaccent', $function$unaccent_init$function$

```

</details>

_Sem referência identificada no código._

---

## unaccent_lexize

- **Tipo:** FUNCTION (c)
- **Argumentos:** `internal, internal, internal, internal`
- **Retorno:** `internal`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION public.unaccent_lexize(internal, internal, internal, internal)
 RETURNS internal
 LANGUAGE c
 PARALLEL SAFE
AS '$libdir/unaccent', $function$unaccent_lexize$function$

```

</details>

_Sem referência identificada no código._

---

## update_data_atualizacao

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION public.update_data_atualizacao()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.data_atualizacao = NOW();
    RETURN NEW;
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## update_entregas_updated_at

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION public.update_entregas_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## update_timestamp_columns

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION public.update_timestamp_columns()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- No INSERT, garantimos que a data_criacao seja preenchida (embora o DEFAULT já ajude)
    -- E que a data_atualizacao seja a mesma da criacao
    IF TG_OP = 'INSERT' THEN
        NEW.data_criacao = NOW();
        NEW.data_atualizacao = NOW();
        RETURN NEW;
    END IF;

    -- No UPDATE, apenas a data_atualizacao é alterada
    IF TG_OP = 'UPDATE' THEN
        NEW.data_atualizacao = NOW();
        -- Opcional: Impedir que a data_criacao seja alterada em um UPDATE
        NEW.data_criacao = OLD.data_criacao;
    END IF;

    RETURN NEW;
END;
$function$

```

</details>

_Sem referência identificada no código._

---

