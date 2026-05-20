import sql from "../src/lib/db";

async function main() {
  await sql`
    CREATE OR REPLACE VIEW alissonerp.vw_produto_preco AS
    SELECT
      p.id_produto,
      CASE
        WHEN p.peso_precificado > 0
         AND cpa.markup_aplicado > 0
         AND (SELECT ouro FROM public.parametros LIMIT 1) > 0
        THEN ROUND(
          p.peso_precificado::numeric
          * (SELECT ouro FROM public.parametros LIMIT 1)::numeric
          * cpa.markup_aplicado::numeric
          * COALESCE(p.fator::numeric, 1)
          / 10
        )::int * 10
        ELSE NULL
      END AS preco_venda
    FROM public.produtos p
    LEFT JOIN alissonerp.produto_curva_aplicada cpa ON cpa.produto_id = p.id_produto
  `;
  console.log("✓ View vw_produto_preco criada com sucesso!");
  await sql.end();
}

main().catch((err) => {
  console.error("Erro:", err);
  process.exit(1);
});
