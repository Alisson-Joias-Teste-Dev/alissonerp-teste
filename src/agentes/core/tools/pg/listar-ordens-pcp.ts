import sql from '../../../../lib/db';
import type { Tool } from '../registry';

export const listarOrdensPcp: Tool = {
  name: 'listar_ordens_pcp',
  description: 'Lista ordens de produção com PCP, situação, status e cliente. Filtra por padrão ordens criadas/ativas',
  parameters: {
    type: 'object',
    properties: {
      situacao: {
        type: 'string',
        enum: ['criado', 'cancelado', 'rascunho'],
        description: 'Filtrar por situacao (criado, cancelado, rascunho). Padrão: criado',
      },
      status: {
        type: 'string',
        enum: ['aguardando', 'em_andamento', 'concluido', 'cancelado'],
        description: 'Filtrar por status (aguardando, em_andamento, concluido, cancelado)',
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
    const filtroSituacao = (args.situacao as string) ?? 'criado';
    const filtroStatus = args.status as string | undefined;

    const rows = await sql`
      SELECT
        vw.id, vw.numero_ordem, vw.situacao, vw.situacao_cod,
        vw.status, vw.status_cod, vw.rota, vw.cliente_nome,
        vw.peso_metal_negociado, vw.data_entrega,
        vw.pcp_id, vw.pcp_etapas, vw.pcp_bloqueado,
        vw.pcp_peso_final, vw.pcp_metal_externo
      FROM alissonerp.vw_ordem_detalhe vw
      WHERE LOWER(vw.situacao) = LOWER(${filtroSituacao})
        ${filtroStatus ? sql`AND LOWER(vw.status) = LOWER(${filtroStatus})` : sql``}
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
