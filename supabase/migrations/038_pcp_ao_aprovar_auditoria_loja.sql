-- =============================================
-- MIGRATION 038: CRIAR PCP AO APROVAR AUDITORIA LOJA (rota=pcp)
-- Mudança ADITIVA: apenas o bloco aprovado+loja recebe nova lógica.
-- Todos os outros blocos (reprovado+loja, reprovado+fabrica) intactos.
-- Padrão idêntico ao fn_concluir_protocolo (testado).
-- =============================================

-- ─── 1. Atualizar trigger ────────────────────────────────────────────────────
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

  -- ── APROVADO ────────────────────────────────────────────────────────────────
  IF NEW.situacao = 'aprovado' THEN
    NEW.data_conclusao := COALESCE(NEW.data_conclusao, now());

    IF NEW.tipo_auditoria = 'loja' THEN
      -- Buscar dados da ordem para verificar rota
      SELECT * INTO v_ordem FROM alissonerp.ordens WHERE id = NEW.ordem_id;

      IF v_ordem.rota = 'pcp' THEN
        -- rota=pcp: criar saida_ordem + PCP novas_ordens + atualizar status
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
        -- rota=protocolo (ou outra): apenas disponibilizar, aguarda protocolo ida
        UPDATE alissonerp.ordens
        SET status = 'aguardando', updated_at = now()
        WHERE id = NEW.ordem_id;
      END IF;

    END IF;
    RETURN NEW;
  END IF;

  -- ── REPROVADO ───────────────────────────────────────────────────────────────
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
        'servico'::alissonerp.enum_tipo_ordem,
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
$function$;

-- ─── 2. Backfill: ordens rota=pcp já aprovadas sem PCP ───────────────────────
DO $$
DECLARE
  r          RECORD;
  v_saida_id INTEGER;
BEGIN
  FOR r IN
    SELECT o.id, o.peso_metal_externo
    FROM alissonerp.ordens o
    JOIN alissonerp.auditorias a
      ON a.ordem_id = o.id AND a.tipo_auditoria = 'loja' AND a.situacao = 'aprovado'
    LEFT JOIN alissonerp.pcp p ON p.ordem_id = o.id
    WHERE o.rota = 'pcp' AND p.id IS NULL
  LOOP
    INSERT INTO alissonerp.saidas_ordem (ordem_id)
    VALUES (r.id) RETURNING id INTO v_saida_id;

    INSERT INTO alissonerp.pcp (
      ordem_id, etapas, saida_ordem_id, metal_externo,
      total_metal, retorno_metal, total_pedras_un, total_pedras_g,
      total_geral_outros_pesos, total_outros_pesos_g
    ) VALUES (
      r.id, 'novas_ordens', v_saida_id,
      COALESCE(r.peso_metal_externo, 0),
      0, 0, 0, 0, 0, 0
    );

    UPDATE alissonerp.ordens
    SET status = 'em_andamento', updated_at = now()
    WHERE id = r.id;
  END LOOP;
END $$;
