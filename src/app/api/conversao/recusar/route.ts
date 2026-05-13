import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { uploadFile, ensureBucket } from "@/lib/storage";

// POST /api/conversao/recusar
// Body: { tarefa_id: number, conversao_id: number, motivo?: string, foto_base64: string }
// Alisson recusa a conversão → produtos voltam ao estoque, ordem cancelada
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  // Verificar se usuário é admin/desenvolvedor (Alisson)
  const [usuario] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario || !["admin", "desenvolvedor"].includes(usuario.role)) {
    return NextResponse.json({ error: "Apenas administradores podem recusar conversões" }, { status: 403 });
  }

  const body = await req.json() as {
    tarefa_id: number;
    conversao_id: number;
    motivo?: string;
    foto_base64: string;
  };

  const { tarefa_id, conversao_id, motivo, foto_base64 } = body;

  if (!tarefa_id || !conversao_id) {
    return NextResponse.json({ error: "tarefa_id e conversao_id são obrigatórios" }, { status: 400 });
  }

  if (!foto_base64) {
    return NextResponse.json({ error: "foto_base64 é obrigatória (foto da balança na recusa)" }, { status: 400 });
  }

  // Verificar se tarefa existe e está 'aguardando_aprovacao'
  const [tarefa] = await sql`
    SELECT id, status::text as status, ordem_id
    FROM alissonerp.tarefas WHERE id = ${tarefa_id}
    LIMIT 1
  `;
  if (!tarefa) {
    return NextResponse.json({ error: "Tarefa não encontrada" }, { status: 404 });
  }
  if (tarefa.status !== "aguardando_aprovacao") {
    return NextResponse.json({ error: `Tarefa já foi ${tarefa.status}` }, { status: 409 });
  }

  // Verificar conversao e seus itens
  const [conversao] = await sql`
    SELECT id, status_conversao, ordem_id, foto_abertura
    FROM alissonerp.conversoes_estoque WHERE id = ${conversao_id}
    LIMIT 1
  `;
  if (!conversao) {
    return NextResponse.json({ error: "Conversão não encontrada" }, { status: 404 });
  }
  if (conversao.status_conversao !== "pendente") {
    return NextResponse.json({ error: `Conversão já está "${conversao.status_conversao}"` }, { status: 409 });
  }

  // Upload da foto de recusa
  await ensureBucket("conversao-fotos");
  const fotoPath = `recusa/${Date.now()}_${user.id}.jpg`;
  const r = await uploadFile("conversao-fotos", fotoPath, foto_base64, "image/jpeg");
  if ("error" in r) {
    return NextResponse.json({ error: `Erro ao enviar foto de recusa: ${r.error}` }, { status: 500 });
  }

  // Buscar itens da conversão para estornar movimentações
  const itens = await sql`
    SELECT ci.*, p.nome AS produto_nome
    FROM alissonerp.conversao_itens ci
    JOIN public.produtos p ON p.id_produto = ci.produto_id
    WHERE ci.conversao_id = ${conversao_id}
  `;

  // Transação: atualizar tudo + estornar movimentações
  await sql.begin(async (tx: any) => {
    // Atualizar tarefa para 'rejeitada'
    await tx`
      UPDATE alissonerp.tarefas
      SET status = 'rejeitada', updated_at = NOW()
      WHERE id = ${tarefa_id}
    `;

    // Atualizar conversão para 'recusado'
    await tx`
      UPDATE alissonerp.conversoes_estoque
      SET status_conversao = 'recusado',
          recusado_por = ${user.id}::uuid,
          recusado_em = NOW(),
          foto_recusa = ${fotoPath},
          motivo_recusa = ${motivo ?? null},
          updated_at = NOW()
      WHERE id = ${conversao_id}
    `;

    // Para cada item: cancelar a reserva (libera estoque sem criar movimento)
    for (const item of itens) {
      if (item.reserva_id) {
        await tx`
          UPDATE alissonerp.reservas_estoque_comercial
          SET status = 'cancelado', cancelado_em = NOW()
          WHERE id = ${item.reserva_id} AND status = 'ativo'
        `;
      }
    }

    // Atualizar ordem para cancelado
    await tx`
      UPDATE alissonerp.ordens
      SET status = 'cancelado', situacao = 'cancelado', updated_at = NOW()
      WHERE id = ${conversao.ordem_id}
    `;

    // Registrar no histórico da tarefa
    await tx`
      INSERT INTO alissonerp.tarefas_historico
        (tarefa_id, usuario_id, acao, created_at)
      VALUES (${tarefa_id}, ${user.id}::uuid, 'rejeitada', NOW())
    `.catch(() => {});
  });

  return NextResponse.json({
    ok: true,
    message: "Conversão recusada. Produtos devolvidos ao estoque.",
  });
}
