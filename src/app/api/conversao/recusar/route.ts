import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { uploadFile, ensureBucket } from "@/lib/storage";
import { zodError } from "@/lib/schemas/common";
import { podeDecidir } from "@/lib/aprovacoes";

const ConversaoRecusarSchema = z.object({
  tarefa_id: z.coerce.number().int().positive(),
  conversao_id: z.coerce.number().int().positive().optional(),
  motivo: z.string().optional(),
  foto_base64: z.string().optional(),
}).passthrough();

// POST /api/conversao/recusar
// Body: { tarefa_id: number, conversao_id: number, motivo?: string, foto_base64: string }
// Alisson recusa a conversão → produtos voltam ao estoque, ordem cancelada
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  // REGRA DE NEGÓCIO: mesma autoridade do "aprovar" — só quem estiver em
  // aprovador_conversao decide (política config-first). Sem ctx.solicitanteId
  // (regra do pacote 3b): conversão não exclui quem criou.
  const [usuario] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  const decisao = await podeDecidir({ id: user.id, role: usuario?.role ?? null }, "conversao");
  if (!decisao.pode) {
    return NextResponse.json({ error: "Apenas administradores podem recusar conversões" }, { status: 403 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = ConversaoRecusarSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { tarefa_id, conversao_id, motivo, foto_base64 } = parsed.data;

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

  // Buscar conversao pelo ordem_id da tarefa (ou pelo conversao_id enviado)
  const [conversao] = conversao_id
    ? await sql`
        SELECT id, status_conversao, ordem_id, foto_abertura
        FROM alissonerp.conversoes_estoque WHERE id = ${conversao_id}
        LIMIT 1
      `
    : await sql`
        SELECT id, status_conversao, ordem_id, foto_abertura
        FROM alissonerp.conversoes_estoque WHERE ordem_id = ${tarefa.ordem_id}
        LIMIT 1
      `;
  if (!conversao) {
    return NextResponse.json({ error: "Conversão não encontrada" }, { status: 404 });
  }
  if (conversao.status_conversao !== "pendente") {
    return NextResponse.json({ error: `Conversão já está "${conversao.status_conversao}"` }, { status: 409 });
  }

  // Upload da foto de recusa (opcional)
  let fotoPath: string | null = null;
  if (foto_base64) {
    try {
      await ensureBucket("conversao-fotos");
    } catch {
      console.warn("[recusar] ensureBucket falhou — continuando sem foto");
    }
    if (foto_base64) {
      fotoPath = `recusa/${Date.now()}_${user.id}.jpg`;
      const r = await uploadFile("conversao-fotos", fotoPath, foto_base64, "image/jpeg");
      if ("error" in r) {
        console.warn(`[recusar] Upload da foto falhou — continuando sem foto: ${r.error}`);
        fotoPath = null;
      }
    }
  }

  // Buscar itens da conversão para estornar movimentações
  const itens = await sql`
    SELECT ci.*, p.nome AS produto_nome
    FROM alissonerp.conversao_itens ci
    JOIN alissonerp.produtos_compat p ON p.id_produto = ci.produto_id
    WHERE ci.conversao_id = ${conversao.id}
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
      WHERE id = ${conversao.id}
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
