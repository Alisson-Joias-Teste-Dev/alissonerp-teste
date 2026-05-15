import { createHash, randomBytes } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import sql from '../../../lib/db';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const LOGIN_STATE = new Map<number, { state: 'ASK_EMAIL' | 'ASK_PASSWORD'; email: string; attempts: number; lastAttempt: number }>();

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function generateToken(): string {
  return randomBytes(32).toString('hex');
}

export function getLoginState(chatId: number) {
  return LOGIN_STATE.get(chatId) ?? null;
}

export function clearLoginState(chatId: number) {
  LOGIN_STATE.delete(chatId);
}

async function findEmail(chatId: number): Promise<string | null> {
  const rows = await sql`
    SELECT email FROM alissonerp.usuarios WHERE email IS NOT NULL LIMIT 1
  `;
  return rows.length > 0 ? (rows[0].email as string) : null;
}

async function findUserByEmail(email: string): Promise<{ id: string; nome: string } | null> {
  const rows = await sql`
    SELECT id, nome FROM alissonerp.usuarios WHERE email = ${email} LIMIT 1
  `;
  if (rows.length === 0) return null;
  return { id: rows[0].id as string, nome: rows[0].nome as string };
}

async function findUsuarioByChatId(
  chatId: number,
): Promise<{ id: number; usuarioId: string; nome: string; tokenExpiresAt: Date } | null> {
  const rows = await sql`
    SELECT us.id, us.usuario_id, u.nome, us.token_expires_at
    FROM agentes.usuarios_skill us
    JOIN alissonerp.usuarios u ON u.id = us.usuario_id
    WHERE us.telegram_chat_id = ${chatId} AND us.esquecido_em IS NULL
    LIMIT 1
  `;
  if (rows.length === 0) return null;
  return {
    id: rows[0].id as number,
    usuarioId: rows[0].usuario_id as string,
    nome: rows[0].nome as string,
    tokenExpiresAt: rows[0].token_expires_at as Date,
  };
}

async function storeSession(
  skillId: number,
  usuarioId: string,
  chatId: number,
  username: string | undefined,
  tokenHash: string,
): Promise<void> {
  const existing = await sql`
    SELECT id FROM agentes.usuarios_skill
    WHERE skill_id = ${skillId} AND telegram_chat_id = ${chatId}
    LIMIT 1
  `;

  if (existing.length > 0) {
    await sql`
      UPDATE agentes.usuarios_skill
      SET token_hash = ${tokenHash},
          token_expires_at = NOW() + INTERVAL '30 days',
          last_login_at = NOW(),
          telegram_username = ${username ?? null}
      WHERE id = ${existing[0].id as number}
    `;
  } else {
    await sql`
      INSERT INTO agentes.usuarios_skill
        (skill_id, usuario_id, telegram_chat_id, telegram_username, token_hash, token_expires_at, last_login_at)
      VALUES (${skillId}, ${usuarioId}, ${chatId}, ${username ?? null}, ${tokenHash}, NOW() + INTERVAL '30 days', NOW())
    `;
  }
}

export async function handleAuthFlow(
  chatId: number,
  text: string,
  skillSlug: string,
): Promise<{ reply: string; authenticated: boolean }> {
  const existingUser = await findUsuarioByChatId(chatId);

  if (existingUser) {
    if (existingUser.tokenExpiresAt > new Date()) {
      await sql`
        UPDATE agentes.usuarios_skill
        SET token_expires_at = NOW() + INTERVAL '30 days',
            last_login_at = NOW()
        WHERE id = ${existingUser.id}
      `;
      return { reply: '', authenticated: true };
    }

    await sql`
      UPDATE agentes.usuarios_skill
      SET token_hash = NULL, token_expires_at = NULL
      WHERE id = ${existingUser.id}
    `;
  }

  let state = LOGIN_STATE.get(chatId);
  const now = Date.now();

  if (state && now - state.lastAttempt > 15 * 60 * 1000) {
    LOGIN_STATE.delete(chatId);
    state = undefined;
  }

  if (text === '*sair') {
    LOGIN_STATE.delete(chatId);
    if (existingUser) {
      await sql`
        UPDATE agentes.usuarios_skill
        SET token_hash = NULL, token_expires_at = NULL
        WHERE id = ${existingUser.id}
      `;
    }
    return { reply: 'Você foi desconectado. Até mais!', authenticated: false };
  }

  if (!state) {
    LOGIN_STATE.set(chatId, { state: 'ASK_EMAIL', email: '', attempts: 0, lastAttempt: now });
    return { reply: 'Olá! Quem é você? Me manda seu email do ERP.', authenticated: false };
  }

  if (state.state === 'ASK_EMAIL') {
    const user = await findUserByEmail(text.trim().toLowerCase());
    if (!user) {
      LOGIN_STATE.set(chatId, {
        ...state,
        attempts: state.attempts + 1,
        lastAttempt: now,
      });
      if (state.attempts >= 4) {
        LOGIN_STATE.delete(chatId);
        return { reply: 'Email não encontrado. Tente novamente mais tarde.', authenticated: false };
      }
      return { reply: 'Email não encontrado no ERP. Tente de novo.', authenticated: false };
    }

    LOGIN_STATE.set(chatId, {
      state: 'ASK_PASSWORD',
      email: text.trim().toLowerCase(),
      attempts: 0,
      lastAttempt: now,
    });
    return { reply: `Oi ${user.nome}! Agora me manda sua senha do ERP.`, authenticated: false };
  }

  if (state.state === 'ASK_PASSWORD') {
    if (state.attempts >= 4) {
      LOGIN_STATE.delete(chatId);
      return { reply: 'Muitas tentativas. Aguarde 15 minutos.', authenticated: false };
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: state.email,
      password: text,
    });

    if (error) {
      LOGIN_STATE.set(chatId, {
        ...state,
        attempts: state.attempts + 1,
        lastAttempt: now,
      });
      return { reply: 'Senha incorreta. Tente de novo.', authenticated: false };
    }

    const user = await findUserByEmail(state.email);
    if (!user) {
      LOGIN_STATE.delete(chatId);
      return { reply: 'Usuário não encontrado no ERP. Contate o admin.', authenticated: false };
    }

    const skillRows = await sql`
      SELECT id FROM agentes.skills WHERE slug = ${skillSlug} LIMIT 1
    `;
    if (skillRows.length === 0) {
      LOGIN_STATE.delete(chatId);
      return { reply: 'Skill não configurada.', authenticated: false };
    }

    const rawToken = generateToken();
    const hashedToken = hashToken(rawToken);

    await storeSession(
      skillRows[0].id as number,
      user.id,
      chatId,
      undefined,
      hashedToken,
    );

    LOGIN_STATE.delete(chatId);
    return {
      reply: `Autenticado com sucesso, ${user.nome}! Sou o Gerente de Produção virtual. Em que posso ajudar?`,
      authenticated: true,
    };
  }

  return { reply: 'Algo deu errado. Mande *sair para recomeçar.', authenticated: false };
}
