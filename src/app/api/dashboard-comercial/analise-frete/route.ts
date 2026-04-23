import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import type { AnaliseFreteResponse } from "@/lib/types/dashboard-comercial";

// GET /api/dashboard-comercial/analise-frete?from=...&to=...
//
// Retorna:
//   total_recebido_clientes     → SUM vendas.frete_pago_cliente (status=2, período)
//   total_pago_transportadores  → SUM entregas.valor_entrega (aprovada=true, período)
//   saldo                       → diferença
//   vendas / entregas           → detalhamento

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const hoje = new Date();
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);

  const from = params.get("from") ?? inicioMes.toISOString().slice(0, 10);
  const to = params.get("to") ?? hoje.toISOString().slice(0, 10);

  try {
    const vendas = await sql<
      Array<{
        id: number;
        data_venda: string;
        numero_pedido: string | null;
        consultora: string | null;
        forma_envio: string | null;
        total_venda: string;
        frete_pago_cliente: string;
      }>
    >`
      SELECT
        v.id,
        v.data_venda::text,
        v.numero_pedido::text,
        vd.nome AS consultora,
        fe.nome AS forma_envio,
        COALESCE(v.total_venda, 0)::text AS total_venda,
        COALESCE(v.frete_pago_cliente, 0)::text AS frete_pago_cliente
      FROM alissonerp.vw_dash_vendas v
      LEFT JOIN alissonerp.vw_dash_vendedores vd ON vd.id_vendedor = v.vendedor_id
      LEFT JOIN alissonerp.vw_dash_forma_envio fe ON fe.id = v.forma_envio_id
      WHERE v.data_venda BETWEEN ${from}::date AND ${to}::date
        AND v.status = 2
      ORDER BY v.data_venda DESC
    `;

    const entregas = await sql<
      Array<{
        id: number;
        data_entrega: string;
        numero_pedido_plataforma: string | null;
        solicitante: string | null;
        entregador: string;
        regiao: string | null;
        frete_recebido: string;
        frete_pago: string;
      }>
    >`
      SELECT
        e.id,
        e.data_entrega::text,
        e.numero_pedido_plataforma,
        vd.nome AS solicitante,
        e.entregador_responsavel AS entregador,
        e.bairro_entrega AS regiao,
        COALESCE(e.frete_pago_cliente, 0)::text AS frete_recebido,
        COALESCE(e.valor_entrega, 0)::text AS frete_pago
      FROM alissonerp.vw_dash_controle_entregas e
      LEFT JOIN alissonerp.vw_dash_vendedores vd ON vd.id_vendedor = e.vendedor_responsavel_id
      WHERE e.data_entrega::date BETWEEN ${from}::date AND ${to}::date
        AND e.aprovada = true
      ORDER BY e.data_entrega DESC
    `;

    const totalRecebido = vendas.reduce((s, v) => s + Number(v.frete_pago_cliente), 0);
    const totalPago = entregas.reduce((s, e) => s + Number(e.frete_pago), 0);

    const response: AnaliseFreteResponse = {
      total_recebido_clientes: totalRecebido,
      total_pago_transportadores: totalPago,
      saldo: totalRecebido - totalPago,
      vendas: vendas.map((v) => ({
        id: v.id,
        data_venda: v.data_venda,
        numero_pedido: v.numero_pedido,
        consultora: v.consultora ?? "Não informada",
        forma_envio: v.forma_envio ?? "N/A",
        total_venda: Number(v.total_venda),
        frete_pago_cliente: Number(v.frete_pago_cliente),
      })),
      entregas: entregas.map((e) => ({
        id: e.id,
        data_entrega: e.data_entrega,
        numero_pedido_plataforma: e.numero_pedido_plataforma,
        solicitante: e.solicitante ?? "N/A",
        entregador: e.entregador,
        regiao: e.regiao,
        frete_recebido: Number(e.frete_recebido),
        frete_pago: Number(e.frete_pago),
      })),
    };

    return NextResponse.json(response);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[dashboard-comercial/analise-frete]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
