import sql from '../../../../lib/db';
import type { Tool } from '../registry';

export const buscarProcessoProduto: Tool = {
  name: 'buscar_processo_produto',
  description: 'Busca o processo de fabricação de um produto (etapas, tempos, observações)',
  parameters: {
    type: 'object',
    properties: {
      produto_id: {
        type: 'number',
        description: 'ID do produto',
      },
      sku: {
        type: 'string',
        description: 'SKU do produto',
      },
    },
  },
  isEscrita: false,
  confirmLevel: 0,

  async execute(args: Record<string, unknown>): Promise<unknown> {
    const produtoId = args.produto_id as number | undefined;
    const sku = args.sku as string | undefined;

    if (!produtoId && !sku) {
      // Try to find by nome
      throw new Error('Informe produto_id ou sku');
    }

    let pid: number | undefined = produtoId;

    if (sku && !pid) {
      const prod = await sql`
        SELECT id_produto FROM public.produtos WHERE sku = ${sku!} LIMIT 1
      `;
      if (prod.length === 0) return { erro: `Produto SKU "${sku}" não encontrado` };
      pid = prod[0].id_produto as number;
    }

    const processo = await sql`
      SELECT pp.id, pp.observacao_geral, pp.origem, pp.ativo,
             pp.versao, pp.criado_em
      FROM alissonerp.produto_processo pp
      WHERE pp.produto_id = ${pid!} AND pp.ativo = true
      LIMIT 1
    `;

    if (processo.length === 0) {
      return { mensagem: 'Este produto ainda não possui processo de fabricação cadastrado' };
    }

    const etapas = await sql`
      SELECT ordem, nome, descricao, tempo_padrao_min, responsavel_role, observacao
      FROM alissonerp.produto_processo_etapa
      WHERE processo_id = ${processo[0].id}
      ORDER BY ordem
    `;

    return {
      observacao_geral: processo[0].observacao_geral,
      versao: processo[0].versao,
      criado_em: processo[0].criado_em,
      etapas: etapas.map((e) => ({
        ordem: e.ordem,
        nome: e.nome,
        descricao: e.descricao,
        tempo_padrao_min: e.tempo_padrao_min,
        responsavel: e.responsavel_role,
      })),
    };
  },
};
