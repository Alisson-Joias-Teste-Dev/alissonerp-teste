import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

// POST /api/rfid/scan
// Body: { codigo: string, action: "vincular_venda" | "entrada_estoque", venda_id?: number, warehouse_id?: number }
// O codigo pode ser EPC completo, UUID parcial, ou SKU
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = await req.json() as {
    codigo: string;
    action?: string;
    venda_id?: number;
    warehouse_id?: number;
  };

  const { codigo, action } = body;
  if (!codigo || typeof codigo !== "string" || codigo.trim().length === 0) {
    return NextResponse.json({ error: "Código RFID obrigatório" }, { status: 400 });
  }

  const code = codigo.trim();

  // Busca o RFID pelo EPC (compatível com leitor de código de barras)
  let rfid = await sql`
    SELECT j.*, p.nome AS produto_nome, p.sku AS produto_sku
    FROM alissonerp.joias_rfid j
    LEFT JOIN public.produtos p ON p.id_produto = j.produto_id::bigint
    WHERE j.epc = ${code}
  `;

  // Se não achou por EPC exato, tenta LIKE (scanner pode ler parcial)
  if (rfid.length === 0) {
    rfid = await sql`
      SELECT j.*, p.nome AS produto_nome, p.sku AS produto_sku
      FROM alissonerp.joias_rfid j
      LEFT JOIN public.produtos p ON p.id_produto = j.produto_id::bigint
      WHERE j.epc LIKE ${'%' + code + '%'}
         OR j.id::text LIKE ${'%' + code + '%'}
      LIMIT 1
    `;
  }

  // Se não achou no RFID, tenta encontrar por SKU de produto
  let produtoEncontrado: { id_produto: number; nome: string; sku: string } | null = null;
  if (rfid.length === 0) {
    const prods = await sql`
      SELECT id_produto, nome, sku FROM public.produtos
      WHERE sku ILIKE ${'%' + code + '%'}
      LIMIT 1
    `;
    if (prods.length > 0) {
      produtoEncontrado = prods[0] as { id_produto: number; nome: string; sku: string };
    }
  }

  if (rfid.length === 0) {
    if (produtoEncontrado) {
      // Produto encontrado por SKU mas sem RFID específico
      // Tenta achar um RFID disponível para este produto
      const rfidsDisponiveis = await sql`
        SELECT id, epc FROM alissonerp.joias_rfid
        WHERE produto_id = ${produtoEncontrado.id_produto}::bigint
          AND status = 'ativo' AND venda_id IS NULL
        LIMIT 1
      `;

      return NextResponse.json({
        ok: true,
        action: "produto_encontrado",
        produto: produtoEncontrado,
        rfid_disponivel: rfidsDisponiveis.length > 0 ? rfidsDisponiveis[0] : null,
        mensagem: rfidsDisponiveis.length > 0
          ? "Produto encontrado. RFID disponível para vincular."
          : "Produto encontrado, mas sem RFID disponível no estoque.",
      });
    }

    return NextResponse.json({ error: "RFID não encontrado", codigo: code }, { status: 404 });
  }

  const r = rfid[0] as {
    id: string;
    epc: string;
    produto_id: number | null;
    produto_nome: string | null;
    produto_sku: string | null;
    status: string;
    localizacao_atual: string;
    venda_id: number | null;
  };

  // ─── Ação: vincular a uma venda ───────────────────────────────
  if (action === "vincular_venda") {
    if (!body.venda_id) {
      return NextResponse.json({ error: "venda_id obrigatório para vincular" }, { status: 400 });
    }
    if (r.venda_id) {
      return NextResponse.json({
        error: "RFID já vinculado a outra venda",
        rfid: { id: r.id, epc: r.epc },
        venda_id_atual: r.venda_id,
      }, { status: 409 });
    }
    if (r.status !== "ativo") {
      return NextResponse.json({
        error: `RFID não está disponível (status: ${r.status})`,
        rfid: { id: r.id, epc: r.epc, status: r.status },
      }, { status: 409 });
    }

    await sql`
      UPDATE alissonerp.joias_rfid
      SET venda_id = ${body.venda_id}, status = 'reservado', reservado_em = now()
      WHERE id = ${r.id}::uuid AND status = 'ativo'
    `;

    return NextResponse.json({
      ok: true,
      action: "vinculado",
      rfid: { id: r.id, epc: r.epc, produto: r.produto_nome, sku: r.produto_sku },
      venda_id: body.venda_id,
    });
  }

  // ─── Ação: entrada no estoque ─────────────────────────────────
  if (action === "entrada_estoque") {
    if (!r.produto_id) {
      return NextResponse.json({ error: "RFID sem produto vinculado" }, { status: 400 });
    }

    const warehouseId = body.warehouse_id ?? 2; // default: Loja

    await sql.begin(async (tx: any) => {
      // 1. Registra entrada no stock_ledger_entry
      await tx`
        INSERT INTO alissonerp.stock_ledger_entry
          (item_id, item_type, warehouse_id, actual_qty, voucher_type, obs, created_by)
        VALUES
          (${r.produto_id}::bigint, 'produto', ${warehouseId}, 1, 'ajuste_entrada',
           ${'Entrada por scanner RFID: ' + r.epc}, ${user.id}::uuid)
      `;

      // 2. Marca RFID como ativo na localização correta
      await tx`
        UPDATE alissonerp.joias_rfid
        SET status = 'ativo', localizacao_atual = 'Loja', venda_id = NULL, reservado_em = NULL
        WHERE id = ${r.id}::uuid
      `;
    });

    return NextResponse.json({
      ok: true,
      action: "entrada_estoque",
      rfid: { id: r.id, epc: r.epc, produto: r.produto_nome },
      warehouse_id: warehouseId,
    });
  }

  // ─── Ação padrão: apenas consultar ────────────────────────────
  return NextResponse.json({
    ok: true,
    action: "consulta",
    rfid: {
      id: r.id,
      epc: r.epc,
      produto_id: r.produto_id,
      produto_nome: r.produto_nome,
      produto_sku: r.produto_sku,
      status: r.status,
      localizacao: r.localizacao_atual,
      venda_id: r.venda_id,
    },
  });
}
