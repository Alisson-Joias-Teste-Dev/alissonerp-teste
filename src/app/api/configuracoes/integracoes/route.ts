import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";

const KEYS_WOO = ["woo_url", "woo_consumer_key", "woo_consumer_secret"] as const;
const KEYS_KOMMO = ["kommo_url", "kommo_token"] as const;
const ALL_KEYS = [...KEYS_WOO, ...KEYS_KOMMO] as const;

// ─── GET /api/configuracoes/integracoes ──────────────────────────────────────
// Retorna status de configuração (não retorna valores sensíveis)
export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  if (!usuario || !isFullAccess(usuario.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  let rows: { chave: string }[] = [];
  try {
    rows = await sql`
      SELECT chave FROM alissonerp.configuracoes_secrets
      WHERE chave = ANY(${[...ALL_KEYS]}::text[])
        AND valor IS NOT NULL
        AND valor != '""'
        AND valor != ''
    `;
  } catch { /* tabela pode não existir ainda */ }

  const chaves = new Set(rows.map((r) => r.chave));

  return NextResponse.json({
    woo_configured: KEYS_WOO.every((k) => chaves.has(k)),
    kommo_configured: KEYS_KOMMO.every((k) => chaves.has(k)),
  });
}

// ─── PATCH /api/configuracoes/integracoes ────────────────────────────────────
// Salva chaves de integração em configuracoes_secrets (upsert)
export async function PATCH(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  if (!usuario || !isFullAccess(usuario.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const body = await req.json() as Record<string, string>;

  for (const key of ALL_KEYS) {
    if (body[key] !== undefined) {
      await sql`
        INSERT INTO alissonerp.configuracoes_secrets (chave, valor)
        VALUES (${key}, ${JSON.stringify(body[key])})
        ON CONFLICT (chave) DO UPDATE SET valor = ${JSON.stringify(body[key])}
      `;
    }
  }

  return NextResponse.json({ ok: true });
}
