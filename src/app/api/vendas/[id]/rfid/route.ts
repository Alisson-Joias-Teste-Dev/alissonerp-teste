import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

// GET /api/vendas/[id]/rfid
// Retorna: RFIDs vinculados à venda + RFIDs disponíveis por produto da venda
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const vendaId = Number(id);
  if (isNaN(vendaId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  // RFIDs já vinculados a esta venda
  const vinculados = await sql`
    SELECT j.id, j.epc, j.sku, j.nome, j.status, j.produto_id
    FROM alissonerp.joias_rfid j
    WHERE j.venda_id = ${vendaId}
    ORDER BY j.epc
  `;

  // Itens da venda
  const itens = await sql`
    SELECT iv.produto_id, p.nome, p.sku, iv.quantidade
    FROM alissonerp.itens_venda_erp iv
    LEFT JOIN public.produtos p ON p.id_produto = iv.produto_id
    WHERE iv.venda_id = ${vendaId}
  `;

  // RFIDs disponíveis para cada produto da venda
  const produtoIds = [...new Set(itens.map(i => i.produto_id).filter(Boolean))];
  let disponiveis: Record<number, Array<{ id: string; epc: string; sku: string; nome: string }>> = {};

  if (produtoIds.length > 0) {
    const rfids = await sql`
      SELECT j.id, j.epc, j.sku, j.nome, j.produto_id
      FROM alissonerp.joias_rfid j
      WHERE j.produto_id = ANY(${produtoIds}::bigint[])
        AND j.status = 'ativo'
        AND j.venda_id IS NULL
      ORDER BY j.epc
    `;
    for (const r of rfids) {
      const pid = Number(r.produto_id);
      if (!disponiveis[pid]) disponiveis[pid] = [];
      disponiveis[pid].push({ id: r.id, epc: r.epc, sku: r.sku, nome: r.nome });
    }
  }

  return NextResponse.json({ vinculados, itens, disponiveis });
}

// POST /api/vendas/[id]/rfid
// Body: { rfid_ids: string[] } — UUIDs dos RFIDs a vincular
// Marca os RFIDs como reservados e vincula à venda
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const vendaId = Number(id);
  if (isNaN(vendaId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const body = await req.json() as { rfid_ids: string[] };
  if (!Array.isArray(body.rfid_ids) || body.rfid_ids.length === 0) {
    return NextResponse.json({ error: "rfid_ids obrigatório (array de UUIDs)" }, { status: 400 });
  }

  // Verifica se venda existe
  const [venda] = await sql`SELECT id FROM alissonerp.vendas_erp WHERE id = ${vendaId}`;
  if (!venda) return NextResponse.json({ error: "Venda não encontrada" }, { status: 404 });

  // Vincula RFIDs à venda e marca como reservados
  const rfids = await sql`
    UPDATE alissonerp.joias_rfid
    SET venda_id = ${vendaId}, status = 'reservado', reservado_em = now()
    WHERE id = ANY(${body.rfid_ids}::uuid[])
      AND status = 'ativo'
      AND venda_id IS NULL
    RETURNING id, epc, produto_id
  `;

  if (rfids.length === 0) {
    return NextResponse.json({ error: "Nenhum RFID disponível encontrado" }, { status: 409 });
  }

  return NextResponse.json({ vinculados: rfids.length, rfids }, { status: 200 });
}
