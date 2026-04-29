import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { getParametroNumber, PARAM } from "@/lib/parametros";

// POST /api/distribuicao/apontamentos
// Tipos scope 'ambos' ou 'distribuicao': 1,2,3,5,6,8,9
// Trigger fn_processar_apontamento_dist (migration 020) executa CE automaticamente após INSERT.
export async function POST(req: NextRequest) {
  const {
    distribuicao_id, tipo_apontamento_id, deposito_id, setor_id,
    insumo_id, qtd, foto_balanca, user_id,
  } = await req.json() as {
    distribuicao_id: number;
    tipo_apontamento_id: number;
    deposito_id: number;
    setor_id: number | null;
    insumo_id: number | null;
    qtd: number;
    foto_balanca?: string | null;
    user_id?: string | null;
  };

  if (!distribuicao_id || !tipo_apontamento_id || !deposito_id || !qtd) {
    return NextResponse.json(
      { error: "distribuicao_id, tipo_apontamento_id, deposito_id e qtd são obrigatórios" },
      { status: 400 },
    );
  }

  const almoxarifadoId = await getParametroNumber(PARAM.ALMOXARIFADO_DEPOSITO_ID);

  // Validação de estoque no Almoxarifado Central para tipos que saem do almox
  // Tipos 1 (Aditivo), 2 (Entrada Metal), 3 (Entrada Pedra): saem do Almoxarifado
  if ((tipo_apontamento_id === 1 || tipo_apontamento_id === 2 || tipo_apontamento_id === 3) && insumo_id) {
    const saldo = await sql`
      SELECT COALESCE(SUM(saldo), 0) AS saldo FROM alissonerp.vw_saldo_estoque
      WHERE deposito_id = ${almoxarifadoId} AND insumo_id = ${insumo_id}
    `;
    const saldoAtual = Number(saldo[0]?.saldo ?? 0);
    if (saldoAtual < qtd) {
      const ehPedra = tipo_apontamento_id === 3;
      const unidade = ehPedra ? "UN" : "g";
      const fmt = (v: number) => ehPedra ? Math.round(v).toString() : v.toFixed(2);
      return NextResponse.json(
        { error: `Saldo insuficiente no Almoxarifado Central. Disponível: ${fmt(saldoAtual)}${unidade}, solicitado: ${fmt(qtd)}${unidade}.` },
        { status: 422 },
      );
    }
  }

  const rows = await sql`
    INSERT INTO alissonerp.apontamentos_distribuicao
      (distribuicao_id, tipo_apontamento_id, deposito_id, setor_id,
       insumo_id, qtd, foto_balanca, created_by)
    VALUES
      (${distribuicao_id}, ${tipo_apontamento_id}, ${deposito_id}, ${setor_id ?? null},
       ${insumo_id ?? null}, ${qtd}, ${foto_balanca ?? null}, ${user_id ?? null})
    RETURNING id
  `;

  // Trigger fn_processar_apontamento_dist executa CE + atualiza totais da distribuição

  return NextResponse.json(rows[0], { status: 201 });
}
