import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { uploadFile, ensureBucket } from "@/lib/storage";
import { zodError } from "@/lib/schemas/common";
import { podeDecidir } from "@/lib/aprovacoes";

const ConversaoReversaRecusarSchema = z.object({
  tarefa_id: z.coerce.number().int().positive(),
  conversao_reversa_id: z.coerce.number().int().positive().optional(),
  motivo_recusa: z.string().optional(),
  foto_base64: z.string().optional(),
}).passthrough();

// POST /api/conversao-reversa/recusar
// Body: { tarefa_id: number, conversao_reversa_id?: number, motivo_recusa?: string, foto_base64?: string }
// Admin/desenvolvedor recusa a conversão reversa → ordem cancelada.
// REGRA DE NEGÓCIO: recusa NÃO toca em cofre nem em estoque — como a conversão
// reversa é 'pendente' (metal ainda não saiu do cofre, peça ainda não entrou
// no estoque comercial), recusar é só cancelar a solicitação. Diferente da
// conversão normal (estoque→metal), não há reserva nem movimentação para
// estornar aqui.
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 403 });
  // Mesma regra da aprovação: só quem está na lista configurada decide (config
  // vazia = ninguém, nem admin/dev). Ver conversao-reversa/aprovar/route.ts e
  // docs/regras-negocio/aprovacoes-refatoracao/03b-config-first-estrito.md.
  const decisao = await podeDecidir({ id: user.id, role: usuario.role }, "conversao_reversa");
  if (!decisao.pode) {
    return NextResponse.json({ error: "Você não está na lista de aprovadores da conversão reversa." }, { status: 403 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = ConversaoReversaRecusarSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { tarefa_id, conversao_reversa_id, motivo_recusa, foto_base64 } = parsed.data;

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

  // Buscar conversão reversa pelo ordem_id da tarefa (ou pelo conversao_reversa_id enviado)
  const [conversao] = conversao_reversa_id
    ? await sql`
        SELECT id, status_conversao, ordem_id
        FROM alissonerp.conversoes_reversas WHERE id = ${conversao_reversa_id}
        LIMIT 1
      `
    : await sql`
        SELECT id, status_conversao, ordem_id
        FROM alissonerp.conversoes_reversas WHERE ordem_id = ${tarefa.ordem_id}
        LIMIT 1
      `;
  if (!conversao) {
    return NextResponse.json({ error: "Conversão reversa não encontrada" }, { status: 404 });
  }
  if (conversao.status_conversao !== "pendente") {
    return NextResponse.json({ error: `Conversão reversa já está "${conversao.status_conversao}"` }, { status: 409 });
  }

  // Upload da foto de recusa (opcional — falha não bloqueia a recusa)
  let fotoPath: string | null = null;
  if (foto_base64) {
    try {
      await ensureBucket("conversao-fotos");
    } catch {
      console.warn("[conversao-reversa/recusar] ensureBucket falhou — continuando sem foto");
    }
    fotoPath = `reversa_recusa/${Date.now()}_${user.id}.jpg`;
    const r = await uploadFile("conversao-fotos", fotoPath, foto_base64, "image/jpeg");
    if ("error" in r) {
      console.warn(`[conversao-reversa/recusar] Upload da foto falhou — continuando sem foto: ${r.error}`);
      fotoPath = null;
    }
  }

  // Transação: tarefa rejeitada + conversão recusada + ordem cancelada
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const processada = await sql.begin(async (tx: any) => {
    // TRAVA ATÔMICA contra processamento duplo concorrente (aprovar×recusar ou
    // recusar×recusar simultâneos) — mesmo padrão do aprovar. A 2ª transação
    // espera o lock, reavalia o WHERE, não acha 'pendente' e sai sem tocar nada.
    const [lock] = await tx`
      UPDATE alissonerp.conversoes_reversas
      SET updated_at = NOW()
      WHERE id = ${conversao.id} AND status_conversao = 'pendente'
      RETURNING id
    `;
    if (!lock) return false;

    // Atualizar tarefa para 'rejeitada'
    await tx`
      UPDATE alissonerp.tarefas
      SET status = 'rejeitada', updated_at = NOW()
      WHERE id = ${tarefa_id}
    `;

    // Atualizar conversão reversa para 'recusado'
    await tx`
      UPDATE alissonerp.conversoes_reversas
      SET status_conversao = 'recusado',
          recusado_por = ${user.id}::uuid,
          recusado_em = NOW(),
          foto_recusa = ${fotoPath},
          motivo_recusa = ${motivo_recusa ?? null},
          updated_at = NOW()
      WHERE id = ${conversao.id}
    `;

    // Atualizar ordem para cancelado — NENHUM toque em cofre/estoque
    await tx`
      UPDATE alissonerp.ordens
      SET status = 'cancelado', situacao = 'cancelado', updated_at = NOW()
      WHERE id = ${conversao.ordem_id}
    `;

    // Registrar no histórico da tarefa — não pode falhar a operação principal
    await tx`
      INSERT INTO alissonerp.tarefas_historico
        (tarefa_id, usuario_id, acao, created_at)
      VALUES (${tarefa_id}, ${user.id}::uuid, 'rejeitada', NOW())
    `.catch(() => {});

    return true;
  });

  if (!processada) {
    return NextResponse.json(
      { error: "Conversão reversa já foi processada por outro aprovador" },
      { status: 409 },
    );
  }

  return NextResponse.json({
    ok: true,
    message: "Conversão reversa recusada. Nenhum metal saiu do cofre e nenhuma peça entrou no estoque.",
  });
}
