import sql from '../../../lib/db';

export async function verifyAndRenewToken(chatId: number): Promise<{
  valid: boolean;
  usuarioSkillId: number;
  nome: string;
} | null> {
  const rows = await sql`
    SELECT us.id, us.token_expires_at, u.nome
    FROM agentes.usuarios_skill us
    JOIN alissonerp.usuarios u ON u.id = us.usuario_id
    WHERE us.telegram_chat_id = ${chatId}
      AND us.esquecido_em IS NULL
      AND us.token_hash IS NOT NULL
    LIMIT 1
  `;

  if (rows.length === 0) return null;

  const session = rows[0];
  const expiresAt = session.token_expires_at as Date;

  if (expiresAt < new Date()) {
    await sql`
      UPDATE agentes.usuarios_skill
      SET token_hash = NULL, token_expires_at = NULL
      WHERE id = ${session.id as number}
    `;
    return null;
  }

  await sql`
    UPDATE agentes.usuarios_skill
    SET token_expires_at = NOW() + INTERVAL '30 days',
        last_login_at = NOW()
    WHERE id = ${session.id as number}
  `;

  return {
    valid: true,
    usuarioSkillId: session.id as number,
    nome: session.nome as string,
  };
}
