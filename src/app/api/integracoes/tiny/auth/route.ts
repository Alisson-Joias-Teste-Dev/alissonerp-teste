import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";

// ─── GET /api/integracoes/tiny/auth ──────────────────────────────────────────
// Redireciona o usuário para a página de autorização do Tiny ERP (OAuth2)
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

  const origin = req.headers.get("origin") ?? req.nextUrl.origin;
  const redirectUri = `${origin}/api/integracoes/tiny/callback`;

  const authUrl = new URL("https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid");

  return NextResponse.redirect(authUrl.toString());
}
