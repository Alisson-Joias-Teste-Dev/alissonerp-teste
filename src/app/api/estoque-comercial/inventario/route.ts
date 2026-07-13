import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";
import { ROLE_OPERADOR_INVENTARIO, ROLES_INVENTARIO_GERENTES, ROLES_INVENTARIO_VER, hasRole } from "@/lib/roles";
import { executarAbrirInventario, InventarioAcaoError } from "@/lib/inventario-acoes";
import { criarSolicitacaoInventario } from "@/lib/inventario-solicitacoes";
import { zodError } from "@/lib/schemas/common";

const InventarioPostSchema = z.object({
  local_estoque_id: z.coerce.number().int().positive(),
  obs: z.string().optional(),
  categoria: z.string().optional(),
}).passthrough();

// GET /api/estoque-comercial/inventario — listar inventários
// BLINDAGEM: restrito às roles de estoque/gerência — quantidades do
// estoque comercial não são dado público interno.
export async function GET(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!hasRole(user.role, ROLES_INVENTARIO_VER)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const url = new URL(req.url);
  const POR_PAGINA = 10;
  const pagina = Math.max(1, Math.trunc(Number(url.searchParams.get("pagina")) || 1));
  const offset = (pagina - 1) * POR_PAGINA;

  // Filtro de SITUAÇÃO: "aberto" = aberto OU em_contagem (ambos em andamento).
  const situacaoRaw = url.searchParams.get("situacao");
  const situacaoCond =
    situacaoRaw === "aberto"      ? sql`AND i.status IN ('aberto', 'em_contagem')`
    : situacaoRaw === "concluido" ? sql`AND i.status = 'concluido'`
    : situacaoRaw === "cancelado" ? sql`AND i.status = 'cancelado'`
    : sql``;

  // Filtro de PERÍODO pela data de abertura (ate INCLUSIVO → < ate + 1 dia).
  // Aceita só YYYY-MM-DD (ignora fora do formato — nunca injeta na query).
  const dataOk = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s)) ? s : null;
  const de = dataOk(url.searchParams.get("de"));
  const ate = dataOk(url.searchParams.get("ate"));
  const deCond  = de  ? sql`AND i.data_abertura >= ${de}::date` : sql``;
  const ateCond = ate ? sql`AND i.data_abertura < (${ate}::date + INTERVAL '1 day')` : sql``;

  // Total para a paginação (sem o LATERAL — barato).
  const [{ total }] = await sql`
    SELECT COUNT(*)::int AS total
    FROM alissonerp.inventarios_comercial i
    WHERE true ${situacaoCond} ${deCond} ${ateCond}
  `;

  // Página: filtra/ordena/limita PRIMEIRO (subquery) e só então o LATERAL roda —
  // assim as somas de peças processam só os 10 inventários da página.
  const items = await sql`
    SELECT
      i.id, i.local_estoque_id, le.nome AS local_nome,
      i.status, i.obs, i.data_abertura, i.data_conclusao,
      i.created_at, i.categoria,
      uc.email AS criado_por_email,
      uf.email AS concluido_por_email,
      -- PEÇA = unidades (o que a lista EXIBE); pecas_divergentes = faltando+excesso
      -- de item CONTADO (sem-contagem vira progresso). Sem o filtro de "peça pronta"
      -- do detalhe (custo alto na lista) — comportamento pré-existente da lista.
      agg.total_itens, agg.itens_contados, agg.itens_divergentes,
      agg.pecas_esperadas, agg.pecas_contadas, agg.pecas_divergentes
    FROM (
      SELECT *
      FROM alissonerp.inventarios_comercial i
      WHERE true ${situacaoCond} ${deCond} ${ateCond}
      ORDER BY i.created_at DESC
      LIMIT ${POR_PAGINA} OFFSET ${offset}
    ) i
    LEFT JOIN alissonerp.locais_estoque le ON le.id = i.local_estoque_id
    LEFT JOIN auth.users uc ON uc.id = i.created_by
    LEFT JOIN auth.users uf ON uf.id = i.concluido_por
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::int                                                   AS total_itens,
        COUNT(*) FILTER (WHERE ii.quantidade_contada IS NOT NULL)::int  AS itens_contados,
        COUNT(*) FILTER (WHERE ii.quantidade_contada IS NOT NULL AND ii.diferenca != 0)::int AS itens_divergentes,
        COALESCE(SUM(ii.quantidade_sistema), 0)::int                    AS pecas_esperadas,
        COALESCE(SUM(ii.quantidade_contada), 0)::int                    AS pecas_contadas,
        COALESCE(SUM(ABS(ii.diferenca)) FILTER (WHERE ii.quantidade_contada IS NOT NULL), 0)::int AS pecas_divergentes
      FROM alissonerp.itens_inventario_comercial ii
      WHERE ii.inventario_id = i.id
    ) agg ON true
    ORDER BY i.created_at DESC
  `;

  return NextResponse.json({ items, total, pagina, porPagina: POR_PAGINA });
}

// POST /api/estoque-comercial/inventario — abrir novo inventário
export async function POST(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;

  const isOperador = user.role === ROLE_OPERADOR_INVENTARIO;
  if (!isOperador && !hasRole(user.role, ROLES_INVENTARIO_GERENTES)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = InventarioPostSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { local_estoque_id, obs, categoria } = parsed.data;

  try {
    /**
     * OPERADOR DE INVENTÁRIO (v2.83.0): não abre direto — o pedido vira
     * tarefa de aprovação do administrador; só executa quando ele aprovar.
     */
    if (isOperador) {
      const [local] = await sql`SELECT nome FROM alissonerp.locais_estoque WHERE id = ${local_estoque_id}`;
      const resumo = [
        `Ação: ABRIR inventário`,
        `Local: ${local?.nome ?? local_estoque_id}`,
        categoria?.trim() ? `Categoria: ${categoria.trim()}` : null,
        obs ? `Obs: ${obs}` : null,
        "",
        "Ao aprovar, o sistema abre o inventário e gera a lista de contagem (peça pronta).",
      ].filter(Boolean).join("\n");
      const solic = await criarSolicitacaoInventario({
        tipoAcao: "abrir",
        payload: { local_estoque_id, obs: obs ?? null, categoria: categoria ?? null },
        resumo,
        user,
      });
      return NextResponse.json(
        { solicitado: true, ...solic, mensagem: "Pedido enviado para aprovação do administrador" },
        { status: 202 },
      );
    }

    const inv = await executarAbrirInventario({ local_estoque_id, obs, categoria, userId: user.id });
    return NextResponse.json({ id: inv.id, created_at: inv.created_at }, { status: 201 });
  } catch (e) {
    if (e instanceof InventarioAcaoError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
