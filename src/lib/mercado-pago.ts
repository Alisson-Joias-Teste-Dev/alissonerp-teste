// ═══════════════════════════════════════════════════════════════════════════
// Mercado Pago helper — Preference + Point Integration API
//
// Padrão igual ao Tiny: credenciais em alissonerp.configuracoes_secrets
// (NUNCA em env vars). Leitura faz JSON.parse porque o valor é gravado
// stringified pelo PATCH /api/configuracoes/integracoes.
// ═══════════════════════════════════════════════════════════════════════════

import { MercadoPagoConfig, Preference, Payment } from "mercadopago";
import sql from "@/lib/db";

// ─── Secrets ─────────────────────────────────────────────────────────────────

async function readSecret(chave: string): Promise<string | null> {
  const [row] = await sql`
    SELECT valor_encrypted FROM alissonerp.configuracoes_secrets
    WHERE chave = ${chave}
  `;
  if (!row?.valor_encrypted) return null;
  let v: string;
  try { v = JSON.parse(row.valor_encrypted); } catch { v = String(row.valor_encrypted); }
  v = v.replace(/"/g, "").trim();
  return v || null;
}

export async function getAccessToken(): Promise<string> {
  const token = await readSecret("mp_access_token");
  if (!token) {
    throw new Error("Mercado Pago não configurado. Vá em Configurações > Integrações e cole o Access Token.");
  }
  return token;
}

export async function getWebhookSecret(): Promise<string> {
  const secret = await readSecret("mp_webhook_secret");
  if (!secret) {
    throw new Error("Webhook secret MP não configurado. Vá em Configurações > Integrações.");
  }
  return secret;
}

export async function getWebhookBaseUrl(fallbackOrigin: string): Promise<string> {
  const base = await readSecret("mp_webhook_base_url");
  return (base ?? fallbackOrigin).replace(/\/$/, "");
}

// ─── SDK client ──────────────────────────────────────────────────────────────

export async function getMpClient(): Promise<MercadoPagoConfig> {
  const accessToken = await getAccessToken();
  return new MercadoPagoConfig({ accessToken, options: { timeout: 10000 } });
}

// ─── Preference (Payment Link) ──────────────────────────────────────────────

interface PreferenceItem {
  title: string;
  quantity: number;
  unit_price: number;
}

interface PreferencePayer {
  name?: string;
  email?: string;
  cpf?: string;
}

export interface CreatePreferenceParams {
  vendaId: number;
  pagamentoId: number;
  numeroVenda: string;
  items: PreferenceItem[];
  payer?: PreferencePayer;
  notificationUrl: string;
  backUrls: { success: string; pending: string; failure: string };
}

export async function createPreference(params: CreatePreferenceParams) {
  const client = await getMpClient();
  const preference = new Preference(client);

  const result = await preference.create({
    body: {
      items: params.items.map((it, i) => ({
        id: `item-${i}`,
        title: it.title,
        quantity: it.quantity,
        unit_price: it.unit_price,
        currency_id: "BRL",
      })),
      payer: params.payer ? {
        name: params.payer.name,
        email: params.payer.email,
        ...(params.payer.cpf ? { identification: { type: "CPF", number: params.payer.cpf } } : {}),
      } : undefined,
      payment_methods: {
        // Excluir boleto, débito, ticket — só PIX + cartão crédito
        excluded_payment_types: [
          { id: "ticket" },
          { id: "atm" },
          { id: "debit_card" },
          { id: "prepaid_card" },
        ],
        installments: 12,
      },
      external_reference: `venda:${params.vendaId}:pag:${params.pagamentoId}`,
      notification_url: params.notificationUrl,
      back_urls: params.backUrls,
      auto_return: "approved",
      metadata: {
        venda_id: params.vendaId,
        pagamento_id: params.pagamentoId,
        numero_venda: params.numeroVenda,
      },
      // Expira em 24h
      expires: true,
      expiration_date_to: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      statement_descriptor: "ALISSON JOIAS",
    },
  });

  return {
    id: result.id,
    init_point: result.init_point,
    sandbox_init_point: result.sandbox_init_point,
    raw: result,
  };
}

// ─── Payment (fetch detalhado) ──────────────────────────────────────────────

export async function fetchPayment(paymentId: string) {
  const client = await getMpClient();
  const payment = new Payment(client);
  return payment.get({ id: paymentId });
}

// ─── Point Integration API (maquininhas) ────────────────────────────────────
// Usamos fetch direto em vez do SDK Point nativo porque a tipagem do SDK
// 2.12 tem campos incompletos (ex: devices[].id não aparece no .d.ts), e
// o fluxo é mais fácil de depurar quando a gente controla o payload.

const MP_BASE = "https://api.mercadopago.com";

async function mpFetch<T = unknown>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const accessToken = await getAccessToken();
  const res = await fetch(`${MP_BASE}${path}`, {
    ...init,
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    signal: init.signal ?? AbortSignal.timeout(15000),
  });

  const text = await res.text();
  let body: unknown;
  try { body = text ? JSON.parse(text) : {}; } catch { body = text; }

  if (!res.ok) {
    const msg = typeof body === "object" && body !== null && "message" in body
      ? String((body as { message: unknown }).message)
      : text.slice(0, 300);
    throw new Error(`Mercado Pago ${res.status}: ${msg}`);
  }

  return body as T;
}

