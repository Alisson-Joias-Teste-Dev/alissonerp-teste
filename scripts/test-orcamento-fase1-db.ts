/**
 * Teste end-to-end FASE 1 (DB direto, sem HTTP).
 * Valida invariantes do schema + comportamento das constraints + cálculos.
 *
 * Cada teste cria dados temporários com numero_orcamento prefixo "TST-",
 * roda asserts, e LIMPA no final (DELETE WHERE numero_orcamento LIKE 'TST-%').
 *
 * Rodar: npx tsx scripts/test-orcamento-fase1-db.ts
 */
import postgres from "postgres";
import { readFileSync } from "fs";

try {
  const env = readFileSync(".env.local", "utf-8");
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/\r$/, "").replace(/^["']|["']$/g, "");
  }
} catch { /* ignora */ }

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL ausente"); process.exit(1); }

const sql = postgres(url, { max: 1, idle_timeout: 5 });

const RESULTADOS: { nome: string; passou: boolean; detalhe: string }[] = [];
function teste(nome: string, passou: boolean, detalhe = "") {
  RESULTADOS.push({ nome, passou, detalhe });
  console.log(`${passou ? "✓" : "✗"} ${nome}${detalhe ? " — " + detalhe : ""}`);
}

async function cleanup() {
  // Captura IDs das fichas referenciadas ANTES de apagar os orçamentos
  // (depois do DELETE não dá mais pra recuperar).
  const fichas = await sql`
    SELECT ficha_tecnica_id AS id FROM alissonerp.orcamentos
    WHERE numero_orcamento LIKE 'TST-%' AND ficha_tecnica_id IS NOT NULL
    UNION
    SELECT ficha_tecnica_2_id FROM alissonerp.orcamentos
    WHERE numero_orcamento LIKE 'TST-%' AND ficha_tecnica_2_id IS NOT NULL
  `;
  const fichaIds = fichas.map(f => Number(f.id));
  // Ordem: apaga orçamento primeiro (libera FK), depois fichas.
  await sql`DELETE FROM alissonerp.orcamentos WHERE numero_orcamento LIKE 'TST-%'`;
  if (fichaIds.length > 0) {
    await sql`DELETE FROM alissonerp.orcamento_fichas_tecnicas WHERE id IN ${sql(fichaIds)}`;
  }
}

async function pegarClienteValido(): Promise<number> {
  const [c] = await sql`SELECT id_contato FROM public.contatos LIMIT 1`;
  if (!c) throw new Error("Sem cliente em public.contatos pra teste");
  return Number(c.id_contato);
}

async function pegarUsuarioValido(): Promise<string> {
  const [u] = await sql`SELECT id FROM alissonerp.usuarios WHERE role = 'desenvolvedor' LIMIT 1`;
  if (!u) throw new Error("Sem usuário desenvolvedor pra teste");
  return String(u.id);
}

