-- =============================================
-- MIGRATION 035: numero_pedido DIRETO EM alissonerp.ordens
-- Motivo: public.pedidos não tem todos os pedidos (gap de ETL).
-- Solução: gravar numero_pedido na hora do INSERT/UPSERT via trigger ponte.
-- =============================================

-- ─── 1. Adicionar coluna ─────────────────────────────────────────────────────
ALTER TABLE alissonerp.ordens
  ADD COLUMN IF NOT EXISTS numero_pedido TEXT;

-- ─── 2. Backfill ordens existentes que já têm pedido_id ──────────────────────
UPDATE alissonerp.ordens o
SET numero_pedido = p.numero_pedido::text
FROM public.pedidos p
WHERE p.id = o.pedido_id
  AND o.numero_pedido IS NULL;

-- ─── 3. Atualizar trigger ponte ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION alissonerp.fn_ponte_directus_para_alissonerp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_ordem_id       INTEGER;
  v_numero_pedido  TEXT;
BEGIN
  IF NEW.situacao != '2' THEN
    RETURN NEW;
  END IF;

  -- Buscar numero_pedido em public.pedidos (pode ser NULL se ainda não sincronizado)
  IF NEW.pedido_id IS NOT NULL THEN
    SELECT p.numero_pedido::text INTO v_numero_pedido
    FROM public.pedidos p
    WHERE p.id = NEW.pedido_id;
  END IF;

  INSERT INTO alissonerp.ordens (
    numero_ordem, cliente_id, vendedor_id, pedido_id, numero_pedido,
    tipo_ordem,
    data_entrega, peso_metal_negociado, peso_metal_externo,
    itens_para_fabricacao,
    situacao, status, rota,
    tipo_controle, setor_atual, local_atual,
    distribuicao_id, protocolo_loja,
    id_ordem_relacionada, id_asana,
    data_conclusao, created_at, updated_at,
    directus_ordem_id,
    ficha_tecnica_id
  ) VALUES (
    NEW.numero_ordem,
    NEW.cliente_id,
    NEW.vendedor_id,
    NEW.pedido_id,
    v_numero_pedido,
    CASE NEW.tipo_ordem
      WHEN '1' THEN 'servico'::alissonerp.enum_tipo_ordem
      WHEN '2' THEN 'fabricacao'::alissonerp.enum_tipo_ordem
      WHEN '3' THEN 'reposicao_venda'::alissonerp.enum_tipo_ordem
      WHEN '4' THEN 'reposicao_loja'::alissonerp.enum_tipo_ordem
      WHEN '5' THEN 'compra_fornecedor'::alissonerp.enum_tipo_ordem
      WHEN '6' THEN 'garantia'::alissonerp.enum_tipo_ordem
      WHEN '7' THEN 'servico_interno'::alissonerp.enum_tipo_ordem
      ELSE          'servico'::alissonerp.enum_tipo_ordem
    END,
    NEW.data_entrega,
    COALESCE(NEW.peso_metal_negocido, 0),
    COALESCE(NEW.peso_metal_externo, 0),
    NEW.itens_para_fabricacao,
    'criado'::alissonerp.enum_situacao_ordem,
    CASE NEW.status
      WHEN '1' THEN 'aguardando'::alissonerp.enum_status_ordem
      WHEN '2' THEN 'em_andamento'::alissonerp.enum_status_ordem
      WHEN '3' THEN 'concluido'::alissonerp.enum_status_ordem
      ELSE          'aguardando'::alissonerp.enum_status_ordem
    END,
    CASE NEW.rota
      WHEN '1' THEN 'pcp'::alissonerp.enum_rota_ordem
      WHEN '2' THEN 'protocolo'::alissonerp.enum_rota_ordem
      ELSE NULL
    END,
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
    NEW.id,
    NEW.ficha_tecnica_id
  )
  ON CONFLICT (directus_ordem_id) DO UPDATE SET
    peso_metal_externo    = EXCLUDED.peso_metal_externo,
    itens_para_fabricacao = EXCLUDED.itens_para_fabricacao,
    status                = EXCLUDED.status,
    rota                  = EXCLUDED.rota,
    setor_atual           = EXCLUDED.setor_atual,
    local_atual           = EXCLUDED.local_atual,
    numero_pedido         = COALESCE(EXCLUDED.numero_pedido, alissonerp.ordens.numero_pedido),
    updated_at            = now()
  RETURNING id INTO v_ordem_id;

  -- Criar auditoria LOJA somente em INSERT
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
          'itens_fabricacao', NEW.itens_para_fabricacao,
          'ficha_tecnica_id', NEW.ficha_tecnica_id
        )
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- ─── 4. Recriar vw_auditorias_completa — sem JOIN com public.pedidos ─────────
DROP VIEW IF EXISTS alissonerp.vw_auditorias_completa;
CREATE VIEW alissonerp.vw_auditorias_completa AS
SELECT
  a.id,
  a.situacao,
  CASE a.situacao
    WHEN 'pendente'    THEN 'Pendente'
    WHEN 'em_analise'  THEN 'Em Análise'
    WHEN 'aprovado'    THEN 'Aprovada'
    WHEN 'reprovado'   THEN 'Reprovada'
    WHEN 'pendenciado' THEN 'Pendenciada'
    ELSE a.situacao
  END AS situacao_label,
  a.tipo_auditoria,
  CASE a.tipo_auditoria
    WHEN 'loja'    THEN 'Auditoria Loja'
    WHEN 'fabrica' THEN 'Auditoria Fábrica'
    ELSE COALESCE(a.tipo_auditoria, 'Outro')
  END AS tipo_auditoria_label,
  a.rota_processo,
  a.ordem_id,
  o.numero_ordem,
  o.numero_pedido,                                     -- direto da tabela, sem JOIN
  o.tipo_ordem::text   AS tipo_ordem,
  o.rota::text         AS rota_ordem,
  a.ourives_nome,
  COALESCE(a.peso_negociado,    0::real) AS peso_negociado,
  COALESCE(a.peso_final,        0::real) AS peso_final,
  COALESCE(a.pmc,               0::real) AS pmc,
  COALESCE(a.quebra,            0::real) AS quebra,
  COALESCE(a.quebra_percentual, 0::real) AS quebra_percentual,
  COALESCE(a.total_metal,       0::real) AS total_metal,
  COALESCE(a.retorno_metal,     0::real) AS retorno_metal,
  COALESCE(a.metal_externo,     0::real) AS metal_externo,
  a.ficha_tecnica_obs,
  a.dados_ordem,
  CASE
    WHEN COALESCE(a.peso_negociado, 0::real) > 0
     AND COALESCE(a.peso_final,     0::real) > 0
    THEN round(((a.peso_final - a.peso_negociado) / a.peso_negociado * 100::double precision)::numeric, 1)
    ELSE 0
  END AS diff_peso_pct,
  a.responsavel_id,
  up.name              AS responsavel_nome,
  a.parecer,
  a.motivo_reprovacao,
  a.tipo_retrabalho,
  a.ordem_retrabalho_id,
  oret.numero_ordem    AS ordem_retrabalho_numero,
  c.nome               AS cliente_nome,
  v.nome               AS vendedor_nome,
  a.created_at,
  a.data_conclusao,
  round(EXTRACT(epoch FROM COALESCE(a.data_conclusao, now()) - a.created_at) / 86400.0, 1) AS dias_analise
