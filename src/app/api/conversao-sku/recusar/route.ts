import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { uploadFile, ensureBucket } from "@/lib/storage";
import { zodError } from "@/lib/schemas/common";
import { podeDecidir } from "@/lib/aprovacoes";

const ConversaoSkuRecusarSchema = z.object({
  tarefa_id: z.coerce.number().int().positive(),
  conversao_sku_id: z.coerce.number().int().positive().optional(),
  motivo: z.string().optional(),
  foto_base64: z.string().optional(),
}).passthrough();

// POST /api/conversao-sku/recusar
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  // REGRA DE NEGÓCIO: mesma autoridade do "aprovar" — aprovador_conversao.
  const [usuario] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  const decisao = await podeDecidir({ id: user.id, role: usuario?.role ?? null }, "conversao_sku");
  if (!decisao.pode) {
    return NextResponse.json({ error: "Apenas administradores podem recusar" }, { status: 403 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = ConversaoSkuRecusarSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { tarefa_id, conversao_sku_id, motivo, foto_base64 } = parsed.data;

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

  let fotoPath: string | null = null;
  if (foto_base64) {
    try {
      await ensureBucket("conversao-fotos");
    } catch {
      console.warn("[conversao-sku/recusar] ensureBucket falhou");
    }
    fotoPath = `sku_recusa/${Date.now()}_${user.id}.jpg`;
    const r = await uploadFile("conversao-fotos", fotoPath, foto_base64, "image/jpeg");
    if ("error" in r) {
      console.warn(`[recusar] Upload foto falhou: ${r.error}`);
      fotoPath = null;
    }
  }

  await sql.begin(async (tx: any) => {
    await tx`
      UPDATE alissonerp.tarefas
      SET status = 'rejeitada', updated_at = NOW()
      WHERE id = ${tarefa_id}
    `;

    await tx`
      UPDATE alissonerp.conversoes_sku
      SET status_conversao = 'recusado',
          recusado_por = ${user.id}::uuid,
          recusado_em = NOW(),
          foto_recusa = ${fotoPath},
          motivo_recusa = ${motivo ?? null},
          updated_at = NOW()
      WHERE id = ${conv.id}
    `;

    // Cancelar reserva
    await tx`
      UPDATE alissonerp.reservas_estoque_comercial
      SET status = 'cancelado', cancelado_em = NOW()
      WHERE ordem_id = ${conv.ordem_id} AND status = 'ativo'
    `;

    // Cancelar ordem
    await tx`
      UPDATE alissonerp.ordens
      SET status = 'cancelado', situacao = 'cancelado', updated_at = NOW()
      WHERE id = ${conv.ordem_id}
    `;

    await tx`
      INSERT INTO alissonerp.tarefas_historico
        (tarefa_id, usuario_id, acao, created_at)
      VALUES (${tarefa_id}, ${user.id}::uuid, 'rejeitada', NOW())
    `.catch(() => {});
  });

  return NextResponse.json({
    ok: true,
    message: "Conversão SKU recusada. SKU devolvido ao estoque.",
  });
}
