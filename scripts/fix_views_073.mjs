// Fix migration 073 — re-apply views with correct column order
import postgres from 'postgres';
const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

console.log('=== FIX VIEWS 073 ===\n');

try {
  await sql`
    CREATE OR REPLACE VIEW alissonerp.vw_ordens_completa AS
    SELECT o.id,
        o.numero_ordem,
        o.numero_pedido,
        (o.situacao)::text AS situacao_cod,
        CASE (o.situacao)::text
            WHEN 'cancelado' THEN 'Cancelado'
            WHEN 'criado'    THEN 'Criado'
            WHEN 'rascunho'  THEN 'Rascunho'
            ELSE 'Desconhecido'
        END AS situacao,
        (o.status)::text AS status_cod,
        CASE (o.status)::text
            WHEN 'aguardando'   THEN 'Aguardando'
            WHEN 'em_andamento' THEN 'Em Andamento'
            WHEN 'concluido'    THEN 'Concluído'
            ELSE 'Aguardando'
        END AS status,
        (o.rota)::text AS rota_cod,
        CASE (o.rota)::text
            WHEN 'pcp'       THEN 'PCP'
            WHEN 'protocolo' THEN 'Protocolo'
            ELSE '—'
        END AS rota,
        (o.tipo_ordem)::text AS tipo_ordem_cod,
        CASE (o.tipo_ordem)::text
            WHEN 'servico_venda'      THEN 'Serviço Venda'
            WHEN 'servico_loja'       THEN 'Serviço Loja'
            WHEN 'fabricacao'         THEN 'Fabricação'
            WHEN 'reposicao_venda'    THEN 'Reposição Venda'
            WHEN 'reposicao_loja'     THEN 'Reposição Loja'
            WHEN 'compra_fornecedor'  THEN 'Compra de Fornecedor'
            WHEN 'garantia'           THEN 'Garantia'
            WHEN 'servico_interno'    THEN 'Serviço Interno'
            ELSE '—'
        END AS tipo_ordem,
        o.setor_atual    AS setor_id,
        s.nome           AS setor_nome,
        o.local_atual    AS deposito_id,
        d.nome           AS deposito_nome,
        o.vendedor_id,
        v.nome           AS vendedor_nome,
        o.cliente_id,
        c.nome           AS cliente_nome,
        o.peso_metal_negociado,
        o.peso_metal_externo,
        o.data_entrega,
        o.data_conclusao,
        o.distribuicao_id,
        o.protocolo_loja,
        o.id_asana,
        o.created_at     AS date_created,
        o.updated_at     AS date_updated
    FROM alissonerp.ordens o
        LEFT JOIN alissonerp.setores    s  ON s.id            = o.setor_atual
        LEFT JOIN alissonerp.depositos  d  ON d.id            = o.local_atual
        LEFT JOIN vendedores            v  ON v.id_vendedor   = o.vendedor_id
        LEFT JOIN contatos              c  ON c.id_contato    = o.cliente_id
  `;
  console.log('✅ vw_ordens_completa');

  await sql`
    CREATE OR REPLACE VIEW alissonerp.vw_ordens_por_tipo AS
    SELECT
        CASE (o.tipo_ordem)::text
            WHEN 'servico_venda'      THEN 'Serviço Venda'
            WHEN 'servico_loja'       THEN 'Serviço Loja'
            WHEN 'fabricacao'         THEN 'Fabricação'
            WHEN 'reposicao_venda'    THEN 'Reposição Venda'
            WHEN 'reposicao_loja'     THEN 'Reposição Loja'
            WHEN 'compra_fornecedor'  THEN 'Compra de Fornecedor'
            WHEN 'garantia'           THEN 'Garantia'
            WHEN 'servico_interno'    THEN 'Serviço Interno'
            ELSE 'N/D'
        END AS tipo,
        count(*) AS total
    FROM alissonerp.ordens o
    WHERE o.created_at > (now() - '6 mons'::interval)
    GROUP BY o.tipo_ordem
    ORDER BY count(*) DESC
  `;
  console.log('✅ vw_ordens_por_tipo');

  // DROP CASCADE necessário pois CREATE OR REPLACE falha quando ordem de colunas muda
  await sql`DROP VIEW IF EXISTS alissonerp.vw_ordem_detalhe CASCADE`;

  await sql`
    CREATE VIEW alissonerp.vw_ordem_detalhe AS
    SELECT o.id,
        o.numero_ordem,
        (o.situacao)::text AS situacao_cod,
        CASE (o.situacao)::text
            WHEN 'cancelado' THEN 'Cancelado'
            WHEN 'criado'    THEN 'Criado'
            WHEN 'rascunho'  THEN 'Rascunho'
            ELSE 'Desconhecido'
        END AS situacao,
        (o.status)::text AS status_cod,
        CASE (o.status)::text
            WHEN 'aguardando'   THEN 'Aguardando'
            WHEN 'em_andamento' THEN 'Em Andamento'
            WHEN 'concluido'    THEN 'Concluído'
            ELSE 'Aguardando'
        END AS status,
        (o.rota)::text AS rota_cod,
        CASE (o.rota)::text
            WHEN 'pcp'       THEN 'PCP'
            WHEN 'protocolo' THEN 'Protocolo'
            ELSE '—'
        END AS rota,
        (o.tipo_ordem)::text AS tipo_ordem_cod,
        CASE (o.tipo_ordem)::text
            WHEN 'servico_venda'      THEN 'Serviço Venda'
            WHEN 'servico_loja'       THEN 'Serviço Loja'
            WHEN 'fabricacao'         THEN 'Fabricação'
            WHEN 'reposicao_venda'    THEN 'Reposição Venda'
            WHEN 'reposicao_loja'     THEN 'Reposição Loja'
            WHEN 'compra_fornecedor'  THEN 'Compra de Fornecedor'
            WHEN 'garantia'           THEN 'Garantia'
            WHEN 'servico_interno'    THEN 'Serviço Interno'
            ELSE '—'
        END AS tipo_ordem,
        o.setor_atual    AS setor_id,
        s.nome           AS setor_nome,
        o.local_atual    AS deposito_id,
        d.nome           AS deposito_nome,
        o.vendedor_id,
        v.nome           AS vendedor_nome,
        o.cliente_id,
        c.nome           AS cliente_nome,
        o.peso_metal_negociado,
        o.peso_metal_externo,
        o.data_entrega,
        o.data_conclusao,
        o.distribuicao_id,
        o.protocolo_loja,
        o.id_asana,
        o.created_at     AS date_created,
        o.updated_at     AS date_updated,
        p.id             AS pcp_id,
        (p.etapas)::text AS pcp_etapas_cod,
        CASE (p.etapas)::text
            WHEN 'novas_ordens'  THEN 'Novas Ordens'
            WHEN 'pendencia'     THEN 'Pendência'
            WHEN 'aguardando'    THEN 'Aguardando'
            WHEN 'em_andamento'  THEN 'Em Andamento'
            WHEN 'concluido'     THEN 'Concluído'
            WHEN 'cancelado'     THEN 'Cancelado'
            ELSE '—'
        END AS pcp_etapas,
        p.total_metal               AS pcp_total_metal,
        p.retorno_metal             AS pcp_retorno_metal,
        p.total_pedras_un           AS pcp_total_pedras_un,
        p.total_pedras_g            AS pcp_total_pedras_g,
        p.total_geral_outros_pesos  AS pcp_total_outros,
        p.pmc                       AS pcp_pmc,
        p.quebra                    AS pcp_quebra,
        p.porcentagem_de_quebra     AS pcp_quebra_pct,
        p.peso_final                AS pcp_peso_final,
        p.metal_externo             AS pcp_metal_externo,
        p.bloqueado                 AS pcp_bloqueado,
        p.data_conclusao            AS pcp_data_conclusao,
        p.local_atual               AS pcp_local_atual,
        COALESCE(NULLIF(TRIM(BOTH FROM up.name), ''), au.email::text, 'Sem operador') AS pcp_operador_nome,
        dist.id                     AS dist_id,
        (dist.setor)::text          AS dist_setor,
        (dist.etapas)::text         AS dist_etapas_cod,
        CASE (dist.etapas)::text
            WHEN 'em_andamento' THEN 'Em Andamento'
            WHEN 'concluido'    THEN 'Concluído'
            ELSE NULL
        END AS dist_etapas,
        dist.pmc                    AS dist_pmc,
        dist.quebra                 AS dist_quebra,
        dist.porcentagem_de_quebra  AS dist_quebra_pct,
        o.foto_peca_servico,
        o.peso_peca_servico,
        o.video_observacao
    FROM alissonerp.ordens o
        LEFT JOIN alissonerp.setores        s    ON s.id          = o.setor_atual
        LEFT JOIN alissonerp.depositos      d    ON d.id          = o.local_atual
        LEFT JOIN vendedores                v    ON v.id_vendedor = o.vendedor_id
        LEFT JOIN contatos                  c    ON c.id_contato  = o.cliente_id
        LEFT JOIN alissonerp.pcp            p    ON p.ordem_id    = o.id
        LEFT JOIN auth.users                au   ON au.id         = p.operador
        LEFT JOIN user_profiles             up   ON up.id_user    = au.id
        LEFT JOIN alissonerp.distribuicoes  dist ON dist.id       = o.distribuicao_id
  `;
  console.log('✅ vw_ordem_detalhe (+ foto_peca_servico, peso_peca_servico, video_observacao ao final)');

  await sql`GRANT SELECT ON alissonerp.vw_ordens_completa TO anon, authenticated`;
  await sql`GRANT SELECT ON alissonerp.vw_ordens_por_tipo  TO anon, authenticated`;
  await sql`GRANT SELECT ON alissonerp.vw_ordem_detalhe    TO anon, authenticated`;
  console.log('✅ GRANTs aplicados');

  // Validação final
  const enumVals = await sql`
    SELECT enumlabel FROM pg_enum
    JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
    WHERE pg_type.typname = 'enum_tipo_ordem'
    AND pg_type.typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'alissonerp')
    ORDER BY enumsortorder
  `;
  console.log('\nEnum final:', enumVals.map(e => e.enumlabel).join(', '));

  const counts = await sql`
    SELECT tipo_ordem::text, COUNT(*)::int AS total
    FROM alissonerp.ordens
    WHERE tipo_ordem::text IN ('servico', 'servico_venda', 'servico_loja')
    GROUP BY tipo_ordem
  `;
  counts.forEach(r => console.log(`  ${r.tipo_ordem}: ${r.total} ordens`));

  const cols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'alissonerp' AND table_name = 'ordens'
    AND column_name IN ('foto_peca_servico', 'peso_peca_servico', 'video_observacao')
    ORDER BY column_name
  `;
  console.log('Novas colunas em ordens:', cols.map(c => c.column_name).join(', '));

  const viewCols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'alissonerp' AND table_name = 'vw_ordem_detalhe'
    AND column_name IN ('foto_peca_servico', 'peso_peca_servico', 'video_observacao')
    ORDER BY column_name
  `;
  console.log('Novas colunas na view:', viewCols.map(c => c.column_name).join(', '));

  console.log('\n=== MIGRATION 073 CONCLUÍDA ✅ ===');

} catch (err) {
  console.error('\n❌ ERRO:', err.message);
  process.exit(1);
} finally {
  await sql.end();
}
