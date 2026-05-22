import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import sql from "@/lib/db";

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = await req.json() as {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };

  if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }

  await sql`
    INSERT INTO alissonerp.push_subscriptions (usuario_id, endpoint, p256dh, auth_key, user_agent)
    VALUES (${user.id}::uuid, ${body.endpoint}, ${body.keys.p256dh}, ${body.keys.auth},
            ${req.headers.get("user-agent") ?? null})
    ON CONFLICT (endpoint) DO UPDATE
      SET usuario_id = EXCLUDED.usuario_id,
          p256dh     = EXCLUDED.p256dh,
          auth_key   = EXCLUDED.auth_key
  `;

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { endpoint } = await req.json() as { endpoint: string };
  if (!endpoint) return NextResponse.json({ error: "endpoint obrigatório" }, { status: 400 });

  await sql`
    DELETE FROM alissonerp.push_subscriptions
    WHERE endpoint = ${endpoint} AND usuario_id = ${user.id}::uuid
  `;

  return NextResponse.json({ ok: true });
}
