import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { normalizeRow } from "@/lib/db";
import { getParametroNumber, PARAM } from "@/lib/parametros";

type Params = Promise<{ id: string }>;

// GET /api/compras/[id]/itens
export async function GET(_req: NextRequest, { params }: { params: Params }) {
  const { id } = await params;
  const compraId = parseInt(id);

  const rows = await sql`
    SELECT
      ic.*,
      i.nome           AS insumo_nome,
      i.categoria_id,
      ci.nome          AS categoria_nome,
      i.peso_pedra_ct,
      d.nome           AS deposito_nome
    FROM alissonerp.itens_compra ic
    JOIN alissonerp.insumos i ON i.id = ic.insumo_id
    JOIN alissonerp.categorias_insumo ci ON ci.id = i.categoria_id
    LEFT JOIN alissonerp.depositos d ON d.id = ic.deposito_id
    WHERE ic.compra_id = ${compraId}
    ORDER BY ic.id
  `;

  const numericFields = ["qtd", "valor_unitario", "valor_total", "peso_ct", "qtd_pecas", "custo_por_ct", "peso_pedra_ct"];
  return NextResponse.json(rows.map((r) => normalizeRow(r as Record<string, unknown>, numericFields)));
}

// POST /api/compras/[id]/itens
// Body (pedras cat_id=2): { insumo_id, deposito_id?, peso_ct, custo_por_ct, qtd_pecas?, lote_referencia?, observacao? }
// Body (outros):          { insumo_id, deposito_id?, qtd, valor_unitario? }
// Trigger fn_calcular_item_compra calcula valor_total automaticamente.
export async function POST(req: NextRequest, { params }: { params: Params }) {
  const { id } = await params;
  const compraId = parseInt(id);

  const {
    insumo_id,
    deposito_id,
    qtd,
    valor_unitario,
    // Campos pedras
    peso_ct,
    qtd_pecas,
    custo_por_ct,
    lote_referencia,
    observacao,
  } = await req.json() as {
    insumo_id: number;
    deposito_id?: number | null;
    qtd?: number | null;
    valor_unitario?: number | null;
    peso_ct?: number | null;
    qtd_pecas?: number | null;
    custo_por_ct?: number | null;
    lote_referencia?: string | null;
    observacao?: string | null;
  };

  if (!insumo_id) {
    return NextResponse.json({ error: "insumo_id é obrigatório" }, { status: 400 });
  }

  const almoxarifadoId = await getParametroNumber(PARAM.ALMOXARIFADO_DEPOSITO_ID);

  // Verificar se compra está bloqueada antes de inserir
  const [compra] = await sql`
    SELECT bloqueado, situacao FROM alissonerp.compras WHERE id = ${compraId} LIMIT 1
  `;
  if (!compra) return NextResponse.json({ error: "Compra não encontrada" }, { status: 404 });
  if (compra.bloqueado) return NextResponse.json({ error: "Compra bloqueada — não permite edição" }, { status: 409 });

  // Detectar categoria do insumo
  const [insumo] = await sql`
    SELECT categoria_id FROM alissonerp.insumos WHERE id = ${insumo_id} LIMIT 1
  `;
  if (!insumo) return NextResponse.json({ error: "Insumo não encontrado" }, { status: 404 });

  const ehPedra = Number(insumo.categoria_id) === 2;

  if (ehPedra) {
    // Pedras: obrigatório peso_ct e custo_por_ct
    if (!peso_ct || peso_ct <= 0) {
      return NextResponse.json({ error: "Para pedras: peso_ct é obrigatório" }, { status: 400 });
    }

    const [row] = await sql`
      INSERT INTO alissonerp.itens_compra
        (compra_id, insumo_id, deposito_id, qtd, valor_unitario, unidade,
         peso_ct, qtd_pecas, custo_por_ct, lote_referencia, observacao)
      VALUES (
        ${compraId},
        ${insumo_id},
        ${deposito_id ?? almoxarifadoId},
        ${peso_ct},
        ${custo_por_ct ?? null},
        'ct',
        ${peso_ct},
        ${qtd_pecas ?? null},
        ${custo_por_ct ?? null},
        ${lote_referencia ?? null},
        ${observacao ?? null}
      )
      RETURNING *
    `;

    const numericFields = ["qtd", "valor_unitario", "valor_total", "peso_ct", "qtd_pecas", "custo_por_ct"];
    return NextResponse.json(normalizeRow(row as Record<string, unknown>, numericFields), { status: 201 });
  } else {
    // Outros insumos: obrigatório qtd
    if (!qtd || qtd <= 0) {
      return NextResponse.json({ error: "Para este insumo: qtd é obrigatório" }, { status: 400 });
    }

    // Detectar unidade pela categoria
    const [catRow] = await sql`
      SELECT nome FROM alissonerp.categorias_insumo WHERE id = ${Number(insumo.categoria_id)} LIMIT 1
    `;
    const catNome   = (catRow?.nome as string ?? "").toLowerCase();
    const unidade   = catNome.includes("metal") || catNome.includes("ouro") ? "g" : "un";

    const [row] = await sql`
      INSERT INTO alissonerp.itens_compra
        (compra_id, insumo_id, deposito_id, qtd, valor_unitario, unidade,
         observacao)
      VALUES (
        ${compraId},
        ${insumo_id},
        ${deposito_id ?? almoxarifadoId},
        ${qtd},
        ${valor_unitario ?? null},
        ${unidade},
        ${observacao ?? null}
      )
      RETURNING *
    `;

    const numericFields = ["qtd", "valor_unitario", "valor_total"];
    return NextResponse.json(normalizeRow(row as Record<string, unknown>, numericFields), { status: 201 });
  }
}
