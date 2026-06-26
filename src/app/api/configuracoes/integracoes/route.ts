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
const KEYS_PAGBANK = ["pagbank_access_token", "pagbank_webhook_secret", "pagbank_webhook_base_url", "pagbank_ambiente"] as const;
// Etapa 3 (Jonathan 11/06): WhatsApp do desenvolvedor — recebe o código quando
// o envio ao cliente falha. Não é segredo, mas guardado no mesmo lugar p/ reuso.
const KEYS_WHATSAPP = ["whatsapp_desenvolvedor"] as const;
const ALL_KEYS = [...KEYS_WOO, ...KEYS_KOMMO, ...KEYS_TINY, ...KEYS_MP, ...KEYS_INTER, ...KEYS_PAGBANK, ...KEYS_WHATSAPP] as const;

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

  /** REGRA DE NEGÓCIO: lê o campo ativo de fin_gateways para Mercado Pago e PagBank.
   *  O QUE: consulta fin_gateways.nome = 'Mercado Pago' e 'PagBank' para saber se estão ativos.
   *  POR QUE: o toggle de ativar/desativar gateway controla se aparece nas vendas e no crediário.
   *  IMPACTO SE ALTERADO: quebra o toggle de ativação dos gateways na UI de configurações. */
  let mpAtivo = true;
  let pagbankAtivo = true;
  try {
    const gateways = await sql<{ nome: string; ativo: boolean }[]>`
      SELECT nome, ativo FROM alissonerp.fin_gateways WHERE nome IN ('Mercado Pago', 'PagBank')
    `;
    for (const g of gateways) {
      if (g.nome === "Mercado Pago") mpAtivo = g.ativo;
      if (g.nome === "PagBank") pagbankAtivo = g.ativo;
    }
  } catch { /* tabela pode não existir ainda */ }

  return NextResponse.json({
    woo_configured: KEYS_WOO.every((k) => chaves.has(k)),
    kommo_configured: KEYS_KOMMO.every((k) => chaves.has(k)),
    tiny_configured: chaves.has("tiny_bearer_token"),
    tiny_has_credentials: chaves.has("tiny_client_id") && chaves.has("tiny_client_secret"),
    mp_configured: chaves.has("mp_access_token") && chaves.has("mp_webhook_secret"),
    mp_has_base_url: chaves.has("mp_webhook_base_url"),
    mp_ativo: mpAtivo,
    pagbank_ativo: pagbankAtivo,
    inter_configured:
      chaves.has("inter_client_id") &&
      chaves.has("inter_client_secret") &&
      chaves.has("inter_cert_pem") &&
      chaves.has("inter_key_pem") &&
      chaves.has("inter_conta_corrente"),
    inter_has_cron_secret: chaves.has("inter_cron_secret"),
    pagbank_configured:
      chaves.has("pagbank_access_token") &&
      chaves.has("pagbank_webhook_secret"),
    pagbank_ambiente: chaves.has("pagbank_ambiente") ? await readSecretVal("pagbank_ambiente") : "producao",
    // Etapa 3: o número do desenvolvedor não é sensível — retorna o valor pra
    // preencher o campo na tela de Integrações.
    whatsapp_desenvolvedor: chaves.has("whatsapp_desenvolvedor") ? await readSecretVal("whatsapp_desenvolvedor") : "",
  });
}

async function readSecretVal(chave: string): Promise<string | null> {
  try {
    const [row] = await sql`
      SELECT valor_encrypted FROM alissonerp.configuracoes_secrets WHERE chave = ${chave}
    `;
    if (!row?.valor_encrypted) return null;
    let v: string;
    try { v = JSON.parse(row.valor_encrypted); } catch { v = String(row.valor_encrypted); }
    return v.replace(/"/g, "").trim() || null;
  } catch { return null; }
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

  /** REGRA DE NEGÓCIO: ativar/desativar gateways pelo toggle na aba Integrações.
   *  O QUE: recebe mp_ativo e/ou pagbank_ativo como strings "true"/"false" e atualiza fin_gateways.
   *  POR QUE: controla se o gateway aparece nas vendas, crediário e maquininhas.
   *  IMPACTO SE ALTERADO: quebra o toggle de ativação/desativação dos gateways. */
  if (body["mp_ativo"] !== undefined) {
    const valor = body["mp_ativo"] === "true";
    await sql`UPDATE alissonerp.fin_gateways SET ativo = ${valor} WHERE nome = 'Mercado Pago'`;
  }
  if (body["pagbank_ativo"] !== undefined) {
    const valor = body["pagbank_ativo"] === "true";
    await sql`UPDATE alissonerp.fin_gateways SET ativo = ${valor} WHERE nome = 'PagBank'`;
  }

  return NextResponse.json({ ok: true });
}
