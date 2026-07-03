import sql from "@/lib/db";

async function readTinyToken(): Promise<string | null> {
  const [row] = await sql`
    SELECT valor_encrypted FROM alissonerp.configuracoes_secrets WHERE chave = 'tiny_bearer_token'
  `;
  if (!row?.valor_encrypted) return null;
  let token: string;
  try { token = JSON.parse(row.valor_encrypted); } catch { token = String(row.valor_encrypted); }
  return token.replace(/"/g, "").trim() || null;
}

function combineSignals(...signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  const cleanups: (() => void)[] = [];
  for (const sig of signals) {
    if (sig.aborted) {
      controller.abort(sig.reason);
      cleanups.forEach(fn => fn());
      return controller.signal;
    }
    const onAbort = () => controller.abort(sig.reason);
    sig.addEventListener("abort", onAbort, { once: true });
    cleanups.push(() => sig.removeEventListener("abort", onAbort));
  }
  return controller.signal;
}

export async function refreshTinyToken(signal?: AbortSignal): Promise<string | null> {
  const [ciRow] = await sql`SELECT valor_encrypted FROM alissonerp.configuracoes_secrets WHERE chave = 'tiny_client_id'`;
  const [csRow] = await sql`SELECT valor_encrypted FROM alissonerp.configuracoes_secrets WHERE chave = 'tiny_client_secret'`;
  if (!ciRow?.valor_encrypted || !csRow?.valor_encrypted) return null;

  let clientId: string, clientSecret: string;
  try { clientId = JSON.parse(ciRow.valor_encrypted); } catch { clientId = String(ciRow.valor_encrypted); }
  try { clientSecret = JSON.parse(csRow.valor_encrypted); } catch { clientSecret = String(csRow.valor_encrypted); }
  clientId = clientId.replace(/"/g, "").trim();
  clientSecret = clientSecret.replace(/"/g, "").trim();

  const [rtRow] = await sql`SELECT valor_encrypted FROM alissonerp.configuracoes_secrets WHERE chave = 'tiny_refresh_token'`;
  const attempts: URLSearchParams[] = [];
  if (rtRow?.valor_encrypted) {
    let rt: string;
    try { rt = JSON.parse(rtRow.valor_encrypted); } catch { rt = String(rtRow.valor_encrypted); }
    rt = rt.replace(/"/g, "").trim();
    if (rt) {
      attempts.push(new URLSearchParams({
        grant_type: "refresh_token", refresh_token: rt,
        client_id: clientId, client_secret: clientSecret,
      }));
    }
  }
  attempts.push(new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId, client_secret: clientSecret,
  }));

  console.error(`[refreshTinyToken] INICIO grantTypes=${attempts.map(a => a.get("grant_type")).join(",")}`);

  for (const body of attempts) {
    const grantType = body.get("grant_type") ?? "?";
    const tReq = Date.now();
    try {
      const timeoutSignal = AbortSignal.timeout(6000);
      const fetchSignal = signal ? combineSignals(signal, timeoutSignal) : timeoutSignal;
      const res = await fetch("https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        signal: fetchSignal,
      });
      console.error(`[refreshTinyToken] ${grantType} status=${res.status} duracao=${Date.now() - tReq}ms`);
      if (!res.ok) continue;
      const tokens = await res.json() as { access_token: string; refresh_token?: string; expires_in?: number };
      await sql`INSERT INTO alissonerp.configuracoes_secrets (chave, valor_encrypted) VALUES ('tiny_bearer_token', ${JSON.stringify(tokens.access_token)}) ON CONFLICT (chave) DO UPDATE SET valor_encrypted = ${JSON.stringify(tokens.access_token)}`;
      if (tokens.refresh_token) {
        await sql`INSERT INTO alissonerp.configuracoes_secrets (chave, valor_encrypted) VALUES ('tiny_refresh_token', ${JSON.stringify(tokens.refresh_token)}) ON CONFLICT (chave) DO UPDATE SET valor_encrypted = ${JSON.stringify(tokens.refresh_token)}`;
      }
      if (tokens.expires_in) {
        const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
        await sql`INSERT INTO alissonerp.configuracoes_secrets (chave, valor_encrypted) VALUES ('tiny_token_expires_at', ${JSON.stringify(expiresAt)}) ON CONFLICT (chave) DO UPDATE SET valor_encrypted = ${JSON.stringify(expiresAt)}`;
      }
      console.error(`[refreshTinyToken] SUCESSO ${grantType}`);
      return tokens.access_token;
    } catch (err) {
      console.error(`[refreshTinyToken] EXCEPTION ${grantType} duracao=${Date.now() - tReq}ms`, err);
      continue;
    }
  }
  console.error(`[refreshTinyToken] FALHA todas as tentativas`);
  return null;
}

export async function ensureTinyToken(signal?: AbortSignal): Promise<string> {
  const t0 = Date.now();

  let token = await readTinyToken();
  if (!token) {
    console.error(`[ensureTinyToken] token inexistente, chamando refresh`);
    const refreshed = await refreshTinyToken(signal);
    if (!refreshed) {
      console.error(`[ensureTinyToken] refresh falhou`);
      throw new Error("Token do Tiny não configurado. Vá em Configurações > Integrações e clique 'Reconectar Tiny'.");
    }
    token = refreshed;
    console.error(`[ensureTinyToken] refresh OK duracao=${Date.now() - t0}ms`);
  }

  const [expiresRow] = await sql`
    SELECT valor_encrypted FROM alissonerp.configuracoes_secrets WHERE chave = 'tiny_token_expires_at'
  `;
  if (expiresRow?.valor_encrypted) {
    let expiresAtIso: string;
    try { expiresAtIso = JSON.parse(expiresRow.valor_encrypted); } catch { expiresAtIso = String(expiresRow.valor_encrypted); }
    expiresAtIso = expiresAtIso.replace(/"/g, "").trim();
    const expiresAt = new Date(expiresAtIso);
    if (!isNaN(expiresAt.getTime()) && expiresAt.getTime() - Date.now() < 10 * 60 * 1000) {
      console.error(`[ensureTinyToken] token expira em breve ${expiresAtIso}, renovando`);
      const newToken = await refreshTinyToken(signal);
      if (newToken) {
        token = newToken;
        console.error(`[ensureTinyToken] renovacao OK`);
      } else if (expiresAt.getTime() < Date.now()) {
        console.error(`[ensureTinyToken] token EXPIRADO e refresh falhou`);
        throw new Error("Token do Tiny expirado. Vá em Configurações > Integrações e clique 'Reconectar Tiny'.");
      }
    }
  }

  console.error(`[ensureTinyToken] FIM duracao=${Date.now() - t0}ms tokenLength=${token.length}`);
  return token;
}
