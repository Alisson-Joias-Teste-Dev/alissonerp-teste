import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

// GET /api/ordens/[id]/comentarios
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const ordemId = parseInt(id);
  if (isNaN(ordemId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const comentarios = await sql`
    SELECT c.id, c.texto, c.mencoes, c.autor_id, c.editado, c.editado_em, c.created_at,
           c.foto_path,
           u.nome AS autor_nome, u.role AS autor_role
    FROM alissonerp.comentarios_ordem c
    JOIN alissonerp.usuarios u ON u.id = c.autor_id
    WHERE c.ordem_id = ${ordemId} AND (c.excluido = false OR c.excluido IS NULL)
    ORDER BY c.created_at ASC
  `;

  return NextResponse.json(comentarios);
}

// POST /api/ordens/[id]/comentarios
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const ordemId = parseInt(id);
  if (isNaN(ordemId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const body = await req.json();
  const { texto, mencoes = [], foto_path = null } = body;

  if (!texto?.trim())
    return NextResponse.json({ error: "Texto obrigatório" }, { status: 400 });

  const [autor] = await sql`
    SELECT id, nome FROM alissonerp.usuarios WHERE id = ${user.id}::uuid
  `;
  if (!autor)
    return NextResponse.json(
      { error: "Usuário não encontrado" },
      { status: 404 }
    );

  // ── Fecha menções pendentes do autor nesta ordem ─────────────────────────
  // Regra: qualquer comentário do usuário na ordem silencia TODAS as menções
  // tipo='mencao' que estavam aguardando resposta dele naquela ordem.
  // Rodamos ANTES do INSERT do novo comentário para não fechar menções que
  // possam vir a ser criadas no mesmo POST (edge case de auto-menção, já
  // ignorado no loop abaixo).
  await sql`
    UPDATE alissonerp.notificacoes
    SET aguardando_resposta = false,
        respondida_em = NOW()
    WHERE usuario_id = ${user.id}::uuid
      AND ordem_id   = ${ordemId}
      AND tipo       = 'mencao'
      AND aguardando_resposta = true
  `;

  const [comentario] = await sql`
    INSERT INTO alissonerp.comentarios_ordem (ordem_id, autor_id, texto, mencoes, foto_path)
    VALUES (${ordemId}, ${user.id}::uuid, ${texto}, ${mencoes}::uuid[], ${foto_path ?? null})
    RETURNING id, created_at
  `;

  const [ordem] = await sql`
    SELECT numero_ordem FROM alissonerp.ordens WHERE id = ${ordemId}
  `;

  for (const mencionadoId of mencoes) {
    if (mencionadoId === user.id) continue;
    await sql`
      INSERT INTO alissonerp.notificacoes (
        usuario_id, tipo, titulo, mensagem, link, ordem_id, comentario_id, remetente_id,
        aguardando_resposta
      )
      VALUES (
        ${mencionadoId}::uuid,
        'mencao',
        ${`@${autor.nome} mencionou você na ${ordem?.numero_ordem ?? ordemId}`},
        ${texto.substring(0, 100)},
        ${`/ordens/${ordemId}`},
        ${ordemId},
        ${comentario.id},
        ${user.id}::uuid,
        true
      )
    `;
  }

  return NextResponse.json({
    success: true,
    comentario: { id: comentario.id, created_at: comentario.created_at },
  });
}
