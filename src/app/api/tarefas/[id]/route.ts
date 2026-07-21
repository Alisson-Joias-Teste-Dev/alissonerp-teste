import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";
import { internalError } from "@/lib/api-error";
import { zodError } from "@/lib/schemas/common";
import { criarNotificacao } from "@/lib/notificacoes";
import { podeDecidir, eventoDaTarefa } from "@/lib/aprovacoes";

const TarefaPatchSchema = z.object({
  titulo: z.string().optional(),
  descricao: z.string().optional(),
  responsavel_id: z.string().nullable().optional(),
  prioridade: z.string().optional(),
  status: z.string().optional(),
  data_limite: z.string().nullable().optional(),
  ordem_id: z.coerce.number().int().nullable().optional(),
  ordem_ids: z.array(z.coerce.number().int()).nullable().optional(),
  peso_metal: z.coerce.number().nullable().optional(),
  tags: z.array(z.string()).optional(),
  tipo: z.string().optional(),
  motivo_delegacao: z.string().optional(),
}).passthrough();

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const tarefaId = Number(id);
  if (isNaN(tarefaId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  try {
    const [tarefa] = await sql`
      SELECT
        t.id, t.titulo, t.descricao, t.prioridade, t.status, t.tipo,
        t.data_limite, t.ordem_id, t.ordem_ids, t.peso_metal, t.tags,
        t.venda_id, t.posicao,
        t.responsavel_id, t.criado_por,
        t.created_at, t.updated_at, t.concluida_em,
        ur.nome AS responsavel_nome, uc.nome AS criador_nome, o.numero_ordem,
        ve.aprovacao_credito_tipo, ve.situacao AS venda_situacao
      FROM alissonerp.tarefas t
      LEFT JOIN alissonerp.usuarios ur ON ur.id = t.responsavel_id
      LEFT JOIN alissonerp.usuarios uc ON uc.id = t.criado_por
      LEFT JOIN alissonerp.ordens o ON o.id = t.ordem_id
      LEFT JOIN alissonerp.vendas_erp ve ON ve.id = t.venda_id
      WHERE t.id = ${tarefaId}
    `;
    if (!tarefa) return NextResponse.json({ error: "Tarefa não encontrada" }, { status: 404 });

    const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
    const isOwner = tarefa.responsavel_id === user.id || tarefa.criado_por === user.id;
    const isAdminOuDev = isFullAccess(usuario?.role);

    // REGRA DE NEGÓCIO (20/07 — correção do 2º/3º aprovador configurado): este
    // GET travava em 403 pra quem não fosse responsavel_id/criado_por/admin,
    // mesmo quando esse usuário já era autorizado a DECIDIR a tarefa via PATCH
    // /api/tarefas/[id]/aprovacao (podeDecidir, config-first — ver comentário
    // do "BUG 1" em aprovacao/route.ts). Resultado: o 2º/3º aprovador de uma
    // chave com múltiplos UUIDs (cartao_desconto, entrega_sem_pagamento,
    // compra_comercial, desconto_padrao, credito_diretor,
    // conversao_reversa) via a tarefa na fila (multiAprovadorCond já liberava
    // a LISTAGEM, 16/07) mas tomava 403 ao abrir a aba Comentários.
    // O QUÊ: refaz aqui o MESMO cálculo do PATCH — busca tipo/tags/venda,
    //   descobre o evento do CATÁLOGO (eventoDaTarefa) e pergunta a
    //   podeDecidir se ESTE usuário está na config atual do evento.
    // POR QUÊ: a interface tem que refletir a autorização que o PATCH já
    //   concede — não pode ficar mais restritiva (nem mais permissiva) que o
    //   portão real que decide.
    // IMPACTO SE REMOVIDO: volta o 403 pro 2º/3º aprovador configurado (ele
    //   consegue aprovar/rejeitar pela API, mas não consegue nem abrir a
    //   tarefa pra ler o histórico/comentários antes de decidir).
    const tagsRaw = tarefa.tags;
    const tags: string[] = Array.isArray(tagsRaw)
      ? tagsRaw
      : (typeof tagsRaw === "string" ? tagsRaw.replace(/[{}"]/g, "").split(",").filter(Boolean) : []);
    const evento = eventoDaTarefa(tarefa.tipo ?? null, tags, tarefa);
    const podeDecidirTarefa = evento
      ? (await podeDecidir({ id: user.id, role: usuario?.role ?? null }, evento)).pode
      : false;

    if (!isOwner && !isAdminOuDev && !podeDecidirTarefa) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    // REGRA DE NEGÓCIO: `pode_decidir` no payload espelha a MESMA condição de
    // autorização do PATCH (ehAprovadorGravado || (evento && podeDecidir)) —
    // não só a parte de config (podeDecidirTarefa), mas também o caso de o
    // usuário ser o aprovador GRAVADO na aprovação pendente (tarefas sem
    // evento mapeado, ex. aprovação ad-hoc criada por POST .../aprovacao).
    // O TarefaDrawer usa este campo, em OR com `a.aprovador_id === currentUserId`
    // (que ele já checa por linha de aprovação), pra decidir se mostra os
    // botões Aprovar/Rejeitar.
    const [aprovacaoPendente] = await sql`
      SELECT aprovador_id FROM alissonerp.aprovacoes_tarefa
      WHERE tarefa_id = ${tarefaId} AND status = 'pendente'
      LIMIT 1
    `;
    const isOwnerDaAprovacao = String(aprovacaoPendente?.aprovador_id ?? "") === user.id;

    const comentarios = await sql`
      SELECT c.*, u.nome AS autor_nome
      FROM alissonerp.comentarios_tarefa c
      LEFT JOIN alissonerp.usuarios u ON u.id = c.autor_id
      WHERE c.tarefa_id = ${tarefaId}
      ORDER BY c.created_at ASC
    `;

    return NextResponse.json({
      ...tarefa,
      comentarios,
      pode_decidir: podeDecidirTarefa || isOwnerDaAprovacao,
    });
  } catch (err) {
    return internalError(`[GET /api/tarefas/${tarefaId}]`, err);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const tarefaId = Number(id);
  if (isNaN(tarefaId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const [tarefaPatch] = await sql`
    SELECT responsavel_id, criado_por, status, titulo
    FROM alissonerp.tarefas WHERE id = ${tarefaId} LIMIT 1
  `;
  if (!tarefaPatch) return NextResponse.json({ error: "Tarefa não encontrada" }, { status: 404 });

  const [usuarioPatch] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  const isOwner = tarefaPatch.responsavel_id === user.id || tarefaPatch.criado_por === user.id;

  if (!isOwner && !isFullAccess(usuarioPatch?.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const raw = await req.json().catch(() => ({}));

  // REGRA DE NEGOCIO (Fase 4, item 2):
  // - O que faz: bloqueia marcar "aprovada"/"rejeitada" por este PATCH genérico quando a tarefa é uma
  //   aprovação formal (tem linha em aprovacoes_tarefa) — obriga a decisão a passar pelo despachante
  //   dedicado (POST /api/tarefas/[id]/aprovacao).
  // - Por que: este endpoint só atualiza a tarefa, sem rodar os efeitos colaterais (comissão, estoque,
  //   crédito, contas a pagar) que o despachante roda — decidir por aqui deixava a tarefa marcada como
  //   decidida sem nenhum efeito ter acontecido.
  // - Impacto se alterado/removido: reabre o backdoor — qualquer dono/full-access pode "aprovar" uma
  //   aprovação formal sem os efeitos de negócio associados rodarem.
  if (raw?.status === "aprovada" || raw?.status === "rejeitada") {
    const [temAprovacaoFormal] = await sql`
      SELECT 1 FROM alissonerp.aprovacoes_tarefa WHERE tarefa_id = ${tarefaId} LIMIT 1
    `;
    if (temAprovacaoFormal) {
      return NextResponse.json(
        { error: "Esta tarefa é uma aprovação formal — decida por /api/tarefas/[id]/aprovacao" },
        { status: 409 },
      );
    }
  }

  const parsed = TarefaPatchSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;

  const novoResponsavel = body.responsavel_id;
  const responsavelAnterior = tarefaPatch.responsavel_id;

  if (novoResponsavel !== undefined && novoResponsavel !== responsavelAnterior) {
    await sql`
      INSERT INTO alissonerp.tarefas_historico
        (tarefa_id, usuario_id, acao, campo, valor_anterior, valor_novo, comentario, created_at)
      VALUES (
        ${tarefaId}, ${user.id}::uuid, 'atribuida',
        'responsavel_id', ${responsavelAnterior ?? null}::text,
        ${novoResponsavel ?? null}::text,
        ${body.motivo_delegacao ?? null},
        now()
      )
    `.catch(() => {});
  }

  const novoConcluida = body.status === "concluida" || body.status === "aprovada"
    ? sql`NOW()`
    : sql`concluida_em`;

  await sql`
    UPDATE alissonerp.tarefas SET
      titulo         = COALESCE(${body.titulo ?? null},         titulo),
      descricao      = COALESCE(${body.descricao ?? null},      descricao),
      responsavel_id = COALESCE(${body.responsavel_id ?? null}::uuid, responsavel_id),
      prioridade     = COALESCE(${body.prioridade ?? null},     prioridade),
      status         = COALESCE(${body.status ?? null},         status),
      data_limite    = COALESCE(${body.data_limite ?? null}::date, data_limite),
      ordem_id       = COALESCE(${body.ordem_id ?? null},       ordem_id),
      ordem_ids      = COALESCE(${body.ordem_ids ?? null},      ordem_ids),
      peso_metal     = COALESCE(${body.peso_metal ?? null},     peso_metal),
      tags           = COALESCE(${body.tags ?? null},           tags),
      tipo           = COALESCE(${body.tipo ?? null},           tipo),
      concluida_em   = ${novoConcluida}
    WHERE id = ${tarefaId}
  `;

  if (novoResponsavel && novoResponsavel !== user.id && novoResponsavel !== responsavelAnterior) {
    await criarNotificacao({
      usuarioId: novoResponsavel,
      tipo: "tarefa",
      titulo: "Tarefa delegada: " + tarefaPatch.titulo,
      mensagem: body.motivo_delegacao ?? "Tarefa delegada para você",
      remetenteId: user.id,
      link: `/tarefas?abrir=${tarefaId}`,
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const tarefaId = Number(id);
  if (isNaN(tarefaId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const [tarefaDel] = await sql`SELECT criado_por FROM alissonerp.tarefas WHERE id = ${tarefaId} LIMIT 1`;
  if (!tarefaDel) return NextResponse.json({ error: "Tarefa não encontrada" }, { status: 404 });

  const [usuarioDel] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  const isCreator = tarefaDel.criado_por === user.id;
  if (!isCreator && !isFullAccess(usuarioDel?.role)) {
    return NextResponse.json({ error: "Sem permissão — apenas o criador pode excluir" }, { status: 403 });
  }

  await sql`DELETE FROM alissonerp.tarefas WHERE id = ${tarefaId}`;
  return NextResponse.json({ ok: true });
}
