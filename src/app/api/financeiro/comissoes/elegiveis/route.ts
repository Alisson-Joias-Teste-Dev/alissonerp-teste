import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { SITUACOES_VENDA_ATIVAS } from "@/lib/vendas-situacoes";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";
import { internalError } from "@/lib/api-error";

// GET /api/financeiro/comissoes/elegiveis?consultora_id=&from=&to=
//
// REGRA DE NEGÓCIO: prévia dos pagamentos que podem entrar no fechamento.
// O que: lista pagamentos confirmados (sem VT e A Receber) que ainda
// não foram fechados, com cálculo da comissão proporcional.
// Por que: permite revisar antes de criar o fechamento.
// Impacto se alterado: risco de fechar valor incorreto.

const ROLES_FINANCEIRO = ["desenvolvedor", "admin", "administrativo", "financeiro", "gerente_loja"];

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  if (!usuario || (!ROLES_FINANCEIRO.includes(usuario.role) && !isFullAccess(usuario.role))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  try {
    const params = req.nextUrl.searchParams;
    const consultoraId = params.get("consultora_id");
    const from = params.get("from");
    const to = params.get("to");

    if (!consultoraId || !from || !to) {
      return NextResponse.json({ error: "consultora_id, from e to obrigatórios" }, { status: 400 });
    }

    const elegiveis = await sql`
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
        -- LEAST(...,1): trava o rateio em 100% -- uma venda cujo total_venda foi
        -- reduzido DEPOIS de um pagamento ja confirmado (desconto/ajuste tardio
        -- sem estorno) nao pode gerar comissao acima do teorico da venda.
        LEAST(ROUND(pv.valor / NULLIF(ve.total_venda, 0), 6), 1)::text AS percentual_rateio,
        -- comissionavel=false (Vale-Troca/Permuta/Ajuste Consultora) sempre R$0 — não é
        -- dinheiro novo. Ainda assim aparece na prévia (comissao_calculada=0), pra ficar
        -- visível/auditável em vez de sumir silenciosamente da consulta (08/07/2026).
        CASE WHEN pv.comissionavel THEN ROUND(ve.total_comissao * LEAST(pv.valor / NULLIF(ve.total_venda, 0), 1), 2) ELSE 0 END::text AS comissao_calculada,
        pv.comissionavel,
        c.nome AS cliente_nome
      FROM alissonerp.pagamentos_venda pv
      JOIN alissonerp.vendas_erp ve ON ve.id = pv.venda_id
        AND ve.status = ANY(${SITUACOES_VENDA_ATIVAS})
      LEFT JOIN public.contatos c ON c.id_contato = ve.cliente_id
      WHERE pv.status = 'confirmado'
        -- REGRA DE NEGÓCIO: comissiona toda forma JÁ RECEBIDA. 'A Receber' (crediário)
        -- comissiona quando CONFIRMADO (pago) — o pv.status='confirmado' acima já garante
        -- isso; A Receber PENDENTE continua de fora (ainda não entrou).
        -- IMPACTO se voltar a excluir 'A Receber': a consultora perde comissão sobre crediário
        -- que o cliente já pagou (ex.: venda 15346 ficava com R$0 mesmo quitada via Mercado Pago).
        AND ve.vendedor_id = ${Number(consultoraId)}
        -- data_confirmacao é timestamptz; "<= to::date" vira meia-noite e exclui
        -- pagamentos confirmados durante o próprio último dia do período.
        AND pv.data_confirmacao >= ${from}::date
        AND pv.data_confirmacao < ${to}::date + interval '1 day'
        AND pv.id NOT IN (
          SELECT pagamento_venda_id FROM alissonerp.fechamento_comissao_itens
          WHERE status NOT IN ('estornado', 'cancelado')
            AND pagamento_venda_id IS NOT NULL
        )
      ORDER BY pv.data_confirmacao DESC
    `;

    return NextResponse.json(elegiveis.map((e) => ({
      venda_id: Number(e.venda_id),
      numero_venda: e.numero_venda,
      pagamento_venda_id: Number(e.pagamento_venda_id),
      data_venda: e.data_venda,
      data_recebimento: e.data_recebimento,
      forma_recebimento: e.forma_recebimento,
      valor_pagamento: Number(e.valor_pagamento),
      valor_comissionavel: Number(e.valor_pagamento),
      percentual_rateio: Number(e.percentual_rateio),
      comissao_calculada: Number(e.comissao_calculada),
      comissionavel: Boolean(e.comissionavel),
      cliente_nome: e.cliente_nome,
    })));
  } catch (err) {
    return internalError("[GET /api/financeiro/comissoes/elegiveis]", err);
  }
}
