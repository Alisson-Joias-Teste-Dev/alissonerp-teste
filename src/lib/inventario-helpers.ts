import sql from "@/lib/db";

type SqlExec = (
  strings: TemplateStringsArray,
  ...values: any[]
) => Promise<any>;

/**
 * Gera movimentacoes de ajuste para todos os itens divergentes de um inventario.
 * Pode ser usado dentro ou fora de uma transacao (aceita sql direto ou tx.begin).
 */
export async function gerarAjustesDivergencias(
  exec: SqlExec,
  invId: number,
  localEstoqueId: number,
  userId: string
) {
  const divergentes = await exec`
    SELECT id, produto_id, diferenca
    FROM alissonerp.itens_inventario_comercial
    WHERE inventario_id = ${invId} AND diferenca != 0
  `;

  let ajustes = 0;
  for (const item of divergentes) {
    const diff = Number(item.diferenca);
    const tipo = diff > 0 ? "entrada" : "saida";
    const quantidade = Math.abs(diff);

    const [mov] = await exec`
      INSERT INTO alissonerp.movimentacoes_estoque_comercial
        (produto_id, tipo, quantidade, motivo, local_estoque_id, status,
         referencia_id, referencia_tipo, observacao, created_by)
      VALUES
        (${item.produto_id}, ${tipo}, ${quantidade}, 'inventario',
         ${localEstoqueId}, 'efetivado',
         ${invId}, 'inventarios_comercial',
         ${`Ajuste inventario #${invId} — diferenca: ${diff > 0 ? "+" : ""}${diff}`},
         ${userId})
      RETURNING id
    `;

    await exec`
      UPDATE alissonerp.itens_inventario_comercial
      SET movimento_ajuste_id = ${mov.id}
      WHERE id = ${item.id}
    `;

    ajustes++;
  }

  return { ajustes, total: divergentes.length };
}
