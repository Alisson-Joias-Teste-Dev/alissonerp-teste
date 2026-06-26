/**
 * GET  /api/produtos/[id]/composicao — lista itens do BOM
 * POST /api/produtos/[id]/composicao — adiciona item ao BOM (ou atualiza se já existe)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authOr401 } from "@/lib/auth-server";
import { temAcessoModulo } from "@/lib/permissoes";
import sql from "@/lib/db";
import { recalcularPrecoPedras } from "@/lib/recalcular-preco-pedras";
import { zodError } from "@/lib/schemas/common";

const ComposicaoPostSchema = z.object({
  insumo_id: z.coerce.number().int().positive(),
  tipo: z.enum(["metal", "pedra", "outro"]),
  quantidade: z.coerce.number().positive(),
  tamanho: z.coerce.number().nullable().optional(),
  unidade_tamanho: z.string().optional(),
  preco_compra_usd: z.coerce.number().nullable().optional(),
  obrigatorio: z.boolean().optional(),
  observacao: z.string().nullable().optional(),
}).passthrough();

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const produtoId = Number(id);
  if (!produtoId) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!(await temAcessoModulo(user.role, "produtos", "ler"))) {
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

  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!(await temAcessoModulo(user.role, "produtos", "escrever"))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = ComposicaoPostSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { insumo_id, tipo, quantidade, tamanho, unidade_tamanho, preco_compra_usd, obrigatorio, observacao } = parsed.data;

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
