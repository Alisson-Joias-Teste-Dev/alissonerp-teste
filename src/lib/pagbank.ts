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

/**
 * Remove caracteres proibidos pela API PagBank no campo customer.name
 * Regra: não pode conter ! @ # $ % ¨ * ( ) " " \ | { } [ ] < > ;
 * Também remove barras invertidas duplas e normaliza espacos.
 */
export function sanitizarNomeCliente(nome: string): string {
  return nome
    .replace(/[!@#$%¨*()"”\\|{}\[\]<>;]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 64) || "Cliente";
}

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
  payment_method?: {
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
  const isPix = params.tipo === "PIX";

  // Segundo doc PagBank:
  //   PIX QR Code → envia qr_codes, NÃO envia charges
  //   Cartão     → envia charges com payment_method.type = CREDIT_CARD
  const body: Record<string, unknown> = {
    reference_id: referenceId,
    customer: {
      name: params.customer.name,
      ...(params.customer.email ? { email: params.customer.email } : {}),
      ...(params.customer.tax_id ? { tax_id: params.customer.tax_id } : {}),
    },
    items: params.items,
    notification_urls: [params.notificationUrl],
  };

  if (isPix) {
    body.qr_codes = [{
      amount: { value: valorCentavos },
    }];
    if (params.expiraEmMinutos) {
      (body.qr_codes as Array<Record<string, unknown>>)[0].expiration_date =
        new Date(Date.now() + params.expiraEmMinutos * 60 * 1000).toISOString();
    }
  } else {
    body.charges = [{
      reference_id: referenceId,
      description: `Venda ${params.numeroVenda} - Alisson Joias`,
      amount: { value: valorCentavos, currency: "BRL" },
      payment_method: {
        type: "CREDIT_CARD",
        installments: params.installments ?? 1,
        capture: true,
      },
    }];
  }

  const payload = await pbFetch<Record<string, unknown>>("/orders", {
    method: "POST",
    headers: { "x-idempotency-key": idempotencyKey },
    body: JSON.stringify(body),
  });

  const orderId = String(payload.id ?? "");

  if (isPix) {
    // QR Code PIX: dados retornam em qr_codes[0] (text = EMV, id = QRCO_*)
    const qrCodes = payload.qr_codes as Array<Record<string, unknown>> | undefined;
    const firstQr = qrCodes?.[0];
    return {
      order_id: orderId,
      qr_code: firstQr ? String(firstQr.text ?? "") : undefined,
      qr_code_id: firstQr ? String(firstQr.id ?? "") : undefined,
      status: String(payload.status ?? "CREATED"),
      raw: payload,
    };
  }

  // Cartão de Crédito: link PAY no array links
  const linksArray = payload.links as Array<Record<string, unknown>> | undefined;
  const payLink = linksArray?.find((l) => l.rel === "PAY");
  const firstCharge = (payload.charges as Array<Record<string, unknown>> | undefined)?.[0];

  return {
    order_id: orderId,
    payment_url: payLink ? String(payLink.href) : undefined,
    status: String(payload.status ?? firstCharge?.status ?? "CREATED"),
    raw: payload,
  };
}

// ─── Criar Checkout (Link de Pagamento — cartão de crédito) ───────────────────
//
// Usa POST /checkouts, que gera uma página de pagamento pública no PagBank.
// Diferente do /orders que retorna um link PAY (API), o /checkouts retorna
// um checkout_url que o cliente pode acessar no navegador.
//
// Casos de uso recomendados:
//   - Link de pagamento para cartão de crédito → checkout
//   - PIX QR → permanece usando /orders (criarPedidoPagamento com tipo="PIX")

export interface CriarCheckoutParams {
  vendaId: number;
  pagamentoId: number;
  numeroVenda: string;
  /** Valor total da cobrança em REAIS (convertido internamente para centavos) */
  valor: number;
  /** Itens da venda para descrição no pedido */
  items: PagBankItem[];
  /** Dados do cliente */
  customer: PagBankCustomer;
  /** Número de parcelas */
  installments?: number;
  /** URL para notificações */
  notificationUrl: string;
  /** URL para redirecionamento pós-pagamento */
  returnUrl?: string;
  /** Tempo de expiração em minutos. Default 1440 (24h). */
  expiraEmMinutos?: number;
}

export interface CriarCheckoutResponse {
  checkout_id: string;
  /** URL pública da página de pagamento PagBank */
  checkout_url: string;
  /** Status do checkout */
  status: string;
  /** Payload completo para debug/log */
  raw: Record<string, unknown>;
}

export async function criarCheckoutPagamento(
  params: CriarCheckoutParams,
): Promise<CriarCheckoutResponse> {
  const idempotencyKey = `checkout-${params.vendaId}-pag-${params.pagamentoId}-${Date.now()}`;

  const referenceId = `venda:${params.vendaId}:pag:${params.pagamentoId}`;
  const valorCentavos = Math.round(params.valor * 100);
  const expirationMin = params.expiraEmMinutos ?? 1440;
  const expiresAt = new Date(Date.now() + expirationMin * 60 * 1000);

  // Converte items para centavos
  const items = params.items.map((it) => ({
    reference_id: it.reference_id,
    name: it.name.slice(0, 64),
    quantity: it.quantity,
    unit_amount: it.unit_amount,
  }));

  const body: Record<string, unknown> = {
    reference_id: referenceId,
    customer_modifiable: false,
    customer: {
      name: params.customer.name.slice(0, 64),
      ...(params.customer.email ? { email: params.customer.email } : {}),
      ...(params.customer.tax_id ? { tax_id: params.customer.tax_id } : {}),
    },
    items,
    payment_methods: [
      {
        type: "CREDIT_CARD",
      },
    ],
    payment_methods_configs: [
      {
        type: "CREDIT_CARD",
        config: {
          installments: [
            {
              quantity: params.installments ?? 1,
              interest_free: true,
            },
          ],
        },
      },
    ],
    notification_urls: [params.notificationUrl],
    payment_notification_urls: [params.notificationUrl],
    soft_descriptor: "ALISSON JOIAS",
    expiration_date: expiresAt.toISOString(),
    return_url: params.returnUrl ?? params.notificationUrl,
  };

  const payload = await pbFetch<Record<string, unknown>>("/checkouts", {
    method: "POST",
    headers: {
      "x-idempotency-key": idempotencyKey,
    },
    body: JSON.stringify(body),
  });

  return {
    checkout_id: String(payload.id ?? ""),
    checkout_url: String((payload as Record<string, unknown>).checkout_url ?? ""),
    status: String(payload.status ?? "ACTIVE"),
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
