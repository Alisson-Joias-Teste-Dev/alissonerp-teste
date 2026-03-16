/**
 * GET  /api/produtos/[id]/composicao — lista itens do BOM
 * POST /api/produtos/[id]/composicao — adiciona item ao BOM (ou atualiza se já existe)
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isProdutosAccess } from "@/lib/roles";
import sql from "@/lib/db";
import { recalcularPrecoPedras } from "@/lib/recalcular-preco-pedras";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const produtoId = Number(id);
  if (!produtoId) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const role = user.user_metadata?.role as string | undefined;
  if (!isProdutosAccess(role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  try {
    const composicao = await sql`
      SELECT
        pc.id,
        pc.insumo_id,
        i.nome       AS insumo_nome,
        i.unidade    AS insumo_unidade,
        ci.nome      AS categoria_nome,
        pc.tipo,
        pc.quantidade,
        pc.tamanho,
        pc.unidade_tamanho,
        pc.preco_compra_usd,
        pc.obrigatorio,
        pc.observacao,
        pc.created_at,
        pc.updated_at
      FROM alissonerp.produto_composicao pc
      LEFT JOIN alissonerp.insumos i ON i.id = pc.insumo_id
      LEFT JOIN alissonerp.categorias_insumo ci ON ci.id = i.categoria_id
      WHERE pc.produto_id = ${produtoId}
      ORDER BY pc.tipo, pc.id
    `;
    return NextResponse.json({ composicao });
  } catch (err) {
    console.error("[GET /api/produtos/[id]/composicao]", err);
    return NextResponse.json({ error: "Erro ao buscar composição" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const produtoId = Number(id);
  if (!produtoId) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const role = user.user_metadata?.role as string | undefined;
  if (!isProdutosAccess(role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const body = await req.json();
  const { insumo_id, tipo, quantidade, tamanho, unidade_tamanho, preco_compra_usd, obrigatorio, observacao } = body;

  if (!insumo_id || !tipo || !quantidade) {
    return NextResponse.json({ error: "insumo_id, tipo e quantidade são obrigatórios" }, { status: 400 });
  }
  if (!["metal", "pedra", "outro"].includes(tipo)) {
    return NextResponse.json({ error: "tipo deve ser 'metal', 'pedra' ou 'outro'" }, { status: 400 });
  }
  if (Number(quantidade) <= 0) {
    return NextResponse.json({ error: "quantidade deve ser maior que zero" }, { status: 400 });
  }
  if (tipo === "pedra" && !preco_compra_usd) {
    return NextResponse.json({ error: "preco_compra_usd é obrigatório para pedras" }, { status: 400 });
  }

  try {
    // Upsert — ON CONFLICT (produto_id, insumo_id) → update
    const [item] = await sql`
      INSERT INTO alissonerp.produto_composicao
        (produto_id, insumo_id, tipo, quantidade, tamanho, unidade_tamanho, preco_compra_usd, obrigatorio, observacao)
      VALUES
        (${produtoId}, ${Number(insumo_id)}, ${tipo}, ${Number(quantidade)},
         ${tamanho != null ? Number(tamanho) : null},
         ${unidade_tamanho ?? "ct"},
         ${preco_compra_usd != null ? Number(preco_compra_usd) : null},
         ${obrigatorio ?? true},
         ${observacao ?? null})
      ON CONFLICT (produto_id, insumo_id)
      DO UPDATE SET
        tipo              = EXCLUDED.tipo,
        quantidade        = EXCLUDED.quantidade,
        tamanho           = EXCLUDED.tamanho,
        unidade_tamanho   = EXCLUDED.unidade_tamanho,
        preco_compra_usd  = EXCLUDED.preco_compra_usd,
        obrigatorio       = EXCLUDED.obrigatorio,
        observacao        = EXCLUDED.observacao,
        updated_at        = NOW()
      RETURNING *
    `;

    // Recalculate stone total
    const totalPedras = await recalcularPrecoPedras(produtoId);

    return NextResponse.json({ item, totalPedras }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/produtos/[id]/composicao]", err);
    return NextResponse.json({ error: "Erro ao salvar item do BOM" }, { status: 500 });
  }
}
