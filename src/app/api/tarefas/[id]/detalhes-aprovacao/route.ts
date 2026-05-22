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
    // Fix: vendas_erp tem `cliente_id` (nao contato_id), `total_venda`/`total_desconto`
    // (nao valor_total/valor_desconto), `situacao` (nao status), `numero_venda`
    // (nao numero_pedido). Tambem nao tem `forma_pagamento_principal` nem
    // `desconto_percentual`. Esses sao derivados:
    //   - desconto_percentual = total_desconto / (total_produtos) * 100
    //   - forma_pagamento_principal = primeira forma em pagamentos_venda
    const [v] = await sql`
      SELECT
        v.id,
        v.numero_venda AS numero_pedido,
        v.total_venda AS valor_total,
        v.total_desconto AS valor_desconto,
        v.total_produtos,
        v.situacao AS status,
        (SELECT forma FROM alissonerp.pagamentos_venda WHERE venda_id = v.id ORDER BY id LIMIT 1) AS forma_pagamento,
        c.nome AS cliente_nome
      FROM alissonerp.vendas_erp v
      LEFT JOIN public.contatos c ON c.id_contato = v.cliente_id
      WHERE v.id = ${tarefa.venda_id}
    `;
    if (v) {
      const totalProd = v.total_produtos != null ? Number(v.total_produtos) : 0;
      const totalDesc = v.valor_desconto != null ? Number(v.valor_desconto) : 0;
      const descPct = totalProd > 0 ? Math.round((totalDesc / totalProd) * 10000) / 100 : null;
      venda = {
        id: Number(v.id),
        numero_pedido: v.numero_pedido,
        valor_total: v.valor_total != null ? Number(v.valor_total) : 0,
        valor_desconto: totalDesc || null,
        desconto_percentual: descPct,
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
