import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/auth-server";
import { isFullAccess } from "@/lib/roles";
import { zodError } from "@/lib/schemas/common";

const IaKeyPostSchema = z.object({
  provedor: z.enum(["claude", "openai", "gemini"]),
  api_key: z.string().min(1, "obrigatório"),
}).passthrough();

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

  const raw = await req.json().catch(() => ({}));
  const parsed = IaKeyPostSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;

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
