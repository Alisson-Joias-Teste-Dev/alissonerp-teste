import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";
import {
  LIMITS,
  checkArrayLength,
  checkStringLength,
  payloadTooLargeResponse,
} from "@/lib/payload-limits";
import { zodError } from "@/lib/schemas/common";
import { criarNotificacao } from "@/lib/notificacoes";
import { listarAprovadoresFreteAvulso } from "@/lib/entrega-venda";

const TarefaPostSchema = z.object({
  titulo: z.string().min(1, "obrigatório"),
  descricao: z.string().optional(),
  responsavel_id: z.string().optional(),
  prioridade: z.string().optional(),
  data_limite: z.string().optional(),
  ordem_id: z.coerce.number().int().optional(),
  ordem_ids: z.array(z.coerce.number().int()).optional(),
  peso_metal: z.coerce.number().optional(),
  venda_id: z.coerce.number().int().optional(),
  tags: z.array(z.string()).optional(),
  tipo: z.string().optional(),
}).passthrough();

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const responsavel = url.searchParams.get("responsavel_id");
  const criador = url.searchParams.get("criado_por");
  const prioridade = url.searchParams.get("prioridade");
  const ordem_id = url.searchParams.get("ordem_id");
  const venda_id = url.searchParams.get("venda_id");
  const tipo = url.searchParams.get("tipo");
  const tagsParam = url.searchParams.get("tags");
  const visao = url.searchParams.get("visao");
  const busca = url.searchParams.get("busca");

  const isAdmin = isFullAccess(usuario?.role);
  const userId = user.id;

  const tagsList = tagsParam ? tagsParam.split(",").map(t => t.trim()).filter(Boolean) : [];

  /**
   * REGRA DE NEGÓCIO (migration 346, modelo TAREFA/POOL — ADITIVO, escopado
   * SÓ para tipo='frete_avulso'): além de responsavel_id/criado_por, quem está
   * na chave de config `aprovadores_frete_avulso` também enxerga as tarefas de
   * frete avulso — é o pool que decide (qualquer um, não só o 1º gravado como
   * responsavel_id). Lida uma única vez por request (evita N+1 por linha).
   * NÃO afeta a visibilidade dos demais tipos de tarefa.
   * IMPACTO SE REMOVIDO: só o 1º aprovador da lista (responsavel_id) veria a
   * tarefa — os demais do pool nunca a encontrariam para decidir.
   */
  let isPoolFreteAvulso = false;
  if (!isAdmin) {
    // Fonte única (V3): listarAprovadoresFreteAvulso (@/lib/entrega-venda) —
    // antes essa mesma query estava duplicada aqui, na lib e no dispatcher.
    const listaPoolFrete = await listarAprovadoresFreteAvulso();
    isPoolFreteAvulso = listaPoolFrete.includes(userId);
  }

  const tarefas = await sql`
    SELECT
      t.id, t.titulo, t.descricao, t.prioridade, t.status, t.tipo,
      t.data_limite, t.ordem_id, t.ordem_ids, t.peso_metal, t.tags,
      t.venda_id, t.posicao,
      t.created_at, t.updated_at, t.concluida_em,
      t.responsavel_id, t.criado_por,
      ur.nome AS responsavel_nome,
      uc.nome AS criador_nome,
      o.numero_ordem
    FROM alissonerp.tarefas t
    LEFT JOIN alissonerp.usuarios ur ON ur.id = t.responsavel_id
    LEFT JOIN alissonerp.usuarios uc ON uc.id = t.criado_por
    LEFT JOIN alissonerp.ordens o ON o.id = t.ordem_id
    WHERE 1=1
      ${visao === "minhas"
          ? sql`AND (t.responsavel_id = ${userId}::uuid)`
          : visao === "time"
            ? sql``
            : !isAdmin
              ? sql`AND (t.responsavel_id = ${userId}::uuid OR t.criado_por = ${userId}::uuid OR (t.tipo = 'frete_avulso' AND ${isPoolFreteAvulso}::boolean))`
              : sql``}
      ${(visao === "aguardando_aprovacao" || visao === "aguardando")
        ? (isAdmin
            ? sql`AND t.status = 'aguardando_aprovacao'`
            : sql`AND t.status = 'aguardando_aprovacao' AND (t.responsavel_id = ${userId}::uuid OR (t.tipo = 'frete_avulso' AND ${isPoolFreteAvulso}::boolean))`)
        : sql``}
      ${visao === "concluidas" ? sql`AND t.status IN ('concluida', 'aprovada')` : sql``}
      ${visao === "pendentes" ? sql`AND t.status IN ('pendente', 'em_andamento', 'aguardando_aprovacao')` : sql``}
      ${visao === "vencidas" ? sql`AND (t.status = 'vencida' OR (t.data_limite < CURRENT_DATE AND t.status NOT IN ('concluida','cancelada','vencida','aprovada')))` : sql``}
      ${status && !visao ? sql`AND t.status = ${status}` : sql``}
      ${responsavel ? sql`AND t.responsavel_id = ${responsavel}::uuid` : sql``}
      ${criador ? sql`AND t.criado_por = ${criador}::uuid` : sql``}
      ${prioridade ? sql`AND t.prioridade = ${prioridade}` : sql``}
      ${ordem_id ? sql`AND t.ordem_id = ${Number(ordem_id)}` : sql``}
      ${venda_id ? sql`AND t.venda_id = ${Number(venda_id)}` : sql``}
      ${tipo ? sql`AND t.tipo = ${tipo}` : sql``}
      ${tagsList.length > 0 ? sql`AND t.tags && ${tagsList}` : sql``}
      ${busca ? sql`AND (t.titulo ILIKE ${'%' + busca + '%'} OR t.descricao ILIKE ${'%' + busca + '%'})` : sql``}
    ORDER BY
      CASE t.prioridade WHEN 'urgente' THEN 1 WHEN 'alta' THEN 2 WHEN 'media' THEN 3 ELSE 4 END,
      t.created_at DESC
    LIMIT 200
  `;

  /**
   * REGRA DE NEGÓCIO (migration 346, modelo TAREFA/POOL — ADITIVO, escopado
   * SÓ para tipo='frete_avulso'): expõe um flag calculado no servidor (em vez
   * de mandar a lista de UUIDs do pool pro client) para o TarefaDrawer decidir
   * se mostra os botões Aprovar/Rejeitar a um usuário que NÃO é o
   * responsavel_id da tarefa. Não é a autoridade final — o dispatcher
   * (PATCH /api/tarefas/[id]/aprovacao) sempre revalida no servidor.
   * IMPACTO SE REMOVIDO: pool decide certo no backend, mas o botão de decisão
   * não aparece pra quem não é o responsavel_id gravado na criação.
   */
  const tarefasComFlag = tarefas.map((t: Record<string, unknown>) => ({
    ...t,
    pode_decidir_pool: t.tipo === "frete_avulso" && (isAdmin || isPoolFreteAvulso),
  }));

  return NextResponse.json(tarefasComFlag);
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const raw = await req.json().catch(() => ({}));
  const parsed = TarefaPostSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;

  try {
    checkStringLength("titulo", body.titulo, LIMITS.TITULO_MAX);
    checkStringLength("descricao", body.descricao, LIMITS.DESCRICAO_LONGA_MAX);
    checkArrayLength("ordem_ids", body.ordem_ids, LIMITS.ORDENS_LOTE_MAX);
    checkArrayLength("tags", body.tags, 20);
  } catch (e) {
    const r = payloadTooLargeResponse(e);
    if (r) return r;
    throw e;
  }

  if (!body.titulo?.trim()) {
    return NextResponse.json({ error: "Título obrigatório" }, { status: 400 });
  }

  const [tarefa] = await sql`
    INSERT INTO alissonerp.tarefas
      (titulo, descricao, responsavel_id, criado_por, prioridade, data_limite,
       ordem_id, ordem_ids, peso_metal, venda_id, tags, tipo)
    VALUES (
      ${body.titulo.trim()},
      ${body.descricao ?? null},
      ${body.responsavel_id ?? null}::uuid,
      ${user.id}::uuid,
      ${body.prioridade ?? "media"},
      ${body.data_limite ?? null},
      ${body.ordem_id ?? null},
      ${body.ordem_ids ?? null},
      ${body.peso_metal ?? null},
      ${body.venda_id ?? null},
      ${body.tags ?? []},
      ${body.tipo ?? null}
    )
    RETURNING id, titulo, status, prioridade, tipo, created_at
  `;

  if (body.responsavel_id && body.responsavel_id !== user.id) {
    await criarNotificacao({
      usuarioId: body.responsavel_id,
      tipo: "tarefa",
      titulo: "Nova tarefa atribuída: " + body.titulo.trim(),
      mensagem: body.descricao ?? body.titulo.trim(),
      remetenteId: user.id,
      link: `/tarefas?abrir=${tarefa.id}`,
    }).catch(() => {});
  }

  return NextResponse.json(tarefa, { status: 201 });
}
