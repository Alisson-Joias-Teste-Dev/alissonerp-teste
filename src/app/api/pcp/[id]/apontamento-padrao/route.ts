/**
 * GET /api/pcp/[id]/apontamento-padrao
 *
 * Retorna o "apontamento padrão" do produto vinculado à OF:
 *   peso_ouro_esperado = peso_precificado − Σ(qtd_pedras_BOM × peso_pedra)
 *
 * Usado no SaidaOrdemModal para alertar quando o peso real apontado
 * desvia significativamente do esperado (banner de diferença).
 *
 * Retorna 200 com { padrao: null } se a OF não tem produto vinculado
 * (ex: OF de aliança/serviço sem catálogo) — o consumidor não mostra o banner.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import sql from "@/lib/db";

function parsePcpId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const pcpId = parsePcpId(id);
  if (!pcpId) return NextResponse.json({ error: "id inválido" }, { status: 400 });

  try {
    // 1. Achar o produto vinculado à ordem da PCP.
    //    Precedência: ordens.produto_reposicao_id (auto-OF) → itens_ordem.produto_id (OF normal)
    const [linha] = await sql`
      SELECT
        COALESCE(o.produto_reposicao_id, io.produto_id) AS produto_id,
        p.id_produto, p.sku, p.nome,
        p.peso_precificado
      FROM alissonerp.pcp pcp
      JOIN alissonerp.ordens o ON o.id = pcp.ordem_id
      LEFT JOIN LATERAL (
        SELECT produto_id
        FROM alissonerp.itens_ordem
        WHERE ordem_id = o.id AND produto_id IS NOT NULL
        ORDER BY id ASC LIMIT 1
      ) io ON true
      LEFT JOIN alissonerp.produtos_compat p
        ON p.id_produto = COALESCE(o.produto_reposicao_id, io.produto_id)
      WHERE pcp.id = ${pcpId}
    `;

    if (!linha?.produto_id || linha.peso_precificado == null) {
      return NextResponse.json({ padrao: null });
    }

    const pesoTotal = Number(linha.peso_precificado);

    // 2. Soma do peso das pedras do BOM (tipo='pedra')
    //    produto_composicao tem { insumo_id, tipo, quantidade, tamanho }.
    //    insumo.peso_pedra é o peso UNITÁRIO em gramas (já convertido de ct via trigger).
    //    peso_total_pedras = Σ(quantidade × peso_pedra_unitario)
    const pedrasRows = await sql`
      SELECT
        c.insumo_id,
        c.quantidade,
        i.nome AS insumo_nome,
        COALESCE(i.peso_pedra, 0) AS peso_pedra
      FROM alissonerp.produto_composicao c
      JOIN alissonerp.insumos i ON i.id = c.insumo_id
      WHERE c.produto_id = ${linha.produto_id} AND c.tipo = 'pedra'
    `;

    const pesoPedras = pedrasRows.reduce((acc, r) => {
      const qtd = Number(r.quantidade ?? 0);
      const pesoPed = Number(r.peso_pedra ?? 0);
      return acc + qtd * pesoPed;
    }, 0);

    const pesoOuroEsperado = Math.max(0, pesoTotal - pesoPedras);

    return NextResponse.json({
      padrao: {
        produto_id: Number(linha.produto_id),
        sku: linha.sku ?? null,
        nome: linha.nome ?? null,
        peso_total: Math.round(pesoTotal * 1000) / 1000,
        peso_pedras: Math.round(pesoPedras * 1000) / 1000,
        peso_ouro_esperado: Math.round(pesoOuroEsperado * 1000) / 1000,
        pedras: pedrasRows.map((r) => ({
          insumo_id: Number(r.insumo_id),
          insumo_nome: String(r.insumo_nome ?? ""),
          quantidade: Number(r.quantidade ?? 0),
          peso_pedra: Number(r.peso_pedra ?? 0),
        })),
      },
    });
  } catch (err) {
    console.error("[GET apontamento-padrao]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
