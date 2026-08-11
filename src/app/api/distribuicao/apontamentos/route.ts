import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { getParametroNumber, PARAM } from "@/lib/parametros";
// REGRA DE NEGOCIO: saldo de estoque centralizado em src/lib/estoque-saldo.ts
// (pente-fino 10/08/2026, etapa 2) — nao reimplementar SUM(saldo) aqui.
import { buscarSaldoEstoque } from "@/lib/estoque-saldo";
import { logAudit } from "@/lib/audit";
import { requireAuth, AuthError } from "@/lib/auth-server";
import { zodError } from "@/lib/schemas/common";

/**
 * Schema de entrada do apontamento de Distribuição.
 *
 * Espelha o de /api/pcp/apontamentos: `qtd` é opcional porque apontamento de
 * PEDRA (tipos 3 e 6) chega em PESO (gramas), não em quantidade de peças.
 * IMPACTO se voltar a ser obrigatório: todo apontamento de pedra é recusado
 * com "Dados invalidos" antes de chegar nas regras abaixo.
 */
const ApontDistPostSchema = z.object({
  distribuicao_id: z.coerce.number().int().positive(),
  tipo_apontamento_id: z.coerce.number().int().positive(),
  deposito_id: z.coerce.number().int().positive(),
  setor_id: z.coerce.number().int().nullable().optional(),
  insumo_id: z.coerce.number().int().nullable().optional(),
  qtd: z.coerce.number().optional().default(0),
  foto_balanca: z.string().nullable().optional(),
  peso_g_pedra: z.coerce.number().nullable().optional(),
  // Recebido, mas ignorado: o ct gravado é sempre o recalculado no servidor.
  peso_ct: z.coerce.number().nullable().optional(),
  user_id: z.string().nullable().optional(),
}).passthrough();

