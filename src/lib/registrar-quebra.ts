import sql from "@/lib/db";

/**
 * Registra quebra de ouro para um operador.
 *
 * REGRA INVIOLÁVEL: Pote (depósito ID=1) NUNCA registra quebra.
 * Quebra = ouro_recebido − ouro_entregue.
 *   > 0 → perdeu ouro (quebra real)
 *   < 0 → sobrou ouro (saldo positivo)
 */
export interface RegistroQuebra {
  ordem_id?:       number | null;
  pcp_id?:         number | null;
  distribuicao_id?: number | null;
  deposito_id:     number;       // operador que teve a quebra
  setor_id?:       number | null;
  insumo_id?:      number;       // default 1 (Ouro 18k Amarelo)
  numero_ordem?:   string | null;
  deposito_nome:   string;
  setor_nome?:     string | null;
  tipo:            "transferencia" | "saida_pcp" | "conclusao_lote" | "devolucao_service";
  ouro_recebido:   number;       // quanto ENTROU neste operador
  ouro_entregue:   number;       // quanto SAIU (transferido ou na peça)
  created_by?:     string | null;
}

export async function registrarQuebra(dados: RegistroQuebra) {
  // Pote (depósito ID=1) NUNCA registra quebra
  if (dados.deposito_id === 1) return null;

  const quebra     = parseFloat((dados.ouro_recebido - dados.ouro_entregue).toFixed(4));
  const percentual = dados.ouro_recebido > 0
    ? parseFloat(((quebra / dados.ouro_recebido) * 100).toFixed(2))
    : 0;

  const [registro] = await sql`
    INSERT INTO alissonerp.quebra_operador (
      ordem_id, pcp_id, distribuicao_id, deposito_id, setor_id, insumo_id,
      numero_ordem, deposito_nome, setor_nome, insumo_nome,
      tipo, ouro_recebido, ouro_entregue, quebra, percentual_quebra,
      data_registro, created_by
    ) VALUES (
      ${dados.ordem_id ?? null},
      ${dados.pcp_id ?? null},
      ${dados.distribuicao_id ?? null},
      ${dados.deposito_id},
      ${dados.setor_id ?? null},
      ${dados.insumo_id ?? 1},
      ${dados.numero_ordem ?? null},
      ${dados.deposito_nome},
      ${dados.setor_nome ?? null},
      'Ouro 18k Amarelo',
      ${dados.tipo},
      ${dados.ouro_recebido},
      ${dados.ouro_entregue},
      ${quebra},
      ${percentual},
      NOW(),
      ${dados.created_by ?? null}
    )
    RETURNING *
  `;

  return registro;
}

/**
 * Retorna o saldo líquido de ouro de um operador para uma ordem.
 * Saldo = SUM(entrada) - SUM(saída) de insumos Metal/Ouro (categoria_id=1)
 * naquele depósito para aquela ordem.
 *
 * Usar saldo líquido evita dupla-contagem quando o operador recebe metal
 * da mesma ordem mais de uma vez (ex: transferência adicional de aditivo).
 */
export async function buscarOuroRecebido(
  ordem_id: number,
  deposito_id: number,
): Promise<number> {
  const [row] = await sql`
    SELECT COALESCE(SUM(me.entrada) - SUM(me.saida), 0)::float8 AS total
    FROM alissonerp.movimentacoes_estoque me
    JOIN alissonerp.insumos i ON i.id = me.insumo_id
    WHERE me.ordem_id    = ${ordem_id}
      AND me.deposito_id = ${deposito_id}
      AND i.categoria_id = 1
  `;
  return row ? Number(row.total) : 0;
}
