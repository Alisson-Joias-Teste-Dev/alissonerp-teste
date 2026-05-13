/**
 * POST /api/promocoes - cria campanha + itens (com expansao de produto pai)
 * GET  /api/promocoes - lista campanhas com situacao_efetiva e qtd_itens
 *
 * Permissao: full-access (admin, desenvolvedor, diretor) escreve; demais roles leem.
 * Conflito (1 produto = 1 promo agendada ativa): 409 com lista de conflitos.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { defineRoute } from "@/lib/api-handler";
import { requireAuth, AuthError, ForbiddenError } from "@/lib/auth-server";
import sql from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { ROLES_FULL_ACCESS } from "@/lib/roles";
import {
  expandirItensComPais,
  checarConflitoPromocoes,
} from "@/lib/promocoes-helpers";

// ── POST ──────────────────────────────────────────────────────────────────────

const ItemSchema = z.object({
  produto_id: z.number().int().positive(),
  preco_promo: z.number().nonnegative(),
});

const CreatePromoSchema = z.object({
  nome_campanha: z.string().min(1).max(200),
  data_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato YYYY-MM-DD"),
  data_fim:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato YYYY-MM-DD"),
  observacao:  z.string().nullable().optional(),
  itens:       z.array(ItemSchema).min(1),
});

export const POST = defineRoute<z.infer<typeof CreatePromoSchema>>({
  requireRoles: [...ROLES_FULL_ACCESS],
  inputSchema: CreatePromoSchema,
  handler: async (_req, { user, body }) => {
    if (body.data_fim < body.data_inicio) {
      return NextResponse.json(
        { error: "data_fim deve ser >= data_inicio" },
        { status: 400 },
      );
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (sql as any).begin(async (tx: any) => {
        // 1. Expande pais em filhos + faz snapshot do preco_original
        const itensExpandidos = await expandirItensComPais(tx, body.itens);
        if (itensExpandidos.length === 0) {
          throw new Error("Nenhum item valido para promocao apos expansao");
        }

        const produtoIds = itensExpandidos.map(i => i.produto_id);

        // 2. Check de conflito: nenhum produto pode estar em outra promo
        //    agendada com janela sobreposta.
        const conflitos = await checarConflitoPromocoes(
          tx, produtoIds, body.data_inicio, body.data_fim,
        );
        if (conflitos.length > 0) {
          return { conflict: true, conflitos };
        }

        // 3. INSERT campanha
        const [campanha] = await tx<{ id: number }[]>`
          INSERT INTO alissonerp.promocoes_produtos
            (nome_campanha, data_inicio, data_fim, observacao, criado_por)
          VALUES
            (${body.nome_campanha}, ${body.data_inicio}::date,
             ${body.data_fim}::date, ${body.observacao ?? null}, ${user.id}::uuid)
          RETURNING id
        `;

        // 4. INSERT bulk em promocao_itens
        for (const item of itensExpandidos) {
          await tx`
            INSERT INTO alissonerp.promocao_itens
              (promocao_id, produto_id, preco_original, preco_promo)
            VALUES
              (${campanha.id}, ${item.produto_id},
               ${item.preco_original}, ${item.preco_promo})
          `;
        }

        // 5. Audit (mesma transacao)
        await logAudit(tx, {
          tabela: "promocoes_produtos",
          operacao: "INSERT",
          registro_id: campanha.id,
          usuario_id: user.id,
          dados_depois: {
            nome_campanha: body.nome_campanha,
            data_inicio: body.data_inicio,
            data_fim: body.data_fim,
            itens_count: itensExpandidos.length,
          },
        });

        return {
          conflict: false,
          id: campanha.id,
          itens_count: itensExpandidos.length,
        };
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

      return NextResponse.json(
        {
          id: result.id,
          nome_campanha: body.nome_campanha,
          data_inicio: body.data_inicio,
          data_fim: body.data_fim,
          itens_count: result.itens_count,
        },
        { status: 201 },
      );
    } catch (err) {
      console.error("[POST /api/promocoes]", err);
      const msg = err instanceof Error ? err.message : "Erro ao criar promocao";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  },
});

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  // Leitura: qualquer usuario autenticado pode ver (decisao Jonathan).

  const sp = req.nextUrl.searchParams;
  const status = sp.get("status")?.trim() ?? "todas"; // ativa|agendada|encerrada|cancelada|todas
  const q       = sp.get("q")?.trim() ?? "";
  const page    = Math.max(1, Number(sp.get("page") ?? 1));
  const limit   = Math.min(100, Math.max(1, Number(sp.get("limit") ?? 20)));
  const offset  = (page - 1) * limit;

  const wBusca = q
    ? sql`AND pp.nome_campanha ILIKE ${"%" + q + "%"}`
    : sql``;

  // Calcula situacao_efetiva e filtra na propria query.
  // ativa = situacao_manual='agendada' AND CURRENT_DATE entre inicio e fim
  // agendada = situacao_manual='agendada' AND CURRENT_DATE < inicio
  // encerrada = situacao_manual='encerrada_manual' OR CURRENT_DATE > fim
  // cancelada = situacao_manual='cancelada'
  const wStatus =
    status === "ativa"     ? sql`AND pp.situacao_manual = 'agendada' AND CURRENT_DATE BETWEEN pp.data_inicio AND pp.data_fim` :
    status === "agendada"  ? sql`AND pp.situacao_manual = 'agendada' AND CURRENT_DATE < pp.data_inicio` :
    status === "encerrada" ? sql`AND (pp.situacao_manual = 'encerrada_manual' OR (pp.situacao_manual = 'agendada' AND CURRENT_DATE > pp.data_fim))` :
    status === "cancelada" ? sql`AND pp.situacao_manual = 'cancelada'` :
    sql``;

  try {
    const [countRow] = await sql<{ total: string }[]>`
      SELECT COUNT(*) AS total
      FROM alissonerp.promocoes_produtos pp
      WHERE TRUE ${wBusca} ${wStatus}
    `;
    const total = Number(countRow?.total ?? 0);
    const totalPages = Math.ceil(total / limit);

    const rows = await sql`
      SELECT
        pp.id,
        pp.nome_campanha,
        pp.data_inicio,
        pp.data_fim,
        pp.situacao_manual,
        pp.observacao,
        pp.criado_por,
        pp.criado_em,
        pp.atualizado_em,
        CASE
          WHEN pp.situacao_manual = 'cancelada'        THEN 'cancelada'
          WHEN pp.situacao_manual = 'encerrada_manual' THEN 'encerrada'
          WHEN CURRENT_DATE > pp.data_fim              THEN 'encerrada'
          WHEN CURRENT_DATE < pp.data_inicio           THEN 'agendada'
          ELSE 'ativa'
        END AS situacao_efetiva,
        COALESCE((SELECT COUNT(*) FROM alissonerp.promocao_itens pi WHERE pi.promocao_id = pp.id), 0)::int AS qtd_itens
      FROM alissonerp.promocoes_produtos pp
      WHERE TRUE ${wBusca} ${wStatus}
      ORDER BY pp.data_inicio DESC, pp.id DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    return NextResponse.json({ promocoes: rows, total, page, limit, totalPages });
  } catch (err) {
    console.error("[GET /api/promocoes]", err);
    return NextResponse.json({ error: "Erro ao listar promocoes" }, { status: 500 });
  }
}
