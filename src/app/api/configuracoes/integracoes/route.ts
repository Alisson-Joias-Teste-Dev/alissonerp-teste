import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";
import { zodError } from "@/lib/schemas/common";

const IntegracoesPatchSchema = z.record(z.string(), z.string());

const KEYS_WOO = ["woo_url", "woo_consumer_key", "woo_consumer_secret"] as const;
const KEYS_KOMMO = ["kommo_url", "kommo_token"] as const;
const KEYS_TINY = ["tiny_client_id", "tiny_client_secret", "tiny_bearer_token"] as const;
const KEYS_MP = ["mp_access_token", "mp_webhook_secret", "mp_user_id", "mp_webhook_base_url"] as const;
const KEYS_INTER = ["inter_client_id", "inter_client_secret", "inter_cert_pem", "inter_key_pem", "inter_conta_corrente", "inter_cron_secret"] as const;
const ALL_KEYS = [...KEYS_WOO, ...KEYS_KOMMO, ...KEYS_TINY, ...KEYS_MP, ...KEYS_INTER] as const;

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
        AND valor_encrypted IS NOT NULL
        AND valor_encrypted != '""'
        AND valor_encrypted != ''
    `;
  } catch { /* tabela pode não existir ainda */ }

  const chaves = new Set(rows.map((r) => r.chave));

  return NextResponse.json({
    woo_configured: KEYS_WOO.every((k) => chaves.has(k)),
    kommo_configured: KEYS_KOMMO.every((k) => chaves.has(k)),
    tiny_configured: chaves.has("tiny_bearer_token"),
    tiny_has_credentials: chaves.has("tiny_client_id") && chaves.has("tiny_client_secret"),
    mp_configured: chaves.has("mp_access_token") && chaves.has("mp_webhook_secret"),
    mp_has_base_url: chaves.has("mp_webhook_base_url"),
    inter_configured:
      chaves.has("inter_client_id") &&
      chaves.has("inter_client_secret") &&
      chaves.has("inter_cert_pem") &&
      chaves.has("inter_key_pem") &&
      chaves.has("inter_conta_corrente"),
    inter_has_cron_secret: chaves.has("inter_cron_secret"),
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

  const raw = await req.json().catch(() => ({}));
  const parsed = IntegracoesPatchSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;

  for (const key of ALL_KEYS) {
    if (body[key] !== undefined) {
      await sql`
        INSERT INTO alissonerp.configuracoes_secrets (chave, valor_encrypted)
        VALUES (${key}, ${JSON.stringify(body[key])})
        ON CONFLICT (chave) DO UPDATE SET valor_encrypted = ${JSON.stringify(body[key])}
      `;
    }
  }

  return NextResponse.json({ ok: true });
}
