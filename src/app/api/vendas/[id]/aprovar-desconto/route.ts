import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

// POST /api/vendas/[id]/aprovar-desconto
// Admin/desenvolvedor aprova desconto acima de 30% diretamente da notificação.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const vendaId = Number(id);
  if (isNaN(vendaId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  if (!usuario || !["admin", "desenvolvedor"].includes(usuario.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const [venda] = await sql`SELECT id, situacao, aprovacao_credito_tarefa_id FROM alissonerp.vendas_erp WHERE id = ${vendaId}`;
  if (!venda) return NextResponse.json({ error: "Venda não encontrada" }, { status: 404 });
  if (venda.situacao !== "rascunho") return NextResponse.json({ error: "Venda não está em rascunho" }, { status: 409 });

  // Verificar se há itens com desconto > 30%
  const [temDesconto] = await sql`
    SELECT EXISTS(SELECT 1 FROM alissonerp.itens_venda_erp WHERE venda_id = ${vendaId} AND pct_desconto > 30) AS tem
  `;
  if (!temDesconto?.tem) return NextResponse.json({ error: "Nenhum item com desconto acima de 30%" }, { status: 409 });

  // Aprovar desconto
  await sql`
    UPDATE alissonerp.vendas_erp
    SET desconto_aprovado_por = ${user.id}::uuid,
        desconto_aprovado_em  = NOW(),
        updated_at            = NOW()
    WHERE id = ${vendaId}
  `;

  // Concluir tarefa de aprovação pendente
  if (venda.aprovacao_credito_tarefa_id) {
    await sql`
      UPDATE alissonerp.tarefas
      SET status = 'concluida', updated_at = NOW()
      WHERE id = ${venda.aprovacao_credito_tarefa_id}
        AND status = 'aguardando_aprovacao'
    `.catch(() => {});
    await sql`
      UPDATE alissonerp.aprovacoes_tarefa
      SET status = 'aprovado', aprovado_em = NOW()
      WHERE tarefa_id = ${venda.aprovacao_credito_tarefa_id} AND status = 'pendente'
    `.catch(() => {});
    // Limpar tarefa da venda para liberar novo fluxo
    await sql`
      UPDATE alissonerp.vendas_erp SET aprovacao_credito_tarefa_id = NULL WHERE id = ${vendaId}
    `.catch(() => {});
  }

  // Notificar quem solicitou
  const [tarefaInfo] = await sql`
    SELECT t.criado_por, v.numero_venda
    FROM alissonerp.tarefas t
    JOIN alissonerp.vendas_erp v ON v.id = t.venda_id
    WHERE t.venda_id = ${vendaId} AND t.tags @> ARRAY['aprovacao_desconto']::text[]
    ORDER BY t.id DESC LIMIT 1
  `.catch(() => []);

  if (tarefaInfo?.criado_por && tarefaInfo.criado_por !== user.id) {
    await sql`
      INSERT INTO alissonerp.notificacoes (usuario_id, tipo, titulo, mensagem, remetente_id, link, venda_id)
      VALUES (
        ${tarefaInfo.criado_por}::uuid, 'aprovacao',
        ${"Desconto aprovado — Venda " + tarefaInfo.numero_venda},
        ${"Seu desconto acima de 30% foi aprovado. Você já pode solicitar aprovação da venda."},
        ${user.id}::uuid,
        ${`/vendas/${vendaId}`},
        ${vendaId}
      )
    `.catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
