import sql from '../../../../lib/db';
import type { Tool } from '../registry';

export const detalharOrdem: Tool = {
  name: 'detalhar_ordem',
  description: 'Detalha uma ordem de produção específica com PCP, apontamentos e informações completas',
  parameters: {
    type: 'object',
    properties: {
      ordem_id: {
        type: 'number',
        description: 'ID numérico da ordem de produção',
      },
      numero_ordem: {
        type: 'string',
        description: 'Número da ordem (ex: OP-1234)',
      },
    },
  },
  isEscrita: false,
  confirmLevel: 0,

  async execute(args: Record<string, unknown>): Promise<unknown> {
    const id = args.ordem_id as number | undefined;
    const num = args.numero_ordem as string | undefined;

    if (!id && !num) {
      throw new Error('Informe ordem_id ou numero_ordem');
    }

    let ordem;
    if (id) {
      ordem = await sql`SELECT * FROM alissonerp.vw_ordem_detalhe WHERE id = ${id} LIMIT 1`;
    } else {
      ordem = await sql`SELECT * FROM alissonerp.vw_ordem_detalhe WHERE numero_ordem = ${num!} LIMIT 1`;
    }

    if (ordem.length === 0) return { erro: 'Ordem não encontrada' };

    const apontamentos = await sql`
      SELECT ap.id, ap.quantidade AS qtd, ap.created_at, ti.nome as tipo_apontamento,
             s.nome as setor, i.nome as insumo
      FROM alissonerp.apontamentos_pcp ap
      JOIN alissonerp.pcp p ON p.id = ap.pcp_id
      LEFT JOIN alissonerp.tipo_apontamento ti ON ti.id = ap.tipo_apontamento_id
      LEFT JOIN alissonerp.setor s ON s.id = ap.setor_id
      LEFT JOIN alissonerp.insumos i ON i.id = ap.insumo_id
      WHERE p.ordem_id = ${ordem[0].id}
      ORDER BY ap.created_at DESC
      LIMIT 20
    `;

    return { ordem: ordem[0], apontamentos };
  },
};
