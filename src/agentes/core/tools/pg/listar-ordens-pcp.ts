import sql from '../../../../lib/db';
import type { Tool } from '../registry';

export const listarOrdensPcp: Tool = {
  name: 'listar_ordens_pcp',
  description: 'Lista ordens do PCP (produção) com etapa, cliente, peso e dados de fabricação. Filtra por padrão ordens ativas (não concluídas)',
  parameters: {
    type: 'object',
    properties: {
      etapa: {
        type: 'string',
        enum: ['novas_ordens', 'em_andamento', 'aguardando', 'cancelado', 'concluido'],
        description: 'Filtrar por etapa (novas_ordens, em_andamento, aguardando, cancelado, concluido)',
      },
      deposito_id: {
        type: 'number',
        description: 'Filtrar por depósito (padrão 1)',
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
    const filtroEtapa = args.etapa as string | undefined;
    const depositoId = (args.deposito_id as number) ?? 1;

    const rows = await sql`
      SELECT
        v.id, v.ordem_id, v.etapas_cod, v.etapas,
        v.numero_ordem, v.cliente_nome, v.vendedor_nome,
        v.setor_nome, v.total_metal, v.peso_final,
        v.data_conclusao, v.created_at, v.deposito_id,
        v.bloqueado, v.data_entrega
      FROM alissonerp.vw_pcp_erp v
      WHERE v.deposito_id = ${depositoId}
        AND NOT EXISTS (
          SELECT 1 FROM alissonerp.servicos s
          WHERE s.pcp_id = v.id
            AND s.status IN ('em_servico', 'aguardando', 'concluido')
        )
        AND NOT EXISTS (
          SELECT 1 FROM alissonerp.transferencias_ordem t
          WHERE t.pcp_id = v.id
            AND t.tipo_transferencia = 'service'
        )
        ${filtroEtapa ? sql`AND v.etapas_cod = ${filtroEtapa}` : sql`AND v.etapas_cod <> 'concluido'`}
      ORDER BY v.id DESC
      LIMIT ${limite}
    `;

    return rows.map((r) => ({
      id: r.id,
      ordem: r.numero_ordem,
      etapa: r.etapas_cod,
      etapa_nome: r.etapas,
      cliente: r.cliente_nome,
      vendedor: r.vendedor_nome,
      setor: r.setor_nome,
      peso_metal: r.total_metal,
      peso_final: r.peso_final,
      data_entrega: r.data_entrega,
      bloqueado: r.bloqueado,
    }));
  },
};
