import sql from '../../../../lib/db';
import type { Tool } from '../registry';

export const buscarProduto: Tool = {
  name: 'buscar_produto',
  description: 'Busca produtos cadastrados por nome, SKU ou referência',
  parameters: {
    type: 'object',
    properties: {
      termo: {
        type: 'string',
        description: 'Nome, SKU ou parte do produto',
      },
      limite: {
        type: 'number',
        description: 'Máximo de resultados (padrão 5)',
      },
    },
  },
  isEscrita: false,
  confirmLevel: 0,

  async execute(args: Record<string, unknown>): Promise<unknown> {
    const termo = (args.termo as string) ?? '';
    const limite = Math.min((args.limite as number) ?? 5, 20);

    if (!termo) throw new Error('Informe um termo de busca');

    const rows = await sql`
      SELECT id_produto, sku, nome, tipo_metal, preco_tiny,
             peso_real, prazo_producao, sob_encomenda
      FROM public.produtos
      WHERE nome ILIKE ${'%' + termo + '%'}
         OR sku ILIKE ${'%' + termo + '%'}
      ORDER BY nome
      LIMIT ${limite}
    `;

    if (rows.length === 0) return { mensagem: `Nenhum produto encontrado para "${termo}"` };

    return rows.map((r) => ({
      id: r.id_produto,
      sku: r.sku,
      nome: r.nome,
      metal: r.tipo_metal,
      preco: r.preco_tiny,
      peso: r.peso_real,
      prazo_producao: r.prazo_producao,
      sob_encomenda: r.sob_encomenda,
    }));
  },
};
