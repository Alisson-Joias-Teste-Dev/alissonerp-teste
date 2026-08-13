import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { ForbiddenError } from "@/lib/auth-server";
import { requireVendaOwnership, NotFoundError } from "@/lib/auth-vendas";
import { zodError } from "@/lib/schemas/common";
import { getDescontoThreshold } from "@/lib/aprovacao-regras";
import { logAudit } from "@/lib/audit";
import { resolverItemComissao } from "@/lib/comissao-item";

const ItemVendaPatchSchema = z.object({
  quantidade: z.coerce.number().optional(),
  preco_lista: z.coerce.number().optional(),
  pct_desconto: z.coerce.number().optional(),
  preco_unitario: z.coerce.number().optional(),
  total_item: z.coerce.number().optional(),
  pct_comissao: z.coerce.number().optional(),
  valor_comissao: z.coerce.number().optional(),
  observacao: z.string().nullable().optional(),
}).passthrough();

async function checkOwnership(userId: string, vendaId: number): Promise<{ role: string; mxDesconto: number }> {
  const [u] = await sql<{ role: string; mx_desconto_permitido: number | null }[]>`
    SELECT role, mx_desconto_permitido FROM alissonerp.usuarios WHERE id = ${userId}::uuid LIMIT 1
  `;
  if (!u) throw new ForbiddenError("Usuario nao encontrado");
  await requireVendaOwnership({ id: userId, role: u.role, email: "" }, vendaId);
  return { role: u.role, mxDesconto: Number(u.mx_desconto_permitido ?? 0) };
}

