# `directus` — Funções e Procedures

> 14 entradas | gerado 2026-04-29

## Índice

- [`atualizar_outros_pesos_pcp()`](#atualizar_outros_pesos_pcp)
- [`atualizar_totais_pedras_pcp()`](#atualizar_totais_pedras_pcp)
- [`atualizar_total_metal_pcp()`](#atualizar_total_metal_pcp)
- [`calc_peso_ourofino()`](#calc_peso_ourofino)
- [`calc_totais_ordem_compra()`](#calc_totais_ordem_compra)
- [`calcular_peso_unitario_pcp()`](#calcular_peso_unitario_pcp)
- [`calcular_total_geral_pcp()`](#calcular_total_geral_pcp)
- [`criar_comentario_com_mencoes(p_ordem_id integer, p_user_id uuid, p_conteudo text, p_conteudo_texto text, p_an)`](#criar_comentario_com_mencoes) 🛡️
- [`fn_atualizar_conclusao_universal()`](#fn_atualizar_conclusao_universal)
- [`fn_ordens_comentarios_update_date_column()`](#fn_ordens_comentarios_update_date_column)
- [`fn_vinculo_entrega_ordens()`](#fn_vinculo_entrega_ordens)
- [`func_gerar_numero_ordem()`](#func_gerar_numero_ordem)
- [`preencher_numero_ordem()`](#preencher_numero_ordem) 🛡️
- [`replicar_pmc_controle_estoque()`](#replicar_pmc_controle_estoque)

_🛡️ = SECURITY DEFINER_

---

## atualizar_outros_pesos_pcp

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION directus.atualizar_outros_pesos_pcp()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- ==============================================================================
    -- CENÁRIO 1: DELETE ou UPDATE (Recalcula a ordem antiga)
    -- ==============================================================================
    IF (TG_OP = 'DELETE' OR TG_OP = 'UPDATE') THEN
        IF OLD.ordem_id IS NOT NULL THEN
            UPDATE directus.pcp
            SET 
                -- AQUI ESTÁ A CORREÇÃO:
                -- Usamos CAST(peso AS NUMERIC) para garantir que o banco some números
                total_outros_pesos_g = (
                    SELECT COALESCE(SUM(CAST(peso AS NUMERIC)), 0)
                    FROM directus.outros_insumos
                    WHERE ordem_id = OLD.ordem_id
                )
            WHERE ordem_id = OLD.ordem_id;
        END IF;
    END IF;

    -- ==============================================================================
    -- CENÁRIO 2: INSERT ou UPDATE (Recalcula a ordem nova)
    -- ==============================================================================
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
        -- Otimização: Só roda se mudou a ordem ou é novo
        IF (TG_OP = 'INSERT') OR (NEW.ordem_id IS DISTINCT FROM OLD.ordem_id) OR (NEW.ordem_id = OLD.ordem_id) THEN
            IF NEW.ordem_id IS NOT NULL THEN
                UPDATE directus.pcp
                SET 
                    -- AQUI ESTÁ A CORREÇÃO:
                    total_outros_pesos_g = (
                        SELECT COALESCE(SUM(CAST(peso AS NUMERIC)), 0)
                        FROM directus.outros_insumos
                        WHERE ordem_id = NEW.ordem_id
                    )
                WHERE ordem_id = NEW.ordem_id;
            END IF;
        END IF;
    END IF;

    RETURN NULL;
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## atualizar_totais_pedras_pcp

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION directus.atualizar_totais_pedras_pcp()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$BEGIN
    -- 1. TRATAMENTO DO OLD (Para UPDATE e DELETE)
    IF (TG_OP = 'DELETE' OR TG_OP = 'UPDATE') THEN
        IF OLD.ordem_id IS NOT NULL THEN
            UPDATE directus.pcp
            SET 
                total_pedras_un = COALESCE(total_pedras_un, 0) - COALESCE(OLD.qtd_pedras, 0),
                total_pedras_g = COALESCE(total_pedras_g, 0) - COALESCE(OLD.peso, 0)
            WHERE ordem_id = OLD.ordem_id;
        END IF;
    END IF;

    -- 2. TRATAMENTO DO NEW (Para INSERT e UPDATE)
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
        IF NEW.ordem_id IS NOT NULL THEN
            UPDATE directus.pcp
            SET 
                total_pedras_un = COALESCE(total_pedras_un, 0) + COALESCE(NEW.qtd_pedras, 0),
                total_pedras_g = COALESCE(total_pedras_g, 0) + COALESCE(NEW.peso, 0)
            WHERE ordem_id = NEW.ordem_id;
        END IF;
    END IF;

    -- MUITO IMPORTANTE: Deve ser NEW para o trigger prosseguir
    RETURN NEW; 
END;$function$

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
CREATE OR REPLACE FUNCTION directus.atualizar_total_metal_pcp()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$BEGIN
    -- =================================================================================
    -- 1. TRATAMENTO DO VALOR ANTIGO (OLD) - Para DELETE ou UPDATE
    -- Subtrai o valor anterior da coluna correspondente
    -- =================================================================================
    IF (TG_OP = 'DELETE' OR TG_OP = 'UPDATE') THEN
        IF OLD.pcp_id IS NOT NULL AND OLD.insumo = 1 THEN
            
            -- Se era entrada (Tipo 1 ou 2), retira do total_metal
            IF OLD.tipo_apontamento IN (1, 2) THEN
                UPDATE directus.pcp 
                SET total_metal = COALESCE(total_metal, 0) - OLD.qtd 
                WHERE id = OLD.pcp_id;
            
            -- Se era retorno (Tipo 5), retira do retorno_metal
            ELSIF OLD.tipo_apontamento = 5 THEN
                UPDATE directus.pcp 
                SET retorno_metal = COALESCE(retorno_metal, 0) - OLD.qtd 
                WHERE id = OLD.pcp_id;
            END IF;
            
        END IF;
    END IF;

    -- =================================================================================
    -- 2. TRATAMENTO DO VALOR NOVO (NEW) - Para INSERT ou UPDATE
    -- Soma o novo valor na coluna correspondente
    -- =================================================================================
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
        IF NEW.pcp_id IS NOT NULL AND NEW.insumo = 1 THEN
            
            -- Se for entrada (Tipo 1 ou 2), soma no total_metal
            IF NEW.tipo_apontamento IN (1, 2) THEN
                UPDATE directus.pcp 
                SET total_metal = COALESCE(total_metal, 0) + NEW.qtd 
                WHERE id = NEW.pcp_id;
            
            -- Se for retorno (Tipo 5), soma no retorno_metal
            ELSIF NEW.tipo_apontamento = 5 THEN
                UPDATE directus.pcp 
                SET retorno_metal = COALESCE(retorno_metal, 0) + NEW.qtd 
                WHERE id = NEW.pcp_id;
            END IF;

        END IF;
    END IF;

    RETURN NEW;
END;$function$

```

</details>

_Sem referência identificada no código._

---

## calc_peso_ourofino

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION directus.calc_peso_ourofino()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.peso_ouro18 IS NOT NULL AND NEW.fator IS NOT NULL THEN
    NEW.peso_ourofino := ROUND(NEW.peso_ouro18 * NEW.fator, 2);
  END IF;
  RETURN NEW;
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## calc_totais_ordem_compra

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION directus.calc_totais_ordem_compra()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_ordem_id INTEGER;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_ordem_id := OLD.ordem_compraid;
  ELSE
    v_ordem_id := NEW.ordem_compraid;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.ordem_compraid IS DISTINCT FROM NEW.ordem_compraid THEN
    UPDATE directus."ordemCompra"
    SET
      "pesoTotalOuro18"   = sub.total_ouro18,
      "pesoTotalOuroFino" = sub.total_ourofino,
      "fatorMedio"         = sub.fator_ponderado
    FROM (
      SELECT
        COALESCE(SUM(peso_ouro18), 0)   AS total_ouro18,
        COALESCE(SUM(peso_ourofino), 0) AS total_ourofino,
        CASE
          WHEN SUM(peso_ouro18) > 0
          THEN ROUND(SUM(peso_ourofino) / SUM(peso_ouro18), 2)
          ELSE 0
        END AS fator_ponderado
      FROM directus.itens_ordem_compra
      WHERE ordem_compraid = OLD.ordem_compraid
    ) sub
    WHERE id = OLD.ordem_compraid;
  END IF;

  IF v_ordem_id IS NOT NULL THEN
    UPDATE directus."ordemCompra"
    SET
      "pesoTotalOuro18"   = sub.total_ouro18,
      "pesoTotalOuroFino" = sub.total_ourofino,
      "fatorMedio"         = sub.fator_ponderado
    FROM (
      SELECT
        COALESCE(SUM(peso_ouro18), 0)   AS total_ouro18,
        COALESCE(SUM(peso_ourofino), 0) AS total_ourofino,
        CASE
          WHEN SUM(peso_ouro18) > 0
          THEN ROUND(SUM(peso_ourofino) / SUM(peso_ouro18), 2)
          ELSE 0
        END AS fator_ponderado
      FROM directus.itens_ordem_compra
      WHERE ordem_compraid = v_ordem_id
    ) sub
    WHERE id = v_ordem_id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## calcular_peso_unitario_pcp

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION directus.calcular_peso_unitario_pcp()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- Lógica: Quantidade / PMC
    -- NULLIF(NEW.pmc, 0) previne erro de divisão por zero.
    -- O CAST (... AS numeric) garante que a divisão não seja inteira, mantendo os decimais.
    
    NEW.peso_unitario := CAST(NEW.quantidade AS numeric) / NULLIF(NEW.pmc, 0);
    
    RETURN NEW;
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## calcular_total_geral_pcp

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION directus.calcular_total_geral_pcp()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- Apenas atualiza o Total Geral (Pedras + Outros), sem mexer no PMC
    NEW.total_geral_outros_pesos := 
        COALESCE(CAST(NEW.total_pedras_g AS NUMERIC), 0) + 
        COALESCE(CAST(NEW.total_outros_pesos_g AS NUMERIC), 0);
    
    RETURN NEW;
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## criar_comentario_com_mencoes

- **Tipo:** FUNCTION (plpgsql) — SECURITY DEFINER
- **Argumentos:** `p_ordem_id integer, p_user_id uuid, p_conteudo text, p_conteudo_texto text, p_anexos_path text[], p_mencoes_ids uuid[]`
- **Retorno:** `json`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION directus.criar_comentario_com_mencoes(p_ordem_id integer, p_user_id uuid, p_conteudo text, p_conteudo_texto text, p_anexos_path text[], p_mencoes_ids uuid[])
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_comentario_id INT;
  v_now TIMESTAMP := NOW();
BEGIN
  -- 1. Inserir o Comentário
  INSERT INTO directus.ordem_comentarios (
    ordem_id,
    user_id,
    conteudo,
    conteudo_texto,
    anexos_path,
    editado,
    data_edicao,
    date_created,
    date_updated,
    deleted_at
  )
  VALUES (
    p_ordem_id,
    p_user_id,
    p_conteudo,
    p_conteudo_texto,
    p_anexos_path,
    FALSE,
    NULL,
    v_now,
    v_now,
    NULL
  )
  RETURNING id INTO v_comentario_id;

  -- 2. Inserir as Menções (se houver)
  IF p_mencoes_ids IS NOT NULL AND array_length(p_mencoes_ids, 1) > 0 THEN
    INSERT INTO directus.ordem_comentario_mencoes (
      comentario_id,
      ordem_id,
      user_id_mencionado,
      user_id_mencionador,
      date_created
    )
    SELECT 
      v_comentario_id,
      p_ordem_id,
      unnest_id,
      p_user_id,
      v_now
    FROM unnest(p_mencoes_ids) AS unnest_id;
  END IF;

  -- 3. Retornar o comentário criado
  RETURN json_build_object(
    'success', TRUE,
    'id', v_comentario_id,
    'ordem_id', p_ordem_id,
    'date_created', v_now
  );

EXCEPTION WHEN OTHERS THEN
  -- Rollback automático pelo Postgres
  RAISE EXCEPTION 'Erro ao criar comentário: %', SQLERRM;
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## fn_atualizar_conclusao_universal

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION directus.fn_atualizar_conclusao_universal()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    nome_coluna text := TG_ARGV[0];
    id_concluido text := TG_ARGV[1];
    valor_novo text := (to_jsonb(NEW)->>nome_coluna);
BEGIN
    -- CASO 1: Registro Novo (INSERT)
    IF (TG_OP = 'INSERT') THEN
        IF valor_novo = id_concluido THEN
            NEW.data_conclusao := CURRENT_TIMESTAMP;
        END IF;

    -- CASO 2: Atualização (UPDATE)
    ELSIF (TG_OP = 'UPDATE') THEN
        IF valor_novo = id_concluido AND (to_jsonb(OLD)->>nome_coluna IS DISTINCT FROM id_concluido) THEN
            NEW.data_conclusao := CURRENT_TIMESTAMP;
        END IF;
    END IF;

    RETURN NEW;
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## fn_ordens_comentarios_update_date_column

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION directus.fn_ordens_comentarios_update_date_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- Se o nome da coluna for diferente de 'updated_at', mude aqui:
    NEW.date_updated = NOW(); 
    RETURN NEW;
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## fn_vinculo_entrega_ordens

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION directus.fn_vinculo_entrega_ordens()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    id_concluido text := TG_ARGV[0]; -- Valor que significa concluído
BEGIN
    -- Verifica se a etapa da entrega mudou para o valor de conclusão
    IF (to_jsonb(NEW)->>'etapas') = id_concluido 
       AND (to_jsonb(OLD)->>'etapas' IS DISTINCT FROM id_concluido) THEN
        
        UPDATE directus.ordens
        SET data_conclusao = CURRENT_TIMESTAMP
        WHERE id = (to_jsonb(NEW)->>'ordem_id')::int; -- Certifique-se que o nome da coluna é ordem_id

    END IF;

    RETURN NEW;
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## func_gerar_numero_ordem

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION directus.func_gerar_numero_ordem()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    prox_valor INTEGER;
BEGIN
    -- Busca o próximo valor da sequência
    prox_valor := nextval('directus.seq_ordens_estoque_num');
    
    -- Formata para 'c-' seguido do número preenchido com zeros (ex: 0005)
    -- O número '4' no lpad indica o total de dígitos numéricos desejados
    NEW.numero_ordem := 'c-' || lpad(prox_valor::text, 4, '0');
    
    RETURN NEW;
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
CREATE OR REPLACE FUNCTION directus.preencher_numero_ordem()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$DECLARE
    next_id INTEGER;
BEGIN
    -- Se o campo vier vazio, geramos o código
    IF NEW.numero_ordem IS NULL THEN
        -- Pega o próximo número da sequência
        next_id := nextval('directus.seq_ordens_numero');
        
        -- Formata: 'C - 0001', 'C - 0002', etc.
        NEW.numero_ordem := 'C-' || TO_CHAR(next_id, 'FM0000');
    END IF;
    RETURN NEW;
END;$function$

```

</details>

_Sem referência identificada no código._

---

## replicar_pmc_controle_estoque

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION directus.replicar_pmc_controle_estoque()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    -- Variáveis para armazenar o que vamos buscar na tabela de ordens
    v_deposito_id INT;
    v_setor_id INT;
BEGIN
    -- Só executa se o PMC tiver valor
    IF (NEW.pmc IS NOT NULL) THEN
        
        -- BUSCA DE DADOS (JOIN):
        -- Vai na tabela 'ordens' e pega o Depósito (local_atual) e Setor (setor_atual)
        -- baseando-se no ID da ordem que está no PCP.
        SELECT local_atual, setor_atual
        INTO v_deposito_id, v_setor_id
        FROM directus.ordens 
        WHERE id = NEW.ordem_id;

        -- UPSERT (Inserir ou Atualizar):
        INSERT INTO directus.controle_estoque (
            ordem_id, 
            saida, 
            deposito_id, 
            setor, 
            insumo_id, 
            marcador
        )
        VALUES (
            NEW.ordem_id,                -- ID da Ordem (Vem do PCP)
            CAST(NEW.pmc AS NUMERIC),    -- Valor da Saída (PMC do PCP)
            v_deposito_id,               -- Depósito (Vem da tabela Ordens)
            v_setor_id,                  -- Setor (Vem da tabela Ordens)
            1,                           -- Insumo Fixo: 1
            'S'                          -- Marcador Fixo: 'S'
        )
        -- Se já existir um registro com esse ordem_id, apenas atualiza os valores
        ON CONFLICT (ordem_id) 
        DO UPDATE SET 
            saida = EXCLUDED.saida,
            deposito_id = EXCLUDED.deposito_id,
            setor = EXCLUDED.setor;
            
    END IF;

    RETURN NULL;
END;
$function$

```

</details>

_Sem referência identificada no código._

---

