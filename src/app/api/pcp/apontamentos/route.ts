import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { recalcularTotaisPCP } from "@/lib/recalcular-totais-pcp";
import { createServerSupabase } from "@/lib/supabase/server";
import { getParametroNumber, PARAM } from "@/lib/parametros";
// REGRA DE NEGOCIO: saldo de estoque centralizado em src/lib/estoque-saldo.ts
// (pente-fino 10/08/2026, etapa 2) — nao reimplementar SUM(saldo) aqui.
import { buscarSaldoEstoque } from "@/lib/estoque-saldo";
import { logAudit } from "@/lib/audit";
import { zodError } from "@/lib/schemas/common";

/**
 * Schema de entrada do apontamento de PCP.
 *
 * O QUE FAZ: valida o corpo do POST antes de qualquer regra de negócio.
 *
 * O PORQUÊ do `qtd` ser opcional: existem DOIS jeitos de apontar.
 *   - Insumo comum (metal, outros): a tela manda `qtd` (a quantidade/peso apontado).
 *   - Pedra (tipos 3 e 6): desde a v2.14.0 a tela manda o PESO EM GRAMAS
 *     (`peso_g_pedra`) e NÃO manda `qtd` — o servidor é quem converte para
 *     quilates (ct) e decide o que gravar na coluna `qtd`.
 *   Exigir `qtd` aqui derrubava TODO apontamento de pedra com "Dados invalidos",
 *   antes mesmo de chegar nas travas abaixo — que são as que de fato sabem a regra
 *   ("pedra precisa de peso_g_pedra OU qtd" / "não-pedra precisa de qtd").
 *
 * IMPACTO se tirar o `.default(0)`: `qtd` viraria `undefined` e as travas
 * `if (!ehPedra && !qtd)` deixariam de barrar apontamento comum sem quantidade,
 * e o cálculo de saldo compararia contra `undefined`.
 */
const ApontPcpPostSchema = z.object({
  tipo_apontamento_id: z.coerce.number().int().positive(),
  deposito_id: z.coerce.number().int().positive(),
  setor_id: z.coerce.number().int().nullable().optional(),
  insumo_id: z.coerce.number().int().nullable().optional(),
  pcp_id: z.coerce.number().int().positive(),
  qtd: z.coerce.number().optional().default(0),
  foto_balanca: z.string().nullable().optional(),
  peso_g_pedra: z.coerce.number().nullable().optional(),
  // Enviado pela tela por conveniência, mas NÃO é usado: o peso em ct gravado é
  // sempre o recalculado no servidor (peso_ct_final), para o front não conseguir
  // forjar um valor de estoque.
  peso_ct: z.coerce.number().nullable().optional(),
  created_by: z.string().nullable().optional(),
}).passthrough();

// POST /api/pcp/apontamentos
export async function POST(req: NextRequest) {
  const raw = await req.json().catch(() => ({}));
  const parsed = ApontPcpPostSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const {
    tipo_apontamento_id,
    deposito_id,
    setor_id,
    insumo_id,
    pcp_id,
    qtd,
    foto_balanca,
    peso_g_pedra,
    created_by,
  } = parsed.data;

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

  const almoxarifadoId = await getParametroNumber(PARAM.ALMOXARIFADO_DEPOSITO_ID);

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

  /**
   * O QUE FAZ: barra o apontamento quando o Almoxarifado Central não tem o
   * insumo em estoque. Vale para os tipos que SAEM do almoxarifado (1, 2, 3, 8).
   *
   * O PORQUÊ da unidade: a vw_saldo_estoque soma as movimentações como elas
   * foram gravadas. Para pedra, o gatilho fn_processar_apontamento_pcp grava a
   * movimentação JÁ EM QUILATES (fn_criar_par_movimentacao(insumo, peso_ct),
   * migration 098) — então o saldo da view já está em ct e a comparação certa é
   * contra peso_ct_final, não contra o peso em gramas nem contra contagem de peças.
   *
   * IMPACTO se comparar com `qtd` aqui: para pedra, `qtd` é o peso em GRAMAS —
   * 5x menor que o ct correspondente. A trava deixaria passar apontamento sem
   * lastro e o saldo de pedra do almoxarifado ficaria negativo.
   *
   * NÃO consultar movimentacoes_estoque.peso_ct: essa coluna NÃO EXISTE (nenhuma
   * migration cria). Uma versão anterior desta trava fazia isso e derrubava a
   * rota com erro de SQL.
   */
  if ((tipo_apontamento_id === 1 || tipo_apontamento_id === 2 || tipo_apontamento_id === 3 || tipo_apontamento_id === 8) && insumo_id) {
    const saldoAtual = await buscarSaldoEstoque(sql, almoxarifadoId, insumo_id);
    const ehPedraCt = tipo_apontamento_id === 3 && peso_ct_final != null;
    const solicitado = ehPedraCt ? peso_ct_final! : qtd;
    if (saldoAtual < solicitado) {
      // ct para pedra pesada; "UN" no caminho antigo (pedra apontada por peça); g no resto.
      const unidade = ehPedraCt ? "ct" : tipo_apontamento_id === 3 ? "UN" : "g";
      const fmt = (v: number) =>
        ehPedraCt ? v.toFixed(4) : tipo_apontamento_id === 3 ? Math.round(v).toString() : v.toFixed(2);
      return NextResponse.json(
        { error: `Saldo insuficiente no Almoxarifado Central. Disponível: ${fmt(saldoAtual)}${unidade}, solicitado: ${fmt(solicitado)}${unidade}.` },
        { status: 422 }
      );
    }
  }

  // Para pedras: qtd = peso_g_pedra_final (backward compat) ou qtd original
  const qtdParaInserir = ehPedra && peso_g_pedra_final != null ? peso_g_pedra_final : qtd;

  const rows = await sql`
    INSERT INTO alissonerp.apontamentos_pcp
      (tipo_apontamento_id, deposito_id, setor_id, insumo_id, pcp_id, quantidade,
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
    const [parMov] = await sql`
      SELECT saida_id, entrada_id FROM alissonerp.fn_criar_par_movimentacao(
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
    // parMov.saida_id e parMov.entrada_id disponíveis para log/audit futuros
    // (capturados para rastreabilidade — uso completo vem na Story 3.3)
    void parMov;
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

  await logAudit(sql, {
    tabela: "apontamentos_pcp",
    operacao: "INSERT",
    registro_id: rows[0].id,
    usuario_id: created_by ?? null,
    dados_depois: { pcp_id, tipo_apontamento_id, deposito_id, insumo_id, qtd: qtdParaInserir },
  });

  return NextResponse.json(rows[0], { status: 201 });
}
