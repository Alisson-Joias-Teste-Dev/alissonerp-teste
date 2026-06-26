/**
 * GET   /api/promocoes/[id]  - retorna campanha + itens (JOIN com public.produtos)
 * PATCH /api/promocoes/[id]  - edita campanha (apenas se situacao_efetiva='agendada')
 *                              corpo: { nome_campanha?, data_inicio?, data_fim?,
 *                                       observacao?, itens? (substitui se passado) }
 *
 * Bloqueia edicao se a promocao ja iniciou (ativa) ou foi encerrada/cancelada.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, AuthError, ForbiddenError } from "@/lib/auth-server";
import sql from "@/lib/db";
import { isFullAccess } from "@/lib/roles";
import { logAudit } from "@/lib/audit";
import {
  expandirItensComPais,
  checarConflitoPromocoes,
} from "@/lib/promocoes-helpers";
import { internalError } from "@/lib/api-error";
import { zodError } from "@/lib/schemas/common";

const PromocaoPatchSchema = z.object({
  nome_campanha: z.string().optional(),
  data_inicio: z.string().optional(),
  data_fim: z.string().optional(),
  observacao: z.string().nullable().optional(),
  max_parcelas_cartao: z.coerce.number().int().nullable().optional(),
  itens: z.array(z.object({
    produto_id: z.coerce.number().int().positive(),
    preco_promo: z.coerce.number(),
  })).optional(),
}).passthrough();

async function loadCampanha(id: number) {
  const [camp] = await sql<Array<{
    id: number;
    nome_campanha: string;
    data_inicio: string;
    data_fim: string;
    situacao_manual: string;
    observacao: string | null;
    criado_por: string;
    max_parcelas_cartao: number | null;
    criado_em: string;
    atualizado_em: string;
    situacao_efetiva: string;
  }>>`
    SELECT
      pp.id, pp.nome_campanha, pp.data_inicio, pp.data_fim,
      pp.situacao_manual, pp.observacao, pp.max_parcelas_cartao, pp.criado_por,
      pp.criado_em, pp.atualizado_em,
      CASE
        WHEN pp.situacao_manual = 'cancelada'        THEN 'cancelada'
        WHEN pp.situacao_manual = 'encerrada_manual' THEN 'encerrada'
        WHEN CURRENT_DATE > pp.data_fim              THEN 'encerrada'
        WHEN CURRENT_DATE < pp.data_inicio           THEN 'agendada'
        ELSE 'ativa'
      END AS situacao_efetiva
    FROM alissonerp.promocoes_produtos pp
    WHERE pp.id = ${id}
    LIMIT 1
  `;
  return camp ?? null;
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try { await requireAuth(req); }
  catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }
  // Leitura: qualquer usuario autenticado pode ver (decisao Jonathan).

  const { id } = await ctx.params;
  const idNum = Number(id);
  if (!Number.isFinite(idNum) || idNum <= 0) {
    return NextResponse.json({ error: "ID invalido" }, { status: 400 });
  }

  const camp = await loadCampanha(idNum);
  if (!camp) return NextResponse.json({ error: "Promocao nao encontrada" }, { status: 404 });

  const itens = await sql`
    SELECT
      pi.id,
      pi.produto_id,
      pi.preco_original,
      pi.preco_promo,
      p.sku,
      p.nome,
      p.preco_tiny,
      CASE WHEN pi.preco_original > 0
        THEN ROUND(((pi.preco_original - pi.preco_promo) / pi.preco_original) * 100, 2)
        ELSE 0
      END AS pct_desconto
    FROM alissonerp.promocao_itens pi
    LEFT JOIN public.produtos p ON p.id_produto = pi.produto_id
    WHERE pi.promocao_id = ${idNum}
    ORDER BY p.nome ASC NULLS LAST
  `;

  return NextResponse.json({ ...camp, itens });
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  let user;
  try { user = await requireAuth(req); }
  catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  if (!isFullAccess(user.role)) {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const idNum = Number(id);
  if (!Number.isFinite(idNum) || idNum <= 0) {
    return NextResponse.json({ error: "ID invalido" }, { status: 400 });
  }

  const camp = await loadCampanha(idNum);
  if (!camp) return NextResponse.json({ error: "Promocao nao encontrada" }, { status: 404 });
  if (camp.situacao_efetiva !== "agendada") {
    return NextResponse.json(
      { error: `Promocao com situacao '${camp.situacao_efetiva}' nao pode ser editada` },
      { status: 422 },
    );
  }

  const raw = await req.json().catch(() => null);
  if (raw === null) return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  const parsed = PromocaoPatchSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;

  if (body.max_parcelas_cartao != null) {
    const n = Number(body.max_parcelas_cartao);
    if (!Number.isInteger(n) || n < 1 || n > 12) {
      return NextResponse.json(
        { error: "max_parcelas_cartao deve ser inteiro entre 1 e 12 (ou null para sem restricao)" },
        { status: 400 },
      );
    }
  }

  const novaInicio = body.data_inicio ?? camp.data_inicio;
  const novaFim    = body.data_fim    ?? camp.data_fim;
  if (novaFim < novaInicio) {
    return NextResponse.json({ error: "data_fim deve ser >= data_inicio" }, { status: 400 });
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (sql as any).begin(async (tx: any) => {
      // Se itens foram passados, expande pais e checa conflito
      let itensExpandidos: Awaited<ReturnType<typeof expandirItensComPais>> | null = null;
      if (body.itens) {
        if (body.itens.length === 0) {
          throw new Error("itens deve ter pelo menos 1 elemento");
        }
        itensExpandidos = await expandirItensComPais(tx, body.itens);
      }

      // Determina os produto_ids a checar conflito:
      //  - se mudou itens -> usa novos
      //  - se mudou apenas datas -> usa itens atuais
      const idsParaCheckar: number[] = itensExpandidos
        ? itensExpandidos.map(i => i.produto_id)
        : (await tx<{ produto_id: number }[]>`
            SELECT produto_id FROM alissonerp.promocao_itens WHERE promocao_id = ${idNum}
          `).map((r: { produto_id: number }) => Number(r.produto_id));

      if (body.data_inicio || body.data_fim || itensExpandidos) {
        const conflitos = await checarConflitoPromocoes(
          tx, idsParaCheckar, novaInicio, novaFim, idNum,
        );
        if (conflitos.length > 0) {
          return { conflict: true, conflitos };
        }
      }

      // UPDATE cabecalho
      await tx`
        UPDATE alissonerp.promocoes_produtos
        SET
          nome_campanha       = ${body.nome_campanha ?? camp.nome_campanha},
          data_inicio         = ${novaInicio}::date,
          data_fim            = ${novaFim}::date,
          observacao          = ${body.observacao !== undefined ? body.observacao : camp.observacao},
          max_parcelas_cartao = ${body.max_parcelas_cartao !== undefined ? body.max_parcelas_cartao : camp.max_parcelas_cartao},
          atualizado_em       = NOW()
        WHERE id = ${idNum}
      `;

      // Substitui itens se passado
      if (itensExpandidos) {
        await tx`DELETE FROM alissonerp.promocao_itens WHERE promocao_id = ${idNum}`;
        for (const item of itensExpandidos) {
          await tx`
            INSERT INTO alissonerp.promocao_itens
              (promocao_id, produto_id, preco_original, preco_promo)
            VALUES
              (${idNum}, ${item.produto_id}, ${item.preco_original}, ${item.preco_promo})
          `;
        }
      }

      await logAudit(tx, {
        tabela: "promocoes_produtos",
        operacao: "UPDATE",
        registro_id: idNum,
        usuario_id: user.id,
        dados_antes: {
          nome_campanha: camp.nome_campanha,
          data_inicio: camp.data_inicio,
          data_fim: camp.data_fim,
          observacao: camp.observacao,
        },
        dados_depois: {
          nome_campanha: body.nome_campanha ?? camp.nome_campanha,
          data_inicio: novaInicio,
          data_fim: novaFim,
          observacao: body.observacao !== undefined ? body.observacao : camp.observacao,
          itens_alterados: !!itensExpandidos,
        },
      });

      return { conflict: false };
    });

    if (result.conflict) {
      return NextResponse.json(
        {
          error: "Produtos ja participam de outra promocao na mesma janela",
          conflitos: result.conflitos,
        },
        { status: 409 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return internalError("[PATCH /api/promocoes/:id]", err, "Erro ao editar promocao");
  }
}
