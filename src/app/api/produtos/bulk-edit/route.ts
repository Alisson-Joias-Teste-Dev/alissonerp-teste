/**
 * POST /api/produtos/bulk-edit
 *
 * Aplica a mesma alteração em N produtos de uma vez.
 * body: {
 *   ids: number[],               // obrigatório (1..500)
 *   updates: {                   // pelo menos um campo
 *     nome?: string,
 *     tipo_metal?: string | null,
 *     categoria?: string | null,           // categoria geral (ex "Anel", "Pulseira -> Feminino")
 *     situacao?: "A" | "I",
 *     tem_pedra_preciosa?: boolean,
 *     peso_precificado?: number | null,
 *     markup?: number | null,
 *     fator?: number | null,
 *     categoria_precificacao?: string | null,
 *     preco_tiny?: number | null,
 *   }
 * }
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authOr401 } from "@/lib/auth-server";
import { temAcessoModulo } from "@/lib/permissoes";
import sql from "@/lib/db";
import { recalcularPrecoPedras } from "@/lib/recalcular-preco-pedras";
import { zodError } from "@/lib/schemas/common";

const MAX_BATCH = 500;

const BulkEditPostSchema = z.object({
  ids: z.array(z.union([z.coerce.number(), z.string()])).min(1, "ids obrigatório").max(MAX_BATCH),
  updates: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

export async function POST(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!(await temAcessoModulo(user.role, "produtos", "escrever"))) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const raw = await req.json().catch(() => ({}));
  const parsed = BulkEditPostSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;
  const idsRaw = body.ids;
  const updates: Record<string, unknown> = body.updates ?? {};

  const ids = idsRaw.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0);
  if (ids.length === 0) return NextResponse.json({ error: "ids inválidos" }, { status: 400 });

  // Campos validados e mapeados
  const up: Record<string, unknown> = {};

  if (typeof updates.nome === "string" && updates.nome.trim()) {
    up.nome = updates.nome.trim();
  }
  if (updates.tipo_metal !== undefined) {
    const t = typeof updates.tipo_metal === "string" ? updates.tipo_metal.trim() : null;
    up.tipo_metal = t ? t : null;
  }
  if (updates.categoria !== undefined) {
    const c = typeof updates.categoria === "string" ? updates.categoria.trim() : null;
    up.categoria = c ? c : null;
  }
  if (typeof updates.situacao === "string" && (updates.situacao === "A" || updates.situacao === "I")) {
    up.situacao = updates.situacao;
  }

  // Guard inativação em lote: nenhum ID da lista pode ter estoque > 0.
  // Se houver, retorna 422 com a lista dos bloqueados (UX: usuário sabe
  // quais zerar). Mesma regra do PATCH single.
  if (up.situacao === "I") {
    const bloqueados = await sql<{ produto_id: number; sku: string | null; nome: string | null; saldo: number }[]>`
      SELECT v.produto_id, p.sku, p.nome, COALESCE(SUM(v.saldo_fisico),0)::int AS saldo
      FROM alissonerp.vw_saldo_estoque_comercial_v2 v
      JOIN public.produtos p ON p.id_produto = v.produto_id
      WHERE v.produto_id = ANY(${ids}::bigint[])
      GROUP BY v.produto_id, p.sku, p.nome
      HAVING SUM(v.saldo_fisico) > 0
    `;
    if (bloqueados.length > 0) {
      return NextResponse.json({
        error: `Não é possível inativar ${bloqueados.length} produto(s) — têm estoque. Zere o estoque antes.`,
        bloqueados: bloqueados.map((b) => ({
          produto_id: Number(b.produto_id), sku: b.sku, nome: b.nome, saldo: Number(b.saldo),
        })),
      }, { status: 422 });
    }
  }
  if (typeof updates.tem_pedra_preciosa === "boolean") {
    up.tem_pedra_preciosa = updates.tem_pedra_preciosa;
  }
  for (const f of ["peso_precificado", "markup", "fator", "preco_tiny"] as const) {
    if (updates[f] !== undefined) {
      const n = updates[f] == null ? null : Number(updates[f]);
      if (n != null && (isNaN(n) || n < 0)) {
        return NextResponse.json({ error: `${f} inválido` }, { status: 400 });
      }
      up[f] = n;
    }
  }
  if (updates.categoria_precificacao !== undefined) {
    const c = typeof updates.categoria_precificacao === "string" ? updates.categoria_precificacao.trim() : null;
    up.categoria_precificacao = c ? c : null;
  }

  // tipo_item: vai para alissonerp.produto_tipo_item (fora de public.produtos)
  let tipoItem: "joia" | "insumo" | null | undefined = undefined;
  if (updates.tipo_item !== undefined) {
    if (updates.tipo_item === null || updates.tipo_item === "") tipoItem = null;
    else if (updates.tipo_item === "joia" || updates.tipo_item === "insumo") tipoItem = updates.tipo_item;
    else return NextResponse.json({ error: "tipo_item inválido" }, { status: 400 });
  }

  if (Object.keys(up).length === 0 && tipoItem === undefined) {
    return NextResponse.json({ error: "Nenhum campo editável informado" }, { status: 400 });
  }

  try {
    // Monta SET dinâmico (cada coluna em um UPDATE para simplicidade e clareza de log)
    const afetados: number[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sql as any).begin(async (tx: any) => {
      if (up.nome !== undefined) {
        await tx`UPDATE alissonerp.erp_produtos SET nome = ${up.nome as string} WHERE produto_id = ANY(${ids})`;
      }
      if (up.tipo_metal !== undefined) {
        await tx`UPDATE alissonerp.erp_produtos SET tipo_metal = ${up.tipo_metal as string | null} WHERE produto_id = ANY(${ids})`;
      }
      if (up.categoria !== undefined) {
        await tx`UPDATE alissonerp.erp_produtos SET categoria = ${up.categoria as string | null} WHERE produto_id = ANY(${ids})`;
      }
      if (up.situacao !== undefined) {
        await tx`UPDATE alissonerp.erp_produtos SET situacao = ${up.situacao as string} WHERE produto_id = ANY(${ids})`;
      }
      if (up.tem_pedra_preciosa !== undefined) {
        await tx`UPDATE alissonerp.erp_produtos SET tem_pedra_preciosa = ${up.tem_pedra_preciosa as boolean} WHERE produto_id = ANY(${ids})`;
      }
      if (up.peso_precificado !== undefined) {
        await tx`UPDATE alissonerp.erp_produtos SET peso_precificado = ${up.peso_precificado as number | null} WHERE produto_id = ANY(${ids})`;
      }
      if (up.markup !== undefined) {
        await tx`UPDATE alissonerp.erp_produtos SET markup = ${up.markup as number | null} WHERE produto_id = ANY(${ids})`;
      }
      if (up.fator !== undefined) {
        await tx`UPDATE alissonerp.erp_produtos SET fator = ${up.fator as number | null} WHERE produto_id = ANY(${ids})`;
      }
      if (up.categoria_precificacao !== undefined) {
        await tx`UPDATE alissonerp.erp_produtos SET categoria_precificacao = ${up.categoria_precificacao as string | null} WHERE produto_id = ANY(${ids})`;
      }
      if (up.preco_tiny !== undefined) {
        await tx`UPDATE alissonerp.erp_produtos SET preco_tiny = ${up.preco_tiny as number | null} WHERE produto_id = ANY(${ids})`;
      }
      if (tipoItem !== undefined) {
        if (tipoItem === null) {
          await tx`DELETE FROM alissonerp.produto_tipo_item WHERE produto_id = ANY(${ids})`;
        } else {
          await tx`
            INSERT INTO alissonerp.produto_tipo_item (produto_id, tipo_item)
            SELECT unnest(${ids}::bigint[]), ${tipoItem}
            ON CONFLICT (produto_id) DO UPDATE SET tipo_item = EXCLUDED.tipo_item, updated_at = now()
          `;
        }
      }
      const rows: { id_produto: number }[] = await tx`
        SELECT id_produto FROM public.produtos WHERE produto_id = ANY(${ids})
      `;
      afetados.push(...rows.map((r: { id_produto: number }) => Number(r.id_produto)));
    });

    // Recalcular preço de pedras se alterou tem_pedra_preciosa (fora da transação)
    if (up.tem_pedra_preciosa !== undefined) {
      for (const id of afetados) {
        try { await recalcularPrecoPedras(id); } catch { /* não-crítico */ }
      }
    }

    const campos = Object.keys(up);
    if (tipoItem !== undefined) campos.push("tipo_item");
    return NextResponse.json({ atualizados: afetados.length, campos });
  } catch (err) {
    console.error("[POST /api/produtos/bulk-edit]", err);
    return NextResponse.json({ error: "Erro ao aplicar edição em massa" }, { status: 500 });
  }
}
