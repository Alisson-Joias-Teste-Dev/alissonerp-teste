import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

// POST /api/conversao-sku/aprovar
// Body: { tarefa_id: number, conversao_sku_id?: number }
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario || !["admin", "desenvolvedor"].includes(usuario.role)) {
    return NextResponse.json({ error: "Apenas administradores podem aprovar" }, { status: 403 });
  }

  const { tarefa_id, conversao_sku_id } = await req.json() as {
    tarefa_id: number;
    conversao_sku_id?: number;
  };

  if (!tarefa_id) {
    return NextResponse.json({ error: "tarefa_id é obrigatório" }, { status: 400 });
  }

  const [tarefa] = await sql`
    SELECT id, status::text as status, ordem_id
    FROM alissonerp.tarefas WHERE id = ${tarefa_id} AND ordem_id IS NOT NULL
    LIMIT 1
  `;
  if (!tarefa) {
    return NextResponse.json({ error: "Tarefa não encontrada" }, { status: 404 });
  }
  if (tarefa.status !== "aguardando_aprovacao") {
    return NextResponse.json({ error: `Tarefa já foi ${tarefa.status}` }, { status: 409 });
  }

  const [conv] = conversao_sku_id
    ? await sql`
        SELECT id, status_conversao, ordem_id
        FROM alissonerp.conversoes_sku WHERE id = ${conversao_sku_id} LIMIT 1
      `
    : await sql`
        SELECT id, status_conversao, ordem_id
        FROM alissonerp.conversoes_sku WHERE ordem_id = ${tarefa.ordem_id} LIMIT 1
      `;
  if (!conv) {
    return NextResponse.json({ error: "Conversão SKU não encontrada" }, { status: 404 });
  }
  if (conv.status_conversao !== "pendente") {
    return NextResponse.json({ error: `Conversão já está "${conv.status_conversao}"` }, { status: 409 });
  }

  await sql.begin(async (tx: any) => {
    await tx`
      UPDATE alissonerp.tarefas
      SET status = 'aprovada', concluida_em = NOW(), updated_at = NOW()
      WHERE id = ${tarefa_id}
    `;
    await tx`
      UPDATE alissonerp.conversoes_sku
      SET status_conversao = 'aprovado',
          aprovado_por = ${user.id}::uuid,
          aprovado_em = NOW(),
          updated_at = NOW()
      WHERE id = ${conv.id}
    `;
    await tx`
      INSERT INTO alissonerp.tarefas_historico
        (tarefa_id, usuario_id, acao, created_at)
      VALUES (${tarefa_id}, ${user.id}::uuid, 'aprovada', NOW())
    `.catch(() => {});
  });

  return NextResponse.json({
    ok: true,
    message: "Conversão SKU aprovada! Liberada para protocolo de ida.",
  });
}
