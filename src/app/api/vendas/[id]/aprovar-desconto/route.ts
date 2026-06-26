import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { getDescontoThreshold } from "@/lib/aprovacao-regras";
import { criarNotificacao } from "@/lib/notificacoes";
import { logAudit } from "@/lib/audit";
import { internalError } from "@/lib/api-error";

// POST /api/vendas/[id]/aprovar-desconto
// Admin/desenvolvedor aprova desconto acima do threshold diretamente da notificação.
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

  // Verificar se há itens com desconto acima do threshold da vendedora
  const thresholdAprov = await getDescontoThreshold(vendaId);
  const [temDesconto] = await sql`
    SELECT EXISTS(SELECT 1 FROM alissonerp.itens_venda_erp WHERE venda_id = ${vendaId} AND pct_desconto > ${thresholdAprov}) AS tem
  `;
  if (!temDesconto?.tem) return NextResponse.json({ error: `Nenhum item com desconto acima de ${thresholdAprov}%` }, { status: 409 });

  // REGRA DE NEGÓCIO (Blindagem 2026-06 — correção M1 da análise):
  // O QUE: aprovação do desconto + conclusão da tarefa + limpeza do lock da
  //   venda rodam em UMA transação, com auditoria. Antes eram 4 escritas com
  //   .catch(() => {}) — a aprovação "dava certo" na tela mas a tarefa podia
  //   ficar órfã no painel, sem ninguém saber.
  // IMPACTO SE ALTERADO: voltar aos catches silenciosos recria tarefas órfãs
  //   e quebra a rastreabilidade (§0.1).
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sql as any).begin(async (tx: typeof sql) => {
      await tx`
        UPDATE alissonerp.vendas_erp
        SET desconto_aprovado_por = ${user.id}::uuid,
            desconto_aprovado_em  = NOW(),
            updated_at            = NOW()
        WHERE id = ${vendaId}
      `;

      // Concluir tarefa de aprovação pendente + liberar novo fluxo na venda
      if (venda.aprovacao_credito_tarefa_id) {
        await tx`
          UPDATE alissonerp.tarefas
          SET status = 'concluida', updated_at = NOW()
          WHERE id = ${venda.aprovacao_credito_tarefa_id}
            AND status = 'aguardando_aprovacao'
        `;
        await tx`
          UPDATE alissonerp.aprovacoes_tarefa
          SET status = 'aprovado', aprovado_em = NOW()
          WHERE tarefa_id = ${venda.aprovacao_credito_tarefa_id} AND status = 'pendente'
        `;
        await tx`
          UPDATE alissonerp.vendas_erp SET aprovacao_credito_tarefa_id = NULL WHERE id = ${vendaId}
        `;
      }

      await logAudit(tx, {
        tabela: "vendas_erp",
        operacao: "UPDATE",
        registro_id: vendaId,
        usuario_id: user.id,
        dados_antes: { desconto_aprovado_por: null, tarefa_id: venda.aprovacao_credito_tarefa_id ?? null },
        dados_depois: { desconto_aprovado: true, threshold: thresholdAprov },
      });
    });
  } catch (err) {
    return internalError(`[POST /api/vendas/${vendaId}/aprovar-desconto]`, err, "Falha ao aprovar desconto. Nada foi gravado — tente novamente.");
  }

  // Notificação é best-effort de verdade (não afeta a aprovação),
  // mas a falha agora é LOGADA em vez de engolida.
  try {
    const [tarefaInfo] = await sql`
      SELECT t.criado_por, v.numero_venda
      FROM alissonerp.tarefas t
      JOIN alissonerp.vendas_erp v ON v.id = t.venda_id
      WHERE t.venda_id = ${vendaId} AND t.tags @> ARRAY['aprovacao_desconto']::text[]
      ORDER BY t.id DESC LIMIT 1
    `;
    if (tarefaInfo?.criado_por && tarefaInfo.criado_por !== user.id) {
      await criarNotificacao({
        usuarioId: String(tarefaInfo.criado_por),
        tipo: "aprovacao",
        titulo: "Desconto aprovado — Venda " + tarefaInfo.numero_venda,
        mensagem: `Seu desconto acima de ${thresholdAprov}% foi aprovado. Você já pode solicitar aprovação da venda.`,
        remetenteId: user.id,
        link: `/vendas/${vendaId}`,
        vendaId,
      });
    }
  } catch (err) {
    console.error(`[aprovar-desconto] Notificação falhou (venda ${vendaId}):`, err);
  }

  return NextResponse.json({ ok: true });
}
