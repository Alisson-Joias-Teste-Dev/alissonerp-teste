import sql from '../../../../lib/db';
import type { Tool } from '../registry';

export const consultarSaldoOuro: Tool = {
  name: 'consultar_saldo_ouro',
  description: 'Consulta o saldo de ouro disponível no depósito da fábrica (deposito_id=1)',
  parameters: {
    type: 'object',
    properties: {
      deposito_id: {
        type: 'number',
        description: 'ID do depósito (padrão 1 = fábrica)',
      },
    },
  },
  isEscrita: false,
  confirmLevel: 0,

  async execute(args: Record<string, unknown>): Promise<unknown> {
    const depositoId = (args.deposito_id as number) ?? 1;

    const rows = await sql`
      SELECT vw.deposito_id, vw.insumo_id, i.nome, vw.saldo
      FROM alissonerp.vw_saldo_estoque vw
      JOIN alissonerp.insumos i ON i.id = vw.insumo_id
      WHERE vw.deposito_id = ${depositoId}
        AND i.nome ILIKE '%ouro%'
      ORDER BY vw.saldo DESC
    `;

    return rows.map((r) => ({
      insumo: r.nome,
      saldo: r.saldo,
      unidade: 'gramas',
    }));
  },
};
