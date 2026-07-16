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

  // REGRA DE NEGÓCIO (Fase 5 conversão reversa): a tarefa de aprovação de
  // conversão reversa deve aparecer pra TODOS os aprovadores configurados em
  // Configurações → Aprovadores, não só pro responsável. Fragmento reutilizado
  // nos filtros de visibilidade abaixo.
  const reversaAprovadorCond = sql`(t.tipo = 'conversao_reversa' AND EXISTS (
    SELECT 1 FROM alissonerp.configuracoes_sistema cs
    WHERE cs.chave = 'aprovadores_conversao_reversa'
      AND ${userId}::text = ANY(string_to_array(cs.valor, ','))
  ))`;

  // REGRA DE NEGÓCIO (16/07 — decisão do Jonathan): "toda aprovação pode ter
  // mais de um aprovador, todos devem RECEBER a tarefa de aprovação — só
  // basta um aprovar". Sem isto, só quem virou `responsavel_id` (o 1º UUID
  // resolvido na criação — ver resolverAprovadores/criarTarefaAprovacao) via
  // a tarefa na fila; o 2º+ aprovador configurado na MESMA chave (MULTI,
  // separada por vírgula) não a via, mesmo podendo decidir (podeDecidir já
  // aceitava qualquer um da lista — só a LISTAGEM que só mostrava o 1º).
  // Generaliza o padrão que já existia só pra conversao_reversa (acima) pros
  // eventos que hoje suportam múltiplos aprovadores. Mapeamento tipo/tags →
  // chave de config conferido direto no código de cada criação (grep, 16/07)
  // — não adivinhado. Eventos fora desta lista (conversao_sku, precificacao,
  // limpeza_ouro, compra_metal, recebimento_metal) continuam só com
  // `responsavel_id` — não têm essa necessidade hoje (config de 1 aprovador
  // só), mas dá pra estender aqui do mesmo jeito quando precisar.
  // IMPACTO SE REMOVIDO: volta o problema — só o "sortudo" (1º da lista)
  // recebe a tarefa; os outros aprovadores configurados ficam cegos.
  const multiAprovadorCond = sql`(
    ${reversaAprovadorCond}
    OR (t.tipo = 'desconto_acima' AND EXISTS (
      SELECT 1 FROM alissonerp.configuracoes_sistema cs
      WHERE cs.chave = 'aprovador_desconto_padrao' AND ${userId}::text = ANY(string_to_array(cs.valor, ','))
    ))
    OR (t.tipo = 'cartao_desconto' AND EXISTS (
      SELECT 1 FROM alissonerp.configuracoes_sistema cs
      WHERE cs.chave = 'aprovador_cartao_desconto_padrao' AND ${userId}::text = ANY(string_to_array(cs.valor, ','))
    ))
    OR (t.tipo = 'entrega_sem_pagamento_total' AND EXISTS (
      SELECT 1 FROM alissonerp.configuracoes_sistema cs
      WHERE cs.chave = 'aprovador_entrega_sem_pagamento' AND ${userId}::text = ANY(string_to_array(cs.valor, ','))
    ))
    OR (t.tipo = 'compra_comercial' AND EXISTS (
      SELECT 1 FROM alissonerp.configuracoes_sistema cs
      WHERE cs.chave = 'aprovador_compra_comercial' AND ${userId}::text = ANY(string_to_array(cs.valor, ','))
    ))
    OR (t.tipo = 'conversao' AND EXISTS (
      SELECT 1 FROM alissonerp.configuracoes_sistema cs
      WHERE cs.chave = 'aprovador_conversao' AND ${userId}::text = ANY(string_to_array(cs.valor, ','))
    ))
    -- credito_loja: tags = ['credito_loja', 'gerente'|'diretor'] (vendas-credito-aprovar.ts) — tipo NULL.
    OR ('credito_loja' = ANY(t.tags) AND 'gerente' = ANY(t.tags) AND EXISTS (
      SELECT 1 FROM alissonerp.configuracoes_sistema cs
      WHERE cs.chave = 'aprovadora_credito_gerente' AND ${userId}::text = ANY(string_to_array(cs.valor, ','))
    ))
    OR ('credito_loja' = ANY(t.tags) AND 'diretor' = ANY(t.tags) AND EXISTS (
      SELECT 1 FROM alissonerp.configuracoes_sistema cs
      WHERE cs.chave = 'aprovador_credito_diretor' AND ${userId}::text = ANY(string_to_array(cs.valor, ','))
    ))
    -- devolucao: tags=['devolucao'] (etapa 1) vs tags=['devolucao','devolucao_estoque'] (etapa 2) — tipo NULL (devolucoes.ts).
    OR ('devolucao_estoque' = ANY(t.tags) AND EXISTS (
      SELECT 1 FROM alissonerp.configuracoes_sistema cs
      WHERE cs.chave = 'aprovador_devolucao_estoque' AND ${userId}::text = ANY(string_to_array(cs.valor, ','))
    ))
    OR ('devolucao' = ANY(t.tags) AND NOT ('devolucao_estoque' = ANY(t.tags)) AND EXISTS (
      SELECT 1 FROM alissonerp.configuracoes_sistema cs
      WHERE cs.chave = 'aprovador_devolucao' AND ${userId}::text = ANY(string_to_array(cs.valor, ','))
    ))
  )`;

  const tagsList = tagsParam ? tagsParam.split(",").map(t => t.trim()).filter(Boolean) : [];

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
      -- REGRA DE NEGÓCIO (Fase 5, Jonathan 15/07): a tarefa de conversão reversa
      -- SÓ é visível pros aprovadores configurados em Configurações → Aprovadores —
      -- NEM admin vê se não estiver na lista, e o solicitante também não a vê na
      -- fila (ele acompanha pelo selo "aguardando aprovação" na aba Ouro). Vale pra
      -- QUALQUER visão (por isso é global, fora dos filtros de visao/isAdmin abaixo).
      -- BUGFIX (16/07 — achado testando o front): 'conversao_reversa' <> t.tipo
      -- dá NULL (não FALSE) quando t.tipo IS NULL em SQL — e credito_loja e
      -- devolucao NUNCA setam t.tipo (só tags — ver vendas-credito-aprovar.ts/
      -- devolucoes.ts). Resultado: NULL OR FALSE = NULL = linha EXCLUÍDA da
      -- consulta pra QUALQUER usuário, inclusive admin (bypass de isAdmin nunca
      -- chegava a rodar — a linha já tinha sumido aqui). 2 tarefas de crédito
      -- reais ficaram invisíveis em PRODUÇÃO por causa disso (achado 16/07,
      -- corrigido na mesma sessão). COALESCE trata o NULL como "não é reversa".
      ${sql`AND (COALESCE(t.tipo, '') <> 'conversao_reversa' OR ${reversaAprovadorCond})`}
      ${visao === "minhas"
          ? sql`AND (t.responsavel_id = ${userId}::uuid)`
          : visao === "time"
            ? sql``
            : !isAdmin
              ? sql`AND (t.responsavel_id = ${userId}::uuid OR t.criado_por = ${userId}::uuid OR ${multiAprovadorCond})`
              : sql``}
      ${(visao === "aguardando_aprovacao" || visao === "aguardando")
        ? (isAdmin
            ? sql`AND t.status = 'aguardando_aprovacao'`
            : sql`AND t.status = 'aguardando_aprovacao' AND (t.responsavel_id = ${userId}::uuid OR ${multiAprovadorCond})`)
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

  return NextResponse.json(tarefas);
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
