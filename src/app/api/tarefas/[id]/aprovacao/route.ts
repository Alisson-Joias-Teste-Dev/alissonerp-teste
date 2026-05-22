// ═══════════════════════════════════════════════════════════════════════════
// Resposta à Aprovação de Tarefa
//
// REGRA DE NEGÓCIO #1: cada handler (cartao_desconto, desconto, credito)
//   limpa SEU próprio campo em vendas_erp. Nunca mexer no campo do outro.
//   - cartao_desconto → limpa aprovacao_cartao_desconto_tarefa_id
//   - desconto        → limpa aprovacao_desconto_tarefa_id
//   - credito         → limpa aprovacao_credito_tarefa_id
//   Se alterar: manter esta separação. Um campo não pode afetar o outro.
//
// REGRA DE NEGÓCIO #2 (Bug 3): toda aprovação passa SÓ pela página de tarefas.
//   Removeu-se o botão "Aprovar" inline na notificação porque ele não
//   reduzia a comissão (0,5%) como a aprovação via tarefa fazia.
//   Se alterar: garantir que aprovação pela notificação tenha os MESMOS
//   efeitos colaterais que aprovação pela tarefa.
// ═══════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { processarDecisao } from "@/lib/aprovacao-regras";
import { internalError } from "@/lib/api-error";
import { zodError } from "@/lib/schemas/common";

const AprovacaoTarefaPostSchema = z.object({
  aprovador_id: z.string().min(1, "obrigatório"),
}).passthrough();

