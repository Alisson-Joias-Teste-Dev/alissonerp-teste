import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, { ssl: false, max: 1, connection: { search_path: "alissonerp,public" } });

// Colunas do public.estoque
const cols = await sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='estoque'`;
console.log("Colunas public.estoque:", JSON.stringify(cols));

// Total alerta
const total = await sql`SELECT COUNT(*)::int FROM alissonerp.vw_estoque_comercial_alerta_v2`;
console.log("Total alertas:", total[0].count);

// Sample estoque
const estoqueSample = await sql`SELECT * FROM public.estoque LIMIT 3`;
console.log("Sample estoque:", JSON.stringify(estoqueSample));

// Testar SKUs escaneados contra public.estoque
const skus = ["AJ5207", "1518-14", "AJ4912"];
for (const sku of skus) {
  const rows = await sql`SELECT * FROM public.estoque WHERE LOWER(sku) = LOWER(${sku})`;
  console.log(`Estoque SKU ${sku}:`, rows.length > 0 ? JSON.stringify(rows) : "NAO ENCONTRADO");
}

// IDs dos produtos escaneados (produto_ids de public.produtos)
const prodIds = [1501869, 8921, 11289, 9940, 699074];
for (const pid of prodIds) {
  const p = await sql`SELECT id_produto, sku, nome, id_api_produto FROM public.produtos WHERE id_produto = ${pid}`;
  if (p.length > 0) {
    console.log(`Produto ID ${pid}: sku=${p[0].sku}, nome=${p[0].nome?.substring(0,40)}, id_api=${p[0].id_api_produto}`);
    // Check estoque por SKU
    if (p[0].sku) {
      const es = await sql`SELECT * FROM public.estoque WHERE LOWER(sku) = LOWER(${p[0].sku})`;
      console.log(`  -> estoque:`, es.length > 0 ? JSON.stringify(es) : "NADA");
    }
    // Check config
    const cfg = await sql`SELECT ativo FROM alissonerp.estoque_comercial_config WHERE produto_id = ${pid}`;
    console.log(`  -> config:`, cfg.length > 0 ? JSON.stringify(cfg[0]) : "NAO CONFIGURADO");
    // Check alerta
    const al = await sql`SELECT sku, saldo_fisico, disponivel, alerta FROM alissonerp.vw_estoque_comercial_alerta_v2 WHERE sku = ${p[0].sku}`;
    console.log(`  -> alerta:`, al.length > 0 ? JSON.stringify(al) : "NADA");
  }
}

// Check if there's any stock movement for these products
for (const pid of prodIds) {
  const mov = await sql`SELECT tipo, quantidade, status, local_estoque_id FROM alissonerp.movimentacoes_estoque_comercial WHERE produto_id = ${pid} LIMIT 3`;
  if (mov.length > 0) {
    console.log(`Movimentacoes produto ${pid}:`, JSON.stringify(mov));
  }
}

await sql.end({ timeout: 5 });
