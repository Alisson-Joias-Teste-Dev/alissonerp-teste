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

const ApontDistPostSchema = z.object({
  distribuicao_id: z.coerce.number().int().positive(),
  tipo_apontamento_id: z.coerce.number().int().positive(),
  deposito_id: z.coerce.number().int().positive(),
  setor_id: z.coerce.number().int().nullable().optional(),
  insumo_id: z.coerce.number().int().nullable().optional(),
  qtd: z.coerce.number().positive(),
  foto_balanca: z.string().nullable().optional(),
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
    insumo_id, qtd, foto_balanca, user_id,
  } = parsed.data;

  const almoxarifadoId = await getParametroNumber(PARAM.ALMOXARIFADO_DEPOSITO_ID);

  // Validação de estoque no Almoxarifado Central para tipos que saem do almox
  // Tipos 1 (Aditivo), 2 (Entrada Metal), 3 (Entrada Pedra): saem do Almoxarifado
  if ((tipo_apontamento_id === 1 || tipo_apontamento_id === 2 || tipo_apontamento_id === 3) && insumo_id) {
    const saldoAtual = await buscarSaldoEstoque(sql, almoxarifadoId, insumo_id);
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
       insumo_id, quantidade, foto_balanca, created_by)
    VALUES
      (${distribuicao_id}, ${tipo_apontamento_id}, ${deposito_id}, ${setor_id ?? null},
       ${insumo_id ?? null}, ${qtd}, ${foto_balanca ?? null}, ${user_id ?? null})
    RETURNING id
  `;

  // Trigger fn_processar_apontamento_dist executa CE + atualiza totais da distribuição

  await logAudit(sql, {
    tabela: "apontamentos_distribuicao",
    operacao: "INSERT",
    registro_id: rows[0].id,
    usuario_id: user_id ?? null,
    dados_depois: { distribuicao_id, tipo_apontamento_id, deposito_id, insumo_id, qtd },
  });

  return NextResponse.json(rows[0], { status: 201 });
}