// ─── PATCH /api/vendas/[id]/itens/[itemId] ─────────────────────────────────────
// Atualiza item (trigger recalcula totais da venda automaticamente)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id, itemId } = await params;
  const vendaId = Number(id);
  const iId     = Number(itemId);
  if (isNaN(vendaId) || isNaN(iId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const [venda] = await sql`
    SELECT id, bloqueado, situacao FROM alissonerp.vendas_erp WHERE id = ${vendaId}
  `;
  if (!venda) return NextResponse.json({ error: "Venda não encontrada" }, { status: 404 });
  if (venda.bloqueado) return NextResponse.json({ error: "Venda bloqueada" }, { status: 409 });
  if (venda.situacao !== "rascunho") {
    return NextResponse.json({ error: "Venda já aprovada. Não é possível alterar itens." }, { status: 409 });
  }

  // Onda 1D: consultora so edita item de venda propria (valida ownership)
  try {
    await checkOwnership(user.id, vendaId);
  }
  catch (e) {
    if (e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const [item] = await sql`
    SELECT id, produto_id, quantidade, preco_lista, pct_desconto, preco_unitario, total_item
    FROM alissonerp.itens_venda_erp WHERE id = ${iId} AND venda_id = ${vendaId}
  `;
  if (!item) return NextResponse.json({ error: "Item não encontrado" }, { status: 404 });

  const raw = await req.json().catch(() => ({}));
  const parsed = ItemVendaPatchSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;

  // ── Gate de desconto (v2.68.2): numa venda RASCUNHO o desconto acima do limite
  // da consultora PODE ser salvo (igual ao fluxo de criação de venda). A aprovação
  // é exigida DEPOIS: ao salvar item com desconto > limite, a venda invalida a
  // aprovação anterior (bloco abaixo) → o botão "Solicitar Aprovação de Desconto"
  // aparece, e a APROVAÇÃO da venda/pagamento fica travada até o diretor aprovar
  // (desconto_aprovado_por). ANTES bloqueávamos aqui (v2.60.4), o que criava um
  // DEADLOCK: a consultora era mandada "solicitar aprovação", mas o desconto nunca
  // era persistido, então o botão de solicitar nunca aparecia.
  // Esta rota só edita venda em rascunho (guard de situacao acima).

  // ── Comissão: recalculada AQUI, não aceita do navegador ─────────────────────
  // Esta rota é o caminho da EDIÇÃO — exatamente onde o furo da promoção batia.
  // O navegador perde o preço cheio da campanha quando a venda é reaberta
  // (ele só existia no estado React), media o desconto contra o preço já
  // promocional e mandava a faixa cheia de 4%. Ver comissao-item.ts.
  //
  // Os valores efetivos são montados aqui, ANTES do UPDATE, porque a comissão
  // depende do preço final — não dá pra derivar de dentro do COALESCE.
  const precoListaEfetivo    = Number(body.preco_lista    ?? item.preco_lista);
  const precoUnitarioEfetivo = Number(body.preco_unitario ?? item.preco_unitario);
  const totalItemEfetivo     = Number(body.total_item     ?? item.total_item);

  const resolvido = await resolverItemComissao({
    produtoId: item.produto_id ?? null,
    precoLista: precoListaEfetivo,
    precoUnitario: precoUnitarioEfetivo,
    totalItem: totalItemEfetivo,
    situacaoVenda: venda.situacao,
  });

  await sql`
    UPDATE alissonerp.itens_venda_erp SET
      quantidade        = COALESCE(${body.quantidade     ?? null}, quantidade),
      preco_lista       = COALESCE(${body.preco_lista    ?? null}, preco_lista),
      preco_lista_cheio = ${resolvido.preco_lista_cheio},
      pct_desconto      = COALESCE(${body.pct_desconto   ?? null}, pct_desconto),
      preco_unitario    = COALESCE(${body.preco_unitario ?? null}, preco_unitario),
      total_item        = COALESCE(${body.total_item     ?? null}, total_item),
      pct_comissao      = COALESCE(${resolvido.comissao?.pct_comissao   ?? body.pct_comissao   ?? null}, pct_comissao),
      valor_comissao    = COALESCE(${resolvido.comissao?.valor_comissao ?? body.valor_comissao ?? null}, valor_comissao),
      observacao        = COALESCE(${body.observacao     ?? null}, observacao)
    WHERE id = ${iId}
  `;

  // Se desconto foi alterado numa venda em rascunho, invalida aprovação anterior
  if (body.pct_desconto !== undefined && venda.situacao === "rascunho") {
    const thresholdItem = await getDescontoThreshold(vendaId);
    const [vendaAtual] = await sql`
      SELECT desconto_aprovado_por,
        aprovacao_desconto_tarefa_id,
        EXISTS(
          SELECT 1 FROM alissonerp.itens_venda_erp
          WHERE venda_id = ${vendaId} AND pct_desconto > ${thresholdItem}
        ) AS tem_desconto_alto
      FROM alissonerp.vendas_erp WHERE id = ${vendaId}
    `;
    if (vendaAtual?.tem_desconto_alto) {
      // BUG FIX (jun/2026, venda 15628): zerar aprovacao_desconto_tarefa_id é
      // obrigatório — senão, se a tarefa antiga já estava 'aprovada', o front esconde
      // o botão de solicitar e o banner de aguardando, e a venda trava em rascunho.
      const tarefaAnteriorId = vendaAtual.aprovacao_desconto_tarefa_id as number | null;
      await sql`
        UPDATE alissonerp.vendas_erp
        SET desconto_aprovado_por        = NULL,
            desconto_aprovado_em         = NULL,
            aprovacao_desconto_tarefa_id = NULL,
            updated_at                   = NOW()
        WHERE id = ${vendaId}
      `;
      // Cancela a tarefa vinculada SÓ se ainda estava pendente. Mira pelo ID (o filtro
      // por tag 'aprovacao_desconto' antigo nunca batia: a tag real é 'aprov_desconto_acima').
      // Blindagem 2026-06: falha aqui não pode ser silenciosa — é logada.
      if (tarefaAnteriorId) {
        try {
          await sql`
            UPDATE alissonerp.tarefas
            SET status = 'cancelado', updated_at = NOW()
            WHERE id = ${tarefaAnteriorId}
              AND status = 'aguardando_aprovacao'
          `;
        } catch (err) {
          console.error(`[itens PATCH] Falha ao cancelar tarefa de desconto (venda ${vendaId}):`, err);
        }
      }
    }
  }

  // Rastreabilidade §0.1: registra a edição do item (valores antes/depois)
  await logAudit(sql, {
    tabela: "itens_venda_erp",
    operacao: "UPDATE",
    registro_id: iId,
    usuario_id: user.id,
    dados_antes: {
      quantidade: Number(item.quantidade),
      pct_desconto: Number(item.pct_desconto),
      preco_unitario: Number(item.preco_unitario),
      total_item: Number(item.total_item),
    },
    dados_depois: Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined)),
  });

  return NextResponse.json({ ok: true });
}

// ─── DELETE /api/vendas/[id]/itens/[itemId] ────────────────────────────────────
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id, itemId } = await params;
  const vendaId = Number(id);
  const iId     = Number(itemId);
  if (isNaN(vendaId) || isNaN(iId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const [venda] = await sql`
    SELECT id, bloqueado, situacao FROM alissonerp.vendas_erp WHERE id = ${vendaId}
  `;
  if (!venda) return NextResponse.json({ error: "Venda não encontrada" }, { status: 404 });
  if (venda.bloqueado) return NextResponse.json({ error: "Venda bloqueada" }, { status: 409 });
  if (venda.situacao === "cancelado") return NextResponse.json({ error: "Venda cancelada" }, { status: 409 });
  if (venda.situacao !== "rascunho") {
    return NextResponse.json({ error: "Venda já aprovada. Não é possível remover itens." }, { status: 409 });
  }

  // Onda 1D: consultora so deleta item de venda propria
  try { await checkOwnership(user.id, vendaId); }
  catch (e) {
    if (e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  // Captura o item antes de deletar para a trilha de auditoria
  const [itemDel] = await sql`
    SELECT nome_produto, sku, quantidade, total_item
    FROM alissonerp.itens_venda_erp WHERE id = ${iId} AND venda_id = ${vendaId}
  `;

  await sql`
    DELETE FROM alissonerp.itens_venda_erp
    WHERE id = ${iId} AND venda_id = ${vendaId}
  `;

  // Rastreabilidade §0.1: remoção de item é operação sensível (mexe em totais
  // e libera reserva de estoque via trigger) — registra quem removeu o quê.
  await logAudit(sql, {
    tabela: "itens_venda_erp",
    operacao: "DELETE",
    registro_id: iId,
    usuario_id: user.id,
    dados_antes: itemDel
      ? { nome_produto: itemDel.nome_produto, sku: itemDel.sku, quantidade: Number(itemDel.quantidade), total_item: Number(itemDel.total_item) }
      : null,
    dados_depois: null,
  });

  return NextResponse.json({ ok: true });
}
