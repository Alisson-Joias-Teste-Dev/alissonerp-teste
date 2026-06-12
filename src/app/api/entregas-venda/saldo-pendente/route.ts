import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { calcularSaldoPendente } from "@/lib/entrega-venda";

/**
 * GET /api/entregas-venda/saldo-pendente?venda_id=X
 *
 * REGRA DE NEGÓCIO (12/06 — Jonathan): retorna o SALDO PENDENTE de entrega por
 *   item da venda (quantidade vendida − já entregue em entregas não canceladas),
 *   lendo a view vw_entregas_pendentes.
 * POR QUE: o modal "Marcar Entrega" precisa mostrar quanto AINDA falta entregar
 *   de cada item (ex.: 1 de 2), não a quantidade cheia — senão deixa entregar de
 *   novo o que já foi entregue. Antes o modal estimava errado (usava a qtd total).
 * IMPACTO SE REMOVIDO: o modal volta a oferecer a quantidade cheia e o operador
 *   pode tentar reentregar item já entregue (o backend rejeita, mas a UX engana).
 *
 * Retorno: [{ itemVendaId, nomeProduto, sku, qtdVendida, qtdEntregue, saldoPendente }]
 *   - padrão: só itens com saldoPendente > 0 (o que ainda falta — usado pelo modal)
 *   - ?todos=1: TODOS os itens (inclui os já 100% entregues, com qtdEntregue) —
 *     usado pela tela da venda para mostrar QUAL item já foi entregue.
 */
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const url = new URL(req.url);
  const vendaId = Number(url.searchParams.get("venda_id"));
  const todos = url.searchParams.get("todos") === "1";
  if (!vendaId || isNaN(vendaId)) {
    return NextResponse.json({ error: "venda_id obrigatório" }, { status: 400 });
  }

  // Qualquer usuário com papel no sistema pode consultar o saldo da venda
  // (a criação da entrega tem suas próprias permissões/ownership).
  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  if (!usuario) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 403 });

  if (todos) {
    // Todos os itens da venda com a quantidade já entregue (até os 100% entregues).
    const rows = await sql`
      SELECT item_venda_id, nome_produto, sku, qtd_vendida, qtd_entregue, saldo_pendente
      FROM alissonerp.vw_entregas_pendentes
      WHERE venda_id = ${vendaId}
      ORDER BY item_venda_id
    `;
    const itens = rows.map((r: Record<string, unknown>) => ({
      itemVendaId: Number(r.item_venda_id),
      nomeProduto: String(r.nome_produto ?? ""),
      sku: r.sku ? String(r.sku) : "",
      qtdVendida: Number(r.qtd_vendida),
      qtdEntregue: Number(r.qtd_entregue),
      saldoPendente: Number(r.saldo_pendente),
    }));
    return NextResponse.json({ itens });
  }

  const itens = await calcularSaldoPendente(vendaId);
  return NextResponse.json({ itens });
}
