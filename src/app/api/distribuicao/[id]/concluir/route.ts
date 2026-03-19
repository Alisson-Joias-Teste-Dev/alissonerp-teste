import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { registrarQuebra } from "@/lib/registrar-quebra";

// POST /api/distribuicao/[id]/concluir
// Conclui a distribuição calculando o balanço do LOTE INTEIRO.
//
// Balanço:
//   ouro_entregue = (tipos 1+2 metal) − tipo 5 (retorno) dos apontamentos
//   ouro_pecas    = Σ peso_ouro_real de todas as ordens com saída
//   quebra_lote   = ouro_entregue − ouro_pecas
//     > 0 = QUEBRA (perdeu ouro)   < 0 = SALDO (sobrou)   0 = zerado
//
// Regra: quebra/saldo é do LOTE, NUNCA por ordem individual.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const distId = parseInt(id);
  if (isNaN(distId)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  // 1. Checar que a distribuição existe e está em andamento
  const [dist] = await sql`
    SELECT d.id, d.etapas::text, d.deposito_id, d.setor_id,
           dep.nome AS deposito_nome, s.nome AS setor_nome
    FROM alissonerp.distribuicoes d
    JOIN alissonerp.depositos dep ON dep.id = d.deposito_id
    LEFT JOIN alissonerp.setores s ON s.id = d.setor_id
    WHERE d.id = ${distId}
    LIMIT 1
  `;
  if (!dist) {
    return NextResponse.json({ error: "Distribuição não encontrada" }, { status: 404 });
  }
  if (dist.etapas === "concluido") {
    return NextResponse.json({ error: "Distribuição já está concluída" }, { status: 400 });
  }

  // 2. Verificar que TODAS as ordens têm saída registrada
  const ordens = await sql`
    SELECT id, ordens_id, data_baixa, peso_bruto, peso_ouro_real, sem_peso
    FROM alissonerp.distribuicao_ordens
    WHERE distribuicao_id = ${distId}
  `;
  if (ordens.length === 0) {
    return NextResponse.json({ error: "Distribuição sem ordens" }, { status: 400 });
  }
  const semSaida = ordens.filter((o) => !o.data_baixa);
  if (semSaida.length > 0) {
    return NextResponse.json(
      { error: `${semSaida.length} ordem(ns) ainda sem saída registrada` },
      { status: 422 },
    );
  }

  // 3. Calcular ouro entregue ao lote (dos apontamentos, categoria metal)
  //    tipos 1 (Aditivo) + 2 (Entrada) − tipo 5 (Retorno)
  const [metalLote] = await sql`
    SELECT
      COALESCE(SUM(CASE WHEN a.tipo_apontamento_id IN (1, 2) THEN a.qtd ELSE 0 END), 0)::float8 AS entrada,
      COALESCE(SUM(CASE WHEN a.tipo_apontamento_id = 5       THEN a.qtd ELSE 0 END), 0)::float8 AS retorno
    FROM alissonerp.apontamentos_distribuicao a
    JOIN alissonerp.insumos i ON i.id = a.insumo_id
    WHERE a.distribuicao_id = ${distId} AND i.categoria_id = 1
  `;
  const ouroEntregue = Number(metalLote.entrada) - Number(metalLote.retorno);

  // 4. Somar ouro nas peças e totais físicos
  //    Ordens sem_peso=true saíram sem ouro — excluir do somatório de ouro_pecas
  //    mas incluir no peso_final (peso_bruto=0, não afeta o total)
  const ordensComPeso = ordens.filter((o) => o.sem_peso !== true);
  const ouroNasPecas   = ordensComPeso.reduce((s, o) => s + Number(o.peso_ouro_real ?? 0), 0);
  const pesoFinalTotal  = ordens.reduce((s, o) => s + Number(o.peso_bruto ?? 0), 0);
  const qtdSemPeso      = ordens.filter((o) => o.sem_peso === true).length;
  const quebraLote    = ouroEntregue - ouroNasPecas;
  const pctQuebra     = ouroEntregue > 0 ? (quebraLote / ouroEntregue) * 100 : 0;

  const round3 = (v: number) => Math.round(v * 1000) / 1000;
  const round2 = (v: number) => Math.round(v * 100) / 100;

  // 5. Atualizar distribuição para concluída
  await sql`
    UPDATE alissonerp.distribuicoes
    SET
      etapas                = 'concluido',
      ouro_entregue         = ${round3(ouroEntregue)},
      ouro_pecas            = ${round3(ouroNasPecas)},
      quebra_lote           = ${round3(quebraLote)},
      peso_final            = ${round3(pesoFinalTotal)},
      pmc                   = ${round3(ouroNasPecas)},
      quebra                = ${round3(quebraLote)},
      porcentagem_de_quebra = ${round2(pctQuebra)},
      updated_at            = now()
    WHERE id = ${distId}
  `;

  // 6. Registrar quebra do operador do lote (só quando quebra_lote ≠ 0)
  if (round3(quebraLote) !== 0) {
    await registrarQuebra({
      tipo:            "conclusao_lote",
      distribuicao_id: distId,
      deposito_id:     dist.deposito_id as number,
      setor_id:        (dist.setor_id as number | null) ?? null,
      deposito_nome:   dist.deposito_nome as string,
      setor_nome:      (dist.setor_nome as string | null) ?? null,
      ouro_recebido:   round3(ouroEntregue),
      ouro_entregue:   round3(ouroNasPecas),
    });
  }

  // 7. CE de baixa definitiva da quebra — só se quebra_lote > 0
  //    Saída do depósito do operador, sem entrada no pote.
  //    Marcador 'QUEBRA_LOTE' identifica baixa de residual de distribuição.
  if (round3(quebraLote) > 0) {
    await sql`
      INSERT INTO alissonerp.movimentacoes_estoque
        (insumo_id, deposito_id, saida, marcador, created_at)
      VALUES
        (1, ${dist.deposito_id as number}, ${round3(quebraLote)},
         'QUEBRA_LOTE'::alissonerp.enum_marcador_estoque, NOW())
    `;
  }

  return NextResponse.json({
    ok: true,
    ouro_entregue:  ouroEntregue,
    ouro_pecas:     ouroNasPecas,
    quebra_lote:    quebraLote,
    porcentagem:    pctQuebra,
    peso_final:     pesoFinalTotal,
    ordens_total:   ordens.length,
    ordens_sem_peso: qtdSemPeso,
    ordens_com_peso: ordens.length - qtdSemPeso,
  });
}
