/**
 * pagbank.ts — SDK wrapper para API PagBank (PagSeguro)
 *
 * Padrão igual ao Mercado Pago: credenciais em alissonerp.configuracoes_secrets
 * (NUNCA em env vars). Leitura faz JSON.parse porque o valor é gravado
 * stringified pelo PATCH /api/configuracoes/integracoes.
 *
 * API PagBank (nova plataforma Orders):
 *   Base URL: https://api.pagseguro.com (sandbox: https://sandbox.api.pagseguro.com)
 *   Auth: Bearer <token> (OAuth2)
 *   Amounts: centavos (inteiro) — esta lib converte reais ↔ centavos
 *
 * Casos de uso implementados:
 *   1. criarPedidoPagamento() — Checkout Link (cartão de crédito)
 *   2. criarCobrancaPix() — PIX QR Code nativo
 *   3. criarIntentPoint() — Maquininha Moderninha (futuro)
 *   4. cancelarIntentPoint() — Cancelar intent na maquininha (futuro)
 *   5. buscarPedido() — Consultar pedido por ID
 *   6. buscarCobranca() — Consultar cobrança por ID
 *   7. listarDispositivos() — Listar terminais (futuro)
 *
 * IMPACTO se alterado: toda comunicação com PagBank depende deste arquivo.
 * Alterar credenciais ou URLs quebra todos os endpoints PagBank.
 */

import sql from "@/lib/db";

// ─── Constantes ───────────────────────────────────────────────────────────────
const PB_TIMEOUT = 15000;

// ─── Secrets ──────────────────────────────────────────────────────────────────

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

export async function getPagBankToken(): Promise<string> {
  const token = await readSecret("pagbank_access_token");
  if (!token) {
    throw new Error(
      "PagBank não configurado. Vá em Configurações > Integrações e cole o Access Token do PagBank.",
    );
  }
  return token;
}

export async function getPagBankWebhookSecret(): Promise<string> {
  const secret = await readSecret("pagbank_webhook_secret");
  if (!secret) {
    throw new Error("Webhook secret PagBank não configurado. Vá em Configurações > Integrações.");
  }
  return secret;
}

export async function getPagBankWebhookBaseUrl(fallbackOrigin: string): Promise<string> {
  const base = await readSecret("pagbank_webhook_base_url");
  return (base ?? fallbackOrigin).replace(/\/$/, "");
}

/** Resolve a URL base da API PagBank: sandbox ou produção */
async function getPagBankBaseUrl(): Promise<string> {
  const ambiente = await readSecret("pagbank_ambiente");
  return ambiente === "sandbox"
    ? "https://sandbox.api.pagseguro.com"
    : "https://api.pagseguro.com";
}

// ─── Fetch helper genérico ────────────────────────────────────────────────────
// Igual ao mpFetch do mercado-pago.ts. Autenticação Bearer, timeout 15s,
// tratamento de erro padronizado.

async function pbFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = await getPagBankToken();
  const baseUrl = await getPagBankBaseUrl();
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    signal: init.signal ?? AbortSignal.timeout(PB_TIMEOUT),
  });

  const text = await res.text();
  let body: unknown;
  try { body = text ? JSON.parse(text) : {}; } catch { body = text; }

  if (!res.ok) {
    const msg =
      typeof body === "object" && body !== null && "message" in body
        ? String((body as { message: unknown }).message)
        : text.slice(0, 300);
    throw new Error(`PagBank ${res.status}: ${msg}`);
  }

  return body as T;
}

// ─── Tipos da API PagBank ─────────────────────────────────────────────────────

export interface PagBankItem {
  reference_id: string;
  name: string;
  quantity: number;
  unit_amount: number; // centavos
}

export interface PagBankCustomer {
  name: string;
  email?: string;
  tax_id?: string; // CPF sem pontuação
}

export interface PagBankCharge {
  reference_id: string;
  description: string;
  amount: {
    value: number; // centavos
    currency: string;
  };
  payment_method: {
    type: "CREDIT_CARD" | "PIX" | "BOLETO";
    installments?: number;
    capture?: boolean;
  };
}

