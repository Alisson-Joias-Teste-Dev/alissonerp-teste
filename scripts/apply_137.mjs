// Apply migration 137: pagamentos_venda valor_liquido + taxas + fix encoding
import postgres from 'postgres';
const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

console.log('=== APPLY 137: pagamentos_venda valor líquido + fix encoding ===\n');

try {
  console.log('── 1. ADD COLUMN valor_liquido + taxas_mp ──');
  await sql`
    ALTER TABLE alissonerp.pagamentos_venda
      ADD COLUMN IF NOT EXISTS valor_liquido NUMERIC(12,2),
      ADD COLUMN IF NOT EXISTS taxas_mp      NUMERIC(12,2)
  `;
  console.log('  ✅ colunas adicionadas');

  console.log('\n── 2. Estado ANTES do fix retroativo ──');
  const antes = await sql`
    SELECT
      jsonb_typeof(gateway_payload) AS tipo,
      COUNT(*)::int AS qtd
    FROM alissonerp.pagamentos_venda
    WHERE gateway_payload IS NOT NULL
    GROUP BY jsonb_typeof(gateway_payload)
    ORDER BY tipo
  `;
  antes.forEach(r => console.log(`  ${r.tipo}: ${r.qtd} registros`));

  console.log('\n── 3. Fix retroativo: string JSON → objeto ──');
  const fixResult = await sql`
    UPDATE alissonerp.pagamentos_venda
    SET gateway_payload = (gateway_payload #>> '{}')::jsonb
    WHERE gateway_payload IS NOT NULL
      AND jsonb_typeof(gateway_payload) = 'string'
      AND (gateway_payload #>> '{}') LIKE '{%}'
    RETURNING id
  `;
  console.log(`  ✅ ${fixResult.length} pagamento(s) consertado(s)`);

  console.log('\n── 4. Estado DEPOIS do fix ──');
  const depois = await sql`
    SELECT
      jsonb_typeof(gateway_payload) AS tipo,
      COUNT(*)::int AS qtd
    FROM alissonerp.pagamentos_venda
    WHERE gateway_payload IS NOT NULL
    GROUP BY jsonb_typeof(gateway_payload)
    ORDER BY tipo
  `;
  depois.forEach(r => console.log(`  ${r.tipo}: ${r.qtd} registros`));

  console.log('\n── 5. Criar fn_resumo_recebido_mp ──');
  await sql`
    CREATE OR REPLACE FUNCTION alissonerp.fn_resumo_recebido_mp(
      p_inicio DATE DEFAULT NULL,
      p_fim    DATE DEFAULT NULL
    )
    RETURNS TABLE (
      qtd            BIGINT,
      total_bruto    NUMERIC,
      total_taxas    NUMERIC,
      total_liquido  NUMERIC
    )
    LANGUAGE sql STABLE AS $$
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
    $$
  `;
  await sql`GRANT EXECUTE ON FUNCTION alissonerp.fn_resumo_recebido_mp(DATE, DATE) TO authenticated`;
  console.log('  ✅ função criada');

  // Validação
  console.log('\n── 6. Validação ──');
  const [resumo] = await sql`SELECT * FROM alissonerp.fn_resumo_recebido_mp()`;
  console.log(`  fn_resumo_recebido_mp() retorna:`);
  console.log(`    qtd           = ${resumo.qtd}`);
  console.log(`    total_bruto   = R$ ${resumo.total_bruto}`);
  console.log(`    total_taxas   = R$ ${resumo.total_taxas}  (vazio — webhook novo ainda não preencheu)`);
  console.log(`    total_liquido = R$ ${resumo.total_liquido} (vazio — webhook novo ainda não preencheu)`);

  const [exemplo] = await sql`
    SELECT id, gateway, jsonb_typeof(gateway_payload) AS tipo, gateway_payload
    FROM alissonerp.pagamentos_venda
    WHERE gateway LIKE 'Mercado Pago%'
    ORDER BY id DESC LIMIT 1
  `;
  if (exemplo) {
    console.log(`\n  exemplo pag#${exemplo.id}: tipo=${exemplo.tipo}`);
    const keys = Object.keys(exemplo.gateway_payload || {});
    console.log(`    payload keys: ${keys.slice(0, 12).join(', ')}${keys.length > 12 ? '...' : ''}`);
  }

  console.log('\n=== MIGRATION 137 CONCLUÍDA ✅ ===');
} catch (err) {
  console.error('\n❌ ERRO:', err.message);
  console.error(err);
  process.exit(1);
} finally {
  await sql.end();
}