async function rodarTestes() {
  console.log("=".repeat(70));
  console.log("FASE 1: TESTES DB DIRETO (staging)");
  console.log("=".repeat(70));

  await cleanup();
  const clienteId = await pegarClienteValido();
  const userId = await pegarUsuarioValido();

  // ────────────────────────────────────────────────────────────────────────
  // GRUPO 1: Migration 260 — constraints aplicadas
  // ────────────────────────────────────────────────────────────────────────
  console.log("\n[GRUPO 1] Migration 260 — constraints aplicadas");

  const fkVendedor = await sql`
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'alissonerp.orcamentos'::regclass
      AND conname = 'orcamentos_vendedor_id_fkey'
  `;
  teste("1.1 FK orcamentos_vendedor_id_fkey existe", fkVendedor.length > 0);

  const uniqNumero = await sql`
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'alissonerp' AND tablename = 'orcamentos'
      AND indexname = 'uq_orcamentos_numero_orcamento'
  `;
  teste("1.2 UNIQUE em numero_orcamento existe", uniqNumero.length > 0);

  const checks = await sql`
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'alissonerp.orcamentos'::regclass AND contype = 'c'
      AND conname IN ('chk_orcamentos_status','chk_orcamentos_tipo','chk_orcamentos_quantidade')
  `;
  teste("1.3 3 CHECK constraints presentes", checks.length === 3, `${checks.length}/3`);

  // ────────────────────────────────────────────────────────────────────────
  // GRUPO 2: CHECK constraints rejeitam valores inválidos
  // ────────────────────────────────────────────────────────────────────────
  console.log("\n[GRUPO 2] CHECK constraints rejeitam invalidos");

  let rejeitouStatus = false;
  try {
    await sql`
      INSERT INTO alissonerp.orcamentos (numero_orcamento, tipo, usuario_id, nome_cliente, status)
      VALUES ('TST-CHECK-STATUS', 'alianca', ${userId}::uuid, 'teste', 'inexistente')
    `;
  } catch (e) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rejeitouStatus = (e as any).code === "23514"; // check_violation
  }
  teste("2.1 CHECK rejeita status invalido", rejeitouStatus);

  let rejeitouTipo = false;
  try {
    await sql`
      INSERT INTO alissonerp.orcamentos (numero_orcamento, tipo, usuario_id, nome_cliente)
      VALUES ('TST-CHECK-TIPO', 'invalido', ${userId}::uuid, 'teste')
    `;
  } catch (e) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rejeitouTipo = (e as any).code === "23514";
  }
  teste("2.2 CHECK rejeita tipo invalido", rejeitouTipo);

  let rejeitouQtd = false;
  try {
    await sql`
      INSERT INTO alissonerp.orcamentos (numero_orcamento, tipo, usuario_id, nome_cliente, quantidade)
      VALUES ('TST-CHECK-QTD', 'alianca', ${userId}::uuid, 'teste', 5)
    `;
  } catch (e) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rejeitouQtd = (e as any).code === "23514";
  }
  teste("2.3 CHECK rejeita quantidade != 1,2", rejeitouQtd);

  // ────────────────────────────────────────────────────────────────────────
  // GRUPO 3: UNIQUE rejeita duplicata em numero_orcamento
  // ────────────────────────────────────────────────────────────────────────
  console.log("\n[GRUPO 3] UNIQUE numero_orcamento");
  await sql`
    INSERT INTO alissonerp.orcamentos (numero_orcamento, tipo, usuario_id, nome_cliente)
    VALUES ('TST-UQ-001', 'alianca', ${userId}::uuid, 'teste')
  `;
  let rejeitouUnique = false;
  try {
    await sql`
      INSERT INTO alissonerp.orcamentos (numero_orcamento, tipo, usuario_id, nome_cliente)
      VALUES ('TST-UQ-001', 'alianca', ${userId}::uuid, 'teste-dup')
    `;
  } catch (e) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rejeitouUnique = (e as any).code === "23505"; // unique_violation
  }
  teste("3.1 UNIQUE rejeita numero_orcamento duplicado", rejeitouUnique);

  // ────────────────────────────────────────────────────────────────────────
  // GRUPO 4: FK rejeita cliente_id inexistente
  // ────────────────────────────────────────────────────────────────────────
  console.log("\n[GRUPO 4] FK constraints");

  let rejeitouFK = false;
  try {
    await sql`
      INSERT INTO alissonerp.orcamentos (numero_orcamento, tipo, usuario_id, nome_cliente, cliente_id)
      VALUES ('TST-FK-CLI', 'alianca', ${userId}::uuid, 'teste', 999999999)
    `;
  } catch (e) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rejeitouFK = (e as any).code === "23503"; // FK violation
  }
  teste("4.1 FK rejeita cliente_id inexistente", rejeitouFK);

  // ────────────────────────────────────────────────────────────────────────
  // GRUPO 5: Snapshot + lock funcional
  // ────────────────────────────────────────────────────────────────────────
  console.log("\n[GRUPO 5] Snapshot + lock");

  const [orcLock] = await sql`
    INSERT INTO alissonerp.orcamentos (
      numero_orcamento, tipo, usuario_id, nome_cliente, cliente_id,
      valor, peso, valor_negociado_locked, snapshot, congelado_em
    ) VALUES (
      'TST-SNAP-001', 'alianca', ${userId}::uuid, 'snap-test', ${clienteId},
      9999.99, 5.5, true,
      ${sql.json({ valor: 9999.99, peso: 5.5, valor_ouro: 8000, valor_pedras: 1999.99, markup: 3.5, desconto_pct: 0, cotacao_ouro: 380, cotacao_dolar: 5.8 })},
      NOW()
    ) RETURNING id, valor, snapshot
  `;
  teste("5.1 INSERT com snapshot+lock funciona",
    orcLock?.valor_negociado_locked !== false && orcLock?.snapshot !== null,
    `valor=${orcLock?.valor}`);

  // UPDATE preserva snapshot
  await sql`UPDATE alissonerp.orcamentos SET nome_cliente = 'editado' WHERE id = ${orcLock.id}`;
  const [posUpdate] = await sql`SELECT snapshot, valor FROM alissonerp.orcamentos WHERE id = ${orcLock.id}`;
  teste("5.2 UPDATE sem mexer em snapshot preserva snapshot",
    posUpdate?.snapshot !== null && Number(posUpdate?.valor) === 9999.99);

  // ────────────────────────────────────────────────────────────────────────
  // GRUPO 6: Sequence venda_numero_seq alinhada
  // ────────────────────────────────────────────────────────────────────────
  console.log("\n[GRUPO 6] Sequences");

  const [seqVenda] = await sql`SELECT last_value FROM alissonerp.venda_numero_seq`;
  const [maxVenda] = await sql`
    SELECT GREATEST(
      COALESCE((SELECT MAX(numero_pedido) FROM public.vendas), 0),
      COALESCE((SELECT MAX(numero_venda::bigint) FROM alissonerp.vendas_erp WHERE numero_venda ~ '^[0-9]+$'), 0)
    ) AS m
  `;
  const alinhada = Number(seqVenda.last_value) >= Number(maxVenda.m);
  teste("6.1 venda_numero_seq alinhada (seq >= max real)", alinhada,
    `seq=${seqVenda.last_value}, max=${maxVenda.m}`);

  const [nextSeq] = await sql`SELECT nextval('alissonerp.venda_numero_seq') AS n`;
  const [maxAposBump] = await sql`
    SELECT GREATEST(
      COALESCE((SELECT MAX(numero_pedido) FROM public.vendas), 0),
      COALESCE((SELECT MAX(numero_venda::bigint) FROM alissonerp.vendas_erp WHERE numero_venda ~ '^[0-9]+$'), 0)
    ) AS m
  `;
  teste("6.2 nextval gera numero > max existente", Number(nextSeq.n) > Number(maxAposBump.m),
    `nextval=${nextSeq.n}, max=${maxAposBump.m}`);

  // ────────────────────────────────────────────────────────────────────────
  // GRUPO 7: tipo_pedra coluna existe (drift formalizado)
  // ────────────────────────────────────────────────────────────────────────
  console.log("\n[GRUPO 7] Schema integridade");

  const colTipoPedra = await sql`
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'alissonerp' AND table_name = 'orcamento_fichas_tecnicas'
      AND column_name = 'tipo_pedra'
  `;
  teste("7.1 coluna tipo_pedra existe", colTipoPedra.length > 0);

  // ────────────────────────────────────────────────────────────────────────
  // GRUPO 8: Ficha técnica salva e lê corretamente (par de alianças)
  // ────────────────────────────────────────────────────────────────────────
  console.log("\n[GRUPO 8] Ficha tecnica par");

  const [ficha1] = await sql`
    INSERT INTO alissonerp.orcamento_fichas_tecnicas (
      modelo, aro_numeracao, largura, espessura, peso_estimado, perfil,
      diametro, cor_metal, tipo_pedra, tipo_aplicacao_pedra, has_friso
    ) VALUES (
      'Aliança Teste 1', 'Aro 14', 5.0, 2.0, 4.5, 'Anatomica',
      18.0, 'Ouro Amarelo', 'diamante', 'meia_lua', false
    ) RETURNING id
  `;
  const [ficha2] = await sql`
    INSERT INTO alissonerp.orcamento_fichas_tecnicas (
      modelo, aro_numeracao, largura, espessura, peso_estimado, perfil,
      diametro, cor_metal, tipo_pedra, tipo_aplicacao_pedra, has_friso
    ) VALUES (
      'Aliança Teste 2', 'Aro 12', 4.5, 1.8, 3.8, 'Anatomica',
      17.0, 'Ouro Amarelo', null, null, false
    ) RETURNING id
  `;
  const [orcPar] = await sql`
    INSERT INTO alissonerp.orcamentos (
      numero_orcamento, tipo, usuario_id, nome_cliente, cliente_id,
      ficha_tecnica_id, ficha_tecnica_2_id, quantidade, valor, peso
    ) VALUES (
      'TST-PAR-001', 'alianca', ${userId}::uuid, 'par-test', ${clienteId},
      ${ficha1.id}, ${ficha2.id}, 2, 15000, 8.3
    ) RETURNING id
  `;
  const [parLido] = await sql`
    SELECT o.id, o.quantidade,
           f1.tipo_aplicacao_pedra AS f1_app,
           f2.aro_numeracao AS f2_aro
    FROM alissonerp.orcamentos o
    LEFT JOIN alissonerp.orcamento_fichas_tecnicas f1 ON f1.id = o.ficha_tecnica_id
    LEFT JOIN alissonerp.orcamento_fichas_tecnicas f2 ON f2.id = o.ficha_tecnica_2_id
    WHERE o.id = ${orcPar.id}
  `;
  teste("8.1 Par persiste com 2 fichas distintas",
    Number(parLido.quantidade) === 2 && parLido.f1_app === "meia_lua" && parLido.f2_aro === "Aro 12");

  // ────────────────────────────────────────────────────────────────────────
  // CLEANUP
  // ────────────────────────────────────────────────────────────────────────
  await cleanup();
  console.log("\n[CLEANUP] OK");

  // ────────────────────────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(70));
  const total = RESULTADOS.length;
  const passou = RESULTADOS.filter(r => r.passou).length;
  const falhou = total - passou;
  console.log(`RESUMO: ${passou}/${total} testes passaram (${falhou} falhas)`);
  if (falhou > 0) {
    console.log("\nFALHAS:");
    RESULTADOS.filter(r => !r.passou).forEach(r => console.log(`  ✗ ${r.nome} ${r.detalhe}`));
  }
  console.log("=".repeat(70));

  await sql.end();
  process.exit(falhou > 0 ? 1 : 0);
}

rodarTestes().catch(async e => {
  console.error("ERRO:", e);
  try { await cleanup(); } catch { /* */ }
  await sql.end().catch(() => null);
  process.exit(1);
});
