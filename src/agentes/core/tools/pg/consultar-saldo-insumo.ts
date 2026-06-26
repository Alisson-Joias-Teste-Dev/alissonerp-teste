import sql from '../../../../lib/db';
import type { Tool } from '../registry';

export const consultarSaldoInsumo: Tool = {
  name: 'consultar_saldo_insumo',
  description: 'Consulta saldo de qualquer insumo (ouro, prata, pedras, etc) em todos os depósitos',
  parameters: {
    type: 'object',
    properties: {
      nome: {
        type: 'string',
        description: 'Nome ou parte do nome do insumo (ex: ouro, prata, zirconia)',
      },
    },
  },
  isEscrita: false,
  confirmLevel: 0,

  async execute(args: Record<string, unknown>): Promise<unknown> {
    const nome = (args.nome as string) ?? '';

    if (!nome) throw new Error('Informe o nome do insumo');

    const rows = await sql`
      SELECT vw.deposito_id, vw.insumo_id, i.nome, vw.saldo,
             vw.ultima_movimentacao
      FROM alissonerp.vw_saldo_estoque vw
      JOIN alissonerp.insumos i ON i.id = vw.insumo_id
      WHERE i.nome ILIKE ${'%' + nome + '%'}
      ORDER BY vw.saldo DESC
    `;

    if (rows.length === 0) return { mensagem: `Nenhum insumo encontrado com "${nome}"` };

    return rows.map((r) => ({
      insumo: r.nome,
      deposito_id: r.deposito_id,
      saldo: r.saldo,
      ultima_movimentacao: r.ultima_movimentacao,
    }));
  },
};
