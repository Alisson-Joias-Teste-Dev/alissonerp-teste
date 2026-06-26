import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL nao definida");
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { ssl: false, max: 3, connection: { search_path: "alissonerp,public" } });

const LOCAL_MAP = [
  { key: "fab", id: 1, nome: "Fabrica" },
  { key: "loj", id: 2, nome: "Loja" },
  { key: "rep", id: 3, nome: "Reposicao" },
  { key: "mkt", id: 4, nome: "Marketing" },
  { key: "ali", id: 7, nome: "Alisson" },
  { key: "dar", id: 8, nome: "Dara" },
  { key: "svc", id: 9, nome: "Service" },
];

async function migrar() {
  console.log("=== MIGRACAO public.estoque -> alissonerp ===\n");

  const t0 = Date.now();

  // 1. Buscar registros Tiny
  const rows = await sql`
    SELECT sku,
      COALESCE(estoque_fabrica, 0)::int        AS fab,
      COALESCE(estoque_loja, 0)::int           AS loj,
      COALESCE(estoque_reposicao_srvc, 0)::int AS rep,
      COALESCE(estoque_marketing, 0)::int      AS mkt,
      COALESCE(estoque_alisson, 0)::int        AS ali,
      COALESCE(estoque_dara, 0)::int           AS dar,
      COALESCE(estoque_service, 0)::int        AS svc
    FROM public.estoque
    WHERE COALESCE(saldo, 0) > 0
  `;
  console.log(`Registros Tiny com saldo > 0: ${rows.length}`);

  // 2. Pre-carregar produtos
  const skus = [...new Set(rows.map(r => r.sku).filter(Boolean))];
  const prods = await sql`SELECT id_produto, sku FROM public.produtos WHERE sku = ANY(${skus}::text[])`;
  const prodPorSku = new Map();
  for (const p of prods) prodPorSku.set(String(p.sku), p.id_produto);

  const ignorados = skus.filter(s => !prodPorSku.has(String(s)));
  console.log(`SKUs encontrados: ${prodPorSku.size} | Ignorados: ${ignorados.length}`);

  // 3. Construir array de movimentos
  const movimentos = [];
  const configsSet = new Set();

  for (const row of rows) {
    const sku = String(row.sku || "");
    const produtoId = prodPorSku.get(sku);
    if (!produtoId) continue;

    let teveMovimento = false;
    for (const { key, id, nome } of LOCAL_MAP) {
      const qty = row[key];
      if (!qty || qty <= 0) continue;
      movimentos.push({
        produto_id: produtoId,
        tipo: "entrada",
        quantidade: qty,
        motivo: "migracao_tiny",
        local_estoque_id: id,
        status: "efetivado",
        observacao: "Migracao Tiny ERP - " + nome,
      });
      teveMovimento = true;
    }
    if (teveMovimento) configsSet.add(produtoId);
  }

  console.log(`Movimentos a criar: ${movimentos.length}`);

  // 4. Batch insert movimentos
  if (movimentos.length > 0) {
    const cols = ["produto_id", "tipo", "quantidade", "motivo", "local_estoque_id", "status", "observacao"];
    await sql`
      INSERT INTO alissonerp.movimentacoes_estoque_comercial
      ${sql(movimentos, cols)}
    `;
    console.log(`Movimentos criados: ${movimentos.length} (batch)`);
  }

  // 5. Upsert configs em batch
  const configsArr = [...configsSet].map(pid => ({ produto_id: pid, ativo: true, estoque_minimo: 0 }));
  if (configsArr.length > 0) {
    await sql`
      INSERT INTO alissonerp.estoque_comercial_config
      ${sql(configsArr, "produto_id", "ativo", "estoque_minimo")}
      ON CONFLICT (produto_id) DO UPDATE SET ativo = true
    `;
    console.log(`Configs upsert: ${configsArr.length}`);
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n=== CONCLUIDO em ${elapsed}s ===`);
  console.log(`SKUs migrados: ${configsArr.length}`);
  console.log(`Movimentos: ${movimentos.length}`);
  console.log(`Ignorados: ${ignorados.length}`);
  if (ignorados.length > 0 && ignorados.length <= 30) {
    console.log(`  SKUs: ${ignorados.join(", ")}`);
  }
}

migrar()
  .then(() => sql.end({ timeout: 5 }))
  .catch(e => {
    console.error("ERRO:", e.message);
    sql.end({ timeout: 5 });
    process.exit(1);
  });
