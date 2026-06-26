import postgres from 'postgres';

const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

async function main() {
  const produto_id = 90000599;
  const local_estoque_id = 2;
  const quantidade = 1;
  const motivo = 'ajuste_saida';
  const observacao = 'Sistema cadastrou com SKU errado o produto';

  console.log('=== BAIXA DE ESTOQUE ===');
  console.log(`Produto: ${produto_id} (SKU 90000055-16)`);
  console.log(`Quantidade: ${quantidade}`);
  console.log(`Motivo: ${motivo}`);
  console.log(`Local: ${local_estoque_id} (Loja)`);

  // 1. Verificar saldo disponível
  const [saldo] = await sql`
    SELECT COALESCE(SUM(
      CASE WHEN tipo = 'entrada' THEN quantidade ELSE -quantidade END
    ), 0) AS disponivel
    FROM alissonerp.movimentacoes_estoque_comercial
    WHERE produto_id = ${produto_id}
      AND local_estoque_id = ${local_estoque_id}
      AND status = 'efetivado'
  `;

  console.log(`\nSaldo disponível: ${saldo.disponivel}`);

  if (Number(saldo.disponivel) < quantidade) {
    console.error('ERRO: Saldo insuficiente!');
    process.exit(1);
  }

  // 2. Inserir movimentação de saída
  const [mov] = await sql`
    INSERT INTO alissonerp.movimentacoes_estoque_comercial
      (produto_id, tipo, quantidade, motivo, local_estoque_id, status, observacao)
    VALUES
      (${produto_id}, 'saida', ${quantidade}, ${motivo}, ${local_estoque_id}, 'efetivado', ${observacao})
    RETURNING id, created_at
  `;

  console.log(`\nMovimentação criada com sucesso!`);
  console.log(`ID: ${mov.id}`);
  console.log(`Data: ${mov.created_at}`);

  // 3. Verificar novo saldo
  const [novoSaldo] = await sql`
    SELECT COALESCE(SUM(
      CASE WHEN tipo = 'entrada' THEN quantidade ELSE -quantidade END
    ), 0) AS disponivel
    FROM alissonerp.movimentacoes_estoque_comercial
    WHERE produto_id = ${produto_id}
      AND local_estoque_id = ${local_estoque_id}
      AND status = 'efetivado'
  `;
  console.log(`\nNovo saldo: ${novoSaldo.disponivel}`);

  await sql.end();
}

main().catch(err => {
  console.error('Erro:', err);
  process.exit(1);
});
