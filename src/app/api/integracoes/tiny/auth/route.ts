import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";
import { getPublicOrigin } from "@/lib/public-origin";

// ─── GET /api/integracoes/tiny/auth ──────────────────────────────────────────
// Redireciona o usuário para a página de autorização do Tiny ERP (OAuth2).
//
// Pontos importantes:
//   - scope inclui "offline_access" pra gerar refresh_token de longa duração
//     (sem isso o Keycloak emite refresh_token com TTL curto que expira em
//     horas junto com a sessão SSO — por isso antes o Tiny expirava toda hora).
//   - redirect_uri usa getPublicOrigin() que respeita X-Forwarded-Host
//     (proxy-aware). Precisa ser EXATAMENTE igual ao redirect_uri do callback,
//     senão Keycloak recusa a troca authorization_code → token.
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  if (!usuario || !isFullAccess(usuario.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  // Buscar client_id das configurações
  const [row] = await sql`
    SELECT valor_encrypted FROM alissonerp.configuracoes_secrets WHERE chave = 'tiny_client_id'
  `;
  const clientId = row?.valor_encrypted ? String(row.valor_encrypted).replace(/"/g, "").trim() : "";
  if (!clientId) {
    return NextResponse.json({ error: "Client ID do Tiny não configurado" }, { status: 400 });
  }

  const origin = getPublicOrigin(req);
  const redirectUri = `${origin}/api/integracoes/tiny/callback`;

  const authUrl = new URL("https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  // offline_access é CRUCIAL — sem ele o refresh_token expira junto com a
  // sessão SSO do usuário (tipicamente 30min-8h). Com offline_access, o
  // token vira "offline" e dura semanas/meses.
  authUrl.searchParams.set("scope", "openid offline_access");

  return NextResponse.redirect(authUrl.toString());
}
