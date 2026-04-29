# `crm` — Funções e Procedures

> 13 entradas | gerado 2026-04-29

## Índice

- [`adicionar_mensagem(p_conversa_id uuid, p_papel text, p_conteudo text, p_canal_message_id text, p_ti)`](#adicionar_mensagem)
- [`atribuir_vendedor(p_conversa_id uuid, p_vendedor_id bigint)`](#atribuir_vendedor)
- [`audit_trigger()`](#audit_trigger)
- [`buscar_ou_criar_contato_dm(p_canal text, p_canal_id text, p_nome text, p_username text, p_foto_url text, p_)`](#buscar_ou_criar_contato_dm)
- [`criar_conversa_se_necessario(p_canal text, p_canal_thread_id text, p_canal_contato_id text, p_contato_id bigi)`](#criar_conversa_se_necessario)
- [`criar_oportunidade(p_contato_id bigint, p_titulo text, p_funil_id uuid, p_etapa_id uuid, p_vendedor)`](#criar_oportunidade)
- [`marcar_conversa_lida(p_conversa_id uuid)`](#marcar_conversa_lida)
- [`mover_etapa_funil(p_conversa_id uuid, p_etapa_para_id uuid, p_motivo text)`](#mover_etapa_funil)
- [`mover_oportunidade_etapa(p_oportunidade_id uuid, p_etapa_destino_id uuid, p_motivo text)`](#mover_oportunidade_etapa)
- [`normalizar_nome(p_nome text)`](#normalizar_nome)
- [`set_updated_at()`](#set_updated_at)
- [`user_eh_admin(p_user_id uuid)`](#user_eh_admin)
- [`user_vendedor_id(p_user_id uuid)`](#user_vendedor_id)

_🛡️ = SECURITY DEFINER_

---

## adicionar_mensagem

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `p_conversa_id uuid, p_papel text, p_conteudo text, p_canal_message_id text, p_tipo_midia text, p_midia_url text, p_midia_storage_path text, p_instagram_media_id text, p_metadata jsonb`
- **Retorno:** `uuid`
- **Volatility:** VOLATILE
- **Comentário:** Insere mensagem com dedup, atualiza conversa, dispara ciclo_vida e notificações.

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION crm.adicionar_mensagem(p_conversa_id uuid, p_papel text, p_conteudo text, p_canal_message_id text DEFAULT NULL::text, p_tipo_midia text DEFAULT NULL::text, p_midia_url text DEFAULT NULL::text, p_midia_storage_path text DEFAULT NULL::text, p_instagram_media_id text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_msg_id uuid;
  v_existe uuid;
  v_resumo text;
  v_eh_primeira boolean;
  v_vendedor_user uuid;
BEGIN
  -- dedupe
  IF p_canal_message_id IS NOT NULL THEN
    SELECT id INTO v_existe
    FROM crm.mensagens
    WHERE conversa_id = p_conversa_id AND canal_message_id = p_canal_message_id
    LIMIT 1;
    IF v_existe IS NOT NULL THEN
      -- enriquece se chegou attachment depois
      UPDATE crm.mensagens SET
        midia_url = COALESCE(midia_url, p_midia_url),
        midia_storage_path = COALESCE(midia_storage_path, p_midia_storage_path),
        instagram_media_id = COALESCE(instagram_media_id, p_instagram_media_id)
      WHERE id = v_existe;
      RETURN v_existe;
    END IF;
  END IF;

  -- conta msgs anteriores pra detectar primeira
  SELECT NOT EXISTS (SELECT 1 FROM crm.mensagens WHERE conversa_id = p_conversa_id)
    INTO v_eh_primeira;

  INSERT INTO crm.mensagens (
    conversa_id, papel, conteudo, canal_message_id, tipo_midia,
    midia_url, midia_storage_path, instagram_media_id, metadata
  ) VALUES (
    p_conversa_id, p_papel, p_conteudo, p_canal_message_id, p_tipo_midia,
    p_midia_url, p_midia_storage_path, p_instagram_media_id, COALESCE(p_metadata,'{}'::jsonb)
  )
  RETURNING id INTO v_msg_id;

  v_resumo := substring(COALESCE(p_conteudo, ''), 1, 120);
  IF v_resumo = '' AND p_tipo_midia IS NOT NULL THEN
    v_resumo := '[' || p_tipo_midia || ']';
  END IF;

  -- atualiza conversa
  UPDATE crm.conversas SET
    ultima_msg_em = now(),
    ultima_msg_resumo = v_resumo,
    nao_lidas_count = CASE WHEN p_papel = 'user' THEN nao_lidas_count + 1 ELSE nao_lidas_count END,
    status = CASE WHEN status = 'arquivada' AND p_papel = 'user' THEN 'aberta' ELSE status END
  WHERE id = p_conversa_id;

  -- ciclo de vida: primeira_mensagem
  IF v_eh_primeira THEN
    INSERT INTO crm.ciclo_vida_eventos (conversa_id, contato_id, evento, detalhes)
    SELECT id, contato_id, 'primeira_mensagem', jsonb_build_object('mensagem_id', v_msg_id)
    FROM crm.conversas WHERE id = p_conversa_id;
  END IF;

  -- notificação: se msg do cliente, notifica vendedor responsável
  IF p_papel = 'user' THEN
    SELECT au.id INTO v_vendedor_user
    FROM crm.conversas conv
    JOIN public.vendedores vd ON vd.id_vendedor = conv.vendedor_id
    JOIN auth.users au ON au.id = vd.user_id
    WHERE conv.id = p_conversa_id;

    IF v_vendedor_user IS NOT NULL THEN
      INSERT INTO crm.notificacoes (user_id, tipo, titulo, mensagem, link, conversa_id)
      VALUES (
        v_vendedor_user,
        'mensagem_nova',
        'Nova mensagem',
        v_resumo,
        '/mensageria/' || p_conversa_id::text,
        p_conversa_id
      );
    END IF;
  END IF;

  RETURN v_msg_id;
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## atribuir_vendedor

- **Tipo:** FUNCTION (sql)
- **Argumentos:** `p_conversa_id uuid, p_vendedor_id bigint`
- **Retorno:** `void`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION crm.atribuir_vendedor(p_conversa_id uuid, p_vendedor_id bigint)
 RETURNS void
 LANGUAGE sql
AS $function$
  UPDATE crm.conversas SET vendedor_id = p_vendedor_id WHERE id = p_conversa_id;
$function$

```

</details>

_Sem referência identificada no código._

---

## audit_trigger

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION crm.audit_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_id text;
  v_old jsonb;
  v_new jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD);
    v_id := COALESCE(v_old->>'id', v_old->>'chave', v_old->>'codigo');
    INSERT INTO crm.audit_log (schema_name, table_name, operacao, registro_id, user_id, dados_antes)
    VALUES (TG_TABLE_SCHEMA, TG_TABLE_NAME, 'DELETE', v_id, v_user, v_old);
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    v_id := COALESCE(v_new->>'id', v_new->>'chave', v_new->>'codigo');
    INSERT INTO crm.audit_log (schema_name, table_name, operacao, registro_id, user_id, dados_antes, dados_depois)
    VALUES (TG_TABLE_SCHEMA, TG_TABLE_NAME, 'UPDATE', v_id, v_user, v_old, v_new);
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    v_new := to_jsonb(NEW);
    v_id := COALESCE(v_new->>'id', v_new->>'chave', v_new->>'codigo');
    INSERT INTO crm.audit_log (schema_name, table_name, operacao, registro_id, user_id, dados_depois)
    VALUES (TG_TABLE_SCHEMA, TG_TABLE_NAME, 'INSERT', v_id, v_user, v_new);
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## buscar_ou_criar_contato_dm

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `p_canal text, p_canal_id text, p_nome text, p_username text, p_foto_url text, p_telefone text`
- **Retorno:** `bigint`
- **Volatility:** VOLATILE
- **Comentário:** Busca cliente em public.contatos por username IG ou nome. Se não achar, cria. Garante 1 cliente único.

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION crm.buscar_ou_criar_contato_dm(p_canal text, p_canal_id text, p_nome text, p_username text DEFAULT NULL::text, p_foto_url text DEFAULT NULL::text, p_telefone text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_contato_id bigint;
  v_nome_normalizado text := crm.normalizar_nome(p_nome);
BEGIN
  -- 1) Procura por canal_id (mais preciso)
  SELECT contato_id INTO v_contato_id
  FROM crm.contato_canais
  WHERE canal = p_canal AND canal_id = p_canal_id
  LIMIT 1;
  IF v_contato_id IS NOT NULL THEN
    -- atualiza foto/nome se mudou
    UPDATE crm.contato_canais SET
      foto_url = COALESCE(p_foto_url, foto_url),
      nome_canal = COALESCE(p_nome, nome_canal),
      username = COALESCE(p_username, username)
    WHERE canal = p_canal AND canal_id = p_canal_id;
    RETURN v_contato_id;
  END IF;

  -- 2) Procura por username em outras conexoes (mesmo cliente, canal diferente)
  IF p_username IS NOT NULL AND length(p_username) > 0 THEN
    SELECT contato_id INTO v_contato_id
    FROM crm.contato_canais
    WHERE lower(username) = lower(p_username)
    LIMIT 1;
    IF v_contato_id IS NOT NULL THEN
      INSERT INTO crm.contato_canais (contato_id, canal, canal_id, username, nome_canal, foto_url)
      VALUES (v_contato_id, p_canal, p_canal_id, p_username, p_nome, p_foto_url)
      ON CONFLICT (canal, canal_id) DO NOTHING;
      RETURN v_contato_id;
    END IF;
  END IF;

  -- 3) Procura por nome normalizado em public.contatos
  IF length(v_nome_normalizado) > 3 THEN
    SELECT id_contato INTO v_contato_id
    FROM public.contatos
    WHERE crm.normalizar_nome(nome) = v_nome_normalizado
    LIMIT 1;
    IF v_contato_id IS NOT NULL THEN
      INSERT INTO crm.contato_canais (contato_id, canal, canal_id, username, nome_canal, foto_url)
      VALUES (v_contato_id, p_canal, p_canal_id, p_username, p_nome, p_foto_url)
      ON CONFLICT (canal, canal_id) DO NOTHING;
      RETURN v_contato_id;
    END IF;
  END IF;

  -- 4) Cria novo
  INSERT INTO public.contatos (id_contato, nome, telefone, data_atualizacao)
  VALUES (
    COALESCE((SELECT max(id_contato) FROM public.contatos), 0) + 1,
    p_nome, p_telefone, now()
  )
  RETURNING id_contato INTO v_contato_id;

  INSERT INTO crm.contato_canais (contato_id, canal, canal_id, username, nome_canal, foto_url)
  VALUES (v_contato_id, p_canal, p_canal_id, p_username, p_nome, p_foto_url);

  RETURN v_contato_id;
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## criar_conversa_se_necessario

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `p_canal text, p_canal_thread_id text, p_canal_contato_id text, p_contato_id bigint`
- **Retorno:** `uuid`
- **Volatility:** VOLATILE
- **Comentário:** 1 conversa por (canal, thread) — UPSERT idempotente para webhooks.

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION crm.criar_conversa_se_necessario(p_canal text, p_canal_thread_id text, p_canal_contato_id text, p_contato_id bigint)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_conversa_id uuid;
BEGIN
  -- tenta achar conversa por (canal, thread)
  SELECT id INTO v_conversa_id
  FROM crm.conversas
  WHERE canal = p_canal AND canal_thread_id = p_canal_thread_id
  LIMIT 1;

  IF v_conversa_id IS NOT NULL THEN
    -- atualiza contato_id se necessário (merge)
    UPDATE crm.conversas
    SET contato_id = COALESCE(p_contato_id, contato_id)
    WHERE id = v_conversa_id AND (contato_id IS NULL OR contato_id <> p_contato_id);
    RETURN v_conversa_id;
  END IF;

  -- cria nova
  INSERT INTO crm.conversas (canal, canal_thread_id, canal_contato_id, contato_id, status)
  VALUES (p_canal, p_canal_thread_id, p_canal_contato_id, p_contato_id, 'aberta')
  RETURNING id INTO v_conversa_id;

  RETURN v_conversa_id;
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## criar_oportunidade

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `p_contato_id bigint, p_titulo text, p_funil_id uuid, p_etapa_id uuid, p_vendedor_id bigint, p_valor numeric, p_produto_interesse text, p_notas text, p_origem_lead text, p_conversa_id uuid`
- **Retorno:** `uuid`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION crm.criar_oportunidade(p_contato_id bigint, p_titulo text, p_funil_id uuid, p_etapa_id uuid DEFAULT NULL::uuid, p_vendedor_id bigint DEFAULT NULL::bigint, p_valor numeric DEFAULT NULL::numeric, p_produto_interesse text DEFAULT NULL::text, p_notas text DEFAULT NULL::text, p_origem_lead text DEFAULT NULL::text, p_conversa_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_op_id uuid;
  v_etapa_id uuid := p_etapa_id;
  v_etapa_nome text;
BEGIN
  -- Se não informou etapa, pega a primeira do funil
  IF v_etapa_id IS NULL THEN
    SELECT id INTO v_etapa_id FROM crm.funil_etapas
    WHERE funil_id = p_funil_id AND ativo
    ORDER BY ordem LIMIT 1;
  END IF;

  INSERT INTO crm.oportunidades
    (contato_id, vendedor_id, funil_id, etapa_id, titulo, valor,
     produto_interesse, notas, origem_lead, conversa_id)
  VALUES
    (p_contato_id, p_vendedor_id, p_funil_id, v_etapa_id, p_titulo, p_valor,
     p_produto_interesse, p_notas, p_origem_lead, p_conversa_id)
  RETURNING id INTO v_op_id;

  -- Histórico inicial
  SELECT nome INTO v_etapa_nome FROM crm.funil_etapas WHERE id = v_etapa_id;
  INSERT INTO crm.oportunidade_historico
    (oportunidade_id, etapa_nova_id, etapa_nova_nome, user_id)
  VALUES (v_op_id, v_etapa_id, v_etapa_nome, auth.uid());

  RETURN v_op_id;
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## marcar_conversa_lida

- **Tipo:** FUNCTION (sql)
- **Argumentos:** `p_conversa_id uuid`
- **Retorno:** `void`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION crm.marcar_conversa_lida(p_conversa_id uuid)
 RETURNS void
 LANGUAGE sql
AS $function$
  UPDATE crm.conversas SET nao_lidas_count = 0 WHERE id = p_conversa_id;
$function$

```

</details>

_Sem referência identificada no código._

---

## mover_etapa_funil

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `p_conversa_id uuid, p_etapa_para_id uuid, p_motivo text`
- **Retorno:** `void`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION crm.mover_etapa_funil(p_conversa_id uuid, p_etapa_para_id uuid, p_motivo text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_etapa_de uuid;
  v_user uuid := auth.uid();
BEGIN
  SELECT etapa_atual_id INTO v_etapa_de FROM crm.conversas WHERE id = p_conversa_id;

  INSERT INTO crm.funil_movimentos (conversa_id, etapa_de, etapa_para, motivo, movido_por)
  VALUES (p_conversa_id, v_etapa_de, p_etapa_para_id, p_motivo, v_user);

  UPDATE crm.conversas SET etapa_atual_id = p_etapa_para_id WHERE id = p_conversa_id;
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## mover_oportunidade_etapa

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `p_oportunidade_id uuid, p_etapa_destino_id uuid, p_motivo text`
- **Retorno:** `void`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION crm.mover_oportunidade_etapa(p_oportunidade_id uuid, p_etapa_destino_id uuid, p_motivo text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_etapa_atual_id   uuid;
  v_etapa_atual_nome text;
  v_etapa_destino_nome text;
  v_destino_tipo     text;
BEGIN
  SELECT etapa_id INTO v_etapa_atual_id FROM crm.oportunidades
  WHERE id = p_oportunidade_id FOR UPDATE;

  SELECT nome INTO v_etapa_atual_nome FROM crm.funil_etapas WHERE id = v_etapa_atual_id;
  SELECT nome, tipo INTO v_etapa_destino_nome, v_destino_tipo
  FROM crm.funil_etapas WHERE id = p_etapa_destino_id;

  UPDATE crm.oportunidades
  SET etapa_id = p_etapa_destino_id,
      motivo_perda = CASE WHEN v_destino_tipo = 'perdido' THEN COALESCE(p_motivo, motivo_perda) ELSE motivo_perda END,
      data_entrada_pos_venda = CASE WHEN v_destino_tipo = 'pos_venda' THEN now() ELSE data_entrada_pos_venda END
  WHERE id = p_oportunidade_id;

  INSERT INTO crm.oportunidade_historico
    (oportunidade_id, etapa_anterior_id, etapa_anterior_nome,
     etapa_nova_id, etapa_nova_nome, motivo, user_id)
  VALUES
    (p_oportunidade_id, v_etapa_atual_id, v_etapa_atual_nome,
     p_etapa_destino_id, v_etapa_destino_nome, p_motivo, auth.uid());
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## normalizar_nome

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `p_nome text`
- **Retorno:** `text`
- **Volatility:** IMMUTABLE
- **Comentário:** Normaliza nome (sem acento, lowercase, só alfanumérico) para deduplicação de clientes.

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION crm.normalizar_nome(p_nome text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
BEGIN
  IF p_nome IS NULL OR length(trim(p_nome)) = 0 THEN RETURN ''; END IF;
  RETURN regexp_replace(lower(unaccent(p_nome)), '[^a-z0-9]', '', 'g');
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
- **Comentário:** Trigger BEFORE UPDATE para atualizar updated_at automaticamente.

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION crm.set_updated_at()
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

## user_eh_admin

- **Tipo:** FUNCTION (sql)
- **Argumentos:** `p_user_id uuid`
- **Retorno:** `boolean`
- **Volatility:** STABLE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION crm.user_eh_admin(p_user_id uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  SELECT COALESCE(
    (SELECT role IN ('admin','superadmin') FROM alissonerp.usuarios WHERE id = p_user_id),
    false
  );
$function$

```

</details>

_Sem referência identificada no código._

---

## user_vendedor_id

- **Tipo:** FUNCTION (sql)
- **Argumentos:** `p_user_id uuid`
- **Retorno:** `bigint`
- **Volatility:** STABLE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION crm.user_vendedor_id(p_user_id uuid DEFAULT auth.uid())
 RETURNS bigint
 LANGUAGE sql
 STABLE
AS $function$
  SELECT vendedor_id FROM alissonerp.usuarios WHERE id = p_user_id;
$function$

```

</details>

_Sem referência identificada no código._

---