// Listar devices Point (maquininhas) associados à conta
export interface PointDevice {
  id: string;
  pos_id?: number | string;
  store_id?: number | string;
  external_pos_id?: string;
  operating_mode?: string;
}

interface ListDevicesResponse {
  devices?: PointDevice[];
  paging?: { total?: number; offset?: number; limit?: number };
}

export async function listPointDevices(): Promise<PointDevice[]> {
  // Paginação: MP retorna no máximo 50 por chamada; buscamos tudo.
  const all: PointDevice[] = [];
  let offset = 0;
  const limit = 50;

  while (true) {
    const qs = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    const res = await mpFetch<ListDevicesResponse>(`/point/integration-api/devices?${qs}`);
    const batch = res.devices ?? [];
    all.push(...batch);
    if (batch.length < limit) break;
    offset += limit;
    if (offset > 500) break; // guard
  }

  return all;
}

// Criar Payment Intent em um device específico
export interface CreatePointIntentParams {
  deviceId: string;
  amountCents: number;      // valor em CENTAVOS (MP Point exige)
  vendaId: number;
  pagamentoId: number;
  numeroVenda: string;
  installments?: number;
  paymentType?: "credit_card" | "debit_card";
  printOnTerminal?: boolean;
}

export interface PointIntentResponse {
  id: string;
  device_id: string;
  state?: string;
  amount?: number;
  description?: string;
  additional_info?: Record<string, unknown>;
}

export async function createPointIntent(params: CreatePointIntentParams): Promise<PointIntentResponse> {
  const body = {
    amount: Math.round(params.amountCents),
    description: `Venda ${params.numeroVenda}`,
    payment: {
      installments: params.installments ?? 1,
      type: params.paymentType ?? "credit_card",
      installments_cost: "seller",
    },
    additional_info: {
      external_reference: `venda:${params.vendaId}:pag:${params.pagamentoId}`,
      print_on_terminal: params.printOnTerminal ?? true,
      ticket_number: params.numeroVenda,
    },
  };

  return mpFetch<PointIntentResponse>(
    `/point/integration-api/devices/${encodeURIComponent(params.deviceId)}/payment-intents`,
    { method: "POST", body: JSON.stringify(body) }
  );
}

// Cancelar Payment Intent ativa (antes de o cliente passar o cartão)
export async function cancelPointIntent(deviceId: string, intentId: string): Promise<{ id?: string }> {
  return mpFetch<{ id?: string }>(
    `/point/integration-api/devices/${encodeURIComponent(deviceId)}/payment-intents/${encodeURIComponent(intentId)}`,
    { method: "DELETE" }
  );
}

// Buscar status da intent
export async function getPointIntentStatus(intentId: string): Promise<{ status?: string; created_on?: string }> {
  return mpFetch(`/point/integration-api/payment-intents/${encodeURIComponent(intentId)}/events`);
}
