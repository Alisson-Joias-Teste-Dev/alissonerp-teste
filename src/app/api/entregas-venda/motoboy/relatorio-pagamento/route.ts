/**
 * GET/POST /api/entregas-venda/motoboy/relatorio-pagamento
 *
 * REGRA DE NEGÓCIO (reforma 21/07/2026 — relatórios PERSISTIDOS, mockup
 * aprovado pelo Jonathan; ver docs/regras-negocio/entregas.md §12.8 e
 * migration 358): antes desta mudança, esta rota só tinha GET e CALCULAVA em
 * tempo real (por `entregadorId`+`inicio`+`fim`, sem gravar nada). Agora:
 *
 *   - `GET`  -> LISTA (paginada, 10/página) os relatórios já CRIADOS —
 *     aguardando pagamento e pagos, NUNCA somem da lista (histórico).
 *   - `POST` -> CRIA um relatório novo (era o botão "Gerar relatório", virou
 *     "Criar relatório"): recebe `motoboy_id`+`inicio`+`fim`, roda a MESMA
 *     classificação de sempre (`classificarCorridaMotoboy`, função pura em
 *     `src/lib/relatorio-pagamento-motoboy.ts`, inalterada) sobre as
 *     corridas confirmadas do período, e GRAVA um snapshot (cabeçalho +
 *     itens com decisão inicial) em `alissonerp.relatorios_pagamento_motoboy`
 *     / `..._itens`.
 *
 * O QUE NÃO MUDOU: fonte (`entregas_venda`, `forma_entrega='motoboy'`,
 * `situacao='confirmada'`), marco de corte (`MARCO_RELATORIO_PAGAMENTO_MOTOBOY`
 * = 20/07/2026), classificação Pagar/Revisar/Não pagar, papéis permitidos.
 *
 * IMPACTO SE ALTERADO: mexer no marco reabre corridas já pagas manualmente
 * (risco de pagamento em dobro); mexer na paginação sem atualizar o front
 * (Paginacao) desalinha "Mostrando X–Y de Z".
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { zodError } from "@/lib/schemas/common";
import {
  MARCO_RELATORIO_PAGAMENTO_MOTOBOY,
  periodoAntesDoMarco,
  classificarCorridaMotoboy,
  decisaoInicialFinanceiro,
  calcularTotalAjustado,
  type ClassificacaoCorridaMotoboy,
} from "@/lib/relatorio-pagamento-motoboy";
import {
  ROLES_PAGAMENTO_MOTOBOY,
  listarRelatoriosPagamentoMotoboy,
  PAGE_SIZE_RELATORIOS_PAGAMENTO_MOTOBOY,
} from "@/lib/pagamento-motoboy";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbTx = any;

const ROLES_PERMITIDOS = ROLES_PAGAMENTO_MOTOBOY;

const REGEX_DATA = /^\d{4}-\d{2}-\d{2}$/;

/** Valida papel do usuário logado — mesma checagem nos dois verbos (GET/POST). */
async function checarAcesso(): Promise<
  { ok: true; userId: string } | { ok: false; response: NextResponse }
> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) };
  }
  const [usuario] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario || !ROLES_PERMITIDOS.includes(usuario.role as string)) {
    return { ok: false, response: NextResponse.json({ error: "Sem permissão" }, { status: 403 }) };
  }
  return { ok: true, userId: user.id };
}

