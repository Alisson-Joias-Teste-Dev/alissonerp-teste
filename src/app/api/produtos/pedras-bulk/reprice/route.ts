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
import { authOr401 } from "@/lib/auth-server";
import { temAcessoModulo } from "@/lib/permissoes";
import sql from "@/lib/db";
import { internalError } from "@/lib/api-error";

interface PedraItem {
  tipo: string;
  label: string;
  mm: number;
  ct: number;
  preco_venda: number;
}

const MAX_BATCH = 500;

export async function POST(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!(await temAcessoModulo(user.role, "produtos", "escrever"))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const itensRaw: unknown = body?.itens;
  if (!Array.isArray(itensRaw) || itensRaw.length === 0) {
    return NextResponse.json({ error: "itens é obrigatório" }, { status: 400 });
  }
  if (itensRaw.length > MAX_BATCH) {
    return NextResponse.json({ error: `Máximo ${MAX_BATCH} itens` }, { status: 400 });
  }

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
        SELECT id_produto, sku, preco_tiny
        FROM public.produtos
        WHERE LOWER(TRIM(nome)) = LOWER(${nome})
          AND categoria ILIKE 'Pedras%'
          AND situacao = 'A'
        LIMIT 1
      `;
      if (!prod) {
        naoEncontrados.push({ nome });
        continue;
      }

      const antes = Number(prod.preco_tiny ?? 0);
      if (Math.abs(antes - novoPreco) < 0.5) continue; // sem mudança

      await sql`UPDATE public.produtos SET preco_tiny = ${novoPreco} WHERE id_produto = ${prod.id_produto}`;
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
