import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { recalcularTotaisPCP } from "@/lib/recalcular-totais-pcp";

// POST /api/distribuicao/[id]/saida — registra saída por ordem
//
// Lógica:
//   peso_bruto     = peso da peça na balança (ouro + pedras)
//   peso_pedras    = Σ(qtd_utilizada × peso_pedra_unitario)
//   peso_ouro_real = peso_bruto − peso_pedras
//
// Quebra/saldo NÃO é calculada por ordem — só na conclusão do lote.
//
// CE: UPDATE fechamentos_distribuicao → trigger fn_processar_fechamento_dist
//     move peso_ouro_real do dep_dist → almoxarifado (TEDD), atualiza PCP.
//
// Pedras consumidas ficam na peça — NÃO voltam ao estoque.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const distId = parseInt(id);
  if (isNaN(distId)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const {
    ordem_id,
    peso_bruto,
    pedras_utilizadas,
    foto_balanca,
    user_id,
  } = await req.json() as {
    ordem_id: number;
    peso_bruto: number;
    pedras_utilizadas?: { insumo_id: number; qtd_utilizada: number }[];
    foto_balanca?: string | null;
    user_id?: string | null;
  };

  if (!ordem_id) {
    return NextResponse.json({ error: "ordem_id obrigatório" }, { status: 400 });
  }
  if (!peso_bruto || peso_bruto <= 0) {
    return NextResponse.json({ error: "Peso bruto deve ser maior que zero" }, { status: 400 });
  }
  if (!foto_balanca) {
    return NextResponse.json({ error: "Foto da balança obrigatória" }, { status: 400 });
  }

  // 1. Verificar que a ordem pertence a esta distribuição e não teve saída
  const [doo] = await sql`
    SELECT id, data_baixa
    FROM alissonerp.distribuicao_ordens
    WHERE distribuicao_id = ${distId} AND ordens_id = ${ordem_id}
    LIMIT 1
  `;
  if (!doo) {
    return NextResponse.json({ error: "Ordem não está nesta distribuição" }, { status: 400 });
  }
  if (doo.data_baixa) {
    return NextResponse.json({ error: "Esta ordem já teve saída registrada" }, { status: 400 });
  }

  // 2. Calcular peso das pedras + buscar insumo unitário
  let peso_pedras_total = 0;
  const pedrasComPeso: { insumo_id: number; qtd: number; peso_unitario: number; peso_total: number }[] = [];

  for (const p of pedras_utilizadas ?? []) {
    if (!p.qtd_utilizada || p.qtd_utilizada <= 0) continue;
    const [ins] = await sql`
      SELECT COALESCE(peso_pedra, 0)::float8 AS peso_pedra
      FROM alissonerp.insumos WHERE id = ${p.insumo_id} LIMIT 1
    `;
    const pu = Number(ins?.peso_pedra ?? 0);
    const pt = p.qtd_utilizada * pu;
    peso_pedras_total += pt;
    pedrasComPeso.push({ insumo_id: p.insumo_id, qtd: p.qtd_utilizada, peso_unitario: pu, peso_total: pt });
  }

  const peso_ouro_real = peso_bruto - peso_pedras_total;

  // 3. INSERT detalhe de pedras usadas
  for (const p of pedrasComPeso) {
    await sql`
      INSERT INTO alissonerp.distribuicao_saida_pedras
        (distribuicao_ordem_id, insumo_id, qtd_utilizada, peso_unitario, peso_total)
      VALUES
        (${doo.id}, ${p.insumo_id}, ${p.qtd}, ${p.peso_unitario}, ${p.peso_total})
    `;
  }

  // 4. UPDATE distribuicao_ordens — somente dados físicos da peça
  //    quebra e ouro_entregue NÃO são gravados aqui — calculados na conclusão do lote
  await sql`
    UPDATE alissonerp.distribuicao_ordens
    SET
      peso_bruto     = ${peso_bruto},
      peso_pedras    = ${peso_pedras_total},
      peso_ouro_real = ${peso_ouro_real},
      data_baixa     = now(),
      saida_por      = ${user_id ?? null},
      foto_balanca   = ${foto_balanca}
    WHERE id = ${doo.id}
  `;

  // 5. UPDATE fechamentos_distribuicao (peso = peso_ouro_real)
  //    → trigger fn_processar_fechamento_dist:
  //      • CE TEDD: peso_ouro_real de dep_dist → almoxarifado (insumo_id=1 proxy)
  //      • PCP.total_metal += pmc, total_pedras_un += total_pedras
  //      • ordens.local_atual = 1
  const totalPedrasUn = pedrasComPeso.reduce((s, p) => s + p.qtd, 0);
  const [fech] = await sql`
    SELECT id, peso AS peso_atual
    FROM alissonerp.fechamentos_distribuicao
    WHERE distribuicao_id = ${distId} AND ordem_id = ${ordem_id}
    LIMIT 1
  `;
  if (fech && !(fech.peso_atual && Number(fech.peso_atual) > 0)) {
    await sql`
      UPDATE alissonerp.fechamentos_distribuicao
      SET
        peso            = ${peso_ouro_real},
        pmc             = ${peso_ouro_real},
        total_pedras_un = ${totalPedrasUn},
        foto_balanca    = ${foto_balanca},
        created_by      = ${user_id ?? null},
        updated_at      = now()
      WHERE id = ${fech.id}
    `;
  }

  // 6. Recalcular totais dist_* no PCP desta ordem (fire-and-forget)
  sql`
    SELECT id FROM alissonerp.pcp WHERE ordem_id = ${ordem_id} LIMIT 1
  `.then(([pcpRow]) => {
    if (pcpRow?.id) recalcularTotaisPCP(pcpRow.id as number).catch(() => {});
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    peso_bruto,
    peso_pedras: peso_pedras_total,
    peso_ouro_real,
  });
}
