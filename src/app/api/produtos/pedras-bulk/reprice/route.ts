/**
 * POST /api/produtos/pedras-bulk/reprice
 *
 * Reaplica preços nos produtos-pedra existentes com base nos markups atuais
 * (recebe o array de itens calculados no cliente, igual ao /pedras-bulk POST).
 *
 * Para cada item: encontra o produto pelo nome "<label> <mm>mm" e categoria
 * Pedras, atualiza preco_tiny.
 *
 * Body:
 * {
 *   itens: Array<{ tipo: string; label: string; mm: number; ct: number; preco_venda: number; }>
 * }
 *
 * Resposta:
 * { ok, atualizados, nao_encontrados: Array<{ nome }>, mudancas: Array<{ sku, nome, antes, depois }> }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authOr401 } from "@/lib/auth-server";
import { temAcessoModulo } from "@/lib/permissoes";
import sql from "@/lib/db";
import { internalError } from "@/lib/api-error";
import { zodError } from "@/lib/schemas/common";

interface PedraItem {
  tipo: string;
  label: string;
  mm: number;
  ct: number;
  preco_venda: number;
}

const MAX_BATCH = 500;

const RepricePostSchema = z.object({
  itens: z.array(z.object({}).passthrough()).min(1, "itens obrigatório").max(MAX_BATCH),
}).passthrough();

export async function POST(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!(await temAcessoModulo(user.role, "produtos", "escrever"))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = RepricePostSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;
  const itensRaw: unknown = body.itens;

  const itens: PedraItem[] = [];
  for (const raw of itensRaw as Record<string, unknown>[]) {
    const tipo  = String(raw?.tipo  ?? "").trim();
    const label = String(raw?.label ?? "").trim();
    const mm    = Number(raw?.mm);
    const ct    = Number(raw?.ct);
    const preco_venda = Number(raw?.preco_venda);
    if (!tipo || !label) continue;
    if (!Number.isFinite(mm) || mm <= 0) continue;
    if (!Number.isFinite(ct) || ct <= 0) continue;
    if (!Number.isFinite(preco_venda) || preco_venda <= 0) continue;
    itens.push({ tipo, label, mm, ct, preco_venda });
  }
  if (itens.length === 0) {
    return NextResponse.json({ error: "Nenhum item válido" }, { status: 400 });
  }

  try {
    const mudancas: Array<{ sku: string; nome: string; antes: number; depois: number }> = [];
    const naoEncontrados: Array<{ nome: string }> = [];

    for (const it of itens) {
      const mmFmt = Number.isInteger(it.mm) ? it.mm.toFixed(1) : String(it.mm);
      const nome = `${it.label} ${mmFmt}mm`;
      const novoPreco = Math.round(Number(it.preco_venda));

      const [prod] = await sql<{ id_produto: string; sku: string; preco_tiny: string | null }[]>`
        -- Categoria/situacao/preco da verdade (erp_produtos); o NOME segue vindo da
        -- copia (decisao do Jonathan, 21/08/2026), por isso o match e por p.nome.
        SELECT p.id_produto,
               COALESCE(e.sku, p.sku) AS sku,
               COALESCE(e.preco_tiny, p.preco_tiny) AS preco_tiny
        FROM public.produtos p
        LEFT JOIN alissonerp.erp_produtos e ON e.produto_id = p.id_produto
        WHERE LOWER(TRIM(p.nome)) = LOWER(${nome})
          AND COALESCE(e.categoria, p.categoria) ILIKE 'Pedras%'
          AND p.situacao = 'A'
        LIMIT 1
      `;
      if (!prod) {
        naoEncontrados.push({ nome });
        continue;
      }

      const antes = Number(prod.preco_tiny ?? 0);
      if (Math.abs(antes - novoPreco) < 0.5) continue; // sem mudança

      await sql`UPDATE alissonerp.erp_produtos SET preco_tiny = ${novoPreco} WHERE produto_id = ${prod.id_produto}`;
      // Atualiza tb peso_ct (caso ct tenha mudado)
      await sql`
        INSERT INTO alissonerp.produto_pedra_extras (produto_id, peso_ct)
        VALUES (${prod.id_produto}, ${Number(it.ct.toFixed(4))})
        ON CONFLICT (produto_id) DO UPDATE SET peso_ct = EXCLUDED.peso_ct, updated_at = NOW()
      `;

      mudancas.push({ sku: prod.sku, nome, antes, depois: novoPreco });
    }

    return NextResponse.json({
      ok: true,
      atualizados: mudancas.length,
      nao_encontrados: naoEncontrados,
      mudancas,
    });
  } catch (err) {
    return internalError("[POST /api/produtos/pedras-bulk/reprice]", err, "Erro ao atualizar preços");
  }
}
