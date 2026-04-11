import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { getPublicOrigin } from "@/lib/public-origin";

// ─── GET /api/integracoes/tiny/callback ──────────────────────────────────────
// Callback OAuth2 do Tiny ERP: recebe o authorization code, troca por tokens.
// O redirect_uri usado aqui PRECISA ser exatamente igual ao usado no /auth
// senão o Keycloak recusa com "redirect_uri doesn't match". Por isso ambos
// usam getPublicOrigin() que respeita X-Forwarded-Host atrás de proxy.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    const error = req.nextUrl.searchParams.get("error") ?? "Código de autorização não recebido";
    return NextResponse.redirect(
      new URL(`/configuracoes?tab=integracoes&tiny_error=${encodeURIComponent(error)}`, req.url)
    );
  }

  // Buscar client_id e client_secret
  const secrets = await sql`
    SELECT chave, valor_encrypted FROM alissonerp.configuracoes_secrets
    WHERE chave IN ('tiny_client_id', 'tiny_client_secret')
  `;
  const secretMap = new Map(secrets.map(s => [s.chave, String(s.valor_encrypted).replace(/"/g, "").trim()]));
  const clientId = secretMap.get("tiny_client_id") ?? "";
  const clientSecret = secretMap.get("tiny_client_secret") ?? "";

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      new URL("/configuracoes?tab=integracoes&tiny_error=Client+ID+ou+Secret+não+configurados", req.url)
    );
  }

  const origin = getPublicOrigin(req);
  const redirectUri = `${origin}/api/integracoes/tiny/callback`;

  try {
    // Trocar código por tokens
    const tokenRes = await fetch(
      "https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
        }),
        signal: AbortSignal.timeout(15000),
      }
    );

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      let errMsg = `Tiny OAuth erro ${tokenRes.status}`;
      try { const j = JSON.parse(errText); errMsg = j.error_description || j.error || errMsg; } catch { /* */ }
      return NextResponse.redirect(
        new URL(`/configuracoes?tab=integracoes&tiny_error=${encodeURIComponent(errMsg)}`, req.url)
      );
    }

    const tokens = await tokenRes.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      token_type?: string;
    };

    // Salvar access_token e refresh_token
    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;

    await sql`
      INSERT INTO alissonerp.configuracoes_secrets (chave, valor_encrypted)
      VALUES ('tiny_bearer_token', ${JSON.stringify(tokens.access_token)})
      ON CONFLICT (chave) DO UPDATE SET valor_encrypted = ${JSON.stringify(tokens.access_token)}
    `;

    // BUG FIX: antes usava coluna (chave, valor) que nao existe, fazendo o
    // refresh_token nunca ser salvo. Agora usa (chave, valor_encrypted).
    if (tokens.refresh_token) {
      await sql`
        INSERT INTO alissonerp.configuracoes_secrets (chave, valor_encrypted)
        VALUES ('tiny_refresh_token', ${JSON.stringify(tokens.refresh_token)})
        ON CONFLICT (chave) DO UPDATE SET valor_encrypted = ${JSON.stringify(tokens.refresh_token)}
      `;
    }

    if (expiresAt) {
      await sql`
        INSERT INTO alissonerp.configuracoes_secrets (chave, valor_encrypted)
        VALUES ('tiny_token_expires_at', ${JSON.stringify(expiresAt)})
        ON CONFLICT (chave) DO UPDATE SET valor_encrypted = ${JSON.stringify(expiresAt)}
      `;
    }

    return NextResponse.redirect(
      new URL("/configuracoes?tab=integracoes&tiny_ok=1", req.url)
    );

  } catch (e) {
    const errMsg = e instanceof Error ? e.message : "Erro na comunicação com o Tiny";
    return NextResponse.redirect(
      new URL(`/configuracoes?tab=integracoes&tiny_error=${encodeURIComponent(errMsg)}`, req.url)
    );
  }
}
