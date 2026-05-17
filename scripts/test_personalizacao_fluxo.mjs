/**
 * Teste de fluxo completo da configuracao de personalizacao.
 *
 * Simula exatamente o que POST /api/lia/personalizar/configurar faz,
 * mas via conexao direta (sem auth).
 *
 * Uso: node scripts/test_personalizacao_fluxo.mjs
 */

// Nota: executar com node --env-file=.env.local scripts/test_personalizacao_fluxo.mjs
import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL nao definida");
  process.exit(1);
}

const sql = postgres(DATABASE_URL, {
  ssl: false,
  connection: { search_path: "alissonerp,public" },
});

async function main() {
  console.log("🧪 TESTE DE FLUXO — Configuracao de Personalizacao\n");

  // ─── 1. Encontra um produto com personalizacao existente ───────────────
  console.log("1️⃣  Buscando produto com config de personalizacao existente...");
  const [produto] = await sql`
    SELECT pp.id, pp.produto_id, p.nome
    FROM alissonerp.produto_personalizacao pp
    JOIN public.produtos p ON p.id_produto = pp.produto_id
    WHERE pp.ativo = true
    LIMIT 1
  `;

  if (!produto) {
    // Tenta qualquer produto
    console.log("   Nenhum com personalizacao. Buscando qualquer produto...");
    const [fallback] = await sql`
      SELECT id_produto AS produto_id, nome
      FROM public.produtos
      WHERE ativo = true
      LIMIT 1
    `;
    if (!fallback) {
      console.error("❌ Nenhum produto encontrado no banco");
      await sql.end();
      process.exit(1);
    }
    console.log(`   Produto fallback: ID=${fallback.produto_id} "${fallback.nome}"`);
    produto = { produto_id: fallback.produto_id, nome: fallback.nome, id: null };
  } else {
    console.log(`   ✅ Produto: ID=${produto.produto_id} "${produto.nome}" (config_id=${produto.id})`);
  }

  const PRODUTO_ID = produto.produto_id;

  // ─── 2. Verifica integridade da UNIQUE constraint ──────────────────────
  console.log("\n2️⃣  Verificando constraint UNIQUE (produto_id)...");
  const constraints = await sql`
    SELECT conname, contype
    FROM pg_constraint
    WHERE conrelid = 'alissonerp.produto_personalizacao'::regclass
    AND contype = 'u'
  `;
  const hasUnique = constraints.some((c) => c.conname === "uq_produto_personalizacao_produto");
  if (hasUnique) {
    console.log("   ✅ UNIQUE constraint 'uq_produto_personalizacao_produto' ativa");
  } else {
    console.log("   ⚠️  Constraint nao encontrada. Verificando outras...");
    for (const c of constraints) {
      console.log(`      - ${c.conname} (${c.contype})`);
    }
  }

  // ─── 3. Testa INSERT com ON CONFLICT (mesma logica do endpoint) ────────
  console.log(`\n3️⃣  Testando INSERT ON CONFLICT (produto_id=${PRODUTO_ID})...`);

  const testConfig = {
    tipo: "nome",
    label: "Nome a gravar",
    obrigatorio: true,
    min_caracteres: 2,
    max_caracteres: 20,
    caracteres_permitidos: "alfa_acento_espaco",
    campos_gratis: 3,
    preco_campo_adicional: 50.00,
  };

  try {
    const [row] = await sql`
      INSERT INTO alissonerp.produto_personalizacao (
        produto_id, tipo, obrigatorio, min_caracteres, max_caracteres,
        caracteres_permitidos, label, campos_gratis, preco_campo_adicional
      ) VALUES (
        ${PRODUTO_ID}, ${testConfig.tipo}, ${testConfig.obrigatorio},
        ${testConfig.min_caracteres}, ${testConfig.max_caracteres},
        ${testConfig.caracteres_permitidos}, ${testConfig.label},
        ${testConfig.campos_gratis}, ${testConfig.preco_campo_adicional}
      )
      ON CONFLICT (produto_id) DO UPDATE SET
        tipo                    = EXCLUDED.tipo,
        obrigatorio             = EXCLUDED.obrigatorio,
        min_caracteres          = EXCLUDED.min_caracteres,
        max_caracteres          = EXCLUDED.max_caracteres,
        caracteres_permitidos   = EXCLUDED.caracteres_permitidos,
        label                   = EXCLUDED.label,
        campos_gratis           = EXCLUDED.campos_gratis,
        preco_campo_adicional   = EXCLUDED.preco_campo_adicional,
        updated_at              = now()
      RETURNING id, produto_id, tipo, campos_gratis, preco_campo_adicional
    `;

    console.log(`   ✅ INSERT/UPDATE OK — config_id=${row.id}`);
    console.log(`      tipo=${row.tipo}, campos_gratis=${row.campos_gratis}, preco_adicional=${row.preco_campo_adicional}`);
  } catch (err) {
    console.error("   ❌ Erro no INSERT ON CONFLICT:", err.message);
    console.log("   Stack:", err.stack);
    await sql.end();
    process.exit(1);
  }

  // ─── 4. Testa INSERT/UPDATE de regras de formatacao ────────────────────
  console.log("\n4️⃣  Testando INSERT/UPDATE de regras de formatacao...");

  const [configAtual] = await sql`
    SELECT id FROM alissonerp.produto_personalizacao
    WHERE produto_id = ${PRODUTO_ID} AND ativo = true
  `;
  const CONFIG_ID = configAtual.id;
  console.log(`   Config ID obtido: ${CONFIG_ID}`);

  const testRegras = {
    primeira_letra_maiuscula: true,
    sem_espacos: false,
    sem_numeros: true,
    sem_simbolos: true,
    sem_acentos: false,
  };

  try {
    const [regraRow] = await sql`
      INSERT INTO alissonerp.produto_personalizacao_regras (
        config_id, primeira_letra_maiuscula, sem_espacos,
        sem_numeros, sem_simbolos, sem_acentos
      ) VALUES (
        ${CONFIG_ID},
        ${testRegras.primeira_letra_maiuscula},
        ${testRegras.sem_espacos},
        ${testRegras.sem_numeros},
        ${testRegras.sem_simbolos},
        ${testRegras.sem_acentos}
      )
      ON CONFLICT (config_id) DO UPDATE SET
        primeira_letra_maiuscula = EXCLUDED.primeira_letra_maiuscula,
        sem_espacos             = EXCLUDED.sem_espacos,
        sem_numeros             = EXCLUDED.sem_numeros,
        sem_simbolos            = EXCLUDED.sem_simbolos,
        sem_acentos             = EXCLUDED.sem_acentos,
        updated_at              = now()
      RETURNING id, primeira_letra_maiuscula, sem_numeros
    `;

    console.log(`   ✅ Regras salvas — regras_id=${regraRow.id}`);
    console.log(`      primeira_maiuscula=${regraRow.primeira_letra_maiuscula}, sem_numeros=${regraRow.sem_numeros}`);
  } catch (err) {
    console.error("   ❌ Erro no INSERT regras:", err.message);
    await sql.end();
    process.exit(1);
  }

  // ─── 5. Atualiza config (simula segunda chamada do LIA) ───────────────
  console.log("\n5️⃣  Testando UPDATE (segunda chamada — altera campos)...");

  try {
    const [updated] = await sql`
      UPDATE alissonerp.produto_personalizacao
      SET
        tipo = 'iniciais',
        label = 'Iniciais a gravar',
        max_caracteres = 5,
        campos_gratis = 2,
        preco_campo_adicional = 30.00,
        updated_at = now()
      WHERE produto_id = ${PRODUTO_ID}
      RETURNING id, tipo, label, campos_gratis, preco_campo_adicional
    `;

    console.log(`   ✅ UPDATE OK — config_id=${updated.id}`);
    console.log(`      tipo=${updated.tipo}, label="${updated.label}"`);
    console.log(`      campos_gratis=${updated.campos_gratis}, preco_adicional=${updated.preco_campo_adicional}`);
  } catch (err) {
    console.error("   ❌ Erro no UPDATE:", err.message);
    await sql.end();
    process.exit(1);
  }

  // ─── 6. Atualiza regras (segunda chamada) ─────────────────────────────
  console.log("\n6️⃣  Testando UPDATE de regras (muda config)...");

  try {
    await sql`
      UPDATE alissonerp.produto_personalizacao_regras
      SET
        sem_espacos = true,
        sem_numeros = false,
        sem_simbolos = false,
        updated_at = now()
      WHERE config_id = ${CONFIG_ID}
    `;
    console.log("   ✅ Regras atualizadas com sucesso");
  } catch (err) {
    console.error("   ❌ Erro no UPDATE regras:", err.message);
    await sql.end();
    process.exit(1);
  }

  // ─── 7. Leitura completa (GET) ─────────────────────────────────────────
  console.log("\n7️⃣  Testando leitura completa (como GET faz)...");

  try {
    const [readback] = await sql`
      SELECT
        pp.id, pp.produto_id, pp.tipo, pp.obrigatorio,
        pp.min_caracteres, pp.max_caracteres,
        pp.caracteres_permitidos, pp.label, pp.placeholder,
        pp.exemplo, pp.observacao, pp.ativo,
        pp.campos_gratis, pp.preco_campo_adicional,
        pp.preco_por_letra, pp.peso_por_letra,
        ppr.primeira_letra_maiuscula, ppr.sem_espacos,
        ppr.sem_numeros, ppr.sem_simbolos, ppr.sem_acentos
      FROM alissonerp.produto_personalizacao pp
      LEFT JOIN alissonerp.produto_personalizacao_regras ppr ON ppr.config_id = pp.id
      WHERE pp.produto_id = ${PRODUTO_ID} AND pp.ativo = true
    `;

    console.log("   ✅ Leitura OK:");
    console.log(`      Config ID: ${readback.id}`);
    console.log(`      Tipo: ${readback.tipo}`);
    console.log(`      Label: "${readback.label}"`);
    console.log(`      Obrigatorio: ${readback.obrigatorio}`);
    console.log(`      Campos Gratis: ${readback.campos_gratis}`);
    console.log(`      Preco Adicional: ${readback.preco_campo_adicional}`);
    console.log(`      Regras:`);
    console.log(`         primeira_letra_maiuscula: ${readback.primeira_letra_maiuscula}`);
    console.log(`         sem_espacos:             ${readback.sem_espacos}`);
    console.log(`         sem_numeros:             ${readback.sem_numeros}`);
    console.log(`         sem_simbolos:            ${readback.sem_simbolos}`);
    console.log(`         sem_acentos:             ${readback.sem_acentos}`);
  } catch (err) {
    console.error("   ❌ Erro na leitura:", err.message);
    await sql.end();
    process.exit(1);
  }

  // ─── 8. Restaura config original ───────────────────────────────────────
  console.log("\n8️⃣  Restaurando config original...");
  try {
    await sql`
      UPDATE alissonerp.produto_personalizacao
      SET
        tipo = 'nome',
        label = 'Nome a gravar',
        obrigatorio = true,
        min_caracteres = 1,
        max_caracteres = 20,
        caracteres_permitidos = 'alfa_acento_espaco',
        campos_gratis = 1,
        preco_campo_adicional = NULL,
        updated_at = now()
      WHERE produto_id = ${PRODUTO_ID}
    `;

    await sql`
      UPDATE alissonerp.produto_personalizacao_regras
      SET
        primeira_letra_maiuscula = true,
        sem_espacos = false,
        sem_numeros = true,
        sem_simbolos = true,
        sem_acentos = false,
        updated_at = now()
      WHERE config_id = ${CONFIG_ID}
    `;

    console.log("   ✅ Config restaurada para valores padrao");
  } catch (err) {
    console.log("   ⚠️  Aviso: nao foi possivel restaurar config:", err.message);
  }

  // ─── RESUMO ────────────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════");
  console.log("✅ TESTE DE FLUXO CONCLUIDO COM SUCESSO!");
  console.log("═══════════════════════════════════════════\n");

  await sql.end();
}

main().catch((err) => {
  console.error("❌ Erro fatal:", err);
  process.exit(1);
});