const AprovacaoTarefaPatchSchema = z.object({
  aprovacao_id: z.coerce.number().int().positive(),
  decisao: z.enum(["aprovado", "rejeitado"]),
  motivo: z.string().optional(),
}).passthrough();

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;

  const aprovacoes = await sql`
    SELECT
      a.id, a.tarefa_id, a.status, a.motivo, a.created_at, a.respondido_em,
      us.nome AS solicitante_nome,
      ua.nome AS aprovador_nome,
      a.solicitante_id, a.aprovador_id
    FROM alissonerp.aprovacoes_tarefa a
    LEFT JOIN alissonerp.usuarios us ON us.id = a.solicitante_id
    LEFT JOIN alissonerp.usuarios ua ON ua.id = a.aprovador_id
    WHERE a.tarefa_id = ${Number(id)}
    ORDER BY a.created_at DESC
  `;

  return NextResponse.json(aprovacoes);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const raw = await req.json().catch(() => ({}));
  const parsed = AprovacaoTarefaPostSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;

  await sql`
    UPDATE alissonerp.tarefas SET status = 'aguardando_aprovacao', updated_at = now()
    WHERE id = ${Number(id)}
  `;

  const [aprovacao] = await sql`
    INSERT INTO alissonerp.aprovacoes_tarefa (tarefa_id, solicitante_id, aprovador_id, status)
    VALUES (${Number(id)}, ${user.id}::uuid, ${body.aprovador_id}::uuid, 'pendente')
    RETURNING id
  `;

  await sql`
    INSERT INTO alissonerp.tarefas_historico (tarefa_id, usuario_id, acao, created_at)
    VALUES (${Number(id)}, ${user.id}::uuid, 'aguardando_aprovacao', now())
  `.catch(() => {});

  await sql`
    INSERT INTO alissonerp.notificacoes (usuario_id, tipo, titulo, mensagem, remetente_id)
    VALUES (${body.aprovador_id}::uuid, 'aprovacao', 'Aprovação solicitada',
      (SELECT titulo FROM alissonerp.tarefas WHERE id = ${Number(id)}),
      ${user.id}::uuid)
  `.catch(() => {});

  return NextResponse.json({ id: aprovacao.id }, { status: 201 });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const rawPatch = await req.json().catch(() => ({}));
  const parsedPatch = AprovacaoTarefaPatchSchema.safeParse(rawPatch);
  if (!parsedPatch.success) return zodError(parsedPatch.error);
  const body = parsedPatch.data;

  const [aprovacao] = await sql`
    SELECT * FROM alissonerp.aprovacoes_tarefa
    WHERE id = ${body.aprovacao_id} AND tarefa_id = ${Number(id)}
  `;
  if (!aprovacao) return NextResponse.json({ error: "Aprovação não encontrada" }, { status: 404 });

  // Admin e desenvolvedor podem responder qualquer aprovação
  const [usuarioLogado] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  const isAdminOuDev = ["admin", "desenvolvedor"].includes(usuarioLogado?.role ?? "");

  if (String(aprovacao.aprovador_id) !== user.id && !isAdminOuDev) {
    return NextResponse.json({ error: "Somente o aprovador pode responder" }, { status: 403 });
  }

  await sql`
    UPDATE alissonerp.aprovacoes_tarefa
    SET status = ${body.decisao}, motivo = ${body.motivo ?? null}, respondido_em = now()
    WHERE id = ${body.aprovacao_id}
  `;

  const novoStatus = body.decisao === "aprovado" ? "aprovada" : "rejeitada";
  await sql`
    UPDATE alissonerp.tarefas SET status = ${novoStatus}, updated_at = now()
    ${body.decisao === "aprovado" ? sql`, concluida_em = now()` : sql``}
    WHERE id = ${Number(id)}
  `;

  await processarDecisao(Number(id), body.decisao, user.id, body.motivo);

  const [tarefaInfo] = await sql`
    SELECT venda_id, tags, tipo FROM alissonerp.tarefas WHERE id = ${Number(id)}
  `;
  const tagsRaw = tarefaInfo?.tags;
  const tags: string[] = Array.isArray(tagsRaw)
    ? tagsRaw
    : (typeof tagsRaw === "string" ? tagsRaw.replace(/[{}"]/g, "").split(",").filter(Boolean) : []);

  if (tarefaInfo?.tipo === "cartao_desconto" && tarefaInfo?.venda_id) {
    const logCtx = { tarefa_id: Number(id), venda_id: tarefaInfo.venda_id, decisao: body.decisao, aprovador_id: user.id };
    console.log(`[cartao_desconto] inicio`, logCtx);
    try {
      if (body.decisao === "aprovado") {
        await sql`
          UPDATE alissonerp.vendas_erp
          SET aprovacao_cartao_desconto_tarefa_id = NULL,
              desconto_cartao_aprovado_por = ${user.id}::uuid,
              desconto_cartao_aprovado_em  = NOW(),
              updated_at = NOW()
          WHERE id = ${tarefaInfo.venda_id}
        `;
        console.log(`[cartao_desconto] vendas_erp: cartao liberado`);
      } else {
        await sql`
          UPDATE alissonerp.vendas_erp
          SET aprovacao_cartao_desconto_tarefa_id = NULL,
              updated_at = NOW()
          WHERE id = ${tarefaInfo.venda_id}
        `;
        console.log(`[cartao_desconto] vendas_erp: rejeitado`);
      }
      const [aprov] = await sql`SELECT solicitante_id FROM alissonerp.aprovacoes_tarefa WHERE tarefa_id = ${Number(id)} LIMIT 1`;
      if (aprov?.solicitante_id) {
        await sql`
          INSERT INTO alissonerp.notificacoes (usuario_id, tipo, titulo, mensagem, remetente_id)
          VALUES (${String(aprov.solicitante_id)}::uuid, 'aprovacao',
            ${body.decisao === "aprovado" ? "Cartão de crédito liberado!" : "Cartão de crédito não aprovado"},
            ${body.motivo ?? (body.decisao === "aprovado" ? "O cartão de crédito foi liberado para esta venda." : "O uso do cartão de crédito foi recusado para esta venda.")},
            ${user.id}::uuid)
        `.catch(() => {});
      }
      console.log(`[cartao_desconto] CONCLUÍDO ok`, logCtx);
      return NextResponse.json({ ok: true, cartao_desconto: { decisao: body.decisao } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[cartao_desconto] ERRO`, { ...logCtx, erro: msg });
      return internalError(`[PATCH /api/tarefas/${id}/aprovacao] cartao_desconto`, err);
    }
  }

  if (tags.includes("aprovacao_desconto") && tarefaInfo?.venda_id) {
    const logCtx = { tarefa_id: Number(id), venda_id: tarefaInfo.venda_id, decisao: body.decisao, aprovador_id: user.id };
    console.log(`[desconto] inicio`, logCtx);
    try {
      if (body.decisao === "aprovado") {
        await sql`
          UPDATE alissonerp.vendas_erp
          SET aprovacao_desconto_tarefa_id = NULL,
              desconto_aprovado_por = ${user.id}::uuid,
              desconto_aprovado_em  = NOW(),
              updated_at = NOW()
          WHERE id = ${tarefaInfo.venda_id}
        `;
        console.log(`[desconto] vendas_erp: lock removido, desconto_aprovado_por gravado`);
        await sql`
          UPDATE alissonerp.itens_venda_erp
          SET pct_comissao    = 0.5,
              valor_comissao  = ROUND(total_item * 0.005, 2)
          WHERE venda_id = ${tarefaInfo.venda_id}
        `;
        console.log(`[desconto] itens_venda_erp: comissão → 0,5%`);
      } else {
        await sql`
          UPDATE alissonerp.vendas_erp
          SET aprovacao_desconto_tarefa_id = NULL,
              updated_at = NOW()
          WHERE id = ${tarefaInfo.venda_id}
        `;
        console.log(`[desconto] vendas_erp: lock removido (rejeição)`);
      }
      const [aprov] = await sql`SELECT solicitante_id FROM alissonerp.aprovacoes_tarefa WHERE tarefa_id = ${Number(id)} LIMIT 1`;
      if (aprov?.solicitante_id) {
        await sql`
          INSERT INTO alissonerp.notificacoes (usuario_id, tipo, titulo, mensagem, remetente_id)
          VALUES (${String(aprov.solicitante_id)}::uuid, 'aprovacao',
            ${body.decisao === "aprovado" ? "Desconto liberado!" : "Desconto não aprovado"},
            ${body.motivo ?? (body.decisao === "aprovado" ? "O desconto foi liberado. Finalize o pagamento para concluir a venda." : "O desconto solicitado foi recusado pelo administrador.")},
            ${user.id}::uuid)
        `.catch(() => {});
      }
      console.log(`[desconto] CONCLUÍDO ok`, logCtx);
      await sql`
        INSERT INTO alissonerp.webhook_log (webhook_nome, payload, response_status)
        VALUES ('aprovacao_desconto', ${JSON.stringify({ ...logCtx, resultado: "ok" })}::text::jsonb, 200)
      `.catch(() => {});
      return NextResponse.json({ ok: true, desconto: { decisao: body.decisao } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[desconto] ERRO`, { ...logCtx, erro: msg });
      await sql`
        INSERT INTO alissonerp.webhook_log (webhook_nome, payload, response_status, erro)
        VALUES ('aprovacao_desconto', ${JSON.stringify({ ...logCtx, resultado: "erro" })}::text::jsonb, 500, ${msg})
      `.catch(() => {});
      return internalError(`[PATCH /api/tarefas/${id}/aprovacao] desconto`, err);
    }
  }

  if (tarefaInfo?.venda_id && !tags.includes("aprovacao_desconto") && tarefaInfo?.tipo !== "cartao_desconto") {
    try {
      const { processarAprovacaoCredito } = await import("@/lib/vendas-credito-aprovar");
      const resultado = await processarAprovacaoCredito(
        Number(id), user.id, body.decisao, body.motivo,
      );
      return NextResponse.json({ ok: true, credito: resultado });
    } catch (err) {
      return internalError(`[PATCH /api/tarefas/${id}/aprovacao] credito`, err);
    }
  }

  const [devLink] = await sql`
    SELECT id FROM alissonerp.devolucoes_venda WHERE tarefa_id = ${Number(id)} LIMIT 1
  `;
  if (devLink || tags.includes("devolucao")) {
    try {
      const { processarAprovacaoDevolucao } = await import("@/lib/devolucoes");
      const resultado = await processarAprovacaoDevolucao(
        Number(id), user.id, body.decisao, body.motivo,
      );
      return NextResponse.json({ ok: true, devolucao: resultado });
    } catch (err) {
      return internalError(`[PATCH /api/tarefas/${id}/aprovacao] devolucao`, err);
    }
  }

  await sql`
    INSERT INTO alissonerp.notificacoes (usuario_id, tipo, titulo, mensagem, remetente_id)
    VALUES (${String(aprovacao.solicitante_id)}::uuid, 'aprovacao',
      ${body.decisao === "aprovado" ? "Tarefa aprovada!" : "Tarefa rejeitada"},
      ${body.motivo ?? (body.decisao === "aprovado" ? "Aprovada com sucesso" : "Rejeitada pelo aprovador")},
      ${user.id}::uuid)
  `.catch(() => {});

  return NextResponse.json({ ok: true });
}
