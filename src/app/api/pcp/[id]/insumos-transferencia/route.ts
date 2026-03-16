import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

// GET /api/pcp/[id]/insumos-transferencia
//
// Retorna os insumos pré-preenchidos para a transferência desta ordem PCP.
// Origem = ordens.local_atual (fonte de verdade — atualizada a cada transferência)
//
// Cenário 1 — deposito_id = 1 E dist_ouro_real > 0 (ordem no pote, veio da distribuição):
//   Insumos base = ouro da distribuição (dist_ouro_real) + pedras da distribuicao_saida_pedras
//   + aditivos (tipo 1) e pedras extras (tipo 3) apontados no PCP
//
// Cenário 2 — deposito_id ≠ 1 (ordem com operador):
//   Insumos = saldo apontamentos_pcp (todas as entradas − retornos) no depósito atual
//
// Cenário 3 — deposito_id = 1 E dist_ouro_real = 0 (PCP direto no pote):
//   Insumos = saldo apontamentos_pcp (tipo 2 = entrada direta)

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const pcpId = parseInt(id);
  if (isNaN(pcpId)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const [pcp] = await sql`
    SELECT p.id, p.ordem_id,
           COALESCE(p.dist_ouro_real, 0)::float8 AS dist_ouro_real,
           o.local_atual
    FROM alissonerp.pcp p
    JOIN alissonerp.ordens o ON o.id = p.ordem_id
    WHERE p.id = ${pcpId}
    LIMIT 1
  `;
  if (!pcp) {
    return NextResponse.json({ error: "PCP não encontrado" }, { status: 404 });
  }

  const ordemId        = pcp.ordem_id as number;
  // Arredonda pra 2 casas para evitar imprecisão float do PostgreSQL (ex: 0.579999983)
  const distOuroReal   = parseFloat(Number(pcp.dist_ouro_real ?? 0).toFixed(2));
  // Origem = ordens.local_atual (fonte de verdade)
  const depositoAtual  = Number(pcp.local_atual);
  // Cenário 1: ordem está no pote (Almox) e veio da distribuição → pré-preenche da dist
  // Cenário 2: ordem já está com um operador → pré-preenche do saldo movimentado pra ele
  const cenarioDistribuicao = depositoAtual === 1 && distOuroReal > 0;

  type InsumoItem = {
    insumo_id: number;
    nome: string;
    categoria_id: number;
    quantidade: number;
    unidade: string;
    peso_pedra?: number;
    origem: "distribuicao" | "pcp";
  };

  const insumos: InsumoItem[] = [];

  if (cenarioDistribuicao) {
    // Cenário 1: ordem está no pote → pré-preenche da distribuição

    // A) Ouro vindo da distribuição — insumo_id=1 (constraint imutável)
    insumos.push({
      insumo_id: 1,
      nome: "Ouro 18k Amarelo",
      categoria_id: 1,
      quantidade: distOuroReal,
      unidade: "g",
      origem: "distribuicao",
    });

    // B) Pedras usadas na distribuição desta ordem
    //    distribuicao_ordens.ordens_id (coluna verificada no código existente)
    const pedrasDist = await sql`
      SELECT
        dsp.insumo_id,
        i.nome,
        COALESCE(i.peso_pedra, 0)::float8 AS peso_pedra,
        dsp.qtd_utilizada AS quantidade
      FROM alissonerp.distribuicao_saida_pedras dsp
      JOIN alissonerp.insumos i ON i.id = dsp.insumo_id
      WHERE dsp.distribuicao_ordem_id = (
        SELECT do2.id
        FROM alissonerp.distribuicao_ordens do2
        WHERE do2.ordens_id = ${ordemId}
        ORDER BY do2.id DESC
        LIMIT 1
      )
      AND dsp.qtd_utilizada > 0
    `;

    for (const p of pedrasDist) {
      insumos.push({
        insumo_id: Number(p.insumo_id),
        nome: p.nome as string,
        categoria_id: 2,
        quantidade: Math.round(Number(p.quantidade)), // pedras: inteiro (UN)
        unidade: "un",
        peso_pedra: Number(p.peso_pedra),
        origem: "distribuicao",
      });
    }

    // C) Apontamentos PCP extras para cenário distribuição
    //    Tipo 2 (Entrada de Metal) é do lote → EXCLUIR; só aditivos (tipo 1) e pedras (tipo 3)
    const apontamentosSaldo = await sql`
      SELECT
        a.insumo_id,
        i.nome,
        i.categoria_id,
        COALESCE(i.peso_pedra, 0)::float8 AS peso_pedra,
        COALESCE(SUM(CASE
          WHEN a.tipo_apontamento_id = 1 THEN a.qtd
          WHEN a.tipo_apontamento_id = 3 THEN a.qtd
          ELSE 0
        END), 0)
        - COALESCE(SUM(CASE
          WHEN a.tipo_apontamento_id IN (5, 6) THEN a.qtd
          ELSE 0
        END), 0) AS saldo
      FROM alissonerp.apontamentos_pcp a
      JOIN alissonerp.insumos i ON i.id = a.insumo_id
      WHERE a.pcp_id = ${pcpId}
        AND i.categoria_id IN (1, 2)
        AND a.insumo_id IS NOT NULL
      GROUP BY a.insumo_id, i.nome, i.categoria_id, i.peso_pedra
      HAVING
        COALESCE(SUM(CASE
          WHEN a.tipo_apontamento_id = 1 THEN a.qtd
          WHEN a.tipo_apontamento_id = 3 THEN a.qtd
          ELSE 0
        END), 0)
        - COALESCE(SUM(CASE
          WHEN a.tipo_apontamento_id IN (5, 6) THEN a.qtd
          ELSE 0
        END), 0) > 0
    `;

    for (const ap of apontamentosSaldo) {
      const saldo    = Number(ap.saldo);
      if (saldo <= 0) continue;
      const insumoId = Number(ap.insumo_id);
      const catId    = Number(ap.categoria_id);
      const existing = insumos.find((i) => i.insumo_id === insumoId);
      if (existing) {
        const raw = existing.quantidade + saldo;
        existing.quantidade = catId === 1 ? parseFloat(raw.toFixed(2)) : Math.round(raw);
      } else {
        insumos.push({
          insumo_id:    insumoId,
          nome:         ap.nome as string,
          categoria_id: catId,
          quantidade:   catId === 1 ? parseFloat(saldo.toFixed(2)) : Math.round(saldo),
          unidade:      catId === 1 ? "g" : "un",
          peso_pedra:   Number(ap.peso_pedra),
          origem:       "pcp",
        });
      }
    }
  } else {
    // Cenário 2: ordem está com operador → pré-preenche do saldo movimentado (TED de entrada)
    //   Saldo = entradas TED pro depositoAtual − saídas TED do depositoAtual (retransferências)
    const apontamentosSaldo = await sql`
      SELECT
        a.insumo_id,
        i.nome,
        i.categoria_id,
        COALESCE(i.peso_pedra, 0)::float8 AS peso_pedra,
        COALESCE(SUM(CASE WHEN a.tipo_apontamento_id = 1 THEN a.qtd ELSE 0 END), 0)
        + COALESCE(SUM(CASE WHEN a.tipo_apontamento_id = 2 THEN a.qtd ELSE 0 END), 0)
        + COALESCE(SUM(CASE WHEN a.tipo_apontamento_id = 3 THEN a.qtd ELSE 0 END), 0)
        - COALESCE(SUM(CASE WHEN a.tipo_apontamento_id IN (5, 6) THEN a.qtd ELSE 0 END), 0)
        AS saldo
      FROM alissonerp.apontamentos_pcp a
      JOIN alissonerp.insumos i ON i.id = a.insumo_id
      WHERE a.pcp_id = ${pcpId}
        AND i.categoria_id IN (1, 2)
        AND a.insumo_id IS NOT NULL
      GROUP BY a.insumo_id, i.nome, i.categoria_id, i.peso_pedra
      HAVING
        COALESCE(SUM(CASE WHEN a.tipo_apontamento_id = 1 THEN a.qtd ELSE 0 END), 0)
        + COALESCE(SUM(CASE WHEN a.tipo_apontamento_id = 2 THEN a.qtd ELSE 0 END), 0)
        + COALESCE(SUM(CASE WHEN a.tipo_apontamento_id = 3 THEN a.qtd ELSE 0 END), 0)
        - COALESCE(SUM(CASE WHEN a.tipo_apontamento_id IN (5, 6) THEN a.qtd ELSE 0 END), 0)
        > 0
    `;

    for (const ap of apontamentosSaldo) {
      const saldo  = Number(ap.saldo);
      if (saldo <= 0) continue;
      const catId  = Number(ap.categoria_id);
      insumos.push({
        insumo_id:    Number(ap.insumo_id),
        nome:         ap.nome as string,
        categoria_id: catId,
        quantidade:   catId === 1 ? parseFloat(saldo.toFixed(2)) : Math.round(saldo),
        unidade:      catId === 1 ? "g" : "un",
        peso_pedra:   Number(ap.peso_pedra),
        origem:       "pcp",
      });
    }

    // Cenário 2 com dist: operador recebeu o ouro via TED (1ª transferência).
    // dist_ouro_real não aparece em apontamentos_pcp → adicionar ao ouro manualmente.
    if (distOuroReal > 0) {
      const ouro = insumos.find((i) => i.insumo_id === 1);
      if (ouro) {
        ouro.quantidade = parseFloat((ouro.quantidade + distOuroReal).toFixed(2));
      } else {
        insumos.push({
          insumo_id:    1,
          nome:         "Ouro 18k Amarelo",
          categoria_id: 1,
          quantidade:   distOuroReal,
          unidade:      "g",
          origem:       "distribuicao",
        });
      }
    }
  }

  // Busca nome do depósito de origem para exibir no modal
  // Almox (ID=1) → nome fixo; outros → lookup
  let depositoOrigemNome: string | null = null;
  if (depositoAtual === 1) {
    depositoOrigemNome = "Almoxarifado Central";
  } else {
    const [dep] = await sql`
      SELECT nome FROM alissonerp.depositos WHERE id = ${depositoAtual} LIMIT 1
    `;
    depositoOrigemNome = dep?.nome as string ?? null;
  }

  return NextResponse.json({
    insumos,
    veio_da_distribuicao: cenarioDistribuicao,
    deposito_origem_id:   depositoAtual,
    deposito_origem_nome: depositoOrigemNome,
  });
}
