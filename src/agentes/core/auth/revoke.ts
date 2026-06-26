import sql from '../../../lib/db';

export async function revokeSession(chatId: number): Promise<void> {
  await sql`
    UPDATE agentes.usuarios_skill
    SET token_hash = NULL, token_expires_at = NULL
    WHERE telegram_chat_id = ${chatId} AND esquecido_em IS NULL
  `;
}
