// Comentarios da DEVOLUCAO (B2) — espelho de /api/ordens/[id]/comentarios.
// Tabela propria (comentarios_devolucao) para nao impactar as ordens. Inclui
// @mencoes com alarme (notificacoes.devolucao_id/comentario_devolucao_id) e foto.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { hasRole, ROLES_DEVOLUCAO } from "@/lib/roles";
import { uploadFile } from "@/lib/storage";
import {
  LIMITS,
  checkBase64Length,
  checkStringLength,
  payloadTooLargeResponse,
} from "@/lib/payload-limits";
import { zodError } from "@/lib/schemas/common";
import { criarNotificacao } from "@/lib/notificacoes";

const ComentarioPostSchema = z.object({
  texto: z.string().min(1, "obrigatório"),
  mencoes: z.array(z.string()).optional(),
  foto_path: z.string().nullable().optional(),
  foto_base64: z.string().nullable().optional(),
}).passthrough();

async function getUserRole(userId: string): Promise<string | null> {
  const [row] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${userId}::uuid`;
  return row?.role ?? null;
}

// GET /api/devolucoes/[id]/comentarios
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!hasRole(await getUserRole(user.id), ROLES_DEVOLUCAO)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const devId = parseInt(id);
  if (isNaN(devId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const comentarios = await sql`
    SELECT c.id, c.texto, c.mencoes, c.autor_id, c.editado, c.editado_em, c.created_at,
           c.foto_path,
           u.nome AS autor_nome, u.role AS autor_role
    FROM alissonerp.comentarios_devolucao c
    JOIN alissonerp.usuarios u ON u.id = c.autor_id
    WHERE c.devolucao_id = ${devId} AND (c.excluido = false OR c.excluido IS NULL)
    ORDER BY c.created_at ASC
  `;
  return NextResponse.json(comentarios);
}

// POST /api/devolucoes/[id]/comentarios
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!hasRole(await getUserRole(user.id), ROLES_DEVOLUCAO)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const devId = parseInt(id);
  if (isNaN(devId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const raw = await req.json().catch(() => ({}));
  const parsed = ComentarioPostSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { texto, mencoes = [], foto_path: fotoPathBody = null, foto_base64 = null } = parsed.data;

  try {
    checkStringLength("texto", texto, LIMITS.OBSERVACOES_MAX);
    checkBase64Length("foto_base64", foto_base64, LIMITS.IMAGE_BASE64_MAX);
  } catch (e) {
    const r = payloadTooLargeResponse(e);
    if (r) return r;
    throw e;
  }

  // Upload server-side se vier foto em base64 (reusa o bucket ordem-fotos).
  let foto_path: string | null = fotoPathBody;
  if (foto_base64) {
    const ext = (foto_base64 as string).includes("png") ? "png" : "jpg";
    const path = `comentarios-devolucao/${devId}/${Date.now()}-${user.id.substring(0, 8)}.${ext}`;
    const result = await uploadFile("ordem-fotos", path, foto_base64 as string, `image/${ext}`);
    if ("path" in result) foto_path = result.path;
  }

  if (!texto?.trim()) return NextResponse.json({ error: "Texto obrigatório" }, { status: 400 });

  const [autor] = await sql`SELECT id, nome FROM alissonerp.usuarios WHERE id = ${user.id}::uuid`;
  if (!autor) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });

  // Fecha mencoes pendentes do autor nesta devolucao antes de criar o novo comentario.
  await sql`
    UPDATE alissonerp.notificacoes
    SET aguardando_resposta = false, respondida_em = NOW()
    WHERE usuario_id = ${user.id}::uuid
      AND devolucao_id = ${devId}
      AND tipo = 'mencao'
      AND aguardando_resposta = true
  `;

  const [comentario] = await sql`
    INSERT INTO alissonerp.comentarios_devolucao (devolucao_id, autor_id, texto, mencoes, foto_path)
    VALUES (${devId}, ${user.id}::uuid, ${texto}, ${mencoes}::uuid[], ${foto_path ?? null})
    RETURNING id, created_at
  `;

  const [dev] = await sql`SELECT numero FROM alissonerp.devolucoes_venda WHERE id = ${devId}`;

  for (const mencionadoId of mencoes) {
    if (mencionadoId === user.id) continue;
    await criarNotificacao({
      usuarioId: mencionadoId,
      tipo: "mencao",
      titulo: `@${autor.nome} mencionou você na devolução ${dev?.numero ?? devId}`,
      mensagem: texto.substring(0, 100),
      link: `/devolucoes/${devId}`,
      devolucaoId: devId,
      comentarioDevolucaoId: comentario.id,
      remetenteId: user.id,
      aguardandoResposta: true,
    }).catch(() => {});
  }

  return NextResponse.json({
    success: true,
    comentario: { id: comentario.id, created_at: comentario.created_at },
  });
}
