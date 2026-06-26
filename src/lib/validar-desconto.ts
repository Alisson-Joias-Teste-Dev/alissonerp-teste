/**
 * Valida se descontos aplicados em itens respeitam o max_desconto_pct
 * de cada produto. Bloqueia vendedor comum; isFullAccess (admin,
 * desenvolvedor, diretor) passa livre.
 */

import sql from "@/lib/db";
import { isFullAccess } from "@/lib/roles";

export interface ItemDesconto {
  produto_id: number;
  pct_desconto: number;
  // Campos opcionais so para mensagem de erro mais clara
  sku?: string;
  nome?: string;
}

export interface ValidacaoResultado {
  ok: boolean;
  erros: string[];
  violacoes: Array<{
    produto_id: number;
    pct_desconto: number;
    max_permitido: number;
    sku?: string;
    nome?: string;
  }>;
}

/**
 * Se a role tem full access, retorna ok=true sem consultar o DB.
 * Caso contrario, busca o max_desconto_pct de cada produto e compara.
 * Produtos com max_desconto_pct NULL nao tem limite (pulam validacao).
 */
export async function validarDescontos(
  items: ItemDesconto[],
  userRole: string | null | undefined,
): Promise<ValidacaoResultado> {
  if (isFullAccess(userRole)) {
    return { ok: true, erros: [], violacoes: [] };
  }

  const itensComDesconto = items.filter((i) => i.pct_desconto > 0);
  if (itensComDesconto.length === 0) {
    return { ok: true, erros: [], violacoes: [] };
  }

  const produtoIds = Array.from(new Set(itensComDesconto.map((i) => i.produto_id)));
  if (produtoIds.length === 0) {
    return { ok: true, erros: [], violacoes: [] };
  }

  const rows = (await sql`
    SELECT produto_id, max_desconto_pct
    FROM alissonerp.produto_curva_aplicada
    WHERE produto_id = ANY(${produtoIds as number[]}::bigint[])
  `) as unknown as Array<{ produto_id: number | string; max_desconto_pct: string | null }>;

  const limMap = new Map<number, number | null>();
  for (const r of rows) {
    const id = Number(r.produto_id);
    limMap.set(id, r.max_desconto_pct == null ? null : Number(r.max_desconto_pct));
  }

  const erros: string[] = [];
  const violacoes: ValidacaoResultado["violacoes"] = [];

  for (const it of itensComDesconto) {
    const max = limMap.get(it.produto_id);
    if (max == null) continue; // produto sem limite configurado: permite
    if (it.pct_desconto > max + 0.001) {
      const identif = it.sku ? `SKU ${it.sku}` : it.nome ? `"${it.nome}"` : `produto #${it.produto_id}`;
      erros.push(
        `Desconto de ${it.pct_desconto.toFixed(1)}% acima do permitido para ${identif} (max ${max.toFixed(1)}%)`,
      );
      violacoes.push({
        produto_id: it.produto_id,
        pct_desconto: it.pct_desconto,
        max_permitido: max,
        sku: it.sku,
        nome: it.nome,
      });
    }
  }

  return { ok: erros.length === 0, erros, violacoes };
}
