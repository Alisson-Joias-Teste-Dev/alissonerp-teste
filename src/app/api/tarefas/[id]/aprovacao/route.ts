import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { processarDecisao } from "@/lib/aprovacao-regras";

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
  const body = await req.json() as { aprovador_id: string };

  if (!body.aprovador_id) {
    return NextResponse.json({ error: "aprovador_id obrigatório" }, { status: 400 });
  }

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
  const body = await req.json() as { aprovacao_id: number; decisao: "aprovado" | "rejeitado"; motivo?: string };

  if (!body.aprovacao_id || !body.decisao) {
    return NextResponse.json({ error: "aprovacao_id e decisao obrigatórios" }, { status: 400 });
  }

  const [aprovacao] = await sql`
    SELECT * FROM alissonerp.aprovacoes_tarefa
    WHERE id = ${body.aprovacao_id} AND tarefa_id = ${Number(id)}
  `;
  if (!aprovacao) return NextResponse.json({ error: "Aprovação não encontrada" }, { status: 404 });
  if (String(aprovacao.aprovador_id) !== user.id) {
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
    SELECT venda_id, tags FROM alissonerp.tarefas WHERE id = ${Number(id)}
  `;
  const tagsRaw = tarefaInfo?.tags;
  const tags: string[] = Array.isArray(tagsRaw)
    ? tagsRaw
    : (typeof tagsRaw === "string" ? tagsRaw.replace(/[{}"]/g, "").split(",").filter(Boolean) : []);

  if (tags.includes("aprovacao_desconto") && tarefaInfo?.venda_id) {
    const logCtx = { tarefa_id: Number(id), venda_id: tarefaInfo.venda_id, decisao: body.decisao, aprovador_id: user.id };
    console.log(`[desconto] inicio`, logCtx);
    try {
      if (body.decisao === "aprovado") {
        await sql`
          UPDATE alissonerp.vendas_erp
          SET aprovacao_credito_tarefa_id = NULL,
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
          SET aprovacao_credito_tarefa_id = NULL,
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
      return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }
  }

  if (tarefaInfo?.venda_id && !tags.includes("aprovacao_desconto")) {
    try {
      const { processarAprovacaoCredito } = await import("@/lib/vendas-credito-aprovar");
      const resultado = await processarAprovacaoCredito(
        Number(id), user.id, body.decisao, body.motivo,
      );
      return NextResponse.json({ ok: true, credito: resultado });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[aprovacao] Erro ao processar crédito:`, msg);
      return NextResponse.json({ ok: false, error: msg }, { status: 500 });
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
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[aprovacao] Erro ao processar devolucao:`, msg);
      return NextResponse.json({ ok: false, error: msg }, { status: 500 });
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
