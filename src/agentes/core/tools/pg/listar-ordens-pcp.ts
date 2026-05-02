import sql from '../../../../lib/db';
import type { Tool } from '../registry';

export const listarOrdensPcp: Tool = {
  name: 'listar_ordens_pcp',
  description: 'Lista ordens de produção em aberto com informações de PCP, situação, status e cliente',
  parameters: {
    type: 'object',
    properties: {
      situacao: {
        type: 'string',
        enum: ['aberto', 'em_andamento', 'finalizado'],
        description: 'Filtrar por situação da ordem (opcional)',
      },
      limite: {
        type: 'number',
        description: 'Máximo de resultados (padrão 10)',
      },
    },
  },
  isEscrita: false,
  confirmLevel: 0,

  async execute(args: Record<string, unknown>): Promise<unknown> {
    const limite = Math.min((args.limite as number) ?? 10, 50);

    const rows = await sql`
      SELECT
        vw.id, vw.numero_ordem, vw.situacao, vw.situacao_cod,
        vw.status, vw.status_cod, vw.rota, vw.cliente_nome,
        vw.peso_metal_negociado, vw.data_entrega,
        vw.pcp_id, vw.pcp_etapas, vw.pcp_bloqueado,
        vw.pcp_peso_final, vw.pcp_metal_externo
      FROM alissonerp.vw_ordem_detalhe vw
      WHERE vw.situacao_cod IN ('1','2')
      ORDER BY vw.data_entrega ASC NULLS LAST
      LIMIT ${limite}
    `;

    return rows.map((r) => ({
      id: r.id,
      ordem: r.numero_ordem,
      situacao: r.situacao,
      status: r.status,
      rota: r.rota,
      cliente: r.cliente_nome,
      peso_metal: r.peso_metal_negociado,
      data_entrega: r.data_entrega,
      pcp_id: r.pcp_id,
      pcp_bloqueado: r.pcp_bloqueado,
    }));
  },
};
