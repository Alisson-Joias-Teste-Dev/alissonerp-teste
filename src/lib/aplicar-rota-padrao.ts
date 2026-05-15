import "server-only";
import sqlDefault from "@/lib/db";

/**
 * Lista de valores de `public.produtos.fornecedor_etl` que indicam
 * fabricação Alisson. Produtos cujo fornecedor_etl está aqui ganham
 * rota automática quando há template default cadastrado pra categoria.
 */
export const FORNECEDORES_ALISSON = [
  "Fabricação Própria",
  "ARAS Indústria (Fábrica Alisson)",
] as const;

export interface AplicarRotaResultado {
  applied: boolean;
  template_id?: number;
  template_nome?: string;
  etapas_inseridas?: number;
  motivo?:
    | "produto_nao_encontrado"
    | "fornecedor_nao_alisson"
    | "sem_categoria"
    | "sem_template_default"
    | "rota_existente";
}

/**
 * Aplica a rota padrão de fabricação a um produto, se aplicável.
 *
 * Regras:
 *   1. Produto deve ter `fornecedor_etl ∈ FORNECEDORES_ALISSON` (fabricação própria).
 *   2. Produto deve ter `categoria` preenchida.
 *   3. Deve existir template `is_default=true, ativo=true` pra essa categoria
 *      (match exato de string em `alissonerp.rotas_template.categoria`).
 *   4. Por default, se já há etapas em `produto_rota` pra esse produto,
 *      NÃO sobrescreve (preserva edições manuais — D do briefing). Use
 *      `sobrescrever: true` pra forçar (botão "Aplicar template" ou mudança
 *      explícita de categoria com confirmação do usuário).
 *
 * A cópia é INDEPENDENTE: as etapas são duplicadas em `produto_rota` e
 * edições futuras no template NÃO propagam.
 *
 * SERVER-ONLY.
 */
export async function aplicarRotaPadrao(
  produtoId: number,
  opts: {
    sobrescrever?: boolean;
    /** Permite passar template específico em vez do default da categoria. */
    templateId?: number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tx?: any;
  } = {},
): Promise<AplicarRotaResultado> {
  const db = opts.tx ?? sqlDefault;
  const sobrescrever = opts.sobrescrever ?? false;

  const [produto] = await db`
    SELECT id_produto, categoria, fornecedor_etl
    FROM public.produtos
    WHERE id_produto = ${produtoId}
  `;
  if (!produto) return { applied: false, motivo: "produto_nao_encontrado" };

  // Se template específico não foi passado, exigir Alisson + categoria
  if (opts.templateId == null) {
    const fornecedor = String(produto.fornecedor_etl ?? "");
    if (!FORNECEDORES_ALISSON.some((v) => v === fornecedor)) {
      return { applied: false, motivo: "fornecedor_nao_alisson" };
    }
    if (!produto.categoria) {
      return { applied: false, motivo: "sem_categoria" };
    }
  }

  // Buscar template — específico ou default da categoria
  const [template] = opts.templateId != null
    ? await db`
        SELECT id, nome FROM alissonerp.rotas_template
        WHERE id = ${opts.templateId} AND ativo = true
      `
    : await db`
        SELECT id, nome FROM alissonerp.rotas_template
        WHERE categoria = ${String(produto.categoria)}
          AND is_default = true
          AND ativo = true
        LIMIT 1
      `;
  if (!template) return { applied: false, motivo: "sem_template_default" };

  // Verificar se já há rota cadastrada
  const [{ total }] = await db`
    SELECT COUNT(*)::int AS total
    FROM alissonerp.produto_rota
    WHERE produto_id = ${produtoId}
  `;
  const jaTemRota = Number(total) > 0;

  if (jaTemRota && !sobrescrever) {
    return { applied: false, motivo: "rota_existente", template_id: Number(template.id), template_nome: String(template.nome) };
  }

  // Etapas do template
  const etapas = await db`
    SELECT ordem, setor_id
    FROM alissonerp.rotas_template_etapas
    WHERE template_id = ${Number(template.id)}
    ORDER BY ordem ASC
  `;
  if (etapas.length === 0) {
    return { applied: false, motivo: "sem_template_default", template_id: Number(template.id), template_nome: String(template.nome) };
  }

  // Sobrescrever: limpa etapas atuais
  if (jaTemRota) {
    await db`DELETE FROM alissonerp.produto_rota WHERE produto_id = ${produtoId}`;
  }

  // Copia etapas do template — independente do template a partir daqui
  for (const e of etapas) {
    await db`
      INSERT INTO alissonerp.produto_rota (produto_id, ordem, setor_id)
      VALUES (${produtoId}, ${Number(e.ordem)}, ${Number(e.setor_id)})
    `;
  }

  return {
    applied: true,
    template_id: Number(template.id),
    template_nome: String(template.nome),
    etapas_inseridas: etapas.length,
  };
}
