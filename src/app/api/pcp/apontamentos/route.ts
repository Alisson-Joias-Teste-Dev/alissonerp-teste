import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { recalcularTotaisPCP } from "@/lib/recalcular-totais-pcp";
import { createServerSupabase } from "@/lib/supabase/server";

// POST /api/pcp/apontamentos
export async function POST(req: NextRequest) {
  const {
    tipo_apontamento_id,
    deposito_id,
    setor_id,
    insumo_id,
    pcp_id,
    qtd,
    foto_balanca,
    // Sprint 3: novos campos para pedras (tipos 3/6)
    peso_g_pedra,
    created_by,
  } = await req.json() as {
    tipo_apontamento_id: number;
    deposito_id: number;
    setor_id: number | null;
    insumo_id: number | null;
    pcp_id: number;
    qtd: number;
    foto_balanca?: string | null;
    peso_g_pedra?: number | null;
    created_by?: string | null;
  };

  // Para tipos 3 e 6 (pedras): calcular peso_ct e peso_g_pedra_final
  const ehPedra = tipo_apontamento_id === 3 || tipo_apontamento_id === 6;
  let peso_g_pedra_final: number | null = null;
  let peso_ct_final: number | null = null;

  if (ehPedra) {
    if (peso_g_pedra != null && peso_g_pedra > 0) {
      // Novo modo: peso em gramas fornecido → calcular ct
      peso_g_pedra_final = peso_g_pedra;
      peso_ct_final = parseFloat((peso_g_pedra / 0.2).toFixed(4));
    } else if (qtd > 0 && insumo_id) {
      // Backward compat: qtd em unidades — buscar peso_pedra_ct do insumo
      const [ins] = await sql`
        SELECT COALESCE(peso_pedra_ct, 0)::float8 AS ppct,
               COALESCE(peso_pedra, 0)::float8     AS pp
        FROM alissonerp.insumos WHERE id = ${insumo_id} LIMIT 1
      `;
      if (ins) {
        const ppct = Number(ins.ppct ?? 0);
        const pp   = Number(ins.pp ?? 0);
        peso_g_pedra_final = parseFloat((qtd * pp).toFixed(4));
        peso_ct_final      = parseFloat((qtd * ppct).toFixed(4));
      }
    }
  }

  if (!tipo_apontamento_id || !deposito_id || !pcp_id) {
    return NextResponse.json(
      { error: "tipo_apontamento_id, deposito_id e pcp_id são obrigatórios" },
      { status: 400 }
    );
  }
  if (!ehPedra && !qtd) {
    return NextResponse.json(
      { error: "qtd é obrigatório para tipos não-pedra" },
      { status: 400 }
    );
  }
  if (ehPedra && !peso_g_pedra && !qtd) {
    return NextResponse.json(
      { error: "Para pedras (tipo 3/6): forneça peso_g_pedra ou qtd" },
      { status: 400 }
    );
  }

  // Guard ourives: só pode apontar em PCPs do seu depósito
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const [caller] = await sql`
      SELECT role, deposito_id FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
    `;
    const ROLES_VE_TUDO = ["admin", "desenvolvedor", "gerente_fabrica", "pcp", "gerente_loja"];
    if (caller && !ROLES_VE_TUDO.includes(caller.role as string) && caller.deposito_id != null) {
      const [pcpRow] = await sql`SELECT deposito_id FROM alissonerp.pcp WHERE id = ${pcp_id} LIMIT 1`;
      if (pcpRow && pcpRow.deposito_id !== caller.deposito_id) {
        return NextResponse.json({ error: "Ordem não pertence ao seu depósito" }, { status: 403 });
      }
    }
  }

  // Para tipo 2 (Entrada de Metal): se pcp.deposito_id está definido, body.deposito_id deve ser igual
  if (tipo_apontamento_id === 2) {
    const [pcpCheck] = await sql`
      SELECT p.deposito_id AS pcp_deposito_id, o.local_atual AS ordem_deposito_id
      FROM alissonerp.pcp p
      LEFT JOIN alissonerp.ordens o ON o.id = p.ordem_id
      WHERE p.id = ${pcp_id}
      LIMIT 1
    `;
    const depositoAtribuido = pcpCheck?.pcp_deposito_id ?? pcpCheck?.ordem_deposito_id;
    if (depositoAtribuido != null && depositoAtribuido !== deposito_id) {
      return NextResponse.json(
        { error: "Operador já atribuído. Use transferência para mudar." },
        { status: 400 }
      );
    }
  }

  // Validação de estoque para tipos 1, 2, 3 e 8 (todos saem do Almoxarifado Central)
  if ((tipo_apontamento_id === 1 || tipo_apontamento_id === 2 || tipo_apontamento_id === 3 || tipo_apontamento_id === 8) && insumo_id) {
    if (tipo_apontamento_id === 3 && peso_ct_final != null) {
      // Pedras: validar saldo em CT
      const saldoRows = await sql`
        SELECT COALESCE(SUM(entrada_ct), 0) - COALESCE(SUM(saida_ct), 0) AS saldo_ct
        FROM (
          SELECT
            CASE WHEN entrada > 0 THEN COALESCE(peso_ct, entrada * (
              SELECT COALESCE(peso_pedra_ct, 0) FROM alissonerp.insumos WHERE id = ${insumo_id} LIMIT 1
            )) ELSE 0 END AS entrada_ct,
            CASE WHEN saida > 0 THEN COALESCE(peso_ct, saida * (
              SELECT COALESCE(peso_pedra_ct, 0) FROM alissonerp.insumos WHERE id = ${insumo_id} LIMIT 1
            )) ELSE 0 END AS saida_ct
          FROM alissonerp.movimentacoes_estoque
          WHERE insumo_id = ${insumo_id} AND deposito_id = 1
        ) t
      `;
      const saldoCt = Number(saldoRows[0]?.saldo_ct ?? 0);
      if (saldoCt < peso_ct_final) {
        return NextResponse.json(
          { error: `Saldo insuficiente no Almoxarifado Central. Disponível: ${saldoCt.toFixed(4)}ct, solicitado: ${peso_ct_final.toFixed(4)}ct.` },
          { status: 422 }
        );
      }
    } else {
      const saldo = await sql`
        SELECT COALESCE(SUM(saldo), 0) AS saldo FROM alissonerp.vw_saldo_estoque
        WHERE deposito_id = 1 AND insumo_id = ${insumo_id}
      `;
      const saldoAtual = Number(saldo[0]?.saldo ?? 0);
      if (saldoAtual < qtd) {
        const unidade = tipo_apontamento_id === 3 ? "UN" : "g";
        const fmt = (v: number) => tipo_apontamento_id === 3 ? Math.round(v).toString() : v.toFixed(2);
        return NextResponse.json(
          { error: `Saldo insuficiente no Almoxarifado Central. Disponível: ${fmt(saldoAtual)}${unidade}, solicitado: ${fmt(qtd)}${unidade}.` },
          { status: 422 }
        );
      }
    }
  }

  // Para pedras: qtd = peso_g_pedra_final (backward compat) ou qtd original
  const qtdParaInserir = ehPedra && peso_g_pedra_final != null ? peso_g_pedra_final : qtd;

  const rows = await sql`
    INSERT INTO alissonerp.apontamentos_pcp
      (tipo_apontamento_id, deposito_id, setor_id, insumo_id, pcp_id, qtd,
       peso_g_pedra, peso_ct, foto_balanca, created_by)
    VALUES
      (${tipo_apontamento_id}, ${deposito_id}, ${setor_id ?? null}, ${insumo_id ?? null}, ${pcp_id},
       ${qtdParaInserir},
       ${peso_g_pedra_final ?? null},
       ${peso_ct_final ?? null},
       ${foto_balanca ?? null},
       ${created_by ?? null}::uuid)
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
        ${'Outros PCP #' + pcp_id},
        1                      -- local_estoque_id = Fabrica
      )
    `;
  }

  // Mover PCP para "em_andamento" se ainda estava em "novas_ordens"
  await sql`
    UPDATE alissonerp.pcp
    SET etapas = 'em_andamento', updated_at = NOW()
    WHERE id = ${pcp_id} AND etapas = 'novas_ordens'
  `;

  // Atribuir operador automaticamente no primeiro apontamento fora do Almoxarifado
  // Garante que pcp.deposito_id seja preenchido mesmo sem transferência formal
  if (deposito_id !== 1) {
    await sql`
      UPDATE alissonerp.pcp
      SET deposito_id = ${deposito_id}
      WHERE id = ${pcp_id}
        AND deposito_id IS NULL
    `;
  }

  // Recalcular totais dist_* (fire-and-forget, não bloqueia resposta)
  recalcularTotaisPCP(pcp_id).catch((err) => console.error('recalcularTotaisPCP falhou:', err));

  return NextResponse.json(rows[0], { status: 201 });
}