// POST /api/distribuicao/apontamentos
// Tipos scope 'ambos' ou 'distribuicao': 1,2,3,5,6,8,9
// Trigger fn_processar_apontamento_dist (migration 020) executa CE automaticamente após INSERT.
export async function POST(req: NextRequest) {
  let authUser: Awaited<ReturnType<typeof requireAuth>>;
  try {
    authUser = await requireAuth(req);
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = ApontDistPostSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const {
    distribuicao_id, tipo_apontamento_id, deposito_id, setor_id,
    insumo_id, qtd, foto_balanca, peso_g_pedra, user_id,
  } = parsed.data;

  /**
   * O QUE FAZ: converte o apontamento de pedra para quilates (ct).
   *
   * O PORQUÊ: pedra no sistema é controlada em ct, não em unidades. A balança dá
   * gramas; 1 ct = 0,2 g. Mesma conta e mesmos tipos (3 = Entrada de Pedra,
   * 6 = Retorno de Pedra) de /api/pcp/apontamentos — as duas telas TÊM que
   * calcular igual, senão o saldo de pedra diverge entre PCP e Distribuição.
   *
   * O caminho `else if` é compatibilidade com apontamentos antigos, que mandavam
   * quantidade de peças: nesse caso o peso vem do cadastro do insumo.
   *
   * IMPACTO se remover: `peso_ct` fica nulo, o gatilho fn_processar_apontamento_dist
   * não movimenta estoque de pedra e distribuicoes.total_pedras_ct fica zerado.
   */
  const ehPedra = tipo_apontamento_id === 3 || tipo_apontamento_id === 6;
  let peso_g_pedra_final: number | null = null;
  let peso_ct_final: number | null = null;

  if (ehPedra) {
    if (peso_g_pedra != null && peso_g_pedra > 0) {
      peso_g_pedra_final = peso_g_pedra;
      peso_ct_final = parseFloat((peso_g_pedra / 0.2).toFixed(4));
    } else if (qtd > 0 && insumo_id) {
      // Compatibilidade: qtd em unidades — buscar o peso unitário do insumo
      const [ins] = await sql`
        SELECT COALESCE(peso_pedra_ct, 0)::float8 AS ppct,
               COALESCE(peso_pedra, 0)::float8     AS pp
        FROM alissonerp.insumos WHERE id = ${insumo_id} LIMIT 1
      `;
      if (ins) {
        peso_g_pedra_final = parseFloat((qtd * Number(ins.pp ?? 0)).toFixed(4));
        peso_ct_final      = parseFloat((qtd * Number(ins.ppct ?? 0)).toFixed(4));
      }
    }
  }

  // Insumo comum sem quantidade não pode entrar (a coluna quantidade é NOT NULL e o
  // apontamento não teria significado).
  if (!ehPedra && !qtd) {
    return NextResponse.json(
      { error: "qtd é obrigatório para tipos não-pedra" },
      { status: 400 },
    );
  }
  if (ehPedra && !peso_g_pedra && !qtd) {
    return NextResponse.json(
      { error: "Para pedras (tipo 3/6): forneça peso_g_pedra ou qtd" },
      { status: 400 },
    );
  }

  const almoxarifadoId = await getParametroNumber(PARAM.ALMOXARIFADO_DEPOSITO_ID);

  /**
   * Validação de estoque no Almoxarifado Central — tipos 1 (Aditivo),
   * 2 (Entrada Metal) e 3 (Entrada Pedra) saem de lá.
   *
   * Para pedra a comparação é em QUILATES: o gatilho grava a movimentação em ct
   * (migration 098), então o saldo da view já está em ct. Antes daqui a rota
   * comparava o saldo contra `qtd` — que no fluxo por peso é o peso em GRAMAS,
   * 5x menor que o ct — e ainda rotulava a mensagem como "UN".
   * Mesma regra e mesma conta de /api/pcp/apontamentos: as duas telas precisam
   * enxergar o mesmo saldo, senão divergem.
   */
  if ((tipo_apontamento_id === 1 || tipo_apontamento_id === 2 || tipo_apontamento_id === 3) && insumo_id) {
    const saldoAtual = await buscarSaldoEstoque(sql, almoxarifadoId, insumo_id);
    const ehPedraCt = tipo_apontamento_id === 3 && peso_ct_final != null;
    const solicitado = ehPedraCt ? peso_ct_final! : qtd;
    if (saldoAtual < solicitado) {
      const unidade = ehPedraCt ? "ct" : tipo_apontamento_id === 3 ? "UN" : "g";
      const fmt = (v: number) =>
        ehPedraCt ? v.toFixed(4) : tipo_apontamento_id === 3 ? Math.round(v).toString() : v.toFixed(2);
      return NextResponse.json(
        { error: `Saldo insuficiente no Almoxarifado Central. Disponível: ${fmt(saldoAtual)}${unidade}, solicitado: ${fmt(solicitado)}${unidade}.` },
        { status: 422 },
      );
    }
  }

  // Pedra: a coluna quantidade (NOT NULL) guarda o peso em GRAMAS — mesma convenção da
  // apontamentos_pcp. O ct vai na coluna peso_ct, que é a que o gatilho lê.
  const qtdParaInserir = ehPedra && peso_g_pedra_final != null ? peso_g_pedra_final : qtd;

  const rows = await sql`
    INSERT INTO alissonerp.apontamentos_distribuicao
      (distribuicao_id, tipo_apontamento_id, deposito_id, setor_id,
       insumo_id, quantidade, peso_ct, foto_balanca, created_by)
    VALUES
      (${distribuicao_id}, ${tipo_apontamento_id}, ${deposito_id}, ${setor_id ?? null},
       ${insumo_id ?? null}, ${qtdParaInserir}, ${peso_ct_final ?? null},
       ${foto_balanca ?? null}, ${user_id ?? null})
    RETURNING id
  `;

  // Trigger fn_processar_apontamento_dist executa CE + atualiza totais da distribuição

  await logAudit(sql, {
    tabela: "apontamentos_distribuicao",
    operacao: "INSERT",
    registro_id: rows[0].id,
    usuario_id: user_id ?? null,
    dados_depois: {
      distribuicao_id, tipo_apontamento_id, deposito_id, insumo_id,
      qtd: qtdParaInserir, peso_ct: peso_ct_final,
    },
  });

  return NextResponse.json(rows[0], { status: 201 });
}
