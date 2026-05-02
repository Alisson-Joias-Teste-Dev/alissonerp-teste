import sql from '../../../../lib/db';
import type { Tool } from '../registry';

export const sugerirApontamento: Tool = {
  name: 'sugerir_apontamento',
  description: 'Registra uma sugestão de apontamento para ser revisada e executada depois',
  parameters: {
    type: 'object',
    properties: {
      ordem_id: {
        type: 'number',
        description: 'ID da ordem de produção',
      },
      descricao: {
        type: 'string',
        description: 'Descrição do apontamento sugerido (ex: adicionar 5g de ouro)',
      },
      justificativa: {
        type: 'string',
        description: 'Por que esse apontamento é necessário',
      },
    },
  },
  isEscrita: false,
  confirmLevel: 0,

  async execute(args: Record<string, unknown>): Promise<unknown> {
    const ordemId = args.ordem_id as number;

    await sql`
      INSERT INTO agentes.detecoes_sistema
        (skill_id, tipo, titulo, descricao, evidencia)
      VALUES
        (1, 'sugestao', 'Apontamento sugerido - OP #' || ${ordemId},
         ${(args.descricao as string) ?? ''},
         ${JSON.stringify({ ordem_id: ordemId, justificativa: args.justificativa })})
    `;

    return {
      mensagem: `Sugestão de apontamento registrada para a ordem #${ordemId}. Você ainda precisa registrar no ERP manualmente. Quando a Fase 6 estiver liberada, poderei fazer isso por você.`,
    };
  },
};
