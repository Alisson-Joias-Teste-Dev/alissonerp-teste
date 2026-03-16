import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { recalcularTotaisPCP } from "@/lib/recalcular-totais-pcp";

// POST /api/pcp/apontamentos
export async function POST(req: NextRequest) {
  const { tipo_apontamento_id, deposito_id, setor_id, insumo_id, pcp_id, qtd, foto_balanca } =
    await req.json() as {
      tipo_apontamento_id: number;
      deposito_id: number;
      setor_id: number | null;
      insumo_id: number | null;
      pcp_id: number;
      qtd: number;
      foto_balanca?: string | null;
    };

  if (!tipo_apontamento_id || !deposito_id || !pcp_id || !qtd) {
    return NextResponse.json(
      { error: "tipo_apontamento_id, deposito_id, pcp_id e qtd são obrigatórios" },
      { status: 400 }
    );
  }

  // Validação de estoque para tipos 1, 2, 3 e 8 (todos saem do Almoxarifado Central)
  if ((tipo_apontamento_id === 1 || tipo_apontamento_id === 2 || tipo_apontamento_id === 3 || tipo_apontamento_id === 8) && insumo_id) {
    const saldo = await sql`
      SELECT saldo FROM alissonerp.vw_saldo_estoque
      WHERE deposito_id = 1 AND insumo_id = ${insumo_id}
      LIMIT 1
    `;
    const saldoAtual = Number(saldo[0]?.saldo ?? 0);
    if (saldoAtual < qtd) {
      const ehPedra = tipo_apontamento_id === 3;
      const unidade = ehPedra ? "UN" : "g";
      const fmt = (v: number) => ehPedra ? Math.round(v).toString() : v.toFixed(2);
      return NextResponse.json(
        { error: `Saldo insuficiente no Almoxarifado Central. Disponível: ${fmt(saldoAtual)}${unidade}, solicitado: ${fmt(qtd)}${unidade}.` },
        { status: 422 }
      );
    }
  }

  const rows = await sql`
    INSERT INTO alissonerp.apontamentos_pcp
      (tipo_apontamento_id, deposito_id, setor_id, insumo_id, pcp_id, qtd, foto_balanca)
    VALUES
      (${tipo_apontamento_id}, ${deposito_id}, ${setor_id ?? null}, ${insumo_id ?? null}, ${pcp_id}, ${qtd}, ${foto_balanca ?? null})
    RETURNING id
  `;

  // Tipo 8 (Entrada Outros Insumos): trigger não cria movimentação — fazemos explicitamente
  // SAÍDA Almoxarifado Central → ENTRADA depósito operador
  if (tipo_apontamento_id === 8 && insumo_id) {
    const [pcp] = await sql`
      SELECT ordem_id FROM alissonerp.pcp WHERE id = ${pcp_id} LIMIT 1
    `;
    await sql`
      SELECT alissonerp.fn_criar_par_movimentacao(
        ${insumo_id}::integer,
        ${qtd}::real,
        1,                     -- dep_origem = Almoxarifado Central
        NULL::integer,         -- set_origem
        ${deposito_id},        -- dep_destino = depósito do operador
        ${setor_id ?? null}::integer,
        'EOID'::alissonerp.enum_marcador_estoque,
        ${pcp.ordem_id ?? null}::integer,
        ${'Outros PCP #' + pcp_id}
      )
    `;
  }

  // Mover PCP para "em_andamento" se ainda estava em "novas_ordens"
  await sql`
    UPDATE alissonerp.pcp
    SET etapas = 'em_andamento', updated_at = NOW()
    WHERE id = ${pcp_id} AND etapas = 'novas_ordens'
  `;

  // Recalcular totais dist_* (fire-and-forget, não bloqueia resposta)
  recalcularTotaisPCP(pcp_id).catch(() => {});

  return NextResponse.json(rows[0], { status: 201 });
}
