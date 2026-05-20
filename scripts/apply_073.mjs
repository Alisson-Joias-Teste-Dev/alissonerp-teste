// Agente A — Apply migration 073: enum servico → servico_venda + servico_loja
import postgres from 'postgres';
import { readFileSync } from 'fs';

const DB_URL = 'postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres';
const sql = postgres(DB_URL, { ssl: false, max: 1 });

console.log('=== APPLY 073: ENUM SERVICO → SERVICO_VENDA ===\n');

try {
  // 1. ENUM RENAME — não pode estar em transação com ADD VALUE no PG15
  console.log('── 1. RENAME VALUE servico → servico_venda ──');
  await sql`ALTER TYPE alissonerp.enum_tipo_ordem RENAME VALUE 'servico' TO 'servico_venda'`;
  console.log('  ✅ RENAME OK');

  // ADD VALUE precisa de commit separado (não roda em transação)
  console.log('── 2. ADD VALUE servico_loja ──');
  await sql`ALTER TYPE alissonerp.enum_tipo_ordem ADD VALUE IF NOT EXISTS 'servico_loja'`;
  console.log('  ✅ ADD VALUE OK');

  // Verificar enum
  const enumVals = await sql`
    SELECT enumlabel FROM pg_enum
    JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
    WHERE pg_type.typname = 'enum_tipo_ordem'
    AND pg_type.typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'alissonerp')
    ORDER BY enumsortorder
  `;
  console.log('  Enum atual:', enumVals.map(e => e.enumlabel).join(', '));

  // Confirmar migração de ordens
  const countServico = await sql`
    SELECT tipo_ordem::text, COUNT(*)::int AS total
    FROM alissonerp.ordens
    WHERE tipo_ordem::text IN ('servico', 'servico_venda', 'servico_loja')
    GROUP BY tipo_ordem
  `;
  countServico.forEach(r => console.log(`  ${r.tipo_ordem}: ${r.total} ordens`));

  // 3. CAMPOS NOVOS
  console.log('\n── 3. ADD COLUMNS ──');
  await sql`ALTER TABLE alissonerp.ordens ADD COLUMN IF NOT EXISTS foto_peca_servico TEXT`;
  await sql`ALTER TABLE alissonerp.ordens ADD COLUMN IF NOT EXISTS peso_peca_servico NUMERIC(10,2)`;
  await sql`ALTER TABLE alissonerp.ordens ADD COLUMN IF NOT EXISTS video_observacao TEXT`;
  console.log('  ✅ foto_peca_servico, peso_peca_servico, video_observacao adicionados');

  // 4. BUCKET ordem-videos
  console.log('\n── 4. BUCKET ordem-videos ──');
  await sql`
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('ordem-videos', 'ordem-videos', false, 104857600, '{video/mp4,video/webm,video/quicktime,video/x-msvideo}')
    ON CONFLICT (id) DO NOTHING
  `;
  const buckets = await sql`SELECT id, name FROM storage.buckets ORDER BY name`;
  console.log('  Buckets:', buckets.map(b => b.name).join(', '));

  // 5. TRIGGER PONTE
  console.log('\n── 5. CREATE OR REPLACE fn_ponte ──');
  await sql`
    CREATE OR REPLACE FUNCTION alissonerp.fn_ponte_directus_para_alissonerp()
    RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
    DECLARE
      v_ordem_id       INTEGER;
      v_numero_pedido  TEXT;
    BEGIN
      IF NEW.situacao != '2' THEN
        RETURN NEW;
      END IF;

      IF NEW.pedido_id IS NOT NULL THEN
        SELECT v.numero_pedido::text INTO v_numero_pedido
        FROM public.vendas v
        WHERE v.id = NEW.pedido_id;
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
          WHEN '1' THEN 'servico_venda'::alissonerp.enum_tipo_ordem
          WHEN '2' THEN 'fabricacao'::alissonerp.enum_tipo_ordem
          WHEN '3' THEN 'reposicao_venda'::alissonerp.enum_tipo_ordem
          WHEN '4' THEN 'reposicao_loja'::alissonerp.enum_tipo_ordem
          WHEN '5' THEN 'compra_fornecedor'::alissonerp.enum_tipo_ordem
          WHEN '6' THEN 'garantia'::alissonerp.enum_tipo_ordem
          WHEN '7' THEN 'servico_interno'::alissonerp.enum_tipo_ordem
          ELSE          'servico_venda'::alissonerp.enum_tipo_ordem
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
        CASE
          WHEN NEW.tipo_ordem = '1' THEN 'protocolo'::alissonerp.enum_rota_ordem
          WHEN NEW.rota = '1'       THEN 'pcp'::alissonerp.enum_rota_ordem
          WHEN NEW.rota = '2'       THEN 'protocolo'::alissonerp.enum_rota_ordem
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
    $$
  `;
  console.log('  ✅ fn_ponte atualizada');

  // 6. fn_processar_auditoria
  console.log('\n── 6. CREATE OR REPLACE fn_processar_auditoria ──');
  await sql`
    CREATE OR REPLACE FUNCTION alissonerp.fn_processar_auditoria()
    RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
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
    $$
  `;
  console.log('  ✅ fn_processar_auditoria atualizada');

  // 7. VIEWS
  console.log('\n── 7. Views ──');

  await sql`
    CREATE OR REPLACE VIEW alissonerp.vw_ordens_completa AS
    SELECT o.id,
        o.numero_ordem,
        o.numero_pedido,
        (o.situacao)::text AS situacao_cod,
            CASE (o.situacao)::text
                WHEN 'cancelado'::text THEN 'Cancelado'::text
                WHEN 'criado'::text THEN 'Criado'::text
                WHEN 'rascunho'::text THEN 'Rascunho'::text
                ELSE 'Desconhecido'::text
            END AS situacao,
        (o.status)::text AS status_cod,
            CASE (o.status)::text
                WHEN 'aguardando'::text THEN 'Aguardando'::text
                WHEN 'em_andamento'::text THEN 'Em Andamento'::text
                WHEN 'concluido'::text THEN 'Concluído'::text
                ELSE 'Aguardando'::text
            END AS status,
        (o.rota)::text AS rota_cod,
            CASE (o.rota)::text
                WHEN 'pcp'::text THEN 'PCP'::text
                WHEN 'protocolo'::text THEN 'Protocolo'::text
                ELSE '—'::text
            END AS rota,
        (o.tipo_ordem)::text AS tipo_ordem_cod,
            CASE (o.tipo_ordem)::text
                WHEN 'servico_venda'::text THEN 'Serviço Venda'::text
                WHEN 'servico_loja'::text  THEN 'Serviço Loja'::text
                WHEN 'fabricacao'::text THEN 'Fabricação'::text
                WHEN 'reposicao_venda'::text THEN 'Reposição Venda'::text
                WHEN 'reposicao_loja'::text THEN 'Reposição Loja'::text
                WHEN 'compra_fornecedor'::text THEN 'Compra de Fornecedor'::text
                WHEN 'garantia'::text THEN 'Garantia'::text
                WHEN 'servico_interno'::text THEN 'Serviço Interno'::text
                ELSE '—'::text
            END AS tipo_ordem,
        o.setor_atual AS setor_id,
        s.nome AS setor_nome,
        o.local_atual AS deposito_id,
        d.nome AS deposito_nome,
        o.vendedor_id,
        v.nome AS vendedor_nome,
        o.cliente_id,
        c.nome AS cliente_nome,
        o.peso_metal_negociado,
        o.peso_metal_externo,
        o.data_entrega,
        o.data_conclusao,
        o.distribuicao_id,
        o.protocolo_loja,
        o.id_asana,
        o.created_at AS date_created,
        o.updated_at AS date_updated
    FROM ((((alissonerp.ordens o
        LEFT JOIN alissonerp.setores s ON ((s.id = o.setor_atual)))
        LEFT JOIN alissonerp.depositos d ON ((d.id = o.local_atual)))
        LEFT JOIN vendedores v ON ((v.id_vendedor = o.vendedor_id)))
        LEFT JOIN contatos c ON ((c.id_contato = o.cliente_id)))
  `;
  console.log('  ✅ vw_ordens_completa');

  await sql`
    CREATE OR REPLACE VIEW alissonerp.vw_ordens_por_tipo AS
    SELECT
        CASE (o.tipo_ordem)::text
            WHEN 'servico_venda'::text THEN 'Serviço Venda'::text
            WHEN 'servico_loja'::text  THEN 'Serviço Loja'::text
            WHEN 'fabricacao'::text THEN 'Fabricação'::text
            WHEN 'reposicao_venda'::text THEN 'Reposição Venda'::text
            WHEN 'reposicao_loja'::text THEN 'Reposição Loja'::text
            WHEN 'compra_fornecedor'::text THEN 'Compra de Fornecedor'::text
            WHEN 'garantia'::text THEN 'Garantia'::text
            WHEN 'servico_interno'::text THEN 'Serviço Interno'::text
            ELSE 'N/D'::text
        END AS tipo,
    count(*) AS total
    FROM alissonerp.ordens o
    WHERE (o.created_at > (now() - '6 mons'::interval))
    GROUP BY o.tipo_ordem
    ORDER BY (count(*)) DESC
  `;
  console.log('  ✅ vw_ordens_por_tipo');

  await sql`
    CREATE OR REPLACE VIEW alissonerp.vw_ordem_detalhe AS
    SELECT o.id,
        o.numero_ordem,
        (o.situacao)::text AS situacao_cod,
            CASE (o.situacao)::text
                WHEN 'cancelado'::text THEN 'Cancelado'::text
                WHEN 'criado'::text THEN 'Criado'::text
                WHEN 'rascunho'::text THEN 'Rascunho'::text
                ELSE 'Desconhecido'::text
            END AS situacao,
        (o.status)::text AS status_cod,
            CASE (o.status)::text
                WHEN 'aguardando'::text THEN 'Aguardando'::text
                WHEN 'em_andamento'::text THEN 'Em Andamento'::text
                WHEN 'concluido'::text THEN 'Concluído'::text
                ELSE 'Aguardando'::text
            END AS status,
        (o.rota)::text AS rota_cod,
            CASE (o.rota)::text
                WHEN 'pcp'::text THEN 'PCP'::text
                WHEN 'protocolo'::text THEN 'Protocolo'::text
                ELSE '—'::text
            END AS rota,
        (o.tipo_ordem)::text AS tipo_ordem_cod,
            CASE (o.tipo_ordem)::text
                WHEN 'servico_venda'::text THEN 'Serviço Venda'::text
                WHEN 'servico_loja'::text  THEN 'Serviço Loja'::text
                WHEN 'fabricacao'::text THEN 'Fabricação'::text
                WHEN 'reposicao_venda'::text THEN 'Reposição Venda'::text
                WHEN 'reposicao_loja'::text THEN 'Reposição Loja'::text
                WHEN 'compra_fornecedor'::text THEN 'Compra de Fornecedor'::text
                WHEN 'garantia'::text THEN 'Garantia'::text
                WHEN 'servico_interno'::text THEN 'Serviço Interno'::text
                ELSE '—'::text
            END AS tipo_ordem,
        o.setor_atual AS setor_id,
        s.nome AS setor_nome,
        o.local_atual AS deposito_id,
        d.nome AS deposito_nome,
        o.vendedor_id,
        v.nome AS vendedor_nome,
        o.cliente_id,
        c.nome AS cliente_nome,
        o.peso_metal_negociado,
        o.peso_metal_externo,
        o.data_entrega,
        o.data_conclusao,
        o.distribuicao_id,
        o.protocolo_loja,
        o.id_asana,
        o.created_at AS date_created,
        o.updated_at AS date_updated,
        p.id AS pcp_id,
        (p.etapas)::text AS pcp_etapas_cod,
            CASE (p.etapas)::text
                WHEN 'novas_ordens'::text THEN 'Novas Ordens'::text
                WHEN 'pendencia'::text THEN 'Pendência'::text
                WHEN 'aguardando'::text THEN 'Aguardando'::text
                WHEN 'em_andamento'::text THEN 'Em Andamento'::text
                WHEN 'concluido'::text THEN 'Concluído'::text
                WHEN 'cancelado'::text THEN 'Cancelado'::text
                ELSE '—'::text
            END AS pcp_etapas,
        p.total_metal AS pcp_total_metal,
        p.retorno_metal AS pcp_retorno_metal,
        p.total_pedras_un AS pcp_total_pedras_un,
        p.total_pedras_g AS pcp_total_pedras_g,
        p.total_geral_outros_pesos AS pcp_total_outros,
        p.pmc AS pcp_pmc,
        p.quebra AS pcp_quebra,
        p.porcentagem_de_quebra AS pcp_quebra_pct,
        p.peso_final AS pcp_peso_final,
        p.metal_externo AS pcp_metal_externo,
        p.bloqueado AS pcp_bloqueado,
        p.data_conclusao AS pcp_data_conclusao,
        p.local_atual AS pcp_local_atual,
        COALESCE(NULLIF(TRIM(BOTH FROM up.name), ''::text), (au.email)::text, 'Sem operador'::text) AS pcp_operador_nome,
        dist.id AS dist_id,
        (dist.setor)::text AS dist_setor,
        (dist.etapas)::text AS dist_etapas_cod,
            CASE (dist.etapas)::text
                WHEN 'em_andamento'::text THEN 'Em Andamento'::text
                WHEN 'concluido'::text THEN 'Concluído'::text
                ELSE NULL::text
            END AS dist_etapas,
        dist.pmc AS dist_pmc,
        dist.quebra AS dist_quebra,
        dist.porcentagem_de_quebra AS dist_quebra_pct,
        o.foto_peca_servico,
        o.peso_peca_servico,
        o.video_observacao
    FROM ((((((((alissonerp.ordens o
        LEFT JOIN alissonerp.setores s ON ((s.id = o.setor_atual)))
        LEFT JOIN alissonerp.depositos d ON ((d.id = o.local_atual)))
        LEFT JOIN vendedores v ON ((v.id_vendedor = o.vendedor_id)))
        LEFT JOIN contatos c ON ((c.id_contato = o.cliente_id)))
        LEFT JOIN alissonerp.pcp p ON ((p.ordem_id = o.id)))
        LEFT JOIN auth.users au ON ((au.id = p.operador)))
        LEFT JOIN user_profiles up ON ((up.id_user = au.id)))
        LEFT JOIN alissonerp.distribuicoes dist ON ((dist.id = o.distribuicao_id)))
  `;
  console.log('  ✅ vw_ordem_detalhe (+ foto_peca_servico, peso_peca_servico, video_observacao)');

  // 8. GRANTS
  await sql`GRANT SELECT ON alissonerp.vw_ordens_completa TO anon, authenticated`;
  await sql`GRANT SELECT ON alissonerp.vw_ordens_por_tipo  TO anon, authenticated`;
  await sql`GRANT SELECT ON alissonerp.vw_ordem_detalhe    TO anon, authenticated`;
  console.log('  ✅ GRANTS aplicados');

  console.log('\n=== MIGRATION 073 CONCLUÍDA ===');

} catch (err) {
  console.error('\n❌ ERRO:', err.message);
  process.exit(1);
} finally {
  await sql.end();
}
