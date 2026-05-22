// ═══════════════════════════════════════════════════════════════════════════
// Detalhes completos para tela de aprovação de tarefa
//
// Retorna em UM ÚNICO fetch tudo que a tela precisa: tarefa + aprovação mais
// recente (com nome/role do solicitante) + dados da venda relacionada (quando
// houver). Evita 3 round-trips do frontend.
// ═══════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const tarefaId = Number(id);
  if (!Number.isFinite(tarefaId) || tarefaId <= 0) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const [tarefa] = await sql`
    SELECT id, titulo, descricao, tipo, status, tags, venda_id, created_at
    FROM alissonerp.tarefas
    WHERE id = ${tarefaId}
  `;
  if (!tarefa) return NextResponse.json({ error: "Tarefa não encontrada" }, { status: 404 });

  const tagsRaw = tarefa.tags;
  const tags: string[] = Array.isArray(tagsRaw)
    ? tagsRaw
    : (typeof tagsRaw === "string" ? tagsRaw.replace(/[{}"]/g, "").split(",").filter(Boolean) : []);

  const [aprovacao] = await sql`
    SELECT
      a.id,
      a.status,
      a.motivo,
      u.nome AS solicitante_nome,
      u.role AS solicitante_role
    FROM alissonerp.aprovacoes_tarefa a
    LEFT JOIN alissonerp.usuarios u ON u.id = a.solicitante_id
    WHERE a.tarefa_id = ${tarefaId}
    ORDER BY a.id DESC
    LIMIT 1
  `;

  let venda = null;
  if (tarefa.venda_id) {
    const [v] = await sql`
      SELECT
        v.id,
        v.numero_pedido,
        v.valor_total,
        v.valor_desconto,
        v.desconto_percentual,
        v.forma_pagamento_principal AS forma_pagamento,
        v.status,
        c.nome AS cliente_nome
      FROM alissonerp.vendas_erp v
      LEFT JOIN public.contatos c ON c.id_contato = v.contato_id
      WHERE v.id = ${tarefa.venda_id}
    `;
    if (v) {
      venda = {
        id: Number(v.id),
        numero_pedido: v.numero_pedido,
        valor_total: v.valor_total != null ? Number(v.valor_total) : 0,
        valor_desconto: v.valor_desconto != null ? Number(v.valor_desconto) : null,
        desconto_percentual: v.desconto_percentual != null ? Number(v.desconto_percentual) : null,
        forma_pagamento: v.forma_pagamento ?? null,
        cliente_nome: v.cliente_nome ?? null,
        status: v.status,
      };
    }
  }

  return NextResponse.json({
    tarefa: {
      id: Number(tarefa.id),
      titulo: tarefa.titulo,
      descricao: tarefa.descricao ?? null,
      tipo: tarefa.tipo ?? null,
      status: tarefa.status,
      tags,
      created_at: tarefa.created_at,
    },
    aprovacao: aprovacao
      ? {
          id: Number(aprovacao.id),
          solicitante_nome: aprovacao.solicitante_nome ?? "",
          solicitante_role: aprovacao.solicitante_role ?? "",
          status: aprovacao.status,
          motivo: aprovacao.motivo ?? null,
        }
      : null,
    venda,
  });
}
