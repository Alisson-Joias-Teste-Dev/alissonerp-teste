import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

// ─── GET /api/vendas/cliente/[id]/historico ───────────────────────────────────
// Busca vendas anteriores de um cliente (para seleção de garantia no wizard de vendas).
// Retorna apenas vendas aprovadas ou concluídas, ordenadas por data DESC, limit 20.
// Response: [{ id, numero_venda, data_venda, total_venda, situacao, itens_resumo }]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const clienteId = Number(id);
  if (isNaN(clienteId) || clienteId <= 0) {
    return NextResponse.json({ error: "ID de cliente inválido" }, { status: 400 });
  }

  const vendas = await sql`
    SELECT
      v.id,
      v.numero_venda,
      v.data_venda,
      v.total_venda,
      v.situacao,
      STRING_AGG(i.nome_produto, ', ' ORDER BY i.id) AS itens_resumo
    FROM alissonerp.vendas_erp v
    LEFT JOIN alissonerp.itens_venda_erp i ON i.venda_id = v.id
    WHERE v.cliente_id = ${clienteId}
      AND v.situacao IN ('aprovado', 'em_rota', 'entregue', 'concluido', 'virou_credito')
    GROUP BY v.id, v.numero_venda, v.data_venda, v.total_venda, v.situacao
    ORDER BY v.data_venda DESC
    LIMIT 20
  `;

  return NextResponse.json(
    vendas.map((v) => ({
      ...v,
      total_venda: Number(v.total_venda),
    }))
  );
}
