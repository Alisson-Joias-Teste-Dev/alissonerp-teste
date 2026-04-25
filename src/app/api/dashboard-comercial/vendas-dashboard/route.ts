import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import type {
  VendasDashboardResponse,
  ResumoConsultora,
  DashVendaComVendedor,
  TipoMeta,
} from "@/lib/types/dashboard-comercial";
import { safeDiv } from "@/lib/dashboard-comercial/utils";

// GET /api/dashboard-comercial/vendas-dashboard?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Retorna:
//   cardsMetas        → soma de metas (Prata/Ouro/Diamante) no período
//   visaoGeral        → faturamento agregado + metas agregadas
//   tabelaConsultoras → array por consultora (vendas, metas, ticket)
//   vendasBrutas      → vendas individuais com vendedor/cliente (join)

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const hoje = new Date();
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);

  const from = params.get("from") ?? inicioMes.toISOString().slice(0, 10);
  const to = params.get("to") ?? hoje.toISOString().slice(0, 10);

  try {
    // ---------------- 1. Vendas do período (legado + ERP, vale-troca pré-computado) ----------------
    const vendas = await sql<
      Array<{
        fonte: string;
        id: number;
        data_venda: string | null;
        status: number | null;
        vendedor_id: number | null;
        cliente_id: number | null;
        total_venda: string | null;
        frete_pago_cliente: string | null;
        forma_envio_id: number | null;
        numero_pedido_tiny: string | null;
        id_api_tiny: string | null;
        vendedor_nome: string | null;
        vendedor_foto: string | null;
        cliente_nome: string | null;
        valor_vale_troca: string | null;
      }>
    >`
      SELECT
        v.fonte,
        v.id,
        v.data_venda::text,
        v.status,
        v.vendedor_id,
        v.cliente_id,
        v.total_venda,
        v.frete_pago_cliente,
        v.forma_envio_id,
        v.numero_pedido_tiny,
        v.id_api_tiny::text,
        vd.nome  AS vendedor_nome,
        vd.foto  AS vendedor_foto,
        c.nome   AS cliente_nome,
        v.valor_vale_troca
      FROM alissonerp.vw_dash_vendas_todas v
      LEFT JOIN alissonerp.vw_dash_vendedores vd ON vd.id_vendedor = v.vendedor_id
      LEFT JOIN public.contatos c ON c.id_contato = v.cliente_id
      WHERE v.data_venda BETWEEN ${from}::date AND ${to}::date
        AND v.status = 2
    `;

    // ---------------- 2. Metas do período (tanto meta_acumulada quanto valor_meta total) ----------------
    const metasAcumuladas = await sql<
      Array<{ consultora: string; tipo_meta: TipoMeta; total: string }>
    >`
      SELECT
        consultora::text,
        tipo_meta,
        COALESCE(SUM(meta_acumulada), 0)::text AS total
      FROM alissonerp.vw_dash_metas_por_hora
      WHERE data_hora BETWEEN ${from}::timestamp AND (${to}::date + INTERVAL '1 day - 1 second')::timestamp
        AND valor_meta > 0
      GROUP BY consultora, tipo_meta
    `;

    const metasFim = await sql<
      Array<{ consultora: string; tipo_meta: TipoMeta; total: string }>
    >`
      SELECT
        consultora::text,
        tipo_meta,
        COALESCE(SUM(valor_meta), 0)::text AS total
      FROM alissonerp.vw_dash_metas_por_hora
      WHERE data_hora BETWEEN ${from}::timestamp AND (${to}::date + INTERVAL '1 day - 1 second')::timestamp
        AND valor_meta > 0
      GROUP BY consultora, tipo_meta
    `;

    // ---------------- 3. Consolidação por consultora ----------------
    const consultorasMap = new Map<number, ResumoConsultora>();

    // Agregar vendas por consultora
    // Normaliza vendedor_id para Number() — bigint do postgres.js chega como string
    for (const v of vendas) {
      if (!v.vendedor_id) continue;
      const vid = Number(v.vendedor_id);
      const totalBruto = Number(v.total_venda ?? 0);
      const valorVale = Number(v.valor_vale_troca ?? 0);
      const totalLiquido = totalBruto - valorVale;

      if (!consultorasMap.has(vid)) {
        consultorasMap.set(vid, {
          id_vendedor: vid,
          nome: v.vendedor_nome ?? "Não informada",
          foto: v.vendedor_foto,
          alcancado_periodo: 0,
          alcancado_bruto: 0,
          valor_vale_troca: 0,
          quantidade_vendas: 0,
          ticket_medio: 0,
          metas: {
            Prata: emptyMeta(),
            Ouro: emptyMeta(),
            Diamante: emptyMeta(),
          },
        });
      }
      const c = consultorasMap.get(vid)!;
      c.alcancado_bruto += totalBruto;
      c.alcancado_periodo += totalLiquido;
      c.valor_vale_troca += valorVale;
      c.quantidade_vendas += 1;
    }

    // Garantir que consultoras que só têm metas (sem vendas no período) também apareçam
    for (const m of metasAcumuladas) {
      const id = Number(m.consultora);
      if (!consultorasMap.has(id)) {
        const [vendedor] = await sql<
          Array<{ id_vendedor: number; nome: string | null; foto: string | null }>
        >`
          SELECT id_vendedor, nome, foto
          FROM alissonerp.vw_dash_vendedores
          WHERE id_vendedor = ${id}
        `;
        consultorasMap.set(id, {
          id_vendedor: id,
          nome: vendedor?.nome ?? "Não informada",
          foto: vendedor?.foto ?? null,
          alcancado_periodo: 0,
          alcancado_bruto: 0,
          valor_vale_troca: 0,
          quantidade_vendas: 0,
          ticket_medio: 0,
          metas: { Prata: emptyMeta(), Ouro: emptyMeta(), Diamante: emptyMeta() },
        });
      }
    }

    // Preencher metas esperadas até o momento
    for (const m of metasAcumuladas) {
      const id = Number(m.consultora);
      const c = consultorasMap.get(id);
      if (!c) continue;
      c.metas[m.tipo_meta].esperado_ate_momento = Number(m.total);
    }

    // Preencher metas esperadas fim do período
    for (const m of metasFim) {
      const id = Number(m.consultora);
      const c = consultorasMap.get(id);
      if (!c) continue;
      c.metas[m.tipo_meta].esperado_fim_periodo = Number(m.total);
    }

    // Calcular diferenças, percentuais e ticket médio
    for (const c of consultorasMap.values()) {
      c.ticket_medio = safeDiv(c.alcancado_periodo, c.quantidade_vendas);
      for (const tipo of ["Prata", "Ouro", "Diamante"] as TipoMeta[]) {
        const m = c.metas[tipo];
        m.diferenca_ate_momento = c.alcancado_periodo - m.esperado_ate_momento;
        m.diferenca_fim_periodo = c.alcancado_periodo - m.esperado_fim_periodo;
        m.percentual_ate_momento = safeDiv(c.alcancado_periodo, m.esperado_ate_momento) * 100;
        m.percentual_fim_periodo = safeDiv(c.alcancado_periodo, m.esperado_fim_periodo) * 100;
      }
    }

    const tabelaConsultoras = Array.from(consultorasMap.values()).sort(
      (a, b) => b.alcancado_periodo - a.alcancado_periodo,
    );

    // ---------------- 4. Visão geral (agregado total) ----------------
    const alcancadoTotal = tabelaConsultoras.reduce((s, c) => s + c.alcancado_periodo, 0);
    const alcancadoBruto = tabelaConsultoras.reduce((s, c) => s + c.alcancado_bruto, 0);
    const valorValeTotal = tabelaConsultoras.reduce((s, c) => s + c.valor_vale_troca, 0);
    const qtdVendas = tabelaConsultoras.reduce((s, c) => s + c.quantidade_vendas, 0);

    const metasAteMomento = { Prata: 0, Ouro: 0, Diamante: 0 };
    const metasFimPeriodo = { Prata: 0, Ouro: 0, Diamante: 0 };
    for (const c of tabelaConsultoras) {
      metasAteMomento.Prata += c.metas.Prata.esperado_ate_momento;
      metasAteMomento.Ouro += c.metas.Ouro.esperado_ate_momento;
      metasAteMomento.Diamante += c.metas.Diamante.esperado_ate_momento;
      metasFimPeriodo.Prata += c.metas.Prata.esperado_fim_periodo;
      metasFimPeriodo.Ouro += c.metas.Ouro.esperado_fim_periodo;
      metasFimPeriodo.Diamante += c.metas.Diamante.esperado_fim_periodo;
    }

    const response: VendasDashboardResponse = {
      cardsMetas: {
        Prata: metasFimPeriodo.Prata,
        Ouro: metasFimPeriodo.Ouro,
        Diamante: metasFimPeriodo.Diamante,
      },
      visaoGeral: {
        alcancado: alcancadoTotal,
        alcancado_bruto: alcancadoBruto,
        valor_vale_troca: valorValeTotal,
        quantidade_vendas: qtdVendas,
        ticket_medio: safeDiv(alcancadoTotal, qtdVendas),
        esperado_ate_momento: metasAteMomento,
        esperado_fim_periodo: metasFimPeriodo,
      },
      tabelaConsultoras,
      vendasBrutas: vendas.map<DashVendaComVendedor>((v) => ({
        fonte: v.fonte,
        id: v.id,
        data_venda: v.data_venda,
        status: v.status,
        vendedor_id: v.vendedor_id,
        cliente_id: v.cliente_id,
        total_venda: Number(v.total_venda ?? 0),
        total_produtos: null,
        frete_pago_cliente: Number(v.frete_pago_cliente ?? 0),
        forma_envio_id: v.forma_envio_id,
        forma_frete_id: null,
        numero_pedido: null,
        numero_pedido_tiny: v.numero_pedido_tiny,
        id_api_tiny: v.id_api_tiny ? Number(v.id_api_tiny) : null,
        entregue: false,
        vendedor_nome: v.vendedor_nome,
        vendedor_foto: v.vendedor_foto,
        cliente_nome: v.cliente_nome,
        valor_vale_troca: Number(v.valor_vale_troca ?? 0),
        valor_liquido: Number(v.total_venda ?? 0) - Number(v.valor_vale_troca ?? 0),
      })),
    };

    return NextResponse.json(response);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[dashboard-comercial/vendas-dashboard]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function emptyMeta() {
  return {
    esperado_ate_momento: 0,
    esperado_fim_periodo: 0,
    diferenca_ate_momento: 0,
    diferenca_fim_periodo: 0,
    percentual_ate_momento: 0,
    percentual_fim_periodo: 0,
  };
}
