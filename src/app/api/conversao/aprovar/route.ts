import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { uploadFile, ensureBucket } from "@/lib/storage";

// POST /api/conversao/aprovar
// Body: { tarefa_id: number, conversao_id: number }
// Alisson aprova a conversão → tarefa vira 'aprovada', conversao vira 'aprovado'
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  // Verificar se usuário é admin/desenvolvedor (Alisson)
  const [usuario] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario || !["admin", "desenvolvedor"].includes(usuario.role)) {
    return NextResponse.json({ error: "Apenas administradores podem aprovar conversões" }, { status: 403 });
  }

  const body = await req.json() as {
    tarefa_id: number;
    conversao_id: number;
  };

  const { tarefa_id, conversao_id } = body;

  if (!tarefa_id || !conversao_id) {
    return NextResponse.json({ error: "tarefa_id e conversao_id são obrigatórios" }, { status: 400 });
  }

  // Verificar se tarefa existe e está 'aguardando_aprovacao'
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

  // Verificar conversao
  const [conversao] = await sql`
    SELECT id, status_conversao, ordem_id
    FROM alissonerp.conversoes_estoque WHERE id = ${conversao_id}
    LIMIT 1
  `;
  if (!conversao) {
    return NextResponse.json({ error: "Conversão não encontrada" }, { status: 404 });
  }
  if (conversao.status_conversao !== "pendente") {
    return NextResponse.json({ error: `Conversão já está "${conversao.status_conversao}"` }, { status: 409 });
  }

  // Tudo ok — aprovar
  await sql.begin(async (tx: any) => {
    // Atualizar tarefa para 'aprovada'
    await tx`
      UPDATE alissonerp.tarefas
      SET status = 'aprovada', concluida_em = NOW(), updated_at = NOW()
      WHERE id = ${tarefa_id}
    `;

    // Atualizar conversão para 'aprovado'
    await tx`
      UPDATE alissonerp.conversoes_estoque
      SET status_conversao = 'aprovado',
          aprovado_por = ${user.id}::uuid,
          aprovado_em = NOW(),
          updated_at = NOW()
      WHERE id = ${conversao_id}
    `;

    // Registrar no histórico da tarefa
    await tx`
      INSERT INTO alissonerp.tarefas_historico
        (tarefa_id, usuario_id, acao, created_at)
      VALUES (${tarefa_id}, ${user.id}::uuid, 'aprovada', NOW())
    `.catch(() => {});
  });

  return NextResponse.json({
    ok: true,
    message: "Conversão aprovada! Liberada para protocolo de ida.",
  });
}
