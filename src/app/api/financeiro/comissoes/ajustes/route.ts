import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";
import { internalError } from "@/lib/api-error";
import { logAudit } from "@/lib/audit";

// POST /api/financeiro/comissoes/ajustes
//
// REGRA DE NEGÓCIO: cria ajuste de comissão manual (positivo ou negativo).
// O que: insere um item avulso em um fechamento em rascunho,
// ou cria um novo fechamento com apenas o ajuste.
// Por que: permite corrigir erro de cálculo ou estornar comissão.
// Impacto se alterado: ajuste sem rastreio ou sem contrapartida.

const ROLES_FINANCEIRO = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja"];

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  if (!usuario || (!ROLES_FINANCEIRO.includes(usuario.role) && !isFullAccess(usuario.role))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const consultoraId = Number(body.consultora_id);
    const valor = Number(body.valor);
    const justificativa = String(body.justificativa ?? "").trim();
    const tipoItem = String(body.tipo_item ?? "ajuste_positivo");

    if (!consultoraId || !valor || valor <= 0 || !justificativa) {
      return NextResponse.json({ error: "consultora_id, valor (>0) e justificativa obrigatórios" }, { status: 400 });
    }

    if (!["ajuste_positivo", "ajuste_negativo", "estorno"].includes(tipoItem)) {
      return NextResponse.json({ error: "tipo_item deve ser ajuste_positivo, ajuste_negativo ou estorno" }, { status: 400 });
    }

    // Busca nome da consultora
    const [vendedor] = await sql`
      SELECT nome FROM alissonerp.vw_dash_vendedores WHERE id_vendedor = ${consultoraId}
    `;
    const nomeConsultora = vendedor?.nome ?? "Consultora";

    const hoje = new Date();
    const competencia = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
    const periodoInicio = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-01`;
    const periodoFim = hoje.toISOString().slice(0, 10);

    const valorFinal = tipoItem === "ajuste_negativo" || tipoItem === "estorno" ? -valor : valor;

    // Busca fechamento em rascunho para esta consultora no mês, ou cria um novo
    let [fechamento] = await sql`
      SELECT id FROM alissonerp.fechamentos_comissao
      WHERE consultora_id = ${consultoraId}
        AND status = 'rascunho'
        AND competencia = ${competencia}
      LIMIT 1
    `;

    if (!fechamento) {
      [fechamento] = await sql`
        INSERT INTO alissonerp.fechamentos_comissao
          (consultora_id, consultora_nome_snapshot, periodo_inicio, periodo_fim, competencia, valor_total, status, created_by)
        VALUES (
          ${consultoraId}, ${nomeConsultora}, ${periodoInicio}::date, ${periodoFim}::date,
          ${competencia}, 0, 'rascunho', ${user.id}::uuid
        )
        RETURNING id
      `;
    }

    // Insere o item de ajuste
    const [item] = await sql`
      INSERT INTO alissonerp.fechamento_comissao_itens
        (fechamento_id, consultora_id, data_venda, data_recebimento, forma_recebimento,
         valor_pagamento, valor_comissionavel, comissao_calculada, status, tipo_item)
      VALUES (
        ${fechamento.id}, ${consultoraId}, ${hoje.toISOString().slice(0, 10)}::date,
        ${hoje.toISOString().slice(0, 10)}::date, 'Ajuste Manual',
        ${valor}, ${valor}, ${valorFinal}, 'liberado', ${tipoItem}
      )
      RETURNING id
    `;

    // Recalcula valor total do fechamento
    await sql`
      UPDATE alissonerp.fechamentos_comissao SET
        valor_total = (
          SELECT COALESCE(SUM(
            CASE WHEN tipo_item IN ('ajuste_negativo', 'estorno') THEN -comissao_calculada
            ELSE comissao_calculada END
          ), 0)
          FROM alissonerp.fechamento_comissao_itens
          WHERE fechamento_id = ${fechamento.id}
            AND status NOT IN ('cancelado')
        )
      WHERE id = ${fechamento.id}
    `;

    await logAudit(sql, {
      tabela: "fechamento_comissao_itens",
      operacao: "INSERT",
      registro_id: item.id,
      usuario_id: user.id,
      dados_depois: { tipo_item: tipoItem, valor: valorFinal, justificativa },
    });

    return NextResponse.json({ id: item.id, fechamento_id: fechamento.id }, { status: 201 });
  } catch (err) {
    return internalError("[POST /api/financeiro/comissoes/ajustes]", err);
  }
}
