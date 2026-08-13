import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";
import { criarNotificacao } from "@/lib/notificacoes";
import { resolverAprovadores } from "@/lib/aprovacoes";

type Params = Promise<{ id: string }>;

function formatarMoedaBR(valor: number): string {
  return `R$ ${Number(valor || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// REGRA DE NEGOCIO:
// - O que faz: envia ordem de compra comercial para aprovacao e bloqueia edicao.
// - Por que: separa quem solicita de quem aprova antes de gerar estoque/contas a pagar.
// - Impacto se alterado/removido: ordem pode ser executada sem governanca de aprovacao.
export async function POST(req: NextRequest, { params }: { params: Params }) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;

  const { id } = await params;
  const compraId = Number(id);
  if (!Number.isFinite(compraId) || compraId <= 0) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  void req;

  const [compra] = await sql`
    SELECT c.id, c.situacao, c.bloqueado, c.fornecedor_id, c.local_estoque_id, c.qtd_parcelas, c.primeiro_vencimento,
      ct.nome AS fornecedor_nome
    FROM alissonerp.compras_comercial c
    LEFT JOIN public.contatos ct ON ct.id_contato = c.fornecedor_id
    WHERE c.id = ${compraId}
    LIMIT 1
  `;
  if (!compra) return NextResponse.json({ error: "Compra não encontrada" }, { status: 404 });

  if (compra.situacao === "aguardando_aprovacao") {
    return NextResponse.json({ error: "Compra já está aguardando aprovação" }, { status: 409 });
  }
  if (compra.situacao === "aprovado" || compra.situacao === "concluido") {
    return NextResponse.json({ error: "Compra já aprovada/concluída" }, { status: 409 });
  }

  const [itensResumo] = await sql`
    SELECT COUNT(*)::int AS total,
      COALESCE(SUM(valor_total), 0)::numeric AS valor_total
    FROM alissonerp.itens_compra_comercial
    WHERE compra_comercial_id = ${compraId}
  `;
  if (!itensResumo || Number(itensResumo.total) <= 0) {
    return NextResponse.json({ error: "Adicione pelo menos um item antes de solicitar aprovação" }, { status: 409 });
  }

  // REGRA DE NEGOCIO:
  // - O que faz: resolve o aprovador exclusivamente pela configuracao central do sistema
  //   (política config-first — 03b-config-first-estrito.md). A camada já filtra usuário
  //   ativo internamente. Sem ctx.solicitanteId: compra comercial não exclui quem solicitou.
  // - Por que: evita override manual pelo operador e garante governanca de aprovacao.
  // - Impacto se alterado/removido: usuario pode escolher aprovador indevido e quebrar compliance.
  const resol = await resolverAprovadores("compra_comercial");
  if (resol.status === "nao_configurado") {
    return NextResponse.json({ error: "Nenhum aprovador configurado para compra comercial" }, { status: 409 });
  }
  const aprovadorId = resol.aprovadores[0]; // colunas aprovacoes_tarefa.aprovador_id / compras_comercial.aprovador_id são UUID único

  // REGRA DE NEGOCIO:
  // - O que faz: gera um resumo estruturado na tarefa de aprovacao com fornecedor, total e quantidade de itens.
  // - Por que: o aprovador precisa contexto imediato para decidir sem abrir outras telas primeiro.
  // - Impacto se alterado/removido: aprovacoes ficam opacas, elevando risco de decisao incorreta.
  const descricaoAprovacao = [
    `Fornecedor: ${String(compra.fornecedor_nome ?? "Não informado")}`,
    `Valor total: ${formatarMoedaBR(Number(itensResumo.valor_total ?? 0))}`,
    `Itens: ${Number(itensResumo.total)} item(ns)`,
    "",
    `Revisar compra comercial #${compraId}. Ao aprovar, o sistema gera entrada em estoque comercial e contas a pagar automaticamente.`,
  ].join("\n");

  const [tarefa] = await sql`
    INSERT INTO alissonerp.tarefas
      (titulo, descricao, responsavel_id, criado_por, prioridade, status, tags, tipo)
    VALUES (
      ${`Aprovação Compra Comercial #${compraId}`},
      ${descricaoAprovacao},
      ${aprovadorId}::uuid,
      ${user.id}::uuid,
      'alta',
      'aguardando_aprovacao',
      ${sql.array(["aprovacao_compra_comercial", `compra_comercial:${compraId}`])},
      'compra_comercial'
    )
    RETURNING id
  `;

  await sql`
    INSERT INTO alissonerp.aprovacoes_tarefa (tarefa_id, solicitante_id, aprovador_id, status)
    VALUES (${tarefa.id}, ${user.id}::uuid, ${aprovadorId}::uuid, 'pendente')
  `;

  await sql`
    UPDATE alissonerp.compras_comercial
    SET
      situacao = 'aguardando_aprovacao',
      bloqueado = true,
      aprovador_id = ${aprovadorId}::uuid,
      tarefa_aprovacao_id = ${tarefa.id},
      motivo_rejeicao = NULL,
      data_decisao = NULL,
      aprovado_por = NULL
    WHERE id = ${compraId}
  `;

  await criarNotificacao({
    usuarioId: aprovadorId,
    tipo: "aprovacao",
    titulo: `Aprovação solicitada - Compra Comercial #${compraId}`,
    mensagem: "Existe uma compra comercial aguardando sua aprovação.",
    remetenteId: user.id,
    link: `/tarefas?abrir=${tarefa.id}`,
  }).catch(() => {});

  return NextResponse.json({ ok: true, tarefa_id: tarefa.id, aprovador_id: aprovadorId });
}
