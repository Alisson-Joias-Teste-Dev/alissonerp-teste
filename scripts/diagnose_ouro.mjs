// Diagnóstico: cotação do ouro em parametros + uso em orçamento
import postgres from 'postgres';
const sql = postgres('postgresql://postgres:V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

try {
  // 1. Valor em public.parametros
  console.log('=== 1. public.parametros ===');
  const params = await sql`
    SELECT * FROM public.parametros LIMIT 5
  `;
  params.forEach(p => console.log(' ', JSON.stringify(p)));

  // 2. Schema da tabela parametros
  console.log('\n=== 2. Colunas de public.parametros ===');
  const cols = await sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'parametros'
    ORDER BY ordinal_position
  `;
  cols.forEach(c => console.log(`  ${c.column_name}: ${c.data_type}`));

  // 3. Ultimo orcamento de alianca salvo (ver cotacao_ouro, peso, valor)
  console.log('\n=== 3. Últimos 5 orçamentos de aliança ===');
  const orcs = await sql`
    SELECT id, numero_orcamento, peso, valor, markup, cotacao_ouro, valor_ouro, valor_pedras
    FROM alissonerp.orcamentos
    WHERE tipo = 'alianca'
    ORDER BY id DESC
    LIMIT 5
  `;
  orcs.forEach(o => {
    const esperadoBruto = Number(o.peso ?? 0) * Number(o.cotacao_ouro ?? 0) * Number(o.markup ?? 0);
    console.log(`  ${o.numero_orcamento}: peso=${o.peso}g × cotação=${o.cotacao_ouro} × markup=${o.markup} = R$ ${esperadoBruto.toFixed(2)} (salvo=${o.valor})`);
  });

  // 4. Fichas técnicas pra ver densidade_ouro armazenada
  console.log('\n=== 4. Últimas 5 fichas técnicas (densidade_ouro, cor_metal) ===');
  const fichas = await sql`
    SELECT id, modelo, largura, espessura, densidade_ouro, cor_metal, peso_estimado
    FROM alissonerp.orcamento_fichas_tecnicas
    ORDER BY id DESC
    LIMIT 5
  `;
  fichas.forEach(f => console.log(`  ${f.id}: ${f.modelo} | densidade=${f.densidade_ouro} | cor=${f.cor_metal} | peso=${f.peso_estimado}g`));

} finally {
  await sql.end();
}