export interface PagBankQrCode {
  amount: { value: number }; // centavos
}

// ─── Criar Pedido (Payment Link + PIX) ────────────────────────────────────────

export interface CriarPedidoParams {
  vendaId: number;
  pagamentoId: number;
  numeroVenda: string;
  /** Valor total da cobrança em REAIS (convertido internamente para centavos) */
  valor: number;
  /** Itens da venda para descrição no pedido */
  items: PagBankItem[];
  /** Dados do cliente */
  customer: PagBankCustomer;
  /** URL para notificações webhook */
  notificationUrl: string;
  /** Tipo de cobrança */
  tipo: "CREDIT_CARD" | "PIX";
  /** Número de parcelas (apenas para CREDIT_CARD) */
  installments?: number;
  /** Tempo de expiração em minutos. Default 30 para PIX, 1440 (24h) para cartão */
  expiraEmMinutos?: number;
}

export interface CriarPedidoResponse {
  order_id: string;
  /** Link de pagamento para o cliente (apenas cartão) */
  payment_url?: string;
  /** QR Code PIX — código EMV (copia e cola) */
  qr_code?: string;
  /** QR Code PIX — imagem PNG base64 */
  qr_code_base64?: string;
  /** ID do QR Code para buscar imagem depois */
  qr_code_id?: string;
  /** Status inicial do pedido */
  status: string;
  /** Payload completo para debug/log */
  raw: Record<string, unknown>;
}

export async function criarPedidoPagamento(
  params: CriarPedidoParams,
): Promise<CriarPedidoResponse> {
  const idempotencyKey = `venda-${params.vendaId}-pag-${params.pagamentoId}-${Date.now()}`;

  const referenceId = `venda:${params.vendaId}:pag:${params.pagamentoId}`;
  const valorCentavos = Math.round(params.valor * 100);

  // Monta os charges (cobranças) do pedido
  const charges: PagBankCharge[] = [{
    reference_id: referenceId,
    description: `Venda ${params.numeroVenda} - Alisson Joias`,
    amount: {
      value: valorCentavos,
      currency: "BRL",
    },
    payment_method: params.tipo === "CREDIT_CARD"
      ? {
          type: "CREDIT_CARD",
          installments: params.installments ?? 1,
          capture: true,
        }
      : {
          type: "PIX",
        },
  }];

  // Para PIX, incluir qr_codes no pedido
  const qr_codes: PagBankQrCode[] | undefined =
    params.tipo === "PIX"
      ? [{ amount: { value: valorCentavos } }]
      : undefined;

  const body: Record<string, unknown> = {
    reference_id: referenceId,
    customer: {
      name: params.customer.name,
      ...(params.customer.email ? { email: params.customer.email } : {}),
      ...(params.customer.tax_id ? { tax_id: params.customer.tax_id } : {}),
    },
    items: params.items,
    notification_urls: [params.notificationUrl],
    charges,
    ...(qr_codes ? { qr_codes } : {}),
  };

  const payload = await pbFetch<Record<string, unknown>>("/orders", {
    method: "POST",
    headers: {
      "x-idempotency-key": idempotencyKey,
    },
    body: JSON.stringify(body),
  });

  // Extrai dados da resposta
  const orderId = String(payload.id ?? "");
  const qrCodeArray = payload.qr_codes as Array<Record<string, unknown>> | undefined;
  const firstQr = qrCodeArray?.[0];
  const linksArray = payload.links as Array<Record<string, unknown>> | undefined;

  // Link de pagamento (para cartão, o link PAY permite o cliente pagar)
  const payLink = linksArray?.find(
    (l) => l.rel === "PAY",
  );

  return {
    order_id: orderId,
    payment_url: payLink ? String(payLink.href) : undefined,
    qr_code: firstQr ? String(firstQr.text ?? "") : undefined,
    qr_code_base64: undefined, // PagBank retorna links para PNG/BASE64, não inline
    qr_code_id: firstQr ? String(firstQr.id ?? "") : undefined,
    status: String(payload.status ?? (payload.charges as Array<Record<string, unknown>>)?.[0]?.status ?? "CREATED"),
    raw: payload,
  };
}

