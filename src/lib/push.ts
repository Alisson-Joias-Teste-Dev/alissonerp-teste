/**
 * push.ts — Envio de Web Push Notifications
 * Uso: await enviarPushParaUsuario(usuarioId, { titulo, mensagem, url })
 * Qualquer módulo pode importar e usar.
 */
import webPush from "web-push";
import sql from "@/lib/db";

export interface PushPayload {
  titulo: string;
  mensagem: string;
  url: string;
  icone?: string;
}

let vapidConfigurado = false;

function garantirVapid(): boolean {
  if (vapidConfigurado) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webPush.setVapidDetails(
    `mailto:${process.env.VAPID_EMAIL ?? "admin@alissonjoias.com.br"}`,
    pub,
    priv,
  );
  vapidConfigurado = true;
  return true;
}

export async function enviarPushParaUsuario(
  usuarioId: string,
  payload: PushPayload,
): Promise<void> {
  if (!garantirVapid()) return;

  const subs = await sql`
    SELECT endpoint, p256dh, auth_key
    FROM alissonerp.push_subscriptions
    WHERE usuario_id = ${usuarioId}::uuid
  `;

  if (subs.length === 0) return;

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webPush.sendNotification(
          {
            endpoint: sub.endpoint as string,
            keys: { p256dh: sub.p256dh as string, auth: sub.auth_key as string },
          },
          JSON.stringify({
            titulo: payload.titulo,
            mensagem: payload.mensagem,
            url: payload.url,
            icone: payload.icone ?? "/icons/icon-192.png",
          }),
        );
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 410 || status === 404) {
          await sql`
            DELETE FROM alissonerp.push_subscriptions
            WHERE endpoint = ${sub.endpoint as string}
          `.catch(() => {});
        }
      }
    }),
  );
}
