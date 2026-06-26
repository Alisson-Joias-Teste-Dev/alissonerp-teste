// Verifica se os triggers permitem:
// 1. pagamentos_venda.status = 'estornado' (sem check constraint bloqueando)
// 2. vendas_erp.situacao = 'concluido' → 'rascunho' (trigger 114 não bloqueia)
// 3. vendas_erp.situacao = 'concluido' → 'cancelado' (trigger 111 reverte estoque)
// 4. contas_receber.situacao de 'pago' → 'cancelado'
import postgres from 'postgres';
const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

console.log('=== Check triggers/constraints pro fluxo de estorno ===\n');

// 1. Constraints em pagamentos_venda.status
console.log('── CHECK constraints em pagamentos_venda.status ──');
const ck = await sql`
  SELECT conname, pg_get_constraintdef(oid) AS def
  FROM pg_constraint
  WHERE conrelid = 'alissonerp.pagamentos_venda'::regclass
    AND contype = 'c'
`;
if (ck.length === 0) console.log('  (nenhum CHECK — status é VARCHAR livre)');
else ck.forEach(c => console.log(`  ${c.conname}: ${c.def}`));

// 2. Trigger 114: veja a source da função
console.log('\n── fn_proteger_venda_fechada (trigger 114) — última parte do source ──');
const [fn114] = await sql`
  SELECT pg_get_functiondef(oid) AS src
  FROM pg_proc
  WHERE proname = 'fn_proteger_venda_fechada'
`;
const src114 = fn114?.src ?? '';
// Busca menções a 'rascunho', 'cancelado', 'concluido'
console.log(`  menciona 'rascunho'? ${src114.toLowerCase().includes("'rascunho'")}`);
console.log(`  menciona 'cancelado'? ${src114.toLowerCase().includes("'cancelado'")}`);
console.log(`  permite mudar situacao? ${src114.includes("situacao IS DISTINCT FROM OLD.situacao")}`);

// 3. Trigger 111 cancelamento
console.log('\n── fn_estoque_comercial_cancelamento_venda (trigger 111) ──');
const [fn111] = await sql`
  SELECT pg_get_functiondef(oid) AS src
  FROM pg_proc
  WHERE proname = 'fn_estoque_comercial_cancelamento_venda'
`;
const src111 = fn111?.src ?? '';
console.log(`  existe? ${src111 ? '✅' : '❌'}`);
if (src111) {
  const matchCancelado = src111.match(/NEW\.situacao[^\n]{0,50}cancelado/);
  console.log(`  detecta mudança pra cancelado: ${matchCancelado ? '✅' : '❌'}`);
}

// 4. Trigger 113 cancelamento CR
console.log('\n── fn_venda_cancelar_conta_receber (trigger 113) ──');
const [fn113] = await sql`
  SELECT pg_get_functiondef(oid) AS src
  FROM pg_proc
  WHERE proname = 'fn_venda_cancelar_conta_receber'
`;
const src113 = fn113?.src ?? '';
console.log(`  existe? ${src113 ? '✅' : '❌'}`);
if (src113) {
  const onlyPendente = src113.includes("situacao = 'pendente'");
  console.log(`  só cancela CR pendente: ${onlyPendente ? '✅ (vamos ter que atualizar CR pago manualmente)' : '❌'}`);
}

// 5. contas_receber.situacao — valores existentes no banco
console.log('\n── Valores distintos de contas_receber.situacao ──');
const stats = await sql`
  SELECT situacao, COUNT(*) AS n
  FROM alissonerp.contas_receber
  GROUP BY situacao
  ORDER BY n DESC
`;
stats.forEach(s => console.log(`  ${s.situacao ?? 'NULL'}: ${s.n}`));

// 6. pagamentos_venda.status — valores existentes
console.log('\n── Valores distintos de pagamentos_venda.status ──');
const stats2 = await sql`
  SELECT status, COUNT(*) AS n
  FROM alissonerp.pagamentos_venda
  GROUP BY status
  ORDER BY n DESC
`;
stats2.forEach(s => console.log(`  ${s.status ?? 'NULL'}: ${s.n}`));

await sql.end();