// ─── Buscar QR Code base64 para PIX ───────────────────────────────────────────
// Após criar o pedido com PIX, busca a imagem base64 do QR code
// via endpoint de link retornado na resposta.

export async function buscarQrCodeBase64(qrCodeId: string): Promise<string> {
  const text = await pbFetch<string>(`/qrcode/${encodeURIComponent(qrCodeId)}/base64`, {
    headers: { "Accept": "text/plain" },
  });
  return text;
}

// ─── Buscar QR Code PNG para PIX ──────────────────────────────────────────────
// Retorna os bytes da imagem PNG. Útil para gerar data URI.

export async function buscarQrCodePng(qrCodeId: string): Promise<ArrayBuffer> {
  const token = await getPagBankToken();
  const baseUrl = await getPagBankBaseUrl();
  const res = await fetch(`${baseUrl}/qrcode/${encodeURIComponent(qrCodeId)}/png`, {
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "image/png",
    },
    signal: AbortSignal.timeout(PB_TIMEOUT),
  });

  if (!res.ok) {
    throw new Error(`PagBank ${res.status}: Erro ao buscar QR Code PNG`);
  }

  return res.arrayBuffer();
}

// ─── Buscar Pedido (para verificação de status) ───────────────────────────────
// Usado pelo webhook e verificação manual para confirmar o status de um pedido.

export interface PagBankOrderStatus {
  id: string;
  reference_id: string;
  status: string;
  created_at: string;
  charges: Array<{
    id: string;
    status: string;
    paid_at?: string;
    amount: {
      value: number; // centavos
      currency: string;
      summary: {
        total: number;
        paid: number;
        refunded: number;
      };
    };
    payment_method: {
      type: string;
      installments?: number;
      card?: {
        brand: string;
        last_digits: string;
      };
    };
  }>;
  items: Array<{
    name: string;
    quantity: number;
    unit_amount: number;
  }>;
  customer: {
    name: string;
    email?: string;
    tax_id?: string;
  };
}

export async function buscarPedido(orderId: string): Promise<PagBankOrderStatus> {
  return pbFetch<PagBankOrderStatus>(
    `/orders/${encodeURIComponent(orderId)}`,
  );
}

// ─── Buscar Cobrança (charge individual) ──────────────────────────────────────
// PagBank também permite consultar cobranças individuais.

export interface PagBankChargeStatus {
  id: string;
  status: string;
  paid_at?: string;
  created_at: string;
  amount: {
    value: number; // centavos
    currency: string;
    summary: { total: number; paid: number; refunded: number };
  };
  payment_method: { type: string };
  metadata?: Record<string, unknown>;
}

export async function buscarCobranca(chargeId: string): Promise<PagBankChargeStatus> {
  return pbFetch<PagBankChargeStatus>(
    `/charges/${encodeURIComponent(chargeId)}`,
  );
}

// ─── Validar assinatura do webhook PagBank ────────────────────────────────────
//
// PagBank envia o header x-authenticity-token com SHA256(token-payload).
// O algoritmo é: SHA256("{token}-{rawBody}").
// O payload NÃO deve ser formatado — usar o body bruto como string.
//
// Diferente do MP que usa HMAC-SHA256 com formato id:{dataId};request-id:{reqId};ts:{ts};

export async function validarAssinaturaPagBank(
  rawBody: string,
  authenticityToken: string,
): Promise<boolean> {
  try {
    const secret = await readSecret("pagbank_webhook_secret");
    if (!secret) return false;

    const crypto = await import("node:crypto");
    const expected = crypto
      .createHash("sha256")
      .update(`${secret}-${rawBody}`)
      .digest("hex");

    return expected === authenticityToken;
  } catch {
    return false;
  }
}

// ─── Converter centavos para reais ────────────────────────────────────────────

export function centavosParaReais(centavos: number): number {
  return Math.round(centavos) / 100;
}

export function reaisParaCentavos(reais: number): number {
  return Math.round(reais * 100);
}
