import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  try {
    const { id } = await params;
    const tarefaId = Number(id);
    if (isNaN(tarefaId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

    const anexos = await sql`
      SELECT a.id, a.nome, a.url, a.tamanho, a.tipo_mime, a.created_at,
             u.nome AS usuario_nome
      FROM alissonerp.tarefas_anexos a
      LEFT JOIN alissonerp.usuarios u ON u.id = a.usuario_id
      WHERE a.tarefa_id = ${tarefaId}
      ORDER BY a.created_at DESC
    `;
    return NextResponse.json(anexos);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[GET /api/tarefas/[id]/anexos]`, msg);
    return NextResponse.json([]);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const tarefaId = Number(id);
  if (isNaN(tarefaId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const body = await req.json() as {
    nome: string;
    url: string;
    tamanho?: number;
    tipo_mime?: string;
  };

  if (!body.nome || !body.url) {
    return NextResponse.json({ error: "nome e url são obrigatórios" }, { status: 400 });
  }

  try {
    const [anexo] = await sql`
      INSERT INTO alissonerp.tarefas_anexos (tarefa_id, usuario_id, nome, url, tamanho, tipo_mime)
      VALUES (${tarefaId}, ${user.id}::uuid, ${body.nome}, ${body.url},
              ${body.tamanho ?? null}, ${body.tipo_mime ?? null})
      RETURNING id, nome, url, created_at
    `;
    return NextResponse.json(anexo, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[POST /api/tarefas/[id]/anexos]`, msg);
    return NextResponse.json({ error: "Tabela tarefas_anexos não disponível. Execute a migration 233." }, { status: 500 });
  }
}
