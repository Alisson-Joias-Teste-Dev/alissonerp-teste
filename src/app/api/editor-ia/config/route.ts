/**
 * GET /api/editor-ia/config
 *   Retorna mascara das chaves (ultimos 4 chars) + flag configured.
 *   NUNCA retorna a chave em texto plano.
 *
 * PUT /api/editor-ia/config
 *   Body: { gemini?: string, openai?: string }
 *   Grava as chaves em configuracoes_sistema.
 *   Somente roles admin/desenvolvedor.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import sql from "@/lib/db";

export const runtime = "nodejs";

const KEYS = {
  gemini: "editor_ia_gemini_key",
  openai: "editor_ia_openai_key",
} as const;

function mask(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = String(value).trim();
  if (!v) return null;
  if (v.length <= 4) return "•".repeat(v.length);
  return "•".repeat(Math.max(4, v.length - 4)) + v.slice(-4);
}

async function getUserRole(userId: string): Promise<string> {
  const rows = await sql<Array<{ role: string | null }>>`
    SELECT role FROM alissonerp.usuarios WHERE id = ${userId}::uuid LIMIT 1
  `.catch(() => [] as Array<{ role: string | null }>);
  return rows[0]?.role ?? "";
}

function isAdmin(role: string): boolean {
  return role === "desenvolvedor" || role === "admin";
}

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const rows = await sql<Array<{ chave: string; valor: string | null; updated_at: string | null }>>`
    SELECT chave, valor, updated_at
      FROM alissonerp.configuracoes_sistema
     WHERE chave IN (${KEYS.gemini}, ${KEYS.openai})
  `;

  const byKey = new Map(rows.map((r) => [r.chave, r]));
  const gemini = byKey.get(KEYS.gemini);
  const openai = byKey.get(KEYS.openai);

  const geminiFromEnv = !!(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim());
  const openaiFromEnv = !!(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim());

  return NextResponse.json({
    gemini: {
      configured: !!gemini?.valor || geminiFromEnv,
      source: gemini?.valor ? "db" : geminiFromEnv ? "env" : null,
      masked: mask(gemini?.valor) ?? (geminiFromEnv ? "•••• (env)" : null),
      updatedAt: gemini?.updated_at || null,
    },
    openai: {
      configured: !!openai?.valor || openaiFromEnv,
      source: openai?.valor ? "db" : openaiFromEnv ? "env" : null,
      masked: mask(openai?.valor) ?? (openaiFromEnv ? "•••• (env)" : null),
      updatedAt: openai?.updated_at || null,
    },
  });
}

export async function PUT(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const role = await getUserRole(user.id);
  if (!isAdmin(role)) {
    return NextResponse.json({ error: "Somente admin/desenvolvedor pode alterar chaves." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const gemini = typeof body?.gemini === "string" ? body.gemini.trim() : undefined;
  const openai = typeof body?.openai === "string" ? body.openai.trim() : undefined;

  const updates: Array<{ chave: string; valor: string | null; descricao: string }> = [];
  if (gemini !== undefined) {
    updates.push({
      chave: KEYS.gemini,
      valor: gemini === "" ? null : gemini,
      descricao: "Chave API Gemini/Imagen usada pelo Editor IA (precedência sobre env).",
    });
  }
  if (openai !== undefined) {
    updates.push({
      chave: KEYS.openai,
      valor: openai === "" ? null : openai,
      descricao: "Chave API OpenAI (GPT-Image-1) usada pelo Editor IA (precedência sobre env).",
    });
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: "Nada para atualizar." }, { status: 400 });
  }

  for (const u of updates) {
    await sql`
      INSERT INTO alissonerp.configuracoes_sistema (chave, valor, descricao, updated_by, updated_at)
           VALUES (${u.chave}, ${u.valor}, ${u.descricao}, ${user.id}, now())
      ON CONFLICT (chave) DO UPDATE
         SET valor = EXCLUDED.valor,
             descricao = EXCLUDED.descricao,
             updated_by = EXCLUDED.updated_by,
             updated_at = now()
    `;
  }

  return NextResponse.json({ ok: true, updated: updates.map((u) => u.chave) });
}
