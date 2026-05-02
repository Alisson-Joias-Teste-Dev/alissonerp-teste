import sql from '../../../../lib/db';
import type { Tool } from '../registry';

export const listarOrdensPcp: Tool = {
  name: 'listar_ordens_pcp',
  description: 'Lista ordens em produção (PCP) com situação, status, operador e dados de fabricação',
  parameters: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['em_andamento', 'concluido', 'aguardando', 'cancelado'],
        description: 'Filtrar por status (padrão: em_andamento)',
      },
      somente_ativos: {
        type: 'boolean',
        description: 'Se true, mostra apenas PCPs sem data de conclusão (padrão: true)',
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
    const filtroStatus = args.status as string | undefined;
    const somenteAtivos = args.somente_ativos !== false;

    const rows = await sql`
      SELECT
        o.id, o.numero_ordem, o.situacao, o.status,
        o.cliente_id, o.peso_metal_negociado, o.data_entrega,
        p.id as pcp_id, p.bloqueado, p.operador,
        p.total_metal, p.retorno_metal, p.peso_final,
        p.quantidade, p.data_conclusao as pcp_data_conclusao,
        u.nome as operador_nome
      FROM alissonerp.pcp p
      JOIN alissonerp.ordens o ON o.id = p.ordem_id
      LEFT JOIN alissonerp.usuarios u ON u.id = p.operador
      WHERE (o.situacao = 'criado' OR o.situacao = 'cancelado')
        ${filtroStatus ? sql`AND LOWER(o.status) = LOWER(${filtroStatus})` : sql``}
        ${somenteAtivos ? sql`AND p.data_conclusao IS NULL` : sql``}
      ORDER BY o.data_entrega ASC NULLS LAST
      LIMIT ${limite}
    `;

    return rows.map((r) => ({
      id: r.id,
      ordem: r.numero_ordem,
      situacao: r.situacao,
      status: r.status,
      pcp_id: r.pcp_id,
      bloqueado: r.bloqueado,
      operador: r.operador_nome ?? 'Não atribuído',
      peso_metal: r.total_metal,
      peso_final: r.peso_final,
      quantidade: r.quantidade,
      data_entrega: r.data_entrega,
      concluido: r.pcp_data_conclusao !== null,
    }));
  },
};
