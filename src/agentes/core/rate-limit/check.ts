import sql from '../../../lib/db';

const BURST_WINDOW = 60_000;
const SUSTAINED_WINDOW = 3_600_000;

const checkMap = new Map<number, { burst: number[]; sustained: number[]; tokens30d: number; lastTokenReset: number }>();

const BURST_LIMIT = 10;
const SUSTAINED_LIMIT = 100;
const TOKEN_LIMIT = 200_000;

export function checkRateLimit(chatId: number, tokensThisMsg: number): boolean {
  const now = Date.now();
  let entry = checkMap.get(chatId);

  if (!entry) {
    entry = { burst: [], sustained: [], tokens30d: 0, lastTokenReset: now };
    checkMap.set(chatId, entry);
  }

  entry.burst = entry.burst.filter((t) => now - t < BURST_WINDOW);
  entry.sustained = entry.sustained.filter((t) => now - t < SUSTAINED_WINDOW);

  if (entry.burst.length >= BURST_LIMIT) return false;
  if (entry.sustained.length >= SUSTAINED_LIMIT) return false;
  if (entry.tokens30d + tokensThisMsg > TOKEN_LIMIT) return false;

  entry.burst.push(now);
  entry.sustained.push(now);
  entry.tokens30d += tokensThisMsg;

  return true;
}

export async function getTokenUsage30d(usuarioSkillId: number): Promise<number> {
  const rows = await sql`
    SELECT COALESCE(SUM(tokens_in + tokens_out), 0)::int AS total
    FROM agentes.conversas
    WHERE usuario_skill_id = ${usuarioSkillId}
      AND criada_em > NOW() - INTERVAL '30 days'
  `;
  return rows[0].total as number;
}
