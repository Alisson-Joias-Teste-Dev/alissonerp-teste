# `directus` — Views e Materialized Views

> 2 entradas | gerado 2026-04-29

## Índice

- [`ordem_comentarios_populados`](#ordem_comentarios_populados)
- [`v_saldo_quebra_final`](#v_saldo_quebra_final)

---

## ordem_comentarios_populados

Owner: `supabase_admin`

```sql
 SELECT c.id,
    c.ordem_id,
    c.user_id,
    c.conteudo,
    c.anexos_path,
    c.editado,
    c.data_edicao,
    c.date_created,
    c.date_updated,
    c.deleted_at,
    u.id_user AS usuario_id,
    u.name AS usuario_name,
    u.email AS usuario_email,
    u.avatar_url AS usuario_avatar_url,
    u.role AS usuario_role
   FROM (directus.ordem_comentarios c
     LEFT JOIN user_profiles u ON ((c.user_id = u.id_user)))
  WHERE (c.deleted_at IS NULL);
```

_Sem referência identificada no código._

---

## v_saldo_quebra_final

Owner: `supabase_admin`

```sql
 WITH pcp_convertido AS (
         SELECT pcp.id AS pcp_id,
            pcp.ordem_id
           FROM directus.pcp
        ), movimento_producao AS (
         SELECT ap.deposito AS id_deposito,
            pcp.ordem_id,
            sum(
                CASE
                    WHEN (ap.tipo_apontamento = ANY (ARRAY[1, 2])) THEN ap.qtd
                    ELSE (0)::real
                END) AS entrada_apontamento,
            sum(
                CASE
                    WHEN (ap.tipo_apontamento = 5) THEN ap.qtd
                    ELSE (0)::real
                END) AS saida_apontamento,
            max(
                CASE
                    WHEN (ap.tipo_apontamento = 5) THEN 1
                    ELSE 0
                END) AS flag_teve_retorno
           FROM (directus.apontamento ap
             LEFT JOIN pcp_convertido pcp ON ((ap.pcp_id = pcp.pcp_id)))
          WHERE (ap.insumo = 1)
          GROUP BY ap.deposito, pcp.ordem_id
        ), movimento_logistica AS (
         SELECT ce.deposito_id AS id_deposito,
            ce.ordem_id,
            sum(
                CASE
                    WHEN (((ce.marcador)::text ~~* '%TED%'::text) AND (ce.entrada > (0)::double precision)) THEN ce.entrada
                    ELSE (0)::real
                END) AS entrada_estoque,
            sum(
                CASE
                    WHEN (((ce.marcador)::text ~~* '%TED%'::text) AND (ce.saida > (0)::double precision)) THEN ce.saida
                    ELSE (0)::real
                END) AS saida_estoque,
            max(
                CASE
                    WHEN (((ce.marcador)::text ~~* '%TED%'::text) AND (ce.saida > (0)::double precision)) THEN 1
                    ELSE 0
                END) AS flag_teve_saida_estoque
           FROM directus.controle_estoque ce
          WHERE (ce.insumo_id = 1)
          GROUP BY ce.deposito_id, ce.ordem_id
        )
 SELECT COALESCE(mp.id_deposito, ml.id_deposito) AS id_deposito,
    d.nome AS nome_deposito,
    COALESCE(mp.ordem_id, ml.ordem_id) AS id_ordem,
    o.numero_ordem,
    (((COALESCE(mp.entrada_apontamento, (0)::real) + COALESCE(ml.entrada_estoque, (0)::real)) - (COALESCE(mp.saida_apontamento, (0)::real) + COALESCE(ml.saida_estoque, (0)::real))))::numeric(10,2) AS diferenca_calculada,
        CASE
            WHEN ((COALESCE(ml.flag_teve_saida_estoque, 0) = 0) AND (COALESCE(mp.flag_teve_retorno, 0) = 0)) THEN (((COALESCE(mp.entrada_apontamento, (0)::real) + COALESCE(ml.entrada_estoque, (0)::real)) - (COALESCE(mp.saida_apontamento, (0)::real) + COALESCE(ml.saida_estoque, (0)::real))))::numeric(10,2)
            ELSE 0.00
        END AS saldo_atual,
        CASE
            WHEN ((COALESCE(ml.flag_teve_saida_estoque, 0) = 1) OR (COALESCE(mp.flag_teve_retorno, 0) = 1)) THEN (((COALESCE(mp.entrada_apontamento, (0)::real) + COALESCE(ml.entrada_estoque, (0)::real)) - (COALESCE(mp.saida_apontamento, (0)::real) + COALESCE(ml.saida_estoque, (0)::real))))::numeric(10,2)
            ELSE 0.00
        END AS quebra_apurada
   FROM (((movimento_producao mp
     FULL JOIN movimento_logistica ml ON (((mp.id_deposito = ml.id_deposito) AND (mp.ordem_id = ml.ordem_id))))
     LEFT JOIN directus.deposito d ON ((COALESCE(mp.id_deposito, ml.id_deposito) = d.id)))
     LEFT JOIN directus.ordens o ON ((COALESCE(mp.ordem_id, ml.ordem_id) = o.id)))
  WHERE ((((COALESCE(mp.entrada_apontamento, (0)::real) + COALESCE(ml.entrada_estoque, (0)::real)) + COALESCE(mp.saida_apontamento, (0)::real)) + COALESCE(ml.saida_estoque, (0)::real)) > (0)::double precision);
```

_Sem referência identificada no código._

---

