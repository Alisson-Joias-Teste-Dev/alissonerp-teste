import postgres from 'postgres';
const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

try {
  console.log('=== TOP 3 CLIENTES QUE MAIS COMPRAM ===\n');

  console.log('>>> Por NÚMERO DE VENDAS (qtd de pedidos) <<<');
  console.log(await sql`
    SELECT c.id_contato, c.nome, c.cpf_cnpj,
           COUNT(v.id)::int AS qtd_vendas,
           COALESCE(SUM(v.total_venda), 0)::numeric(14,2) AS total_gasto
    FROM public.vendas v
    JOIN public.contatos c ON c.id_contato = v.cliente_id
    WHERE v.status::text NOT IN ('cancelada','cancelado','0')
    GROUP BY c.id_contato, c.nome, c.cpf_cnpj
    ORDER BY qtd_vendas DESC, total_gasto DESC
    LIMIT 3
  `);

  console.log('\n>>> Por VALOR TOTAL GASTO (R$) <<<');
  console.log(await sql`
    SELECT c.id_contato, c.nome, c.cpf_cnpj,
           COUNT(v.id)::int AS qtd_vendas,
           COALESCE(SUM(v.total_venda), 0)::numeric(14,2) AS total_gasto
    FROM public.vendas v
    JOIN public.contatos c ON c.id_contato = v.cliente_id
    WHERE v.status::text NOT IN ('cancelada','cancelado','0')
    GROUP BY c.id_contato, c.nome, c.cpf_cnpj
    ORDER BY total_gasto DESC, qtd_vendas DESC
    LIMIT 3
  `);
} finally {
  await sql.end();
}