// ─────────────────────────────────────────────────────────────────────────
// GET — lista paginada (10/página) dos relatórios já criados.
// ─────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const acesso = await checarAcesso();
  if (!acesso.ok) return acesso.response;

  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const limit = PAGE_SIZE_RELATORIOS_PAGAMENTO_MOTOBOY;

  const { items, total } = await listarRelatoriosPagamentoMotoboy(sql, { page, limit });

  return NextResponse.json({
    items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
}

// ─────────────────────────────────────────────────────────────────────────
// POST — cria (persiste) um relatório novo para entregador+período.
// ─────────────────────────────────────────────────────────────────────────
const CriarRelatorioSchema = z.object({
  motoboy_id: z.string().min(1, "Entregador é obrigatório"),
  inicio: z.string().regex(REGEX_DATA, "Data de início inválida"),
  fim: z.string().regex(REGEX_DATA, "Data de fim inválida"),
});

export async function POST(req: NextRequest) {
  const acesso = await checarAcesso();
  if (!acesso.ok) return acesso.response;

  let raw: unknown;
  try { raw = await req.json(); } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const parsed = CriarRelatorioSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);

  const { motoboy_id, inicio, fim } = parsed.data;

  if (inicio > fim) {
    return NextResponse.json({ error: "A data de início não pode ser depois da data de fim" }, { status: 400 });
  }

  // REGRA DE NEGÓCIO: mesma defesa em profundidade do cálculo antigo — o
  // período não pode começar antes do marco (pagamento manual cobriu tudo
  // até 19/07/2026).
  if (periodoAntesDoMarco(inicio)) {
    return NextResponse.json(
      {
        error: `Corridas anteriores a ${MARCO_RELATORIO_PAGAMENTO_MOTOBOY.split("-").reverse().join("/")} já foram pagas e não entram neste relatório. Selecione um período a partir dessa data.`,
      },
      { status: 400 },
    );
  }

  // ─── Consulta ÚNICA (sem N+1): corridas confirmadas do entregador no
  // período — mesma consulta que antes vivia no GET (cálculo em tempo real),
  // agora só usada na CRIAÇÃO do relatório (§ acima).
  const rows: Record<string, unknown>[] = await sql`
    SELECT
      ev.id, ev.frete_motoboy, ev.venda_id, ev.is_avulso, ev.descricao_avulso,
      ve.situacao AS venda_situacao,
      (mb.id IS NOT NULL) AS tem_cadastro_motoboy,
      CASE WHEN ev.venda_id IS NOT NULL THEN
        ROW_NUMBER() OVER (PARTITION BY ev.venda_id ORDER BY ev.data_entrega_realizada ASC, ev.id ASC)
      ELSE 1 END AS ordem_na_venda
    FROM alissonerp.entregas_venda ev
    LEFT JOIN alissonerp.vendas_erp ve ON ve.id = ev.venda_id
    LEFT JOIN alissonerp.motoboys mb ON mb.user_id = ev.motoboy_id
    WHERE ev.motoboy_id = ${motoboy_id}::uuid
      AND ev.forma_entrega = 'motoboy'
      AND ev.situacao = 'confirmada'
      AND ev.data_entrega_realizada >= ${inicio}::date
      AND ev.data_entrega_realizada < (${fim}::date + interval '1 day')
    ORDER BY ev.data_entrega_realizada ASC, ev.id ASC
  `;

  if (rows.length === 0) {
    return NextResponse.json(
      { error: "Nenhuma corrida confirmada deste entregador no período selecionado — nada para criar." },
      { status: 400 },
    );
  }

  const corridas = rows.map((r) => {
    const vendaId = r.venda_id === null ? null : Number(r.venda_id);
    const { classificacao } = classificarCorridaMotoboy({
      vendaId,
      vendaSituacao: (r.venda_situacao as string | null) ?? null,
      isAvulso: Boolean(r.is_avulso),
      descricaoAvulso: (r.descricao_avulso as string | null) ?? null,
      temCadastroMotoboy: Boolean(r.tem_cadastro_motoboy),
      ordemNaVenda: Number(r.ordem_na_venda ?? 1),
    });
    return {
      entregaId: Number(r.id),
      freteMotoboy: Number(r.frete_motoboy ?? 0),
      classificacao: classificacao as ClassificacaoCorridaMotoboy,
      decisao: decisaoInicialFinanceiro(classificacao),
    };
  });

  // REGRA DE NEGÓCIO: total sugerido na criação = soma da decisão inicial
  // "pagar" (mesmo cálculo de `calcularTotalAjustado` usado hoje no front,
  // aqui aplicado ao estado INICIAL — nenhuma corrida do período é
  // "foi_pago" ainda relevante aqui, o relatório é novo).
  const totalSugerido = calcularTotalAjustado(
    corridas.map((c) => ({ decisaoFinal: c.decisao, freteMotoboy: c.freteMotoboy, foiPago: false })),
  );

  try {
    const [relatorio] = await sql.begin(async (tx: DbTx) => {
      const [cabecalho] = await tx`
        INSERT INTO alissonerp.relatorios_pagamento_motoboy
          (motoboy_id, data_inicio, data_fim, status, total_sugerido, created_by)
        VALUES
          (${motoboy_id}::uuid, ${inicio}::date, ${fim}::date, 'aguardando', ${totalSugerido}, ${acesso.userId}::uuid)
        RETURNING id, motoboy_id, data_inicio, data_fim, status, total_sugerido, created_at, pago_em
      `;

      for (const c of corridas) {
        await tx`
          INSERT INTO alissonerp.relatorios_pagamento_motoboy_itens
            (relatorio_id, entrega_id, classificacao, decisao, frete_motoboy)
          VALUES
            (${Number(cabecalho.id)}, ${c.entregaId}, ${c.classificacao}, ${c.decisao}, ${c.freteMotoboy})
        `;
      }

      return [cabecalho];
    });

    return NextResponse.json({
      ok: true,
      relatorio: {
        id: Number(relatorio.id),
        motoboy_id: relatorio.motoboy_id,
        data_inicio: relatorio.data_inicio,
        data_fim: relatorio.data_fim,
        status: relatorio.status,
        total_sugerido: Number(relatorio.total_sugerido),
        quantidade_corridas: corridas.length,
        created_at: relatorio.created_at,
        pago_em: relatorio.pago_em,
      },
      message: `Relatório criado com ${corridas.length} corrida(s). Total sugerido: R$ ${totalSugerido.toFixed(2)}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao criar relatório";
    console.error("[motoboy/relatorio-pagamento POST] Erro:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
