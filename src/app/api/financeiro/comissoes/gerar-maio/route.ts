import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { SITUACOES_VENDA_ATIVAS } from "@/lib/vendas-situacoes";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";
import { internalError } from "@/lib/api-error";
import { logAudit } from "@/lib/audit";

// POST /api/financeiro/comissoes/gerar-maio
//
// REGRA DE NEGÓCIO: gera fechamentos de maio/2026 para TODAS as consultoras
// com pagamentos no período, mas APENAS para vendas com data_venda TAMBÉM em maio.
// O que: resolve o problema de migração — comissão de vendas ANTERIORES a maio
// já foi paga cheia no sistema antigo. Incluí-las de novo pagaria em dobro.
// Por que: A Receber de meses anteriores foi pago em maio, mas a comissão
// já havia sido paga integralmente. A regra "só data_venda no período" evita
// a duplicidade sem precisar de filtro manual.
// Impacto se alterado: pode pagar comissão em dobro para vendas antigas.

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
    const periodoInicio = "2026-05-01";
    const periodoFim = "2026-05-31";
    const competencia = "2026-05";

    // Busca vendedores com pagamentos elegíveis em maio
    // Onde TANTO data_confirmacao QUANTO data_venda são em maio
    const vendedores = await sql<Array<{ id: number; nome: string }>>`
      SELECT DISTINCT
        ve.vendedor_id AS id,
        vd.nome
      FROM alissonerp.pagamentos_venda pv
      JOIN alissonerp.vendas_erp ve ON ve.id = pv.venda_id
        AND ve.situacao = ANY(${SITUACOES_VENDA_ATIVAS})
      LEFT JOIN alissonerp.vw_dash_vendedores vd ON vd.id_vendedor = ve.vendedor_id
      WHERE pv.status = 'confirmado'
        -- A Receber (crediário) comissiona quando CONFIRMADO (pago); comissionavel=false
        -- (Vale-Troca/Permuta/Ajuste Consultora) nunca comissiona. Ver migration 341.
        AND pv.comissionavel = true
        AND pv.data_confirmacao >= ${periodoInicio}::date
        AND pv.data_confirmacao <= ${periodoFim}::date
        -- REGRA DE MIGRAÇÃO: só vendas com data_venda também em maio
        AND ve.data_venda >= ${periodoInicio}::date
        AND ve.data_venda <= ${periodoFim}::date
        AND ve.vendedor_id IS NOT NULL
        AND pv.id NOT IN (
          SELECT pagamento_venda_id FROM alissonerp.fechamento_comissao_itens
          WHERE status NOT IN ('estornado', 'cancelado')
            AND pagamento_venda_id IS NOT NULL
        )
      ORDER BY vd.nome
    `;

    if (vendedores.length === 0) {
      return NextResponse.json({ error: "Nenhuma consultora com pagamentos elegíveis em maio" }, { status: 400 });
    }

    const resultados: Array<{ consultora: string; valor_total: number; qtd_itens: number }> = [];
    const erros: string[] = [];

    for (const v of vendedores) {
      try {
        // Busca pagamentos elegíveis
        const elegiveis = await sql<Array<{
          venda_id: number;
          numero_venda: string;
          pagamento_venda_id: number;
          data_venda: string;
          data_recebimento: Date;
          forma_recebimento: string;
          valor_pagamento: string;
          total_venda: string;
          total_comissao: string;
          percentual_rateio: string;
          comissao_calculada: string;
          cliente_nome: string | null;
        }>>`
          SELECT
            ve.id AS venda_id,
            ve.numero_venda,
            pv.id AS pagamento_venda_id,
            ve.data_venda::text,
            pv.data_confirmacao::date AS data_recebimento,
            pv.forma AS forma_recebimento,
            pv.valor::text AS valor_pagamento,
            ve.total_venda::text,
            ve.total_comissao::text,
            ROUND(pv.valor / NULLIF(ve.total_venda, 0), 6)::text AS percentual_rateio,
            ROUND(ve.total_comissao * pv.valor / NULLIF(ve.total_venda, 0), 2)::text AS comissao_calculada,
            c.nome AS cliente_nome
          FROM alissonerp.pagamentos_venda pv
          JOIN alissonerp.vendas_erp ve ON ve.id = pv.venda_id
            AND ve.situacao = ANY(${SITUACOES_VENDA_ATIVAS})
          LEFT JOIN public.contatos c ON c.id_contato = ve.cliente_id
          WHERE pv.status = 'confirmado'
            AND pv.comissionavel = true
            AND ve.vendedor_id = ${v.id}
            AND pv.data_confirmacao >= ${periodoInicio}::date
            AND pv.data_confirmacao <= ${periodoFim}::date
            AND ve.data_venda >= ${periodoInicio}::date
            AND ve.data_venda <= ${periodoFim}::date
            AND pv.id NOT IN (
              SELECT pagamento_venda_id FROM alissonerp.fechamento_comissao_itens
              WHERE status NOT IN ('estornado', 'cancelado')
                AND pagamento_venda_id IS NOT NULL
            )
        `;

        if (elegiveis.length === 0) continue;

        const valorTotal = elegiveis.reduce((s, e) => s + Number(e.comissao_calculada), 0);

        // Verifica se já existe fechamento não-cancelado para esta consultora no período
        const [existente] = await sql`
          SELECT id FROM alissonerp.fechamentos_comissao
          WHERE consultora_id = ${v.id}
            AND competencia = ${competencia}
            AND status != 'cancelado'
          LIMIT 1
        `;
        if (existente) {
          erros.push(`${v.nome}: já existe fechamento para maio/2026`);
          continue;
        }

        // Cria fechamento
        const [fechamento] = await sql`
          INSERT INTO alissonerp.fechamentos_comissao
            (consultora_id, consultora_nome_snapshot, periodo_inicio, periodo_fim, competencia, valor_total, status, created_by)
          VALUES (
            ${v.id}, ${v.nome}, ${periodoInicio}::date, ${periodoFim}::date,
            ${competencia}, ${valorTotal}, 'rascunho', ${user.id}::uuid
          )
          RETURNING id
        `;

        // Cria itens
        for (const e of elegiveis) {
          await sql`
            INSERT INTO alissonerp.fechamento_comissao_itens
              (fechamento_id, venda_id, numero_venda_snapshot, pagamento_venda_id,
               consultora_id, cliente_nome_snapshot, data_venda, data_recebimento, forma_recebimento,
               valor_venda, valor_pagamento, valor_comissionavel, percentual_rateio,
               comissao_total_venda, comissao_calculada, status, tipo_item)
            VALUES (
              ${fechamento.id}, ${e.venda_id}, ${e.numero_venda}, ${e.pagamento_venda_id},
              ${v.id}, ${e.cliente_nome}, ${e.data_venda}::date, ${e.data_recebimento}::date, ${e.forma_recebimento},
              ${Number(e.total_venda)}, ${Number(e.valor_pagamento)}, ${Number(e.valor_pagamento)},
              ${Number(e.percentual_rateio)}, ${Number(e.total_comissao)},
              ${Number(e.comissao_calculada)}, 'liberado', 'normal'
            )
          `;
        }

        await logAudit(sql, {
          tabela: "fechamentos_comissao",
          operacao: "INSERT",
          registro_id: fechamento.id,
          usuario_id: user.id,
          dados_depois: { consultora_id: v.id, nome: v.nome, valor_total: valorTotal, qtd_itens: elegiveis.length, origem: "gerar-maio" },
        });

        resultados.push({ consultora: v.nome, valor_total: valorTotal, qtd_itens: elegiveis.length });
      } catch (err) {
        erros.push(`${v.nome}: ${err instanceof Error ? err.message : "erro interno"}`);
      }
    }

    return NextResponse.json({
      gerados: resultados,
      erros: erros.length > 0 ? erros : undefined,
    });
  } catch (err) {
    return internalError("[POST /api/financeiro/comissoes/gerar-maio]", err);
  }
}
