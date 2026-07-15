import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

interface Params { params: Promise<{ produtoId: string }> }

// GET /api/estoque-comercial/[produtoId]
// Retorna saldo por local + movimentações + reservas ativas
export async function GET(
  req: NextRequest,
  { params }: Params
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { produtoId } = await params;
  const id = Number(produtoId);
  const url = new URL(req.url);
  const limit = Number(url.searchParams.get("limit") ?? "50");

  // Detectar views v2
  const [v2Exists] = await sql`
    SELECT 1 FROM information_schema.views
    WHERE table_schema = 'alissonerp' AND table_name = 'vw_estoque_comercial_alerta_v2'
    LIMIT 1
  `;

  if (v2Exists) {
    // ── V2 ──
    const [consolidado] = await sql`
      SELECT * FROM alissonerp.vw_estoque_comercial_alerta_v2
      WHERE produto_id = ${id}
    `;

    // Localizacao fisica da peca (carga externa + edicao manual) — vive em erp_produtos.
    const [prodExtra] = await sql`
      SELECT localizacao FROM alissonerp.erp_produtos WHERE produto_id = ${id}::bigint
    `;

    const saldoPorLocal = await sql`
      SELECT
        local_estoque_id, local_nome,
        saldo_fisico, reservado, disponivel, em_transito
      FROM alissonerp.vw_saldo_estoque_comercial_v2
      WHERE produto_id = ${id}
      ORDER BY local_estoque_id
    `;

    const movimentos = await sql`
      SELECT
        m.id, m.tipo, m.quantidade, m.motivo, m.observacao,
        m.referencia_tipo, m.referencia_id,
        m.local_estoque_id, le.nome AS local_nome,
        m.status, m.estorno_de_id, m.estornado_por_id,
        m.ordem_id, m.protocolo_id,
        m.created_at,
        u.email AS criado_por
      FROM alissonerp.movimentacoes_estoque_comercial m
      LEFT JOIN auth.users u ON u.id = m.created_by
      LEFT JOIN alissonerp.locais_estoque le ON le.id = m.local_estoque_id
      WHERE m.produto_id = ${id}
      ORDER BY m.created_at DESC
      LIMIT ${limit}
    `;

    const reservas = await sql`
      SELECT
        r.id, r.quantidade, r.local_estoque_id, r.status,
        r.venda_id, r.item_venda_id, r.ordem_id,
        v.numero_venda,
        o.numero_ordem,
        o.tipo_ordem::text AS tipo_ordem,
        -- Regra de negocio: reserva com venda_id pertence ao fluxo comercial (PDV).
        -- Se nao houver venda_id e existir ordem_id, a reserva pertence ao fluxo operacional (conversao/ordem).
        -- Impacto: sem essa classificacao explicita a UI confunde conversao com venda e induz leitura operacional errada.
        CASE
          WHEN r.venda_id IS NOT NULL THEN 'venda'
          WHEN r.ordem_id IS NOT NULL AND o.tipo_ordem::text = 'conversao_sku' THEN 'conversao_sku'
          WHEN r.ordem_id IS NOT NULL AND o.tipo_ordem::text = 'conversao' THEN 'conversao_estoque'
          WHEN r.ordem_id IS NOT NULL THEN 'ordem'
          ELSE 'indefinida'
        END AS tipo_reserva,
        CASE
          WHEN r.venda_id IS NOT NULL THEN 'Venda ' || COALESCE(v.numero_venda::text, '#' || r.venda_id::text)
          WHEN r.ordem_id IS NOT NULL AND o.tipo_ordem::text = 'conversao_sku' THEN 'Conversao SKU ' || COALESCE(o.numero_ordem, '#' || r.ordem_id::text)
          WHEN r.ordem_id IS NOT NULL AND o.tipo_ordem::text = 'conversao' THEN 'Conversao Estoque ' || COALESCE(o.numero_ordem, '#' || r.ordem_id::text)
          WHEN r.ordem_id IS NOT NULL THEN 'Ordem ' || COALESCE(o.numero_ordem, '#' || r.ordem_id::text)
          ELSE 'Origem indefinida'
        END AS origem_label,
        r.created_at
      FROM alissonerp.reservas_estoque_comercial r
      LEFT JOIN alissonerp.vendas_erp v ON v.id = r.venda_id
      LEFT JOIN alissonerp.ordens o ON o.id = r.ordem_id
      WHERE r.produto_id = ${id} AND r.status = 'ativo'
      ORDER BY r.created_at DESC
    `;

    const transferencias = await sql`
      SELECT
        t.id, t.quantidade, t.status,
        t.local_origem_id, lo.nome AS local_origem_nome,
        t.local_destino_id, ld.nome AS local_destino_nome,
        t.ordem_solicitacao, t.obs, t.created_at,
        ue.email AS enviado_por_email,
        ur.email AS recebido_por_email,
        t.recebido_em
      FROM alissonerp.transferencias_estoque_comercial t
      LEFT JOIN alissonerp.locais_estoque lo ON lo.id = t.local_origem_id
      LEFT JOIN alissonerp.locais_estoque ld ON ld.id = t.local_destino_id
      LEFT JOIN auth.users ue ON ue.id = t.enviado_por
      LEFT JOIN auth.users ur ON ur.id = t.recebido_por
      WHERE t.produto_id = ${id}
      ORDER BY t.created_at DESC
      LIMIT 20
    `;

    const rfidItens = await sql`
      SELECT id, epc, sku, nome, localizacao_atual, status, peso_g, preco_venda
      FROM alissonerp.joias_rfid
      WHERE produto_id = ${id}::bigint
      ORDER BY epc
    `;

    return NextResponse.json({
      consolidado: consolidado ?? null,
      localizacao: prodExtra?.localizacao ?? null,
      saldoPorLocal: saldoPorLocal.map(r => ({
        ...r,
        saldo_fisico: Number(r.saldo_fisico ?? 0),
        reservado: Number(r.reservado ?? 0),
        disponivel: Number(r.disponivel ?? 0),
        em_transito: Number(r.em_transito ?? 0),
      })),
      movimentos,
      reservas,
      transferencias,
      rfidItens,
    });
  }

  // ── Fallback: views antigas ──
  const [saldo] = await sql`
    SELECT * FROM alissonerp.vw_estoque_comercial_com_alerta
    WHERE produto_id = ${id}
  `;

  const movimentos = await sql`
    SELECT
      m.id, m.tipo, m.quantidade, m.motivo, m.observacao,
      m.referencia_tipo, m.referencia_id,
      m.created_at,
      u.email AS criado_por
    FROM alissonerp.movimentacoes_estoque_comercial m
    LEFT JOIN auth.users u ON u.id = m.created_by
    WHERE m.produto_id = ${id}
    ORDER BY m.created_at DESC
    LIMIT ${limit}
  `;

  // Mapear para formato v2
  const consolidado = saldo ? {
    ...saldo,
    saldo_fisico: Number(saldo.saldo ?? 0),
    reservado: 0,
    disponivel: Number(saldo.saldo ?? 0),
    em_transito: 0,
  } : null;

  // Localizacao fisica da peca (vive em erp_produtos), tambem no caminho legado.
  const [prodExtraLegado] = await sql`
    SELECT localizacao FROM alissonerp.erp_produtos WHERE produto_id = ${id}::bigint
  `;

  return NextResponse.json({
    consolidado,
    localizacao: prodExtraLegado?.localizacao ?? null,
    saldoPorLocal: [],
    movimentos: movimentos.map(m => ({
      ...m,
      local_estoque_id: null,
      local_nome: null,
      status: "efetivado",
      estorno_de_id: null,
      estornado_por_id: null,
      ordem_id: null,
      protocolo_id: null,
    })),
    reservas: [],
    transferencias: [],
    rfidItens: [],
  });
}
