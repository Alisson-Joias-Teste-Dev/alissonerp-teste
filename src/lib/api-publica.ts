/**
 * API Pública — autenticação por API key + rate limiting em memória
 *
 * Sliding window: mantém timestamps das últimas N requisições por chave.
 * Limpo automaticamente a cada ciclo de verificação.
 */

import { createHash, randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

// ── Rate limiting em memória (sliding window 60s) ───────────────────────────────
const rateLimitWindows = new Map<number, number[]>(); // chave_id → timestamps (ms)

function checkRateLimit(chaveId: number, limitePorMinuto: number): boolean {
  const agora = Date.now();
  const janela = 60_000; // 60 segundos
  const timestamps = rateLimitWindows.get(chaveId) ?? [];

  // Remove timestamps fora da janela
  const recentes = timestamps.filter((t) => agora - t < janela);
  recentes.push(agora);
  rateLimitWindows.set(chaveId, recentes);

  return recentes.length <= limitePorMinuto;
}

// Limpa entradas antigas do Map a cada 5 min para não vazar memória
setInterval(() => {
  const agora = Date.now();
  for (const [id, timestamps] of rateLimitWindows) {
    const recentes = timestamps.filter((t) => agora - t < 60_000);
    if (recentes.length === 0) rateLimitWindows.delete(id);
    else rateLimitWindows.set(id, recentes);
  }
}, 5 * 60_000);

// ── Tipos ───────────────────────────────────────────────────────────────────────
export interface ApiChave {
  id: number;
  nome: string;
  rate_limit_por_minuto: number;
}

export interface AuthResult {
  ok: true;
  chave: ApiChave;
}

export interface AuthError {
  ok: false;
  response: NextResponse;
}

// ── Validação da chave ──────────────────────────────────────────────────────────
export async function autenticarApiKey(
  req: NextRequest
): Promise<AuthResult | AuthError> {
  const apiKey = req.headers.get("x-api-key") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (!apiKey) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "API key obrigatória", hint: "Envie no header: X-API-Key: sk_live_..." },
        { status: 401 }
      ),
    };
  }

  const hash = createHash("sha256").update(apiKey).digest("hex");

  const [chave] = await sql<ApiChave[]>`
    SELECT id, nome, rate_limit_por_minuto
    FROM alissonerp.api_chaves
    WHERE chave_hash = ${hash} AND ativa = true
    LIMIT 1
  `;

  if (!chave) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "API key inválida ou revogada" },
        { status: 401 }
      ),
    };
  }

  // Rate limit
  if (!checkRateLimit(chave.id, chave.rate_limit_por_minuto)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "Rate limit excedido",
          hint: `Máximo ${chave.rate_limit_por_minuto} requisições por minuto`,
        },
        {
          status: 429,
          headers: {
            "Retry-After": "60",
            "X-RateLimit-Limit": String(chave.rate_limit_por_minuto),
          },
        }
      ),
    };
  }

  // Atualiza ultimo_uso e contador de forma assíncrona (não bloqueia a resposta)
  sql`
    UPDATE alissonerp.api_chaves
    SET ultimo_uso = NOW(), total_requisicoes = total_requisicoes + 1
    WHERE id = ${chave.id}
  `.catch(() => { /* não bloqueia */ });

  return { ok: true, chave };
}

// ── Helpers de resposta padronizada ────────────────────────────────────────────
export function apiResponse<T>(
  data: T,
  meta?: Record<string, unknown>,
  status = 200
): NextResponse {
  return NextResponse.json({ data, meta: meta ?? {} }, { status });
}

export function apiListResponse<T>(
  data: T[],
  total: number,
  page: number,
  perPage: number,
  baseUrl: string
): NextResponse {
  const lastPage = Math.ceil(total / perPage);
  const nextPage = page < lastPage ? page + 1 : null;
  const prevPage = page > 1 ? page - 1 : null;

  return NextResponse.json({
    data,
    meta: {
      total,
      page,
      per_page: perPage,
      last_page: lastPage,
      timestamp: new Date().toISOString(),
    },
    links: {
      self: `${baseUrl}?page=${page}&per_page=${perPage}`,
      next: nextPage ? `${baseUrl}?page=${nextPage}&per_page=${perPage}` : null,
      prev: prevPage ? `${baseUrl}?page=${prevPage}&per_page=${perPage}` : null,
    },
  });
}

// ── Geração de nova chave ───────────────────────────────────────────────────────
export function gerarApiKey(): { chave: string; hash: string; preview: string } {
  const raw = randomBytes(32).toString("hex"); // 64 chars hex
  const chave = `sk_live_${raw}`;
  const hash = createHash("sha256").update(chave).digest("hex");
  const preview = `${chave.slice(0, 16)}...`;
  return { chave, hash, preview };
}