FROM alissonerp.auditorias a
LEFT JOIN alissonerp.ordens o    ON o.id          = a.ordem_id
LEFT JOIN user_profiles     up   ON up.id_user    = a.responsavel_id
LEFT JOIN alissonerp.ordens oret ON oret.id       = a.ordem_retrabalho_id
LEFT JOIN contatos          c    ON c.id_contato  = o.cliente_id
LEFT JOIN vendedores        v    ON v.id_vendedor = o.vendedor_id;

GRANT SELECT ON alissonerp.vw_auditorias_completa TO anon, authenticated;

-- ─── 5. Recriar vw_ordens_completa — sem JOIN com public.pedidos ──────────────
DROP VIEW IF EXISTS alissonerp.vw_ordens_completa;
CREATE VIEW alissonerp.vw_ordens_completa AS
SELECT
  o.id,
  o.numero_ordem,
  o.numero_pedido,                                     -- direto da tabela, sem JOIN
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
    ELSE 'Aguardando'
  END AS status,
  o.rota::text AS rota_cod,
  CASE o.rota::text
    WHEN 'pcp'       THEN 'PCP'
    WHEN 'protocolo' THEN 'Protocolo'
    ELSE '—'
  END AS rota,
  o.tipo_ordem::text AS tipo_ordem_cod,
  CASE o.tipo_ordem::text
    WHEN 'servico'           THEN 'Serviço'
    WHEN 'fabricacao'        THEN 'Fabricação'
    WHEN 'reposicao_venda'   THEN 'Reposição Venda'
    WHEN 'reposicao_loja'    THEN 'Reposição Loja'
    WHEN 'compra_fornecedor' THEN 'Compra de Fornecedor'
    WHEN 'garantia'          THEN 'Garantia'
    WHEN 'servico_interno'   THEN 'Serviço Interno'
    ELSE '—'
  END AS tipo_ordem,
  o.setor_atual  AS setor_id,
  s.nome         AS setor_nome,
  o.local_atual  AS deposito_id,
  d.nome         AS deposito_nome,
  o.vendedor_id,
  v.nome         AS vendedor_nome,
  o.cliente_id,
  c.nome         AS cliente_nome,
  o.peso_metal_negociado,
  o.peso_metal_externo,
  o.data_entrega,
  o.data_conclusao,
  o.distribuicao_id,
  o.protocolo_loja,
  o.id_asana,
  o.created_at   AS date_created,
  o.updated_at   AS date_updated
FROM alissonerp.ordens o
LEFT JOIN alissonerp.setores   s ON s.id          = o.setor_atual
LEFT JOIN alissonerp.depositos d ON d.id          = o.local_atual
LEFT JOIN vendedores           v ON v.id_vendedor = o.vendedor_id
LEFT JOIN contatos             c ON c.id_contato  = o.cliente_id;

GRANT SELECT ON alissonerp.vw_ordens_completa TO anon, authenticated;
