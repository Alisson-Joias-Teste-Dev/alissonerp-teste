import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";

// POST /api/user/avatar
// Body: FormData { file: File, user_id?: string }
// Faz upload no bucket 'avatars' e atualiza user_profiles.avatar_url
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();

  // Verificar autenticação
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  // Verificar permissões — join por UUID (emails podem diferir entre tabelas)
  const rows = await sql`
    SELECT role::text AS role, id AS id_user
    FROM alissonerp.usuarios
    WHERE id = ${user.id}::uuid
  `;
  const meuPerfil = rows[0];
  if (!meuPerfil) return NextResponse.json({ error: "Perfil não encontrado" }, { status: 404 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const targetUserId = (formData.get("user_id") as string) || String(meuPerfil.id_user);

  if (!file) return NextResponse.json({ error: "Arquivo obrigatório" }, { status: 400 });

  // Apenas admin/desenvolvedor pode alterar foto de outros
  if (targetUserId !== String(meuPerfil.id_user) && !isFullAccess(meuPerfil.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  // Extensão e caminho no bucket
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const path = `${targetUserId}.${ext}`;

  // Converter File → ArrayBuffer → Buffer
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Obter session token para auth
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  // Tentar UPSERT (PUT) primeiro, se falhar tenta POST
  let uploadRes = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/avatars/${path}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        "Content-Type": file.type || "image/jpeg",
        "x-upsert": "true",
      },
      body: buffer,
    }
  );

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    return NextResponse.json(
      { error: `Upload falhou: ${uploadRes.status} — ${errText}` },
      { status: 500 }
    );
  }

  // URL pública com cache-bust (garante que o browser não usa versão em cache)
  const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/avatars/${path}?t=${Date.now()}`;

  // Atualizar avatar_url buscando por email — funciona mesmo se id_user estiver desincronizado
  await sql`
    UPDATE public.user_profiles
    SET avatar_url = ${publicUrl}, updated_at = now()
    WHERE email = (SELECT email FROM alissonerp.usuarios WHERE id = ${targetUserId}::uuid)
  `;

  return NextResponse.json({ avatar_url: publicUrl });
}
