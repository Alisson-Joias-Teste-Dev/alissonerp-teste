import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import sql from "@/lib/db";

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = await req.json().catch(() => null) as {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  } | null;

  /**
   * REGRA DE NEGOCIO: somente assinaturas Web Push completas entram no banco,
   * pois o envio para celular depende de endpoint, p256dh e auth_key.
   * POR QUE: registros incompletos fazem o push falhar depois e mascaram o
   * problema real de ativacao do dispositivo.
   * IMPACTO: relaxar esta validacao permite salvar assinaturas inuteis em
   * push_subscriptions e quebra a entrega de alertas fora do ERP.
   */
  if (!body?.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }

  try {
    await sql`
      INSERT INTO alissonerp.push_subscriptions (usuario_id, endpoint, p256dh, auth_key, user_agent)
      VALUES (${user.id}::uuid, ${body.endpoint}, ${body.keys.p256dh}, ${body.keys.auth},
              ${req.headers.get("user-agent") ?? null})
      ON CONFLICT (endpoint) DO UPDATE
        SET usuario_id = EXCLUDED.usuario_id,
            p256dh     = EXCLUDED.p256dh,
            auth_key   = EXCLUDED.auth_key,
            user_agent = EXCLUDED.user_agent
    `;
  } catch (err) {
    console.error("[push subscribe] erro ao salvar assinatura", err);
    return NextResponse.json({ error: "Erro ao salvar assinatura push" }, { status: 500 });
  }

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
