import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/auth-server";
import { isFullAccess } from "@/lib/roles";

// POST /api/configuracoes/ia/key
// Body: { provedor: "claude" | "openai" | "gemini", api_key: string }
// Upsert da API key do provedor (somente admin/dev/diretor)
export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireAuth(req);
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: 401 });
    }
    throw e;
  }
  if (!isFullAccess(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const body = await req.json() as { provedor?: string; api_key?: string };

  const PROVEDORES_VALIDOS = ["claude", "openai", "gemini"];

  if (!body.provedor || !PROVEDORES_VALIDOS.includes(body.provedor)) {
    return NextResponse.json({ error: "Provedor inválido" }, { status: 400 });
  }
  if (!body.api_key || body.api_key.trim() === "") {
    return NextResponse.json({ error: "API key não pode estar vazia" }, { status: 400 });
  }

  const chave = `ia_key_${body.provedor}`;

  await sql`
    INSERT INTO alissonerp.configuracoes_secrets (chave, valor_encrypted, updated_at)
    VALUES (${chave}, ${body.api_key.trim()}, NOW())
    ON CONFLICT (chave) DO UPDATE
      SET valor_encrypted = ${body.api_key.trim()},
          updated_at = NOW()
  `;

  return NextResponse.json({ ok: true });
}
