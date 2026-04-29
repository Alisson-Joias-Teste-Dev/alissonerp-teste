# `alissonerp` — Funções e Procedures

> 67 entradas | gerado 2026-04-29

## Índice

- [`atualizar_preco_produto_v2()`](#atualizar_preco_produto_v2) 🛡️
- [`fn_adicionar_dias_uteis(p_data_inicio date, p_dias_uteis integer)`](#fn_adicionar_dias_uteis)
- [`fn_aprovacao_para_entrega()`](#fn_aprovacao_para_entrega) 🛡️
- [`fn_atualizar_parametros_sistema()`](#fn_atualizar_parametros_sistema)
- [`fn_audit_log()`](#fn_audit_log) 🛡️
- [`fn_auto_auditoria_loja()`](#fn_auto_auditoria_loja) 🛡️
- [`fn_bloquear_compra()`](#fn_bloquear_compra)
- [`fn_bloquear_venda()`](#fn_bloquear_venda)
- [`fn_calcular_item_compra()`](#fn_calcular_item_compra)
- [`fn_calcular_peso_pedra_gramas()`](#fn_calcular_peso_pedra_gramas)
- [`fn_calcular_pmc_distribuicao(p_peso_final real, p_total_outros real, p_entrada real, p_retorno real)`](#fn_calcular_pmc_distribuicao)
- [`fn_calcular_pmc_pcp(p_peso_final real, p_total_outros real, p_metal_externo real, p_entrada real, p_)`](#fn_calcular_pmc_pcp)
- [`fn_cancelar_pcp_ordem()`](#fn_cancelar_pcp_ordem)
- [`fn_compra_gerar_conta_pagar()`](#fn_compra_gerar_conta_pagar) 🛡️
- [`fn_concluir_compra()`](#fn_concluir_compra) 🛡️
- [`fn_concluir_distribuicao()`](#fn_concluir_distribuicao) 🛡️
- [`fn_concluir_protocolo()`](#fn_concluir_protocolo) 🛡️
- [`fn_cr_marcar_pago_mp(p_venda_id integer)`](#fn_cr_marcar_pago_mp)
- [`fn_criar_fechamento_por_ordem()`](#fn_criar_fechamento_por_ordem) 🛡️
- [`fn_criar_item_distribuicao(p_dist_id integer, p_insumo_id integer, p_deposito_id integer, p_qtd real, p_tip)`](#fn_criar_item_distribuicao)
- [`fn_criar_itens_ordem(p_ordem_id integer, p_insumo_id integer, p_deposito_id integer, p_qtd real, p_ti)`](#fn_criar_itens_ordem)
- [`fn_criar_itens_ordem(p_ordem_id integer, p_insumo_id integer, p_deposito_id integer, p_qtd real, p_ti)`](#fn_criar_itens_ordem)
- [`fn_criar_par_movimentacao(p_insumo_id integer, p_quantidade real, p_dep_origem integer, p_set_origem integ)`](#fn_criar_par_movimentacao)
- [`fn_criar_servico_from_pcp()`](#fn_criar_servico_from_pcp)
- [`fn_curva_touch_updated_at()`](#fn_curva_touch_updated_at)
- [`fn_devolucoes_updated_at()`](#fn_devolucoes_updated_at)
- [`fn_disparar_webhook(p_nome character varying, p_payload jsonb)`](#fn_disparar_webhook)
- [`fn_estoque_comercial_aprovar_venda()`](#fn_estoque_comercial_aprovar_venda) 🛡️
- [`fn_estoque_comercial_baixa_venda()`](#fn_estoque_comercial_baixa_venda) 🛡️
- [`fn_estoque_comercial_cancelamento_venda()`](#fn_estoque_comercial_cancelamento_venda) 🛡️
- [`fn_estoque_comercial_entrega_venda()`](#fn_estoque_comercial_entrega_venda) 🛡️
- [`fn_estoque_comercial_reversao_item()`](#fn_estoque_comercial_reversao_item) 🛡️
- [`fn_estoque_comercial_update_qtd_item()`](#fn_estoque_comercial_update_qtd_item) 🛡️
- [`fn_handle_new_user()`](#fn_handle_new_user) 🛡️
- [`fn_ponte_directus_para_alissonerp()`](#fn_ponte_directus_para_alissonerp) 🛡️
- [`fn_processar_apontamento_dist()`](#fn_processar_apontamento_dist) 🛡️
- [`fn_processar_apontamento_pcp()`](#fn_processar_apontamento_pcp) 🛡️
- [`fn_processar_auditoria()`](#fn_processar_auditoria) 🛡️
- [`fn_processar_fechamento_dist()`](#fn_processar_fechamento_dist) 🛡️
- [`fn_processar_lancamento_avulso()`](#fn_processar_lancamento_avulso)
- [`fn_processar_outros_insumos_dist()`](#fn_processar_outros_insumos_dist) 🛡️
- [`fn_processar_outros_insumos_pcp()`](#fn_processar_outros_insumos_pcp) 🛡️
- [`fn_processar_saida_ordem()`](#fn_processar_saida_ordem) 🛡️
- [`fn_processar_transferencia()`](#fn_processar_transferencia) 🛡️
- [`fn_produto_imagens_touch()`](#fn_produto_imagens_touch)
- [`fn_proteger_campos_pdv()`](#fn_proteger_campos_pdv)
- [`fn_proteger_itens_venda_fechada()`](#fn_proteger_itens_venda_fechada) 🛡️
- [`fn_proteger_venda_fechada()`](#fn_proteger_venda_fechada) 🛡️
- [`fn_recalcular_totais_venda()`](#fn_recalcular_totais_venda)
- [`fn_resumo_recebido_mp(p_inicio date, p_fim date)`](#fn_resumo_recebido_mp)
- [`fn_sync_item_venda_from_public()`](#fn_sync_item_venda_from_public)
- [`fn_sync_venda_from_public()`](#fn_sync_venda_from_public)
- [`fn_sync_venda_update_from_public()`](#fn_sync_venda_update_from_public)
- [`fn_touch_updated_at()`](#fn_touch_updated_at)
- [`fn_update_estoque_comercial_config_ts()`](#fn_update_estoque_comercial_config_ts)
- [`fn_updated_at_mp_point_devices()`](#fn_updated_at_mp_point_devices)
- [`fn_updated_at_tarefas()`](#fn_updated_at_tarefas)
- [`fn_updated_at_vendas_erp()`](#fn_updated_at_vendas_erp)
- [`fn_user_role()`](#fn_user_role) 🛡️
- [`fn_user_views_touch_updated()`](#fn_user_views_touch_updated)
- [`fn_venda_cancelar_conta_receber()`](#fn_venda_cancelar_conta_receber) 🛡️
- [`fn_venda_gerar_conta_receber()`](#fn_venda_gerar_conta_receber) 🛡️
- [`fn_venda_gerar_conta_receber_on_insert()`](#fn_venda_gerar_conta_receber_on_insert) 🛡️
- [`gerar_proximo_epc()`](#gerar_proximo_epc)
- [`proximo_sku_pz()`](#proximo_sku_pz)
- [`tg_joias_rfid_touch_updated()`](#tg_joias_rfid_touch_updated)
- [`tg_produto_personalizacao_touch_updated()`](#tg_produto_personalizacao_touch_updated)

_🛡️ = SECURITY DEFINER_

---

## atualizar_preco_produto_v2

- **Tipo:** FUNCTION (plpgsql) — SECURITY DEFINER
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION alissonerp.atualizar_preco_produto_v2()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    param_record RECORD;
    cotacao_metal NUMERIC;
    fator_eff NUMERIC;
    novo_custo NUMERIC;
    novo_preco_cotacao NUMERIC;
    novo_preco_sync INT;
    valor_base INT;
    resto NUMERIC;
    tipo_metal_norm TEXT;
BEGIN
    SELECT ouro, prata_manual INTO param_record FROM public.parametros LIMIT 1;
    tipo_metal_norm := LOWER(TRIM(COALESCE(NEW.tipo_metal, '')));

    IF tipo_metal_norm LIKE '%ouro%' THEN
        cotacao_metal := param_record.ouro;
    ELSIF tipo_metal_norm LIKE '%prata%' THEN
        cotacao_metal := param_record.prata_manual;
    ELSE
        cotacao_metal := NULL;
    END IF;

    -- Default fator = 1 se NULL
    fator_eff := COALESCE(NEW.fator, 1);

    IF
        cotacao_metal IS NOT NULL AND cotacao_metal > 0 AND
        NEW.peso_precificado IS NOT NULL AND NEW.peso_precificado > 0 AND
        NEW.markup IS NOT NULL AND NEW.markup > 0
    THEN
        novo_custo := (cotacao_metal * fator_eff) * NEW.peso_precificado;
        novo_preco_cotacao := novo_custo * NEW.markup;

        valor_base := floor(novo_preco_cotacao / 10) * 10;
        resto := novo_preco_cotacao - valor_base;
        IF resto < 5 THEN
            novo_preco_sync := valor_base;
        ELSE
            novo_preco_sync := valor_base + 10;
        END IF;

        NEW.custo_na_cotacao := novo_custo;
        NEW.preco_na_cotacao := novo_preco_cotacao;
        NEW.preco_sync := novo_preco_sync;
        NEW.fator := fator_eff;

        IF TG_OP = 'INSERT' AND NEW.preco_sync IS NOT NULL THEN
            NEW.data_atualizacao_preco := now();
        ELSIF TG_OP = 'UPDATE' AND NEW.preco_sync IS NOT NULL AND OLD.preco_tiny IS NOT NULL AND OLD.preco_tiny > 0 THEN
            IF NEW.preco_sync >= (OLD.preco_tiny * 1.02) OR NEW.preco_sync <= (OLD.preco_tiny * 0.95) THEN
                NEW.data_atualizacao_preco := now();
            END IF;
        END IF;
    ELSE
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

_Sem referência identificada no código._

---

## fn_adicionar_dias_uteis

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `p_data_inicio date, p_dias_uteis integer`
- **Retorno:** `date`
- **Volatility:** IMMUTABLE
- **Comentário:** Retorna a data após N dias úteis (seg-sex). Não conta o dia de início.

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION alissonerp.fn_adicionar_dias_uteis(p_data_inicio date, p_dias_uteis integer)
 RETURNS date
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
  v_data_atual      DATE;
  v_dias_adicionados INTEGER := 0;
BEGIN
  v_data_atual := p_data_inicio;

  WHILE v_dias_adicionados < p_dias_uteis LOOP
    v_data_atual := v_data_atual + 1;
    -- EXTRACT(DOW): 0=domingo, 6=sábado
    IF EXTRACT(DOW FROM v_data_atual) NOT IN (0, 6) THEN
      v_dias_adicionados := v_dias_adicionados + 1;
    END IF;
  END LOOP;

  RETURN v_data_atual;
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## fn_aprovacao_para_entrega

- **Tipo:** FUNCTION (plpgsql) — SECURITY DEFINER
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE
- **Comentário:** Flow 06: aprovacoes_consultora→aprovado dispara INSERT em preparacoes_entrega.

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION alissonerp.fn_aprovacao_para_entrega()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- Guard: so ao aprovar
  IF NEW.etapas != 'aprovado' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.etapas = 'aprovado' THEN RETURN NEW; END IF;

  INSERT INTO alissonerp.preparacoes_entrega (etapas, ordem_id)
  VALUES ('pendente', NEW.ordem_id);

  RETURN NEW;
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## fn_atualizar_parametros_sistema

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION alissonerp.fn_atualizar_parametros_sistema()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## fn_audit_log

- **Tipo:** FUNCTION (plpgsql) — SECURITY DEFINER
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION alissonerp.fn_audit_log()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO alissonerp.audit_log (tabela, operacao, registro_id, dados_antes, dados_depois, usuario_id)
  VALUES (
    TG_TABLE_NAME, TG_OP,
    COALESCE(NEW.id::text, OLD.id::text),
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) END,
    COALESCE(current_setting('request.jwt.claims', true)::jsonb->>'sub', NULL)::uuid
  );
  RETURN COALESCE(NEW, OLD);
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## fn_auto_auditoria_loja

- **Tipo:** FUNCTION (plpgsql) — SECURITY DEFINER
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION alissonerp.fn_auto_auditoria_loja()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
    DECLARE
      v_audit_id INTEGER;
    BEGIN
      -- Ignora ordens de teste ou sem rota definida que não precisam de auditoria
      IF NEW.eh_teste = TRUE THEN RETURN NEW; END IF;
      IF NEW.rota IS NULL THEN RETURN NEW; END IF;

      -- Só cria se ainda não existe auditoria loja ativa para esta ordem
      IF EXISTS (
        SELECT 1 FROM alissonerp.auditorias
        WHERE ordem_id = NEW.id AND tipo_auditoria = 'loja' AND situacao != 'reprovado'
      ) THEN
        RETURN NEW;
      END IF;

      INSERT INTO alissonerp.auditorias (
        situacao, tipo_auditoria, rota_processo, ordem_id,
        peso_negociado, parecer, dados_ordem
      ) VALUES (
        'pendente', 'loja', 'entrada_ordem', NEW.id,
        COALESCE(NEW.peso_metal_negociado, 0), NULL,
        jsonb_build_object(
          'numero_ordem', NEW.numero_ordem,
          'tipo_ordem',   NEW.tipo_ordem::text,
          'rota',         NEW.rota::text,
          'origem',       'trigger_auto'
        )
      ) RETURNING id INTO v_audit_id;

      -- Aprovação imediata dispara fn_processar_auditoria (BEFORE UPDATE)
      UPDATE alissonerp.auditorias
      SET situacao = 'aprovado', data_conclusao = NOW(),
          parecer  = 'Aprovação automática — trigger'
      WHERE id = v_audit_id;

      RETURN NEW;
    END;
    $function$

```

</details>

_Sem referência identificada no código._

---

## fn_bloquear_compra

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION alissonerp.fn_bloquear_compra()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.bloqueado = true AND NEW.situacao != OLD.situacao THEN
    RAISE EXCEPTION 'Compra #% está bloqueada para edição', OLD.id;
  END IF;
  RETURN NEW;
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## fn_bloquear_venda

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION alissonerp.fn_bloquear_venda()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
      BEGIN
        IF current_setting('app.sync_ativo', true) = 'true' THEN RETURN NEW; END IF;
        IF OLD.bloqueado = true THEN
          RAISE EXCEPTION 'Venda bloqueada nao pode ser editada';
        END IF;
        RETURN NEW;
      END;
      $function$

```

</details>

_Sem referência identificada no código._

---

## fn_calcular_item_compra

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION alissonerp.fn_calcular_item_compra()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_cat INTEGER;
BEGIN
  SELECT categoria_id INTO v_cat
  FROM alissonerp.insumos WHERE id = NEW.insumo_id;

  IF v_cat = 2
     AND NEW.peso_ct IS NOT NULL AND NEW.peso_ct > 0
     AND NEW.custo_por_ct IS NOT NULL AND NEW.custo_por_ct > 0 THEN
    -- Pedras: pre??o total em ct
    NEW.valor_total := ROUND((NEW.peso_ct * NEW.custo_por_ct)::numeric, 2);
  ELSE
    -- Padr??o: qtd ?? valor_unit??rio
    NEW.valor_total := ROUND(
      (COALESCE(NEW.qtd, 0) * COALESCE(NEW.valor_unitario, 0))::numeric,
      2
    );
  END IF;

  RETURN NEW;
END;
$function$

```

</details>

**Uso no código:**
- `alissonerp.fn_calcular_item_compra` — 3 ocorrência(s)
  - `src/app/api/compras/[id]/itens/route.ts:36`
  - `supabase/migrations/098_triggers_pedras_ct_compras.sql:8`
  - `supabase/migrations/098_triggers_pedras_ct_compras.sql:381`

---

## fn_calcular_peso_pedra_gramas

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION alissonerp.fn_calcular_peso_pedra_gramas()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.peso_pedra_ct IS NOT NULL AND (
    OLD.peso_pedra_ct IS NULL OR 
    NEW.peso_pedra_ct IS DISTINCT FROM OLD.peso_pedra_ct
  ) THEN
    NEW.peso_pedra = NEW.peso_pedra_ct * 0.2;
  END IF;
  RETURN NEW;
END;
$function$

```

</details>

**Uso no código:**
- `alissonerp.fn_calcular_peso_pedra_gramas` — 2 ocorrência(s)
  - `scripts/_db_mapping_build_docs.mjs:180`
  - `scripts/_db_mapping_build_docs.mjs:433`

---

## fn_calcular_pmc_distribuicao

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `p_peso_final real, p_total_outros real, p_entrada real, p_retorno real`
- **Retorno:** `TABLE(pmc real, quebra real, percentual real)`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION alissonerp.fn_calcular_pmc_distribuicao(p_peso_final real, p_total_outros real, p_entrada real, p_retorno real)
 RETURNS TABLE(pmc real, quebra real, percentual real)
 LANGUAGE plpgsql
AS $function$
DECLARE v_pmc REAL; v_quebra REAL; v_pct REAL;
BEGIN
  v_pmc:=p_peso_final-p_total_outros; v_quebra:=p_entrada-v_pmc;
  v_pct:=CASE WHEN v_pmc!=0 THEN (v_quebra/v_pmc*100) ELSE 0 END;
  RETURN QUERY SELECT ROUND(v_pmc::numeric,3)::REAL,ROUND(v_quebra::numeric,3)::REAL,ROUND(v_pct::numeric,2)::REAL;
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## fn_calcular_pmc_pcp

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `p_peso_final real, p_total_outros real, p_metal_externo real, p_entrada real, p_retorno real`
- **Retorno:** `TABLE(pmc real, quebra real, percentual real)`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION alissonerp.fn_calcular_pmc_pcp(p_peso_final real, p_total_outros real, p_metal_externo real, p_entrada real, p_retorno real)
 RETURNS TABLE(pmc real, quebra real, percentual real)
 LANGUAGE plpgsql
AS $function$
DECLARE v_pmc REAL; v_consumo REAL; v_quebra REAL; v_pct REAL;
BEGIN
  IF p_entrada = 0 THEN RETURN QUERY SELECT 0::REAL,0::REAL,0::REAL; RETURN; END IF;
  v_pmc:=p_peso_final-p_total_outros-p_metal_externo; v_consumo:=p_entrada-p_retorno;
  v_quebra:=v_consumo-v_pmc;
  v_pct:=CASE WHEN v_consumo!=0 THEN (v_quebra/v_consumo*100) ELSE 0 END;
  RETURN QUERY SELECT ROUND(v_pmc::numeric,2)::REAL,ROUND(v_quebra::numeric,2)::REAL,ROUND(v_pct::numeric,2)::REAL;
END;
$function$

```

</details>

**Uso no código:**
- `alissonerp.fn_calcular_pmc_pcp` — 1 ocorrência(s)
  - `supabase/migrations/019_trigger_transferencia_saida.sql:172`

---

## fn_cancelar_pcp_ordem

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION alissonerp.fn_cancelar_pcp_ordem()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    BEGIN
      IF NEW.status::text = 'cancelado' AND OLD.status::text != 'cancelado' THEN
        UPDATE alissonerp.pcp
        SET etapas = 'cancelado', bloqueado = true
        WHERE ordem_id = NEW.id
          AND etapas::text != 'cancelado';
      END IF;
      RETURN NEW;
    END;
    $function$

```

</details>

_Sem referência identificada no código._

---

## fn_compra_gerar_conta_pagar

- **Tipo:** FUNCTION (plpgsql) — SECURITY DEFINER
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION alissonerp.fn_compra_gerar_conta_pagar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_fornecedor_nome TEXT;
  v_existe BOOLEAN;
BEGIN
  -- Só executa se situação mudou para concluido
  IF NEW.situacao != 'concluido' OR OLD.situacao = 'concluido' THEN
    RETURN NEW;
  END IF;

  -- Guard duplicata
  SELECT EXISTS(
    SELECT 1 FROM alissonerp.contas_pagar WHERE compra_id = NEW.id
  ) INTO v_existe;

  IF v_existe THEN
    RETURN NEW;
  END IF;

  -- Buscar nome do fornecedor
  SELECT nome INTO v_fornecedor_nome
  FROM public.contatos WHERE id_contato = NEW.fornecedor_id;

  -- Criar conta a pagar
  INSERT INTO alissonerp.contas_pagar (
    descricao, fornecedor_id, fornecedor_nome, compra_id, valor,
    data_vencimento, situacao, categoria, created_by
  ) VALUES (
    'Compra #' || NEW.id,
    NEW.fornecedor_id,
    v_fornecedor_nome,
    NEW.id,
    COALESCE(NEW.total, 0),
    CURRENT_DATE + interval '30 days',
    'pendente',
    'compra',
    NEW.created_by
  );

  RETURN NEW;
END;
$function$

```

</details>

**Uso no código:**
- `alissonerp.fn_compra_gerar_conta_pagar` — 2 ocorrência(s)
  - `supabase/migrations/113_financeiro_auto.sql:88`
  - `supabase/migrations/113_financeiro_auto.sql:149`

---

## fn_concluir_compra

- **Tipo:** FUNCTION (plpgsql) — SECURITY DEFINER
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE
- **Comentário:** Concluir compra → CE entrada por item + bloquear edição.

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION alissonerp.fn_concluir_compra()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_item     RECORD;
  v_entrada  REAL;
  v_local_id INTEGER;
BEGIN
  IF NEW.situacao != 'concluido' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.situacao = 'concluido' THEN RETURN NEW; END IF;

  -- Guard: transi????o de status v??lida
  IF TG_OP = 'UPDATE' AND OLD.situacao NOT IN ('rascunho', 'recebida') THEN
    RAISE EXCEPTION 'Compra #% precisa estar em rascunho ou recebida para concluir (status atual: %)',
      OLD.id, OLD.situacao;
  END IF;

  -- Local de destino: usa local_destino_id se preenchido, sen??o F??brica (1)
  v_local_id := COALESCE(NEW.local_destino_id, 1);

  FOR v_item IN
    SELECT ic.*, i.categoria_id
    FROM alissonerp.itens_compra ic
    JOIN alissonerp.insumos i ON i.id = ic.insumo_id
    WHERE ic.compra_id = NEW.id
  LOOP
    -- Pedras: CE em ct | Outros: CE em qtd (gramas/ml/un)
    IF v_item.categoria_id = 2
       AND v_item.peso_ct IS NOT NULL
       AND v_item.peso_ct > 0 THEN
      v_entrada := v_item.peso_ct;
    ELSE
      v_entrada := v_item.qtd;
    END IF;

    INSERT INTO alissonerp.movimentacoes_estoque
      (entrada, saida, insumo_id, deposito_id,
       marcador, obs, preco_compra, valor_total, local_estoque_id)
    VALUES
      (v_entrada, 0, v_item.insumo_id,
       COALESCE(v_item.deposito_id, 1),
       'EA'::alissonerp.enum_marcador_estoque,
       'Entrada via compra #' || NEW.id,
       v_item.valor_unitario, v_item.valor_total,
       v_local_id);
  END LOOP;

  NEW.bloqueado := true;

  SELECT COALESCE(SUM(valor_total), 0) INTO NEW.total
  FROM alissonerp.itens_compra WHERE compra_id = NEW.id;

  RETURN NEW;
END;
$function$

```

</details>

**Uso no código:**
- `alissonerp.fn_concluir_compra` — 2 ocorrência(s)
  - `supabase/migrations/098_triggers_pedras_ct_compras.sql:9`
  - `supabase/migrations/098_triggers_pedras_ct_compras.sql:415`

---

## fn_concluir_distribuicao

- **Tipo:** FUNCTION (plpgsql) — SECURITY DEFINER
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE
- **Comentário:** Flow 1014: PMC=pf-outros (sem metal_ext), quebra=(entrada-retorno)-PMC, %=quebra/PMC. CE TEDMD+TEDPD.

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION alissonerp.fn_concluir_distribuicao()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_pmc           REAL;
  v_quebra        REAL;
  v_pct           REAL;
  v_metal_liquido REAL;
BEGIN
  IF NEW.etapas != 'concluido' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.etapas = 'concluido' THEN RETURN NEW; END IF;

  v_pmc    := COALESCE(NEW.peso_final, 0) - COALESCE(NEW.total_geral_outros_pesos, 0);
  v_quebra := (COALESCE(NEW.total_metal, 0) - COALESCE(NEW.retorno_metal, 0)) - v_pmc;

  -- metal_liquido: usa ouro_entregue (novo sistema) ou total_metal-retorno (legado)
  v_metal_liquido := COALESCE(
    NULLIF(NEW.ouro_entregue, 0),
    COALESCE(NEW.total_metal, 0) - COALESCE(NEW.retorno_metal, 0)
  );

  v_pct := CASE WHEN v_metal_liquido > 0
    THEN ROUND((v_quebra / v_metal_liquido * 100)::numeric, 2)::REAL
    ELSE 0
  END;

  -- CE TEDMD e TEDPD removidos — conclusão do lote é só administrativa.
  -- ZERO INSERT em movimentacoes_estoque (saída por ordem cobre o estoque).

  NEW.pmc                   := ROUND(v_pmc::numeric, 3);
  NEW.quebra                := ROUND(v_quebra::numeric, 3);
  NEW.porcentagem_de_quebra := v_pct;
  NEW.updated_at            := now();

  RETURN NEW;
END;
$function$

```

</details>

**Uso no código:**
- `alissonerp.fn_concluir_distribuicao` — 2 ocorrência(s)
  - `supabase/migrations/098_triggers_pedras_ct_compras.sql:17`
  - `supabase/migrations/098_triggers_pedras_ct_compras.sql:743`

---

## fn_concluir_protocolo

- **Tipo:** FUNCTION (plpgsql) — SECURITY DEFINER
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE
- **Comentário:** Flows 03+05: ida→cria PCPs em batch (saida_ordem vazia + pcp com zeros). volta→cria aprovacoes_consultora.

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION alissonerp.fn_concluir_protocolo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_rec      RECORD;
  v_saida_id INTEGER;
BEGIN
  -- Guard: so ao transicionar para 'concluido'
  IF NEW.etapas != 'concluido' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.etapas = 'concluido' THEN RETURN NEW; END IF;

  IF NEW.direcao = 'ida' THEN
    -- Flow 03: para cada ordem → saida_ordem vazia + PCP + atualiza ordem
    FOR v_rec IN
      SELECT o.id            AS ordem_id,
             COALESCE(o.peso_metal_externo, 0) AS metal_ext
      FROM alissonerp.protocolo_ordens po
      JOIN alissonerp.ordens o ON po.ordem_id = o.id
      WHERE po.protocolo_id = NEW.id
    LOOP
      -- Saida vazia (trigger em saidas_ordem e no-op pois peso=NULL com o novo guard)
      INSERT INTO alissonerp.saidas_ordem (ordem_id)
      VALUES (v_rec.ordem_id) RETURNING id INTO v_saida_id;

      -- PCP com zeros explicitos para evitar NULL + aritmetica
      INSERT INTO alissonerp.pcp (
        ordem_id, etapas, saida_ordem_id, metal_externo,
        total_metal, retorno_metal, total_pedras_un, total_pedras_g,
        total_geral_outros_pesos, total_outros_pesos_g
      ) VALUES (
        v_rec.ordem_id, 'novas_ordens', v_saida_id, v_rec.metal_ext,
        0, 0, 0, 0, 0, 0
      );

      -- Ordem → em_andamento
      UPDATE alissonerp.ordens
      SET status = 'em_andamento', updated_at = now()
      WHERE id = v_rec.ordem_id;
    END LOOP;

  ELSIF NEW.direcao = 'volta' THEN
    -- Flow 05: para cada ordem → aprovacao_consultora pendente
    FOR v_rec IN
      SELECT o.id AS ordem_id, o.vendedor_id
      FROM alissonerp.protocolo_ordens po
      JOIN alissonerp.ordens o ON po.ordem_id = o.id
      WHERE po.protocolo_id = NEW.id
    LOOP
      INSERT INTO alissonerp.aprovacoes_consultora (etapas, ordem_id, consultora_id)
      VALUES ('pendente', v_rec.ordem_id, v_rec.vendedor_id);
    END LOOP;
  END IF;

  -- Marcar data de conclusao
  NEW.data_conclusao := now();
  RETURN NEW;
END;
$function$

```

</details>

**Uso no código:**
- `alissonerp.fn_concluir_protocolo` — 14 ocorrência(s)
  - `src/app/api/pcp/transferir-service/receber/route.ts:10`
  - `src/app/api/pcp/transferir-service/receber/route.ts:125`
  - `src/app/api/pcp/transferir-service/receber/route.ts:148`
  - `src/app/api/service/receber/route.ts:10`
  - `src/app/api/service/receber/route.ts:104`

---

## fn_cr_marcar_pago_mp

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `p_venda_id integer`
- **Retorno:** `integer`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION alissonerp.fn_cr_marcar_pago_mp(p_venda_id integer)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
    DECLARE
      v_count INTEGER;
    BEGIN
      UPDATE alissonerp.contas_receber
      SET
        situacao         = 'pago',
        data_recebimento = CURRENT_DATE,
        updated_at       = NOW()
      WHERE venda_erp_id = p_venda_id
        AND situacao     = 'pendente';

      GET DIAGNOSTICS v_count = ROW_COUNT;
      RETURN v_count;
    END;
    $function$

```

</details>

**Uso no código:**
- `alissonerp.fn_cr_marcar_pago_mp` — 15 ocorrência(s)
  - `src/lib/vendas-aprovar.ts:678`
  - `src/lib/vendas-aprovar.ts:768`
  - `src/lib/vendas-aprovar.ts:772`
  - `src/lib/vendas-aprovar.ts:826`
  - `src/lib/vendas-aprovar.ts:915`

---

## fn_criar_fechamento_por_ordem

- **Tipo:** FUNCTION (plpgsql) — SECURITY DEFINER
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE
- **Comentário:** Flow 1012: INSERT em fechamentos_distribuicao ao vincular ordem (trigger em distribuicao_ordens).

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION alissonerp.fn_criar_fechamento_por_ordem()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO alissonerp.fechamentos_distribuicao (distribuicao_id, ordem_id)
  VALUES (NEW.distribuicao_id, NEW.ordens_id);
  RETURN NEW;
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## fn_criar_item_distribuicao

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `p_dist_id integer, p_insumo_id integer, p_deposito_id integer, p_qtd real, p_tipo integer`
- **Retorno:** `void`
- **Volatility:** VOLATILE
- **Comentário:** Flow 1011: Upsert em itens_distribuicao. Tipos 5,6 subtraem.

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION alissonerp.fn_criar_item_distribuicao(p_dist_id integer, p_insumo_id integer, p_deposito_id integer, p_qtd real, p_tipo integer)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_existente INTEGER;
  v_mult REAL := CASE WHEN p_tipo IN (5, 6) THEN -1.0 ELSE 1.0 END;
BEGIN
  SELECT id INTO v_existente
  FROM alissonerp.itens_distribuicao
  WHERE distribuicao_id = p_dist_id AND insumo_id = p_insumo_id;

  IF v_existente IS NOT NULL THEN
    UPDATE alissonerp.itens_distribuicao
    SET peso = peso + (p_qtd * v_mult)
    WHERE id = v_existente;
  ELSE
    INSERT INTO alissonerp.itens_distribuicao (distribuicao_id, deposito_id, insumo_id, peso)
    VALUES (p_dist_id, p_deposito_id, p_insumo_id, p_qtd * v_mult);
  END IF;
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## fn_criar_itens_ordem

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `p_ordem_id integer, p_insumo_id integer, p_deposito_id integer, p_qtd real, p_tipo_apontamento integer`
- **Retorno:** `void`
- **Volatility:** VOLATILE
- **Comentário:** Flow 1001: Cria/atualiza itens_ordem_insumos. Se existe soma peso, senao insere.

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION alissonerp.fn_criar_itens_ordem(p_ordem_id integer, p_insumo_id integer, p_deposito_id integer, p_qtd real, p_tipo_apontamento integer)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_item_existente INTEGER;
  v_multiplicador REAL;
BEGIN
  -- Retornos (tipo 5,6) subtraem; entradas (tipo 1,2,3,4) somam
  v_multiplicador := CASE WHEN p_tipo_apontamento IN (5, 6) THEN -1.0 ELSE 1.0 END;

  SELECT id INTO v_item_existente
  FROM alissonerp.itens_ordem_insumos
  WHERE ordem_id = p_ordem_id AND insumo_id = p_insumo_id;

  IF v_item_existente IS NOT NULL THEN
    UPDATE alissonerp.itens_ordem_insumos
    SET peso = peso + (p_qtd * v_multiplicador),
        updated_at = now()
    WHERE id = v_item_existente;
  ELSE
    INSERT INTO alissonerp.itens_ordem_insumos (ordem_id, deposito_id, insumo_id, peso)
    VALUES (p_ordem_id, p_deposito_id, p_insumo_id, p_qtd * v_multiplicador);
  END IF;
END;
$function$

```

</details>

**Uso no código:**
- `alissonerp.fn_criar_itens_ordem` — 5 ocorrência(s)
  - `supabase/migrations/018_trigger_apontamento_pcp.sql:191`
  - `supabase/migrations/101_fix_triggers_pedras_local.sql:5`
  - `supabase/migrations/101_fix_triggers_pedras_local.sql:22`
  - `supabase/migrations/101_fix_triggers_pedras_local.sql:27`
  - `supabase/migrations/101_fix_triggers_pedras_local.sql:73`

---

## fn_criar_itens_ordem

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `p_ordem_id integer, p_insumo_id integer, p_deposito_id integer, p_qtd real, p_tipo_apontamento integer, p_peso_gramas real`
- **Retorno:** `void`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION alissonerp.fn_criar_itens_ordem(p_ordem_id integer, p_insumo_id integer, p_deposito_id integer, p_qtd real, p_tipo_apontamento integer, p_peso_gramas real DEFAULT NULL::real)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_item_existente INTEGER;
  v_multiplicador  REAL;
  v_peso_real      REAL;
BEGIN
  -- Retornos (tipo 5,6) subtraem; entradas (1,2,3,4) somam
  v_multiplicador := CASE WHEN p_tipo_apontamento IN (5, 6) THEN -1.0 ELSE 1.0 END;

  -- Para pedras: p_peso_gramas (gramas reais); para metal: p_qtd ja e gramas
  v_peso_real := COALESCE(p_peso_gramas, p_qtd);

  SELECT id INTO v_item_existente
  FROM alissonerp.itens_ordem_insumos
  WHERE ordem_id = p_ordem_id AND insumo_id = p_insumo_id;

  IF v_item_existente IS NOT NULL THEN
    UPDATE alissonerp.itens_ordem_insumos
    SET peso       = peso + (v_peso_real * v_multiplicador),
        updated_at = now()
    WHERE id = v_item_existente;
  ELSE
    INSERT INTO alissonerp.itens_ordem_insumos (ordem_id, deposito_id, insumo_id, peso)
    VALUES (p_ordem_id, p_deposito_id, p_insumo_id, v_peso_real * v_multiplicador);
  END IF;
END;
$function$

```

</details>

**Uso no código:**
- `alissonerp.fn_criar_itens_ordem` — 5 ocorrência(s)
  - `supabase/migrations/018_trigger_apontamento_pcp.sql:191`
  - `supabase/migrations/101_fix_triggers_pedras_local.sql:5`
  - `supabase/migrations/101_fix_triggers_pedras_local.sql:22`
  - `supabase/migrations/101_fix_triggers_pedras_local.sql:27`
  - `supabase/migrations/101_fix_triggers_pedras_local.sql:73`

---

## fn_criar_par_movimentacao

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `p_insumo_id integer, p_quantidade real, p_dep_origem integer, p_set_origem integer, p_dep_destino integer, p_set_destino integer, p_marcador alissonerp.enum_marcador_estoque, p_ordem_id integer, p_obs text, p_local_id integer`
- **Retorno:** `TABLE(saida_id bigint, entrada_id bigint)`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION alissonerp.fn_criar_par_movimentacao(p_insumo_id integer, p_quantidade real, p_dep_origem integer, p_set_origem integer, p_dep_destino integer, p_set_destino integer, p_marcador alissonerp.enum_marcador_estoque, p_ordem_id integer DEFAULT NULL::integer, p_obs text DEFAULT NULL::text, p_local_id integer DEFAULT NULL::integer)
 RETURNS TABLE(saida_id bigint, entrada_id bigint)
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_saida_id  bigint;
  v_entrada_id bigint;
BEGIN
  INSERT INTO alissonerp.movimentacoes_estoque
    (saida, entrada, insumo_id, deposito_id, setor_id, marcador, ordem_id, obs, local_estoque_id)
  VALUES
    (p_quantidade, 0, p_insumo_id, p_dep_origem, p_set_origem,
     p_marcador, p_ordem_id, p_obs, COALESCE(p_local_id, 1))
  RETURNING id INTO v_saida_id;

  INSERT INTO alissonerp.movimentacoes_estoque
    (saida, entrada, insumo_id, deposito_id, setor_id, marcador, ordem_id, obs, local_estoque_id)
  VALUES
    (0, p_quantidade, p_insumo_id, p_dep_destino, p_set_destino,
     p_marcador, p_ordem_id, p_obs, COALESCE(p_local_id, 1))
  RETURNING id INTO v_entrada_id;

  RETURN QUERY SELECT v_saida_id, v_entrada_id;
END;
$function$

```

</details>

**Uso no código:**
- `alissonerp.fn_criar_par_movimentacao` — 13 ocorrência(s)
  - `src/app/api/service/carregar-aditivo/route.ts:79`
  - `src/app/api/service/carregar-solda/route.ts:79`
  - `scripts/_db_mapping_build_docs.mjs:179`
  - `supabase/migrations/098_triggers_pedras_ct_compras.sql:5`
  - `supabase/migrations/098_triggers_pedras_ct_compras.sql:32`

---

## fn_criar_servico_from_pcp

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION alissonerp.fn_criar_servico_from_pcp()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE
      v_tipo_ordem    VARCHAR;
      v_peso_entrada  NUMERIC;
      v_tipos_service JSONB;
    BEGIN
      SELECT tipo_ordem, COALESCE(peso_peca_servico, 0)
      INTO v_tipo_ordem, v_peso_entrada
      FROM alissonerp.ordens WHERE id = NEW.ordem_id;

      SELECT COALESCE(valor::jsonb, '["servico_venda","garantia","servico_interno"]'::jsonb)
      INTO v_tipos_service
      FROM alissonerp.configuracoes_sistema
      WHERE chave = 'service_tipos_ordem';

      IF v_tipo_ordem IS NOT NULL AND v_tipos_service ? v_tipo_ordem THEN
        INSERT INTO alissonerp.servicos
          (ordem_id, pcp_id, operador_id, peso_entrada, status)
        VALUES
          (NEW.ordem_id, NEW.id, NULL, v_peso_entrada, 'aguardando');
      END IF;

      RETURN NEW;
    END;
    $function$

```

</details>

**Uso no código:**
- `alissonerp.fn_criar_servico_from_pcp` — 2 ocorrência(s)
  - `scripts/_db_mapping_build_docs.mjs:180`
  - `scripts/_db_mapping_build_docs.mjs:433`

---

## fn_curva_touch_updated_at

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION alissonerp.fn_curva_touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## fn_devolucoes_updated_at

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION alissonerp.fn_devolucoes_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## fn_disparar_webhook

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `p_nome character varying, p_payload jsonb`
- **Retorno:** `void`
- **Volatility:** VOLATILE
- **Comentário:** Registra disparo no log + atualiza contador. HTTP feito pelo frontend.

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION alissonerp.fn_disparar_webhook(p_nome character varying, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_url   TEXT;
  v_ativo BOOLEAN;
BEGIN
  SELECT url, ativo INTO v_url, v_ativo
  FROM alissonerp.webhook_config WHERE nome = p_nome;

  IF v_url IS NULL THEN
    RAISE NOTICE 'Webhook % nao encontrado', p_nome;
    RETURN;
  END IF;

  IF NOT v_ativo THEN
    RAISE NOTICE 'Webhook % inativo', p_nome;
    RETURN;
  END IF;

  INSERT INTO alissonerp.webhook_log (webhook_nome, payload)
  VALUES (p_nome, p_payload);

  UPDATE alissonerp.webhook_config SET
    ultimo_disparo = now(),
    total_disparos = total_disparos + 1
  WHERE nome = p_nome;
END;
$function$

```

</details>

**Uso no código:**
- `alissonerp.fn_disparar_webhook` — 2 ocorrência(s)
  - `src/lib/webhooks.ts:33`
  - `supabase/migrations/135_mercado_pago_integracao.sql:17`

---

## fn_estoque_comercial_aprovar_venda

- **Tipo:** FUNCTION (plpgsql) — SECURITY DEFINER
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION alissonerp.fn_estoque_comercial_aprovar_venda()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'alissonerp', 'directus', 'public'
AS $function$
DECLARE
  v_reserva    RECORD;
  v_mov_id     INTEGER;
BEGIN
  IF NEW.situacao != 'aprovado' THEN RETURN NEW; END IF;
  IF OLD.situacao != 'rascunho' THEN RETURN NEW; END IF;

  FOR v_reserva IN
    SELECT id, produto_id, quantidade, local_estoque_id
    FROM alissonerp.reservas_estoque_comercial
    WHERE venda_id = NEW.id AND status = 'ativo'
  LOOP
    INSERT INTO alissonerp.movimentacoes_estoque_comercial
      (produto_id, tipo, quantidade, motivo, referencia_id, referencia_tipo,
       local_estoque_id, status, observacao)
    VALUES
      (v_reserva.produto_id, 'saida', v_reserva.quantidade, 'venda',
       NEW.id, 'vendas_erp', v_reserva.local_estoque_id, 'efetivado',
       'Efetivação reserva #' || v_reserva.id || ' - venda aprovada')
    RETURNING id INTO v_mov_id;

    UPDATE alissonerp.reservas_estoque_comercial
    SET status = 'efetivado', efetivado_em = now(), movimento_id = v_mov_id
    WHERE id = v_reserva.id;
  END LOOP;

  RETURN NEW;
END;
$function$

```

</details>

**Uso no código:**
- `alissonerp.fn_estoque_comercial_aprovar_venda` — 4 ocorrência(s)
  - `supabase/migrations/141_triggers_estoque_comercial_v2.sql:51`
  - `supabase/migrations/141_triggers_estoque_comercial_v2.sql:413`
  - `supabase/migrations/141_triggers_estoque_comercial_v2.sql:443`
  - `supabase/migrations/169_fix_trigger_search_path.sql:264`

---

## fn_estoque_comercial_baixa_venda

- **Tipo:** FUNCTION (plpgsql) — SECURITY DEFINER
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION alissonerp.fn_estoque_comercial_baixa_venda()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'alissonerp', 'directus', 'public'
AS $function$
DECLARE
  v_config_ativo BOOLEAN;
  v_situacao     TEXT;
BEGIN
  SELECT situacao INTO v_situacao FROM alissonerp.vendas_erp WHERE id = NEW.venda_id;
  IF v_situacao = 'cancelado' THEN RETURN NEW; END IF;

  SELECT ativo INTO v_config_ativo FROM alissonerp.estoque_comercial_config WHERE produto_id = NEW.produto_id;
  IF v_config_ativo IS NULL OR v_config_ativo = false THEN RETURN NEW; END IF;

  IF v_situacao = 'rascunho' THEN
    INSERT INTO alissonerp.reservas_estoque_comercial
      (produto_id, venda_id, item_venda_id, quantidade, local_estoque_id, status)
    VALUES
      (NEW.produto_id, NEW.venda_id, NEW.id, NEW.quantidade, 2, 'ativo');
  ELSE
    INSERT INTO alissonerp.movimentacoes_estoque_comercial
      (produto_id, tipo, quantidade, motivo, referencia_id, referencia_tipo,
       local_estoque_id, status, observacao)
    VALUES
      (NEW.produto_id, 'saida', NEW.quantidade, 'venda', NEW.venda_id, 'vendas_erp',
       2, 'efetivado', 'Venda automática - item #' || NEW.id);
  END IF;

  RETURN NEW;
END;
$function$

```

</details>

**Uso no código:**
- `alissonerp.fn_estoque_comercial_baixa_venda` — 11 ocorrência(s)
  - `supabase/migrations/111_estoque_comercial_auto_venda.sql:8`
  - `supabase/migrations/111_estoque_comercial_auto_venda.sql:108`
  - `supabase/migrations/111_estoque_comercial_auto_venda.sql:127`
  - `supabase/migrations/141_triggers_estoque_comercial_v2.sql:12`
  - `supabase/migrations/141_triggers_estoque_comercial_v2.sql:395`

---

## fn_estoque_comercial_cancelamento_venda

- **Tipo:** FUNCTION (plpgsql) — SECURITY DEFINER
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION alissonerp.fn_estoque_comercial_cancelamento_venda()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'alissonerp', 'directus', 'public'
AS $function$
DECLARE
  v_mov            RECORD;
  v_mov_reverso_id INTEGER;
BEGIN
  IF NEW.situacao != 'cancelado' OR OLD.situacao = 'cancelado' THEN
    RETURN NEW;
  END IF;

  UPDATE alissonerp.reservas_estoque_comercial
  SET status = 'cancelado', cancelado_em = now()
  WHERE venda_id = NEW.id AND status = 'ativo';

  FOR v_mov IN
    SELECT id, produto_id, quantidade, local_estoque_id
    FROM alissonerp.movimentacoes_estoque_comercial
    WHERE referencia_id = NEW.id
      AND referencia_tipo = 'vendas_erp'
      AND tipo = 'saida'
      AND status = 'efetivado'
      AND estornado_por_id IS NULL
  LOOP
    INSERT INTO alissonerp.movimentacoes_estoque_comercial
      (produto_id, tipo, quantidade, motivo, referencia_id, referencia_tipo,
       local_estoque_id, status, estorno_de_id, observacao)
    VALUES
      (v_mov.produto_id, 'entrada', v_mov.quantidade, 'cancelamento',
       NEW.id, 'vendas_erp', v_mov.local_estoque_id, 'efetivado', v_mov.id,
       'Estorno por cancelamento da venda #' || NEW.numero_venda)
    RETURNING id INTO v_mov_reverso_id;

    UPDATE alissonerp.movimentacoes_estoque_comercial
    SET estornado_por_id = v_mov_reverso_id, status = 'estornado'
    WHERE id = v_mov.id;
  END LOOP;

  RETURN NEW;
END;
$function$

```

</details>

**Uso no código:**
- `alissonerp.fn_estoque_comercial_cancelamento_venda` — 14 ocorrência(s)
  - `src/lib/vendas-aprovar.ts:903`
  - `scripts/check_estorno_triggers.mjs:36`
  - `scripts/check_estorno_triggers.mjs:40`
  - `supabase/migrations/111_estoque_comercial_auto_venda.sql:71`
  - `supabase/migrations/111_estoque_comercial_auto_venda.sql:120`

---

## fn_estoque_comercial_entrega_venda

- **Tipo:** FUNCTION (plpgsql) — SECURITY DEFINER
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION alissonerp.fn_estoque_comercial_entrega_venda()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'alissonerp', 'directus', 'public'
AS $function$
DECLARE
  v_reserva RECORD;
  v_mov_id  INTEGER;
BEGIN
  IF NEW.situacao != 'entregue' THEN RETURN NEW; END IF;
  IF OLD.situacao = 'entregue'  THEN RETURN NEW; END IF;

  FOR v_reserva IN
    SELECT id, produto_id, quantidade, local_estoque_id
    FROM alissonerp.reservas_estoque_comercial
    WHERE venda_id = NEW.id AND status = 'ativo'
  LOOP
    INSERT INTO alissonerp.movimentacoes_estoque_comercial
      (produto_id, tipo, quantidade, motivo, referencia_id, referencia_tipo,
       local_estoque_id, status, observacao)
    VALUES
      (v_reserva.produto_id, 'saida', v_reserva.quantidade, 'venda',
       NEW.id, 'vendas_erp', v_reserva.local_estoque_id, 'efetivado',
       'Entrega venda #' || NEW.numero_venda)
    RETURNING id INTO v_mov_id;

    UPDATE alissonerp.reservas_estoque_comercial
    SET status = 'efetivado', efetivado_em = now(), movimento_id = v_mov_id
    WHERE id = v_reserva.id;
  END LOOP;

  -- Marcar ordens vinculadas como entregue (directus.ordens)
  UPDATE directus.ordens
  SET situacao = 'entregue'
  WHERE venda_id = NEW.id
    AND situacao NOT IN ('cancelado', 'entregue');

  RETURN NEW;
END;
$function$

```

</details>

**Uso no código:**
- `alissonerp.fn_estoque_comercial_entrega_venda` — 5 ocorrência(s)
  - `supabase/migrations/161_reserva_entrega_venda.sql:139`
  - `supabase/migrations/161_reserva_entrega_venda.sql:143`
  - `supabase/migrations/161_reserva_entrega_venda.sql:364`
  - `supabase/migrations/161_reserva_entrega_venda.sql:372`
  - `supabase/migrations/169_fix_trigger_search_path.sql:115`

---

## fn_estoque_comercial_reversao_item

- **Tipo:** FUNCTION (plpgsql) — SECURITY DEFINER
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION alissonerp.fn_estoque_comercial_reversao_item()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'alissonerp', 'directus', 'public'
AS $function$
DECLARE
  v_config_ativo   BOOLEAN;
  v_reserva_id     INTEGER;
  v_mov_original   RECORD;
  v_mov_reverso_id INTEGER;
BEGIN
  SELECT ativo INTO v_config_ativo FROM alissonerp.estoque_comercial_config WHERE produto_id = OLD.produto_id;
  IF v_config_ativo IS NULL OR v_config_ativo = false THEN RETURN OLD; END IF;

  SELECT id INTO v_reserva_id
  FROM alissonerp.reservas_estoque_comercial
  WHERE item_venda_id = OLD.id AND status = 'ativo'
  LIMIT 1;

  IF v_reserva_id IS NOT NULL THEN
    UPDATE alissonerp.reservas_estoque_comercial
    SET status = 'cancelado', cancelado_em = now()
    WHERE id = v_reserva_id;
    RETURN OLD;
  END IF;

  SELECT id, quantidade, local_estoque_id INTO v_mov_original
  FROM alissonerp.movimentacoes_estoque_comercial
  WHERE referencia_id = OLD.venda_id
    AND referencia_tipo = 'vendas_erp'
    AND produto_id = OLD.produto_id
    AND tipo = 'saida'
    AND status = 'efetivado'
    AND estornado_por_id IS NULL
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_mov_original.id IS NOT NULL THEN
    INSERT INTO alissonerp.movimentacoes_estoque_comercial
      (produto_id, tipo, quantidade, motivo, referencia_id, referencia_tipo,
       local_estoque_id, status, estorno_de_id, observacao)
    VALUES
      (OLD.produto_id, 'entrada', OLD.quantidade, 'estorno', OLD.venda_id, 'vendas_erp',
       v_mov_original.local_estoque_id, 'efetivado', v_mov_original.id,
       'Estorno - item removido da venda')
    RETURNING id INTO v_mov_reverso_id;

    UPDATE alissonerp.movimentacoes_estoque_comercial
    SET estornado_por_id = v_mov_reverso_id, status = 'estornado'
    WHERE id = v_mov_original.id;
  END IF;

  RETURN OLD;
END;
$function$

```

</details>

**Uso no código:**
- `alissonerp.fn_estoque_comercial_reversao_item` — 11 ocorrência(s)
  - `supabase/migrations/111_estoque_comercial_auto_venda.sql:45`
  - `supabase/migrations/111_estoque_comercial_auto_venda.sql:114`
  - `supabase/migrations/111_estoque_comercial_auto_venda.sql:128`
  - `supabase/migrations/141_triggers_estoque_comercial_v2.sql:90`
  - `supabase/migrations/141_triggers_estoque_comercial_v2.sql:401`

---

## fn_estoque_comercial_update_qtd_item

- **Tipo:** FUNCTION (plpgsql) — SECURITY DEFINER
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION alissonerp.fn_estoque_comercial_update_qtd_item()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'alissonerp', 'directus', 'public'
AS $function$
DECLARE
  v_config_ativo BOOLEAN;
  v_situacao     TEXT;
  v_delta        INTEGER;
  v_reserva_id   INTEGER;
BEGIN
  IF NEW.quantidade = OLD.quantidade THEN RETURN NEW; END IF;

  SELECT situacao INTO v_situacao FROM alissonerp.vendas_erp WHERE id = NEW.venda_id;
  IF v_situacao = 'cancelado' THEN RETURN NEW; END IF;

  SELECT ativo INTO v_config_ativo FROM alissonerp.estoque_comercial_config WHERE produto_id = NEW.produto_id;
  IF v_config_ativo IS NULL OR v_config_ativo = false THEN RETURN NEW; END IF;

  v_delta := NEW.quantidade - OLD.quantidade;

  IF v_situacao = 'rascunho' OR v_situacao = 'aprovado' OR v_situacao = 'enviado' THEN
    SELECT id INTO v_reserva_id
    FROM alissonerp.reservas_estoque_comercial
    WHERE item_venda_id = NEW.id AND status = 'ativo'
    LIMIT 1;

    IF v_reserva_id IS NOT NULL THEN
      UPDATE alissonerp.reservas_estoque_comercial SET quantidade = NEW.quantidade WHERE id = v_reserva_id;
    END IF;
  ELSE
    IF v_delta > 0 THEN
      INSERT INTO alissonerp.movimentacoes_estoque_comercial
        (produto_id, tipo, quantidade, motivo, referencia_id, referencia_tipo,
         local_estoque_id, status, observacao)
      VALUES
        (NEW.produto_id, 'saida', v_delta, 'venda', NEW.venda_id, 'vendas_erp',
         2, 'efetivado', 'Ajuste +' || v_delta || ' item #' || NEW.id);
    ELSIF v_delta < 0 THEN
      INSERT INTO alissonerp.movimentacoes_estoque_comercial
        (produto_id, tipo, quantidade, motivo, referencia_id, referencia_tipo,
         local_estoque_id, status, observacao)
      VALUES
        (NEW.produto_id, 'entrada', ABS(v_delta), 'devolucao', NEW.venda_id, 'vendas_erp',
         2, 'efetivado', 'Ajuste ' || v_delta || ' item #' || NEW.id);
    END IF;
  END IF;

  RETURN NEW;
END;
$function$

```

</details>

**Uso no código:**
- `alissonerp.fn_estoque_comercial_update_qtd_item` — 11 ocorrência(s)
  - `supabase/migrations/111_estoque_comercial_auto_venda.sql:132`
  - `supabase/migrations/111_estoque_comercial_auto_venda.sql:188`
  - `supabase/migrations/111_estoque_comercial_auto_venda.sql:190`
  - `supabase/migrations/141_triggers_estoque_comercial_v2.sql:199`
  - `supabase/migrations/141_triggers_estoque_comercial_v2.sql:419`

---

## fn_handle_new_user

- **Tipo:** FUNCTION (plpgsql) — SECURITY DEFINER
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION alissonerp.fn_handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO alissonerp.usuarios (id, email, nome, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'nome',
      NEW.raw_user_meta_data->>'full_name',
      split_part(NEW.email, '@', 1)
    ),
    COALESCE(NEW.raw_user_meta_data->>'role', 'ourives')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$

```

</details>

**Uso no código:**
- `alissonerp.fn_handle_new_user` — 5 ocorrência(s)
  - `src/app/api/user/route.ts:145`
  - `supabase/migrations/068_role_varchar.sql:9`
  - `supabase/migrations/068_role_varchar.sql:12`
  - `supabase/migrations/068_role_varchar.sql:25`
  - `supabase/migrations/068_role_varchar.sql:38`

---

## fn_ponte_directus_para_alissonerp

- **Tipo:** FUNCTION (plpgsql) — SECURITY DEFINER
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE
- **Comentário:** TEMPORÁRIO: Copia ordens situacao=2 do directus→alissonerp + auditoria loja. Inclui ficha_tecnica_id (v030). Remover quando migrar PDV.

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION alissonerp.fn_ponte_directus_para_alissonerp()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_ordem_id  INTEGER;
  v_audit_id  INTEGER;
BEGIN
  -- Guard: só processar ordens com situacao = '2' (Criado)
  IF NEW.situacao != '2' THEN
    RETURN NEW;
  END IF;

  -- UPSERT da ordem
  INSERT INTO alissonerp.ordens (
    numero_ordem, cliente_id, vendedor_id, pedido_id,
    tipo_ordem,
    data_entrega, peso_metal_negociado, peso_metal_externo,
    itens_para_fabricacao,
    situacao, status, rota,
    tipo_controle, setor_atual, local_atual,
    distribuicao_id, protocolo_loja,
    id_ordem_relacionada, id_asana,
    data_conclusao, created_at, updated_at,
    directus_ordem_id
  ) VALUES (
    NEW.numero_ordem,
    NEW.cliente_id,
    NEW.vendedor_id,
    NEW.pedido_id,
    CASE NEW.tipo_ordem
      WHEN '1' THEN 'producao' WHEN '2' THEN 'reparo'  WHEN '3' THEN 'ajuste'
      WHEN '4' THEN 'banho'    WHEN '5' THEN 'gravacao' WHEN '6' THEN 'reposicao'
      WHEN '7' THEN 'outro'    ELSE       'outro'
    END::alissonerp.enum_tipo_ordem,
    NEW.data_entrega,
    COALESCE(NEW.peso_metal_negocido, 0),
    COALESCE(NEW.peso_metal_externo, 0),
    NEW.itens_para_fabricacao,
    'criado'::alissonerp.enum_situacao_ordem,
    CASE NEW.status
      WHEN '1' THEN 'aguardando' WHEN '2' THEN 'em_andamento' WHEN '3' THEN 'concluido'
      ELSE 'aguardando'
    END::alissonerp.enum_status_ordem,
    CASE NEW.rota WHEN '1' THEN 'pcp' WHEN '2' THEN 'protocolo' ELSE NULL END::alissonerp.enum_rota_ordem,
    NEW.tipo_controle,
    NEW.setor_atual,
    NEW.local_atual::integer,
    NEW.distribuicao_id,
    COALESCE(NEW.protocolo_loja::boolean, false),
    NEW.id_ordem_relacionada::integer,
    NEW.id_asana,
    NEW.data_conclusao,
    COALESCE(NEW.date_created, now()),
    now(),
    NEW.id
  )
  ON CONFLICT (directus_ordem_id) DO UPDATE SET
    peso_metal_externo    = EXCLUDED.peso_metal_externo,
    itens_para_fabricacao = EXCLUDED.itens_para_fabricacao,
    status                = EXCLUDED.status,
    rota                  = EXCLUDED.rota,
    setor_atual           = EXCLUDED.setor_atual,
    local_atual           = EXCLUDED.local_atual,
    updated_at            = now()
  RETURNING id INTO v_ordem_id;

  -- Auditoria loja automática: somente em INSERT e se não existe auditoria ativa
  IF TG_OP = 'INSERT' AND v_ordem_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM alissonerp.auditorias
      WHERE ordem_id = v_ordem_id
        AND tipo_auditoria = 'loja'
        AND situacao != 'reprovado'
    ) THEN
      INSERT INTO alissonerp.auditorias (
        situacao, tipo_auditoria, rota_processo, ordem_id,
        peso_negociado, dados_ordem
      ) VALUES (
        'pendente', 'loja', 'entrada_ordem', v_ordem_id,
        COALESCE(NEW.peso_metal_negocido, 0),
        jsonb_build_object(
          'numero_ordem',     NEW.numero_ordem,
          'tipo_ordem',       NEW.tipo_ordem,
          'rota',             NEW.rota,
          'peso_negociado',   NEW.peso_metal_negocido,
          'peso_externo',     NEW.peso_metal_externo,
          'cliente_id',       NEW.cliente_id,
          'vendedor_id',      NEW.vendedor_id,
          'data_entrega',     NEW.data_entrega::text,
          'itens_fabricacao', NEW.itens_para_fabricacao
        )
      ) RETURNING id INTO v_audit_id;

      -- Aprovação automática — dispara fn_processar_auditoria (cria PCP/saida_ordem)
      UPDATE alissonerp.auditorias
      SET situacao       = 'aprovado',
          data_conclusao = now(),
          parecer        = 'Aprovação automática — PDV'
      WHERE id = v_audit_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$

```

</details>

**Uso no código:**
- `alissonerp.fn_ponte_directus_para_alissonerp` — 12 ocorrência(s)
  - `scripts/migrar_ordens_legado.mjs:2`
  - `scripts/migrar_ordens_legado.mjs:105`
  - `scripts/pre_check_enum_servico.mjs:38`
  - `scripts/pre_check_enum_servico.mjs:39`
  - `scripts/pre_check_modal_ordens.mjs:53`

---

## fn_processar_apontamento_dist

- **Tipo:** FUNCTION (plpgsql) — SECURITY DEFINER
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE
- **Comentário:** Flow 1007: Branch tipo 1-9 com CE marcadores dist (ADD,EIMD,EPD,RMD,RPD,EOID) + Flow 1011.

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION alissonerp.fn_processar_apontamento_dist()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_marcador   alissonerp.enum_marcador_estoque;
  v_dep_almox  INTEGER := 1;
  v_peso_pedra REAL;
  v_peso_ct    NUMERIC(10,4);
BEGIN
  IF NEW.insumo_id IS NOT NULL THEN
    SELECT COALESCE(peso_pedra, 0) INTO v_peso_pedra
    FROM alissonerp.insumos WHERE id = NEW.insumo_id;
  ELSE
    v_peso_pedra := 0;
  END IF;

  CASE NEW.tipo_apontamento_id

    -- TIPO 1: Aditivo metal (ADD) ??? Dep1 ??? DepDist
    WHEN 1 THEN
      v_marcador := 'ADD';
      PERFORM alissonerp.fn_criar_par_movimentacao(
        NEW.insumo_id, NEW.qtd,
        v_dep_almox, NULL,
        NEW.deposito_id, NEW.setor_id,
        v_marcador, NULL, NULL, 1
      );
      UPDATE alissonerp.distribuicoes
      SET total_metal = total_metal + NEW.qtd, updated_at = now()
      WHERE id = NEW.distribuicao_id;

    -- TIPO 2: Entrada metal (EIMD) ??? Dep1 ??? DepDist
    WHEN 2 THEN
      v_marcador := 'EIMD';
      PERFORM alissonerp.fn_criar_par_movimentacao(
        NEW.insumo_id, NEW.qtd,
        v_dep_almox, NULL,
        NEW.deposito_id, NEW.setor_id,
        v_marcador, NULL, NULL, 1
      );
      UPDATE alissonerp.distribuicoes
      SET total_metal = total_metal + NEW.qtd, updated_at = now()
      WHERE id = NEW.distribuicao_id;

    -- TIPO 3: Entrada pedra (EPD) ??? Dep1 ??? DepDist
    WHEN 3 THEN
      v_marcador := 'EPD';
      v_peso_ct  := NEW.peso_ct;
      IF v_peso_ct IS NOT NULL AND v_peso_ct > 0 THEN
        -- Novo: CE em ct
        PERFORM alissonerp.fn_criar_par_movimentacao(
          NEW.insumo_id, v_peso_ct::REAL,
          v_dep_almox, NULL,
          NEW.deposito_id, NEW.setor_id,
          v_marcador, NULL, NULL, 1
        );
        UPDATE alissonerp.distribuicoes SET
          total_pedras_ct = COALESCE(total_pedras_ct, 0) + v_peso_ct,
          total_pedras_un = total_pedras_un + NEW.qtd,
          total_pedras_g  = total_pedras_g  + (v_peso_pedra * NEW.qtd),
          updated_at      = now()
        WHERE id = NEW.distribuicao_id;
      ELSE
        -- Backward compat: CE em gramas
        PERFORM alissonerp.fn_criar_par_movimentacao(
          NEW.insumo_id, NEW.qtd,
          v_dep_almox, NULL,
          NEW.deposito_id, NEW.setor_id,
          v_marcador, NULL, NULL, 1
        );
        UPDATE alissonerp.distribuicoes SET
          total_pedras_un = total_pedras_un + NEW.qtd,
          total_pedras_g  = total_pedras_g  + (v_peso_pedra * NEW.qtd),
          updated_at      = now()
        WHERE id = NEW.distribuicao_id;
      END IF;

    -- TIPO 5: Retorno metal (RMD) ??? DepDist ??? Dep1
    WHEN 5 THEN
      v_marcador := 'RMD';
      PERFORM alissonerp.fn_criar_par_movimentacao(
        NEW.insumo_id, NEW.qtd,
        NEW.deposito_id, NEW.setor_id,
        v_dep_almox, NULL,
        v_marcador, NULL, NULL, 1
      );
      UPDATE alissonerp.distribuicoes
      SET retorno_metal = retorno_metal + NEW.qtd, updated_at = now()
      WHERE id = NEW.distribuicao_id;

    -- TIPO 6: Retorno pedra (RPD) ??? DepDist ??? Dep1
    WHEN 6 THEN
      v_marcador := 'RPD';
      v_peso_ct  := NEW.peso_ct;
      IF v_peso_ct IS NOT NULL AND v_peso_ct > 0 THEN
        -- Novo: CE em ct (retorno)
        PERFORM alissonerp.fn_criar_par_movimentacao(
          NEW.insumo_id, v_peso_ct::REAL,
          NEW.deposito_id, NEW.setor_id,
          v_dep_almox, NULL,
          v_marcador, NULL, NULL, 1
        );
        UPDATE alissonerp.distribuicoes SET
          total_pedras_ct = COALESCE(total_pedras_ct, 0) - v_peso_ct,
          total_pedras_un = total_pedras_un - NEW.qtd,
          total_pedras_g  = total_pedras_g  - (v_peso_pedra * NEW.qtd),
          updated_at      = now()
        WHERE id = NEW.distribuicao_id;
      ELSE
        -- Backward compat
        PERFORM alissonerp.fn_criar_par_movimentacao(
          NEW.insumo_id, NEW.qtd,
          NEW.deposito_id, NEW.setor_id,
          v_dep_almox, NULL,
          v_marcador, NULL, NULL, 1
        );
        UPDATE alissonerp.distribuicoes SET
          total_pedras_un = total_pedras_un - NEW.qtd,
          total_pedras_g  = total_pedras_g  - (v_peso_pedra * NEW.qtd),
          updated_at      = now()
        WHERE id = NEW.distribuicao_id;
      END IF;

    -- TIPO 8: Entrada outros insumos (EOID) ??? sa??da direta do almox
    WHEN 8 THEN
      v_marcador := 'EOID';
      INSERT INTO alissonerp.movimentacoes_estoque
        (saida, entrada, insumo_id, deposito_id, marcador, local_estoque_id)
      VALUES
        (NEW.qtd, 0, NEW.insumo_id, v_dep_almox, v_marcador, 1);

    -- TIPO 9: Ocorr??ncia distribui????o ??? sem CE
    WHEN 9 THEN
      NULL;

    ELSE
      RAISE NOTICE 'Tipo apontamento % nao tratado na distribuicao', NEW.tipo_apontamento_id;

  END CASE;

  -- Flow 1011: upsert item da distribui????o (tipos 1-6) ??? inalterado
  IF NEW.tipo_apontamento_id BETWEEN 1 AND 6 AND NEW.insumo_id IS NOT NULL THEN
    PERFORM alissonerp.fn_criar_item_distribuicao(
      NEW.distribuicao_id, NEW.insumo_id, NEW.deposito_id, NEW.qtd, NEW.tipo_apontamento_id
    );
  END IF;

  RETURN NEW;
END;
$function$

```

</details>

**Uso no código:**
- `alissonerp.fn_processar_apontamento_dist` — 4 ocorrência(s)
  - `src/app/api/distribuicao/apontamentos/route.ts:9`
  - `src/app/api/distribuicao/apontamentos/route.ts:71`
  - `supabase/migrations/098_triggers_pedras_ct_compras.sql:10`
  - `supabase/migrations/098_triggers_pedras_ct_compras.sql:481`

---

## fn_processar_apontamento_pcp

- **Tipo:** FUNCTION (plpgsql) — SECURITY DEFINER
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE
- **Comentário:** Flow 1000: Branch por tipo 1-7, CE dupla-entrada, atualiza totais PCP, chama fn_criar_itens_ordem.

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION alissonerp.fn_processar_apontamento_pcp()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_ordem_id            INTEGER;
  v_marcador            alissonerp.enum_marcador_estoque;
  v_peso_pedra_unitario REAL;
  v_dep_almox           INTEGER := 1;
  v_peso_ct             NUMERIC(10,4);
  v_peso_gramas_itens   REAL;
BEGIN
  SELECT p.ordem_id INTO v_ordem_id
  FROM alissonerp.pcp p WHERE p.id = NEW.pcp_id;

  IF v_ordem_id IS NULL THEN
    RAISE EXCEPTION 'PCP % nao encontrado ou sem ordem vinculada', NEW.pcp_id;
  END IF;

  IF NEW.insumo_id IS NOT NULL THEN
    SELECT COALESCE(peso_pedra, 0) INTO v_peso_pedra_unitario
    FROM alissonerp.insumos WHERE id = NEW.insumo_id;
  ELSE
    v_peso_pedra_unitario := 0;
  END IF;

  CASE NEW.tipo_apontamento_id

    WHEN 1 THEN
      v_marcador := 'AD';
      PERFORM alissonerp.fn_criar_par_movimentacao(
        NEW.insumo_id, NEW.qtd,
        v_dep_almox, NULL,
        NEW.deposito_id, NEW.setor_id,
        v_marcador, v_ordem_id, NULL, 1
      );
      UPDATE alissonerp.pcp SET total_metal = total_metal + NEW.qtd WHERE id = NEW.pcp_id;

    WHEN 2 THEN
      v_marcador := 'EM';
      PERFORM alissonerp.fn_criar_par_movimentacao(
        NEW.insumo_id, NEW.qtd,
        v_dep_almox, NULL,
        NEW.deposito_id, NEW.setor_id,
        v_marcador, v_ordem_id, NULL, 1
      );
      UPDATE alissonerp.pcp SET total_metal = total_metal + NEW.qtd WHERE id = NEW.pcp_id;

    WHEN 3 THEN
      v_marcador := 'EP';
      v_peso_ct  := NEW.peso_ct;
      IF v_peso_ct IS NOT NULL AND v_peso_ct > 0 THEN
        PERFORM alissonerp.fn_criar_par_movimentacao(
          NEW.insumo_id, v_peso_ct::REAL,
          v_dep_almox, NULL,
          NEW.deposito_id, NEW.setor_id,
          v_marcador, v_ordem_id, NULL, 1
        );
        UPDATE alissonerp.pcp SET
          total_pedras_ct = COALESCE(total_pedras_ct, 0) + v_peso_ct,
          total_pedras_un = total_pedras_un + NEW.qtd,
          total_pedras_g  = total_pedras_g  + (COALESCE(v_peso_pedra_unitario, 0) * NEW.qtd)
        WHERE id = NEW.pcp_id;
      ELSE
        PERFORM alissonerp.fn_criar_par_movimentacao(
          NEW.insumo_id, NEW.qtd,
          v_dep_almox, NULL,
          NEW.deposito_id, NEW.setor_id,
          v_marcador, v_ordem_id, NULL, 1
        );
        UPDATE alissonerp.pcp SET
          total_pedras_un = total_pedras_un + NEW.qtd,
          total_pedras_g  = total_pedras_g  + (COALESCE(v_peso_pedra_unitario, 0) * NEW.qtd)
        WHERE id = NEW.pcp_id;
      END IF;
      IF COALESCE(v_peso_pedra_unitario, 0) > 0 THEN
        INSERT INTO alissonerp.pedras_ordens (ordem_id, deposito_id, peso, peso_pedra, qtd_pedras)
        VALUES (v_ordem_id, NEW.deposito_id, v_peso_pedra_unitario * NEW.qtd, v_peso_pedra_unitario, NEW.qtd);
      END IF;

    WHEN 4 THEN
      v_marcador := 'BI';
      PERFORM alissonerp.fn_criar_par_movimentacao(
        NEW.insumo_id, NEW.qtd,
        NEW.deposito_id, NEW.setor_id,
        v_dep_almox, NULL,
        v_marcador, v_ordem_id, NULL, 1
      );

    WHEN 5 THEN
      v_marcador := 'RM';
      PERFORM alissonerp.fn_criar_par_movimentacao(
        NEW.insumo_id, NEW.qtd,
        NEW.deposito_id, NEW.setor_id,
        v_dep_almox, NULL,
        v_marcador, v_ordem_id, NULL, 1
      );
      UPDATE alissonerp.pcp SET retorno_metal = retorno_metal + NEW.qtd WHERE id = NEW.pcp_id;

    WHEN 6 THEN
      v_marcador := 'RP';
      v_peso_ct  := NEW.peso_ct;
      IF v_peso_ct IS NOT NULL AND v_peso_ct > 0 THEN
        PERFORM alissonerp.fn_criar_par_movimentacao(
          NEW.insumo_id, v_peso_ct::REAL,
          NEW.deposito_id, NEW.setor_id,
          v_dep_almox, NULL,
          v_marcador, v_ordem_id, NULL, 1
        );
        UPDATE alissonerp.pcp SET
          total_pedras_ct = COALESCE(total_pedras_ct, 0) - v_peso_ct,
          total_pedras_un = total_pedras_un - NEW.qtd,
          total_pedras_g  = total_pedras_g  - (COALESCE(v_peso_pedra_unitario, 0) * NEW.qtd)
        WHERE id = NEW.pcp_id;
      ELSE
        PERFORM alissonerp.fn_criar_par_movimentacao(
          NEW.insumo_id, NEW.qtd,
          NEW.deposito_id, NEW.setor_id,
          v_dep_almox, NULL,
          v_marcador, v_ordem_id, NULL, 1
        );
        UPDATE alissonerp.pcp SET
          total_pedras_un = total_pedras_un - NEW.qtd,
          total_pedras_g  = total_pedras_g  - (COALESCE(v_peso_pedra_unitario, 0) * NEW.qtd)
        WHERE id = NEW.pcp_id;
      END IF;

    WHEN 7 THEN
      NULL;

    ELSE
      RAISE NOTICE 'Tipo apontamento % nao tratado no PCP', NEW.tipo_apontamento_id;
  END CASE;

  -- Flow 1001: atualizar itens_ordem_insumos para tipos 1-6
  -- Para pedras (3,6): p_peso_gramas = qtd x peso_pedra_unitario (gramas)
  -- Para metal (1,2,4,5): p_peso_gramas=NULL -> COALESCE usa p_qtd (ja e gramas)
  IF NEW.tipo_apontamento_id BETWEEN 1 AND 6 AND NEW.insumo_id IS NOT NULL THEN
    v_peso_gramas_itens := CASE
      WHEN NEW.tipo_apontamento_id IN (3, 6) AND COALESCE(v_peso_pedra_unitario, 0) > 0
        THEN v_peso_pedra_unitario * NEW.qtd
      ELSE NULL
    END;
    PERFORM alissonerp.fn_criar_itens_ordem(
      v_ordem_id, NEW.insumo_id, NEW.deposito_id, NEW.qtd, NEW.tipo_apontamento_id,
      v_peso_gramas_itens
    );
  END IF;

  RETURN NEW;
END;
$function$

```

</details>

**Uso no código:**
- `alissonerp.fn_processar_apontamento_pcp` — 7 ocorrência(s)
  - `src/lib/recalcular-totais-pcp.ts:13`
  - `scripts/sync_db.mjs:19`
  - `scripts/_db_mapping_build_docs.mjs:180`
  - `scripts/_db_mapping_build_docs.mjs:433`
  - `supabase/migrations/098_triggers_pedras_ct_compras.sql:6`

---

## fn_processar_auditoria

- **Tipo:** FUNCTION (plpgsql) — SECURITY DEFINER
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE
- **Comentário:** Loja aprovada→libera produção. Fábrica aprovada→libera volta. Loja reprovada→rascunho. Fábrica reprovada→retrabalho (tipo=servico).

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION alissonerp.fn_processar_auditoria()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
    DECLARE
      v_ordem          RECORD;
      v_nova_ordem_id  INTEGER;
      v_saida_id       INTEGER;
    BEGIN
      IF TG_OP = 'UPDATE' AND OLD.situacao = NEW.situacao THEN RETURN NEW; END IF;
      IF NEW.ordem_id IS NULL THEN RETURN NEW; END IF;

      IF NEW.situacao = 'aprovado' THEN
        NEW.data_conclusao := COALESCE(NEW.data_conclusao, now());

        IF NEW.tipo_auditoria = 'loja' THEN
          SELECT * INTO v_ordem FROM alissonerp.ordens WHERE id = NEW.ordem_id;

          IF v_ordem.rota = 'pcp' THEN
            INSERT INTO alissonerp.saidas_ordem (ordem_id)
            VALUES (NEW.ordem_id) RETURNING id INTO v_saida_id;

            INSERT INTO alissonerp.pcp (
              ordem_id, etapas, saida_ordem_id, metal_externo,
              total_metal, retorno_metal, total_pedras_un, total_pedras_g,
              total_geral_outros_pesos, total_outros_pesos_g
            ) VALUES (
              NEW.ordem_id, 'novas_ordens', v_saida_id,
              COALESCE(v_ordem.peso_metal_externo, 0),
              0, 0, 0, 0, 0, 0
            );

            UPDATE alissonerp.ordens
            SET status = 'em_andamento', updated_at = now()
            WHERE id = NEW.ordem_id;

          ELSE
            UPDATE alissonerp.ordens
            SET status = 'aguardando', updated_at = now()
            WHERE id = NEW.ordem_id;
          END IF;

        END IF;
        RETURN NEW;
      END IF;

      IF NEW.situacao = 'reprovado' THEN
        IF NEW.motivo_reprovacao IS NULL OR TRIM(NEW.motivo_reprovacao) = '' THEN
          RAISE EXCEPTION 'Motivo de reprovação é obrigatório';
        END IF;
        NEW.data_conclusao := COALESCE(NEW.data_conclusao, now());

        IF NEW.tipo_auditoria = 'loja' THEN
          UPDATE alissonerp.ordens SET
            situacao          = 'rascunho'::alissonerp.enum_situacao_ordem,
            status            = 'aguardando'::alissonerp.enum_status_ordem,
            origem_reprovacao = 'auditoria_loja',
            updated_at        = now()
          WHERE id = NEW.ordem_id;

        ELSIF NEW.tipo_auditoria = 'fabrica' THEN
          SELECT * INTO v_ordem FROM alissonerp.ordens WHERE id = NEW.ordem_id;

          INSERT INTO alissonerp.ordens (
            numero_ordem, cliente_id, vendedor_id,
            tipo_ordem, situacao, status, rota,
            peso_metal_negociado, id_ordem_relacionada,
            origem_reprovacao
          ) VALUES (
            COALESCE(v_ordem.numero_ordem, '#' || v_ordem.id::text) || '-RET',
            v_ordem.cliente_id,
            v_ordem.vendedor_id,
            'servico_venda'::alissonerp.enum_tipo_ordem,
            'criado'::alissonerp.enum_situacao_ordem,
            'aguardando'::alissonerp.enum_status_ordem,
            'pcp'::alissonerp.enum_rota_ordem,
            v_ordem.peso_metal_negociado,
            v_ordem.id,
            'auditoria_fabrica'
          ) RETURNING id INTO v_nova_ordem_id;

          INSERT INTO alissonerp.saidas_ordem (ordem_id)
          VALUES (v_nova_ordem_id)
          RETURNING id INTO v_saida_id;

          INSERT INTO alissonerp.pcp (
            ordem_id, etapas, saida_ordem_id,
            total_metal, retorno_metal, total_pedras_un, total_pedras_g,
            total_geral_outros_pesos, total_outros_pesos_g, metal_externo
          ) VALUES (
            v_nova_ordem_id, 'novas_ordens', v_saida_id,
            0, 0, 0, 0, 0, 0, 0
          );

          NEW.ordem_retrabalho_id := v_nova_ordem_id;
        END IF;
        RETURN NEW;
      END IF;

      IF NEW.situacao = 'pendenciado' THEN RETURN NEW; END IF;
      RETURN NEW;
    END;
    $function$

```

</details>

**Uso no código:**
- `alissonerp.fn_processar_auditoria` — 20 ocorrência(s)
  - `scripts/apply_073.mjs:180`
  - `scripts/apply_073.mjs:181`
  - `scripts/apply_073.mjs:285`
  - `scripts/fix_aguardando_rota.mjs:54`
  - `scripts/fix_aguardando_rota.mjs:73`

---

## fn_processar_fechamento_dist

- **Tipo:** FUNCTION (plpgsql) — SECURITY DEFINER
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE
- **Comentário:** Flow 1013: ACUMULA no PCP (soma!), CE TEDD, move ordem → dep1, cria transferencia + copia itens.

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION alissonerp.fn_processar_fechamento_dist()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_pcp_id    INTEGER;
  v_dep_dist  INTEGER;
BEGIN
  -- Guard: só processar quando peso é preenchido pela primeira vez
  IF NEW.peso IS NULL OR NEW.peso <= 0 THEN
    RETURN NEW;
  END IF;
  -- Para UPDATE: não reprocessar se já tinha peso > 0 (evita duplo acúmulo)
  IF TG_OP = 'UPDATE' AND OLD.peso IS NOT NULL AND OLD.peso > 0 THEN
    RETURN NEW;
  END IF;

  -- Guard v2: verificar se já existe processamento anterior para (distribuicao_id, ordem_id)
  -- O índice único acima previne o INSERT, mas este guard protege em casos de UPSERT ou bypass
  IF TG_OP = 'INSERT' THEN
    -- O índice único já vai rejeitar INSERT duplicado com erro
    -- Este bloco é documentação do comportamento esperado
    NULL;
  END IF;

  -- Buscar PCP ativo da ordem
  SELECT id INTO v_pcp_id
  FROM alissonerp.pcp
  WHERE ordem_id = NEW.ordem_id
    AND etapas NOT IN ('concluido', 'cancelado')
  ORDER BY id DESC
  LIMIT 1;

  IF v_pcp_id IS NULL THEN
    RAISE NOTICE 'Sem PCP ativo para ordem %, ignorando acumulo', NEW.ordem_id;
    RETURN NEW;
  END IF;

  -- Buscar depósito da distribuição (do primeiro apontamento)
  SELECT deposito_id INTO v_dep_dist
  FROM alissonerp.apontamentos_distribuicao
  WHERE distribuicao_id = NEW.distribuicao_id
  LIMIT 1;

  -- ═══ ACUMULAR NO PCP — SOMA, NÃO SUBSTITUI ═══
  UPDATE alissonerp.pcp SET
    total_metal     = total_metal     + COALESCE(NEW.pmc, 0),
    total_pedras_un = total_pedras_un + COALESCE(NEW.total_pedras_un, 0),
    total_pedras_g  = total_pedras_g  + COALESCE(NEW.total_pedras_g, 0),
    updated_at      = now()
  WHERE id = v_pcp_id;

  -- CE marcador TEDD (dep distribuição → dep almoxarifado) usando Ouro como proxy
  IF v_dep_dist IS NOT NULL THEN
    PERFORM alissonerp.fn_criar_par_movimentacao(
      1, NEW.peso,
      v_dep_dist, NULL,
      1, NULL,
      'TEDD', NEW.ordem_id,
      'Fechamento distribuicao #' || NEW.distribuicao_id::text || ' → PCP'
    );
  END IF;

  -- Mover ordem para almoxarifado (local_atual = 1)
  UPDATE alissonerp.ordens
  SET local_atual = 1, updated_at = now()
  WHERE id = NEW.ordem_id;

  -- Criar transferência vazia para a ordem (registra movimentação no histórico)
  INSERT INTO alissonerp.transferencias_ordem (pcp_id, ordem_id)
  VALUES (v_pcp_id, NEW.ordem_id);

  -- Copiar itens distribuição → itens_ordem_insumos
  INSERT INTO alissonerp.itens_ordem_insumos (ordem_id, deposito_id, insumo_id, peso)
  SELECT NEW.ordem_id, id_item.deposito_id, id_item.insumo_id, id_item.peso
  FROM alissonerp.itens_distribuicao id_item
  WHERE id_item.distribuicao_id = NEW.distribuicao_id
    AND id_item.peso > 0;

  RETURN NEW;
END;
$function$

```

</details>

**Uso no código:**
- `alissonerp.fn_processar_fechamento_dist` — 8 ocorrência(s)
  - `src/app/api/distribuicao/[id]/estorno/route.ts:223`
  - `src/app/api/distribuicao/[id]/saida/route.ts:21`
  - `src/app/api/distribuicao/[id]/saida/route.ts:189`
  - `scripts/_db_mapping_build_docs.mjs:180`
  - `scripts/_db_mapping_build_docs.mjs:433`

---

## fn_processar_lancamento_avulso

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE
- **Comentário:** Flow 1006: Branch T/E/S/Sangria → CE com marcadores TA/EA/SA/Sangria.

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION alissonerp.fn_processar_lancamento_avulso()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_dep_almox   INTEGER := 1;
  v_dep_destino INTEGER;
  v_local       INTEGER;
BEGIN
  v_local := COALESCE(NEW.local_estoque_id, 1);

  CASE NEW.tipo_lancamento::text

    WHEN 'transferencia' THEN
      IF NEW.deposito_id IS NULL THEN
        RAISE EXCEPTION 'Deposito obrigatorio para transferencia avulsa';
      END IF;
      v_dep_destino := COALESCE(NEW.deposito_destino_id, v_dep_almox);
      PERFORM alissonerp.fn_criar_par_movimentacao(
        NEW.insumo_id, NEW.peso,
        NEW.deposito_id, NEW.setor_id,
        v_dep_destino, NULL,
        'TA'::alissonerp.enum_marcador_estoque,
        NULL, NEW.obs, v_local
      );

    WHEN 'entrada' THEN
      INSERT INTO alissonerp.movimentacoes_estoque
        (entrada, saida, insumo_id, deposito_id, setor_id, marcador, obs, created_by, local_estoque_id)
      VALUES
        (NEW.peso, 0, NEW.insumo_id,
         COALESCE(NEW.deposito_id, v_dep_almox), NEW.setor_id,
         'EA'::alissonerp.enum_marcador_estoque,
         NEW.obs, NEW.created_by, v_local);

    WHEN 'saida' THEN
      INSERT INTO alissonerp.movimentacoes_estoque
        (entrada, saida, insumo_id, deposito_id, setor_id, marcador, obs, created_by, local_estoque_id)
      VALUES
        (0, NEW.peso, NEW.insumo_id,
         COALESCE(NEW.deposito_id, v_dep_almox), NEW.setor_id,
         'SA'::alissonerp.enum_marcador_estoque,
         NEW.obs, NEW.created_by, v_local);

    WHEN 'sangria' THEN
      INSERT INTO alissonerp.movimentacoes_estoque
        (entrada, saida, insumo_id, deposito_id, setor_id, marcador, obs, created_by, local_estoque_id)
      VALUES
        (NEW.peso, 0, NEW.insumo_id, v_dep_almox, NULL,
         'Sangria'::alissonerp.enum_marcador_estoque,
         NEW.obs, NEW.created_by, v_local);

    ELSE
      RAISE EXCEPTION 'Tipo de lancamento nao reconhecido: %', NEW.tipo_lancamento;
  END CASE;

  RETURN NEW;
END;
$function$

```

</details>

**Uso no código:**
- `alissonerp.fn_processar_lancamento_avulso` — 2 ocorrência(s)
  - `supabase/migrations/101_fix_triggers_pedras_local.sql:14`
  - `supabase/migrations/101_fix_triggers_pedras_local.sql:295`

---

## fn_processar_outros_insumos_dist

- **Tipo:** FUNCTION (plpgsql) — SECURITY DEFINER
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE
- **Comentário:** Flow 1010: CE SOID + acumula total_outros_pesos/total_geral_outros_pesos.

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION alissonerp.fn_processar_outros_insumos_dist()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO alissonerp.movimentacoes_estoque
    (saida, entrada, insumo_id, deposito_id, marcador, local_estoque_id)
  VALUES (NEW.peso, 0, NEW.insumo_id, 1, 'SOID', 1);

  UPDATE alissonerp.distribuicoes SET
    total_outros_pesos       = total_outros_pesos       + NEW.peso,
    total_geral_outros_pesos = total_geral_outros_pesos + NEW.peso,
    updated_at               = now()
  WHERE id = NEW.distribuicao_id;

  RETURN NEW;
END;
$function$

```

</details>

**Uso no código:**
- `alissonerp.fn_processar_outros_insumos_dist` — 2 ocorrência(s)
  - `supabase/migrations/102_fix_local_estoque_functions.sql:9`
  - `supabase/migrations/102_fix_local_estoque_functions.sql:57`

---

## fn_processar_outros_insumos_pcp

- **Tipo:** FUNCTION (plpgsql) — SECURITY DEFINER
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE
- **Comentário:** Flow 1004: CE marcador SOI + atualiza total_geral_outros_pesos no PCP.

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION alissonerp.fn_processar_outros_insumos_pcp()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO alissonerp.movimentacoes_estoque
    (saida, entrada, insumo_id, deposito_id, marcador, ordem_id, obs, local_estoque_id)
  VALUES
    (NEW.peso, 0, NEW.insumo_id, 1, 'SOI', NEW.ordem_id, 'Outros insumos PCP', 1);

  UPDATE alissonerp.pcp
  SET total_geral_outros_pesos = total_geral_outros_pesos + NEW.peso
  WHERE id = NEW.pcp_id;

  RETURN NEW;
END;
$function$

```

</details>

**Uso no código:**
- `alissonerp.fn_processar_outros_insumos_pcp` — 2 ocorrência(s)
  - `supabase/migrations/102_fix_local_estoque_functions.sql:12`
  - `supabase/migrations/102_fix_local_estoque_functions.sql:82`

---

## fn_processar_saida_ordem

- **Tipo:** FUNCTION (plpgsql) — SECURITY DEFINER
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE
- **Comentário:** Conclui PCP + cria auditoria fábrica pendente com dados PMC/quebra.

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION alissonerp.fn_processar_saida_ordem()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_pcp          RECORD;
  v_item         RECORD;
  v_pmc          REAL;
  v_quebra       REAL;
  v_pct          REAL;
  v_ordem        RECORD;
  v_ourives_nome TEXT;
  v_saida_val    REAL;
BEGIN
  -- Guard: ignorar inserts sem peso (saidas vazias criadas pelo Flow 03)
  IF NEW.peso IS NULL OR NEW.peso <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_pcp
  FROM alissonerp.pcp
  WHERE ordem_id = NEW.ordem_id
    AND etapas NOT IN ('concluido', 'cancelado')
  ORDER BY id DESC LIMIT 1;

  IF v_pcp.id IS NULL THEN
    RAISE EXCEPTION 'Nenhum PCP ativo encontrado para ordem %', NEW.ordem_id;
  END IF;

  SELECT pmc, quebra, percentual INTO v_pmc, v_quebra, v_pct
  FROM alissonerp.fn_calcular_pmc_pcp(
    NEW.peso,
    COALESCE(v_pcp.total_geral_outros_pesos, 0),
    COALESCE(v_pcp.metal_externo, 0),
    COALESCE(v_pcp.total_metal, 0),
    COALESCE(v_pcp.retorno_metal, 0)
  );

  -- Movimenta????es de estoque (itens da ordem)
  FOR v_item IN
    SELECT ioi.insumo_id, ioi.peso, ioi.deposito_id,
           ins.categoria_id, ins.peso_pedra_ct
    FROM alissonerp.itens_ordem_insumos ioi
    JOIN alissonerp.insumos ins ON ins.id = ioi.insumo_id
    WHERE ioi.ordem_id = NEW.ordem_id AND ioi.peso > 0
  LOOP
    IF v_item.categoria_id = 1 THEN
      -- SM: metal em gramas (inalterado)
      PERFORM alissonerp.fn_criar_par_movimentacao(
        v_item.insumo_id, v_item.peso,
        v_item.deposito_id, NULL, NULL, NULL,
        'SM', NEW.ordem_id,
        'Saida ordem ??? saida_id #' || NEW.id::text,
        1
      );
    ELSE
      -- SP: pedras em ct se peso_pedra_ct dispon??vel (1 ct = 0.2 g)
      IF v_item.categoria_id = 2
         AND v_item.peso_pedra_ct IS NOT NULL
         AND v_item.peso_pedra_ct > 0 THEN
        v_saida_val := v_item.peso / 0.2;
      ELSE
        v_saida_val := v_item.peso;  -- backward compat: gramas
      END IF;
      PERFORM alissonerp.fn_criar_par_movimentacao(
        v_item.insumo_id, v_saida_val,
        v_item.deposito_id, NULL, NULL, NULL,
        'SP', NEW.ordem_id,
        'Saida ordem ??? saida_id #' || NEW.id::text,
        1
      );
    END IF;
  END LOOP;

  -- Concluir PCP (inalterado)
  UPDATE alissonerp.pcp SET
    peso_final            = NEW.peso,
    pmc                   = v_pmc,
    quebra                = v_quebra,
    porcentagem_de_quebra = v_pct,
    saida_ordem_id        = NEW.id,
    etapas                = 'concluido',
    data_conclusao        = now(),
    updated_at            = now()
  WHERE id = v_pcp.id;

  -- Concluir ordem (inalterado)
  UPDATE alissonerp.ordens SET
    status         = 'concluido',
    data_conclusao = now(),
    updated_at     = now()
  WHERE id = NEW.ordem_id;

  -- Dados complementares (inalterado)
  SELECT * INTO v_ordem FROM alissonerp.ordens WHERE id = NEW.ordem_id;

  SELECT up.name INTO v_ourives_nome
  FROM public.user_profiles up
  WHERE up.id_user = v_pcp.operador;

  -- Criar auditoria F??BRICA (inalterado)
  IF NOT EXISTS (
    SELECT 1 FROM alissonerp.auditorias
    WHERE ordem_id = NEW.ordem_id
      AND tipo_auditoria = 'fabrica'
      AND situacao != 'reprovado'
  ) THEN
    INSERT INTO alissonerp.auditorias (
      situacao, tipo_auditoria, rota_processo, ordem_id,
      peso_negociado, peso_final, pmc,
      quebra, quebra_percentual,
      total_metal, retorno_metal, metal_externo,
      ourives_nome
    ) VALUES (
      'pendente',
      'fabrica',
      'saida_pcp',
      NEW.ordem_id,
      COALESCE(v_ordem.peso_metal_negociado, 0),
      COALESCE(NEW.peso, 0),
      COALESCE(v_pmc, 0),
      COALESCE(v_quebra, 0),
      COALESCE(v_pct, 0),
      COALESCE(v_pcp.total_metal, 0),
      COALESCE(v_pcp.retorno_metal, 0),
      COALESCE(v_pcp.metal_externo, 0),
      COALESCE(v_ourives_nome, 'Sem operador')
    );
  END IF;

  RETURN NEW;
END;
$function$

```

</details>

**Uso no código:**
- `alissonerp.fn_processar_saida_ordem` — 9 ocorrência(s)
  - `supabase/migrations/019_trigger_transferencia_saida.sql:7`
  - `supabase/migrations/021_triggers_protocolo.sql:8`
  - `supabase/migrations/026_auditoria_completa.sql:26`
  - `supabase/migrations/026_auditoria_completa.sql:32`
  - `supabase/migrations/028_auditoria_dupla.sql:15`

---

## fn_processar_transferencia

- **Tipo:** FUNCTION (plpgsql) — SECURITY DEFINER
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE
- **Comentário:** Flow 1002: CE TED por insumo entre setores + atualiza local_atual/setor_atual da ordem + PCP→em_andamento + cria próxima transferência vazia.

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION alissonerp.fn_processar_transferencia()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_ordem   RECORD;
  v_item    RECORD;
BEGIN
  IF NEW.setor_id IS NULL OR NEW.deposito_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.setor_id IS NOT NULL AND OLD.deposito_id IS NOT NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT local_atual, setor_atual INTO v_ordem
  FROM alissonerp.ordens WHERE id = NEW.ordem_id;

  IF v_ordem.local_atual IS NOT NULL THEN
    FOR v_item IN
      SELECT ioi.insumo_id, ioi.peso
      FROM alissonerp.itens_ordem_insumos ioi
      WHERE ioi.ordem_id = NEW.ordem_id AND ioi.peso > 0
    LOOP
      PERFORM alissonerp.fn_criar_par_movimentacao(
        v_item.insumo_id, v_item.peso,
        v_ordem.local_atual, v_ordem.setor_atual,
        NEW.deposito_id, NEW.setor_id,
        'TED', NEW.ordem_id,
        'Transferencia PCP #' || NEW.pcp_id::text,
        1
      );
    END LOOP;
  END IF;

  UPDATE alissonerp.ordens
  SET setor_atual = NEW.setor_id,
      local_atual = NEW.deposito_id,
      updated_at  = now()
  WHERE id = NEW.ordem_id;

  UPDATE alissonerp.pcp
  SET etapas     = 'em_andamento',
      updated_at = now()
  WHERE id = NEW.pcp_id;

  INSERT INTO alissonerp.transferencias_ordem (pcp_id, ordem_id)
  VALUES (NEW.pcp_id, NEW.ordem_id);

  RETURN NEW;
END;
$function$

```

</details>

**Uso no código:**
- `alissonerp.fn_processar_transferencia` — 6 ocorrência(s)
  - `src/app/api/pcp/transferir/route.ts:189`
  - `src/app/api/pcp/transferir-service/route.ts:112`
  - `src/app/api/service/[id]/transferir/route.ts:107`
  - `supabase/migrations/019_trigger_transferencia_saida.sql:6`
  - `supabase/migrations/101_fix_triggers_pedras_local.sql:11`

---

## fn_produto_imagens_touch

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION alissonerp.fn_produto_imagens_touch()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## fn_proteger_campos_pdv

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION alissonerp.fn_proteger_campos_pdv()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE v_role TEXT;
    BEGIN
      v_role := COALESCE(current_setting('request.jwt.claims', true)::jsonb->>'role', 'authenticated');
      IF v_role = 'service_role' THEN RETURN NEW; END IF;
      IF current_setting('app.role', true) = 'desenvolvedor' THEN RETURN NEW; END IF;
      IF NEW.numero_ordem IS DISTINCT FROM OLD.numero_ordem THEN RAISE EXCEPTION 'Campo protegido: numero_ordem'; END IF;
      IF NEW.cliente_id IS DISTINCT FROM OLD.cliente_id THEN RAISE EXCEPTION 'Campo protegido: cliente_id'; END IF;
      IF NEW.vendedor_id IS DISTINCT FROM OLD.vendedor_id THEN RAISE EXCEPTION 'Campo protegido: vendedor_id'; END IF;
      IF NEW.pedido_id IS DISTINCT FROM OLD.pedido_id THEN RAISE EXCEPTION 'Campo protegido: pedido_id'; END IF;
      IF NEW.tipo_ordem IS DISTINCT FROM OLD.tipo_ordem THEN RAISE EXCEPTION 'Campo protegido: tipo_ordem'; END IF;
      IF NEW.data_entrega IS DISTINCT FROM OLD.data_entrega THEN RAISE EXCEPTION 'Campo protegido: data_entrega'; END IF;
      IF NEW.peso_metal_negociado IS DISTINCT FROM OLD.peso_metal_negociado THEN RAISE EXCEPTION 'Campo protegido: peso_metal_negociado'; END IF;
      IF NEW.ficha_tecnica_id IS DISTINCT FROM OLD.ficha_tecnica_id THEN RAISE EXCEPTION 'Campo protegido: ficha_tecnica_id'; END IF;
      RETURN NEW;
    END;
    $function$

```

</details>

**Uso no código:**
- `alissonerp.fn_proteger_campos_pdv` — 3 ocorrência(s)
  - `src/app/api/ordens/[id]/route.ts:7`
  - `supabase/migrations/027_trigger_ponte_pdv.sql:95`
  - `supabase/migrations/028_auditoria_dupla.sql:97`

---

## fn_proteger_itens_venda_fechada

- **Tipo:** FUNCTION (plpgsql) — SECURITY DEFINER
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION alissonerp.fn_proteger_itens_venda_fechada()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE v_situacao TEXT;
BEGIN
  IF current_setting('app.sync_ativo', true) = 'true' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  SELECT situacao INTO v_situacao
  FROM alissonerp.vendas_erp
  WHERE id = COALESCE(NEW.venda_id, OLD.venda_id);

  IF v_situacao IN ('confirmado', 'concluido') THEN
    RAISE EXCEPTION 'Venda fechada (%). Itens não podem ser alterados.', v_situacao
      USING ERRCODE = 'P0001';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$

```

</details>

**Uso no código:**
- `alissonerp.fn_proteger_itens_venda_fechada` — 4 ocorrência(s)
  - `supabase/migrations/114_blindar_vendas_fechadas.sql:12`
  - `supabase/migrations/114_blindar_vendas_fechadas.sql:38`
  - `supabase/migrations/114_blindar_vendas_fechadas.sql:46`
  - `supabase/migrations/114_blindar_vendas_fechadas.sql:111`

---

## fn_proteger_venda_fechada

- **Tipo:** FUNCTION (plpgsql) — SECURITY DEFINER
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION alissonerp.fn_proteger_venda_fechada()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF current_setting('app.sync_ativo', true) = 'true' THEN RETURN NEW; END IF;
  IF OLD.situacao NOT IN ('confirmado', 'concluido') THEN RETURN NEW; END IF;

  IF NEW.total_produtos IS DISTINCT FROM OLD.total_produtos
     OR NEW.total_desconto IS DISTINCT FROM OLD.total_desconto
     OR NEW.total_venda IS DISTINCT FROM OLD.total_venda
     OR NEW.total_comissao IS DISTINCT FROM OLD.total_comissao
     OR NEW.total_frete IS DISTINCT FROM OLD.total_frete
     OR NEW.cliente_id IS DISTINCT FROM OLD.cliente_id
     OR NEW.vendedor_id IS DISTINCT FROM OLD.vendedor_id
  THEN
    RAISE EXCEPTION 'Venda fechada (%). Campos financeiros protegidos.', OLD.situacao
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$function$

```

</details>

**Uso no código:**
- `alissonerp.fn_proteger_venda_fechada` — 5 ocorrência(s)
  - `scripts/check_estorno_triggers.mjs:23`
  - `scripts/check_estorno_triggers.mjs:27`
  - `supabase/migrations/114_blindar_vendas_fechadas.sql:54`
  - `supabase/migrations/114_blindar_vendas_fechadas.sql:104`
  - `supabase/migrations/114_blindar_vendas_fechadas.sql:112`

---

## fn_recalcular_totais_venda

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION alissonerp.fn_recalcular_totais_venda()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_venda_id INTEGER;
  v_total_produtos NUMERIC(12,2);
  v_total_desconto NUMERIC(12,2);
  v_total_frete    NUMERIC(12,2);
  v_total_comissao NUMERIC(12,2);
BEGIN
  -- Determinar o venda_id correto (DELETE usa OLD, INSERT/UPDATE usa NEW)
  IF TG_OP = 'DELETE' THEN
    v_venda_id := OLD.venda_id;
  ELSE
    v_venda_id := NEW.venda_id;
  END IF;

  -- Calcular os totais agregados a partir dos itens
  SELECT
    COALESCE(SUM(total_item),                                    0),
    COALESCE(SUM((preco_lista - preco_unitario) * quantidade),   0),
    COALESCE(SUM(valor_comissao),                                0)
  INTO
    v_total_produtos,
    v_total_desconto,
    v_total_comissao
  FROM alissonerp.itens_venda_erp
  WHERE venda_id = v_venda_id;

  -- Buscar o frete atual (não é recalculado a partir dos itens)
  SELECT total_frete
  INTO   v_total_frete
  FROM   alissonerp.vendas_erp
  WHERE  id = v_venda_id;

  -- Atualizar a venda
  UPDATE alissonerp.vendas_erp
  SET
    total_produtos = v_total_produtos,
    total_desconto = v_total_desconto,
    total_venda    = v_total_produtos + COALESCE(v_total_frete, 0),
    total_comissao = v_total_comissao,
    updated_at     = now()
  WHERE id = v_venda_id;

  -- Retornar o registro correto para cada operação
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## fn_resumo_recebido_mp

- **Tipo:** FUNCTION (sql)
- **Argumentos:** `p_inicio date, p_fim date`
- **Retorno:** `TABLE(qtd bigint, total_bruto numeric, total_taxas numeric, total_liquido numeric)`
- **Volatility:** STABLE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION alissonerp.fn_resumo_recebido_mp(p_inicio date DEFAULT NULL::date, p_fim date DEFAULT NULL::date)
 RETURNS TABLE(qtd bigint, total_bruto numeric, total_taxas numeric, total_liquido numeric)
 LANGUAGE sql
 STABLE
AS $function$
      SELECT
        COUNT(*)                                    AS qtd,
        COALESCE(SUM(p.valor),         0)::numeric  AS total_bruto,
        COALESCE(SUM(p.taxas_mp),      0)::numeric  AS total_taxas,
        COALESCE(SUM(p.valor_liquido), 0)::numeric  AS total_liquido
      FROM alissonerp.pagamentos_venda p
      WHERE p.gateway LIKE 'Mercado Pago%'
        AND p.status = 'confirmado'
        AND p.data_confirmacao IS NOT NULL
        AND (p_inicio IS NULL OR p.data_confirmacao::date >= p_inicio)
        AND (p_fim    IS NULL OR p.data_confirmacao::date <= p_fim);
    $function$

```

</details>

**Uso no código:**
- `alissonerp.fn_resumo_recebido_mp` — 3 ocorrência(s)
  - `scripts/apply_137.mjs:51`
  - `scripts/apply_137.mjs:83`
  - `scripts/backfill_mp_valor_liquido.mjs:80`

---

## fn_sync_item_venda_from_public

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION alissonerp.fn_sync_item_venda_from_public()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE v_venda_erp_id INTEGER; v_nome_produto TEXT;
BEGIN
  BEGIN
    SELECT id INTO v_venda_erp_id FROM alissonerp.vendas_erp WHERE public_venda_id = NEW.venda_id;
    IF v_venda_erp_id IS NULL THEN RETURN NEW; END IF;
    IF EXISTS (
      SELECT 1 FROM alissonerp.itens_venda_erp
      WHERE venda_id = v_venda_erp_id AND produto_id = NEW.produto_id AND COALESCE(sku, '') = COALESCE(NEW.sku, '')
    ) THEN RETURN NEW; END IF;

    PERFORM set_config('app.sync_ativo', 'true', true);

    SELECT nome INTO v_nome_produto FROM public.produtos WHERE id_produto = NEW.produto_id;

    INSERT INTO alissonerp.itens_venda_erp (
      venda_id, produto_id, nome_produto, sku,
      quantidade, preco_lista, pct_desconto, preco_unitario, total_item,
      pct_comissao, valor_comissao
    ) VALUES (
      v_venda_erp_id, NEW.produto_id,
      COALESCE(v_nome_produto, 'Produto #' || NEW.produto_id::text), NEW.sku,
      GREATEST(1, COALESCE(NEW.quantidade, 1)::integer),
      COALESCE(NEW.preco_tabela, 0), COALESCE(NEW.desconto_percentual, 0),
      COALESCE(NEW.preco_unitario_final, 0), COALESCE(NEW.preco_total, 0),
      COALESCE(NEW.comissao_percentual, 0), COALESCE(NEW.comissao_valor, 0)
    );

    UPDATE alissonerp.vendas_erp SET
      total_produtos = COALESCE((SELECT SUM(total_item) FROM alissonerp.itens_venda_erp WHERE venda_id = v_venda_erp_id), 0),
      total_desconto = COALESCE((SELECT SUM((preco_lista - preco_unitario) * quantidade) FROM alissonerp.itens_venda_erp WHERE venda_id = v_venda_erp_id), 0),
      total_comissao = COALESCE((SELECT SUM(valor_comissao) FROM alissonerp.itens_venda_erp WHERE venda_id = v_venda_erp_id), 0),
      total_venda = COALESCE((SELECT SUM(total_item) FROM alissonerp.itens_venda_erp WHERE venda_id = v_venda_erp_id), 0) + COALESCE(total_frete, 0),
      updated_at = now()
    WHERE id = v_venda_erp_id;

    PERFORM set_config('app.sync_ativo', '', true);
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('app.sync_ativo', '', true);
    NULL;
  END;
  RETURN NEW;
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## fn_sync_venda_from_public

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION alissonerp.fn_sync_venda_from_public()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_situacao VARCHAR(20);
BEGIN
  IF EXISTS (
    SELECT 1 FROM alissonerp.vendas_erp WHERE public_venda_id = NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  v_situacao := CASE
    WHEN NEW.entregue = true THEN 'concluido'
    WHEN NEW.status IS NULL  THEN 'rascunho'
    WHEN NEW.status = 1      THEN 'aprovado'
    WHEN NEW.status IN (2,3) THEN 'concluido'
    WHEN NEW.status = 4      THEN 'cancelado'
    ELSE                          'aprovado'
  END;

  INSERT INTO alissonerp.vendas_erp (
    numero_venda, cliente_id, vendedor_id,
    data_venda, data_entrega,
    total_produtos, total_frete, total_venda,
    situacao, observacoes, observacoes_internas,
    tiny_pedido_id, public_venda_id,
    bloqueado, created_at, updated_at
  ) VALUES (
    NEW.numero_pedido::text,
    NEW.cliente_id,
    NEW.vendedor_id,
    NEW.data_venda,
    NEW.data_envio::date,
    COALESCE(NEW.total_produtos,     0),
    COALESCE(NEW.frete_pago_cliente, 0),
    COALESCE(NEW.total_venda,        0),
    v_situacao,
    NEW.observacoes,
    NEW.observacoes_internas,
    NEW.id_api_tiny,
    NEW.id,
    false,
    COALESCE(NEW.created_at, now()),
    now()
  )
  -- Se o número já existe como entrada manual (sem public_venda_id), sobrescreve
  ON CONFLICT (numero_venda) DO UPDATE SET
    public_venda_id = EXCLUDED.public_venda_id,
    cliente_id      = EXCLUDED.cliente_id,
    vendedor_id     = EXCLUDED.vendedor_id,
    data_venda      = EXCLUDED.data_venda,
    total_produtos  = EXCLUDED.total_produtos,
    total_frete     = EXCLUDED.total_frete,
    total_venda     = EXCLUDED.total_venda,
    situacao        = EXCLUDED.situacao,
    updated_at      = now()
  WHERE alissonerp.vendas_erp.public_venda_id IS NULL;

  RETURN NEW;
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## fn_sync_venda_update_from_public

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION alissonerp.fn_sync_venda_update_from_public()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_situacao VARCHAR(20); v_erp_id INTEGER; v_erp_situacao VARCHAR(20);
  v_novo_total NUMERIC; v_novo_produtos NUMERIC;
  v_item RECORD; v_nome TEXT; v_itens_inseridos INTEGER := 0;
BEGIN
  BEGIN
    SELECT id, situacao INTO v_erp_id, v_erp_situacao
    FROM alissonerp.vendas_erp WHERE public_venda_id = NEW.id;
    IF v_erp_id IS NULL THEN RETURN NEW; END IF;

    PERFORM set_config('app.sync_ativo', 'true', true);

    v_situacao := CASE
      WHEN NEW.entregue = true THEN 'concluido'
      WHEN NEW.status IS NULL  THEN 'rascunho'
      WHEN NEW.status = 1      THEN 'aprovado'
      WHEN NEW.status = 2      THEN 'concluido'
      WHEN NEW.status = 3      THEN 'concluido'
      WHEN NEW.status = 4      THEN 'cancelado'
      ELSE 'aprovado'
    END;

    v_novo_total := COALESCE(NEW.total_venda, 0);
    v_novo_produtos := COALESCE(NEW.total_produtos, 0);

    IF v_erp_situacao IN ('confirmado', 'concluido') THEN
      UPDATE alissonerp.vendas_erp SET
        cliente_id = COALESCE(NEW.cliente_id, cliente_id),
        vendedor_id = COALESCE(NEW.vendedor_id, vendedor_id),
        data_venda = COALESCE(NEW.data_venda, data_venda),
        total_produtos = CASE WHEN v_novo_produtos > 0 THEN v_novo_produtos ELSE total_produtos END,
        total_frete = COALESCE(NEW.frete_pago_cliente, total_frete),
        total_venda = CASE WHEN v_novo_total > 0 THEN v_novo_total ELSE total_venda END,
        updated_at = now()
      WHERE id = v_erp_id;
    ELSE
      UPDATE alissonerp.vendas_erp SET
        situacao = v_situacao,
        cliente_id = COALESCE(NEW.cliente_id, cliente_id),
        vendedor_id = COALESCE(NEW.vendedor_id, vendedor_id),
        data_venda = COALESCE(NEW.data_venda, data_venda),
        total_produtos = CASE WHEN v_novo_produtos > 0 THEN v_novo_produtos ELSE total_produtos END,
        total_frete = COALESCE(NEW.frete_pago_cliente, 0),
        total_venda = CASE WHEN v_novo_total > 0 THEN v_novo_total ELSE total_venda END,
        updated_at = now()
      WHERE id = v_erp_id;
    END IF;

    -- RE-SYNC ITENS FALTANTES
    IF NOT EXISTS (SELECT 1 FROM alissonerp.itens_venda_erp WHERE venda_id = v_erp_id) THEN
      FOR v_item IN
        SELECT sku, produto_id, quantidade, preco_tabela, desconto_percentual,
               preco_unitario_final, preco_total, comissao_percentual, comissao_valor
        FROM public.itens_venda WHERE venda_id = NEW.id AND produto_id IS NOT NULL
      LOOP
        SELECT nome INTO v_nome FROM public.produtos WHERE id_produto = v_item.produto_id;
        INSERT INTO alissonerp.itens_venda_erp (
          venda_id, produto_id, nome_produto, sku,
          quantidade, preco_lista, pct_desconto, preco_unitario, total_item,
          pct_comissao, valor_comissao
        ) VALUES (
          v_erp_id, v_item.produto_id,
          COALESCE(v_nome, 'Produto #' || v_item.produto_id::text), v_item.sku,
          GREATEST(1, COALESCE(v_item.quantidade, 1)::integer),
          COALESCE(v_item.preco_tabela, 0), COALESCE(v_item.desconto_percentual, 0),
          COALESCE(v_item.preco_unitario_final, 0), COALESCE(v_item.preco_total, 0),
          COALESCE(v_item.comissao_percentual, 0), COALESCE(v_item.comissao_valor, 0)
        );
        v_itens_inseridos := v_itens_inseridos + 1;
      END LOOP;

      IF v_itens_inseridos > 0 THEN
        UPDATE alissonerp.vendas_erp SET
          total_produtos = COALESCE((SELECT SUM(total_item) FROM alissonerp.itens_venda_erp WHERE venda_id = v_erp_id), 0),
          total_desconto = COALESCE((SELECT SUM((preco_lista - preco_unitario) * quantidade) FROM alissonerp.itens_venda_erp WHERE venda_id = v_erp_id), 0),
          total_comissao = COALESCE((SELECT SUM(valor_comissao) FROM alissonerp.itens_venda_erp WHERE venda_id = v_erp_id), 0),
          total_venda = COALESCE((SELECT SUM(total_item) FROM alissonerp.itens_venda_erp WHERE venda_id = v_erp_id), 0) + COALESCE(total_frete, 0),
          updated_at = now()
        WHERE id = v_erp_id;
      END IF;
    END IF;

    PERFORM set_config('app.sync_ativo', '', true);
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('app.sync_ativo', '', true);
    NULL;
  END;
  RETURN NEW;
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## fn_touch_updated_at

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION alissonerp.fn_touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## fn_update_estoque_comercial_config_ts

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION alissonerp.fn_update_estoque_comercial_config_ts()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## fn_updated_at_mp_point_devices

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION alissonerp.fn_updated_at_mp_point_devices()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    BEGIN
      NEW.updated_at := NOW();
      RETURN NEW;
    END;
    $function$

```

</details>

_Sem referência identificada no código._

---

## fn_updated_at_tarefas

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION alissonerp.fn_updated_at_tarefas()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  IF NEW.status = 'concluida' AND OLD.status != 'concluida' THEN
    NEW.concluida_em = now();
  END IF;
  RETURN NEW;
END;
$function$

```

</details>

**Uso no código:**
- `alissonerp.fn_updated_at_tarefas` — 2 ocorrência(s)
  - `supabase/migrations/112_modulo_tarefas.sql:35`
  - `supabase/migrations/112_modulo_tarefas.sql:50`

---

## fn_updated_at_vendas_erp

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION alissonerp.fn_updated_at_vendas_erp()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## fn_user_role

- **Tipo:** FUNCTION (sql) — SECURITY DEFINER
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `character varying`
- **Volatility:** STABLE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION alissonerp.fn_user_role()
 RETURNS character varying
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT role FROM alissonerp.usuarios WHERE id = auth.uid();
$function$

```

</details>

**Uso no código:**
- `alissonerp.fn_user_role` — 7 ocorrência(s)
  - `scripts/apply_068.mjs:62`
  - `supabase/migrations/017_auth_trigger.sql:33`
  - `supabase/migrations/068_role_varchar.sql:10`
  - `supabase/migrations/068_role_varchar.sql:11`
  - `supabase/migrations/068_role_varchar.sql:29`

---

## fn_user_views_touch_updated

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION alissonerp.fn_user_views_touch_updated()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END; $function$

```

</details>

_Sem referência identificada no código._

---

## fn_venda_cancelar_conta_receber

- **Tipo:** FUNCTION (plpgsql) — SECURITY DEFINER
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION alissonerp.fn_venda_cancelar_conta_receber()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- Só executa se situação mudou para cancelado
  IF NEW.situacao != 'cancelado' OR OLD.situacao = 'cancelado' THEN
    RETURN NEW;
  END IF;

  -- Cancelar conta_receber vinculada
  UPDATE alissonerp.contas_receber
  SET situacao = 'cancelado', updated_at = now()
  WHERE venda_erp_id = NEW.id AND situacao = 'pendente';

  RETURN NEW;
END;
$function$

```

</details>

**Uso no código:**
- `alissonerp.fn_venda_cancelar_conta_receber` — 5 ocorrência(s)
  - `src/lib/vendas-aprovar.ts:914`
  - `scripts/check_estorno_triggers.mjs:50`
  - `scripts/check_estorno_triggers.mjs:54`
  - `supabase/migrations/113_financeiro_auto.sql:70`
  - `supabase/migrations/113_financeiro_auto.sql:143`

---

## fn_venda_gerar_conta_receber

- **Tipo:** FUNCTION (plpgsql) — SECURITY DEFINER
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION alissonerp.fn_venda_gerar_conta_receber()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_cliente_nome TEXT;
  v_existe BOOLEAN;
BEGIN
  -- Só executa se situação mudou para confirmado ou concluido
  IF NEW.situacao NOT IN ('confirmado', 'concluido') THEN
    RETURN NEW;
  END IF;

  -- Não reprocessar se já era confirmado/concluido
  IF OLD.situacao IN ('confirmado', 'concluido') THEN
    RETURN NEW;
  END IF;

  -- Verificar se já existe conta_receber para esta venda (guard duplicata)
  SELECT EXISTS(
    SELECT 1 FROM alissonerp.contas_receber WHERE venda_erp_id = NEW.id
  ) INTO v_existe;

  IF v_existe THEN
    RETURN NEW;
  END IF;

  -- Buscar nome do cliente
  SELECT nome INTO v_cliente_nome
  FROM public.contatos WHERE id_contato = NEW.cliente_id;

  -- Criar conta a receber
  INSERT INTO alissonerp.contas_receber (
    descricao, cliente_id, cliente_nome, venda_erp_id, valor,
    data_vencimento, situacao, categoria, created_by
  ) VALUES (
    'Venda ' || COALESCE(NEW.numero_venda, '#' || NEW.id),
    NEW.cliente_id,
    v_cliente_nome,
    NEW.id,
    NEW.total_venda,
    COALESCE(NEW.data_entrega, CURRENT_DATE + interval '30 days'),
    'pendente',
    'venda',
    NEW.created_by
  );

  RETURN NEW;
END;
$function$

```

</details>

**Uso no código:**
- `alissonerp.fn_venda_gerar_conta_receber` — 4 ocorrência(s)
  - `src/lib/vendas-aprovar.ts:755`
  - `supabase/migrations/113_financeiro_auto.sql:20`
  - `supabase/migrations/113_financeiro_auto.sql:137`
  - `supabase/migrations/135_mercado_pago_integracao.sql:71`

---

## fn_venda_gerar_conta_receber_on_insert

- **Tipo:** FUNCTION (plpgsql) — SECURITY DEFINER
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION alissonerp.fn_venda_gerar_conta_receber_on_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
    DECLARE v_cliente_nome TEXT; v_existe BOOLEAN;
    BEGIN
      IF NEW.situacao NOT IN ('confirmado','concluido') THEN RETURN NEW; END IF;
      SELECT EXISTS(SELECT 1 FROM alissonerp.contas_receber WHERE venda_erp_id = NEW.id) INTO v_existe;
      IF v_existe THEN RETURN NEW; END IF;
      SELECT nome INTO v_cliente_nome FROM public.contatos WHERE id_contato = NEW.cliente_id;
      INSERT INTO alissonerp.contas_receber (descricao, cliente_id, cliente_nome, venda_erp_id, valor, data_vencimento, situacao, categoria, created_by)
      VALUES ('Venda ' || COALESCE(NEW.numero_venda, '#' || NEW.id), NEW.cliente_id, v_cliente_nome, NEW.id, NEW.total_venda,
        COALESCE(NEW.data_entrega, CURRENT_DATE + interval '30 days'), 'pendente', 'venda', NEW.created_by);
      RETURN NEW;
    END;
    $function$

```

</details>

**Uso no código:**
- `alissonerp.fn_venda_gerar_conta_receber_on_insert` — 2 ocorrência(s)
  - `supabase/migrations/113_financeiro_auto.sql:152`
  - `supabase/migrations/113_financeiro_auto.sql:200`

---

## gerar_proximo_epc

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `text`
- **Volatility:** VOLATILE
- **Comentário:** Gera proximo EPC sequencial no formato AJ{AA}{NNNNNNNN} (12 chars ASCII / 96 bits hex). Atomico.

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION alissonerp.gerar_proximo_epc()
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE
  ano_atual INT := EXTRACT(YEAR FROM now())::INT - 2000;
  serial    BIGINT;
BEGIN
  -- INSERT com ON CONFLICT garante atomicidade mesmo sob alta concorrencia.
  -- Na 1a chamada do ano: insere (ano, 2) e retorna serial=1 (proximo_serial - 1).
  -- Nas seguintes: incrementa proximo_serial e retorna o valor anterior.
  INSERT INTO alissonerp.epc_serial (ano, proximo_serial)
  VALUES (ano_atual, 2)
  ON CONFLICT (ano) DO UPDATE
    SET proximo_serial = alissonerp.epc_serial.proximo_serial + 1,
        atualizado_em  = now()
  RETURNING proximo_serial - 1 INTO serial;

  RETURN 'AJ' || LPAD(ano_atual::TEXT, 2, '0') || LPAD(serial::TEXT, 8, '0');
END;
$function$

```

</details>

**Uso no código:**
- `alissonerp.gerar_proximo_epc` — 1 ocorrência(s)
  - `supabase/migrations/134_modulo_rfid.sql:43`

---

## proximo_sku_pz

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `text`
- **Volatility:** VOLATILE
- **Comentário:** Retorna proximo SKU PZ disponivel (formato PZ0001..PZ9999). Atomico via nextval.

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION alissonerp.proximo_sku_pz()
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE
  n INT;
BEGIN
  n := nextval('alissonerp.seq_sku_pz')::INT;
  RETURN 'PZ' || LPAD(n::TEXT, 4, '0');
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## tg_joias_rfid_touch_updated

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION alissonerp.tg_joias_rfid_touch_updated()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## tg_produto_personalizacao_touch_updated

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION alissonerp.tg_produto_personalizacao_touch_updated()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$

```

</details>

_Sem referência identificada no código._

---

