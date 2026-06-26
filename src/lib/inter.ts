/**
 * Cliente Banco Inter — API Pagamentos (Pix / Boleto / TED)
 *
 * Auth: OAuth2 client_credentials + mTLS (cert + key)
 * Docs: https://developers.bancointer.com.br/
 *
 * Credenciais lidas do banco (alissonerp.configuracoes_secrets):
 *   inter_client_id
 *   inter_client_secret
 *   inter_cert_pem        (conteudo PEM completo do .crt)
 *   inter_key_pem         (conteudo PEM completo do .key)
 *   inter_conta_corrente  (numero da conta corrente Inter)
 *   inter_cron_secret     (opcional, secret pro endpoint /sync)
 *
 * Configurar em /configuracoes -> Integracoes -> Banco Inter.
 *
 * Todas as chamadas sao logadas em alissonerp.inter_sync_log.
 */
import https from "node:https";
import sql from "@/lib/db";

const BASE_URL = "https://cdpj.partners.bancointer.com.br";

// ─── Token cache em memoria ───────────────────────────────────────────────────
type TokenCache = { token: string; expiresAt: number };
let tokenCache: TokenCache | null = null;

// ─── Credenciais (lidas do DB) ────────────────────────────────────────────────
type InterCreds = {
  clientId: string;
  clientSecret: string;
  certPem: string;
  keyPem: string;
  contaCorrente: string;
};

type CredsCache = { creds: InterCreds; expiresAt: number };
let credsCache: CredsCache | null = null;
let cachedAgent: https.Agent | null = null;

function parseSecret(raw: string): string {
  try {
    const v = JSON.parse(raw);
    return typeof v === "string" ? v : String(v);
  } catch {
    return String(raw);
  }
}

async function getInterCredentials(): Promise<InterCreds> {
  if (credsCache && credsCache.expiresAt > Date.now()) {
    return credsCache.creds;
  }
  const keys = [
    "inter_client_id",
    "inter_client_secret",
    "inter_cert_pem",
    "inter_key_pem",
    "inter_conta_corrente",
  ];
  const rows = await sql<{ chave: string; valor_encrypted: string }[]>`
    SELECT chave, valor_encrypted
    FROM alissonerp.configuracoes_secrets
    WHERE chave = ANY(${keys}::text[])
  `;
  const map = new Map<string, string>();
  for (const r of rows) {
    if (r.valor_encrypted) map.set(r.chave, parseSecret(r.valor_encrypted));
  }

  const clientId = map.get("inter_client_id");
  const clientSecret = map.get("inter_client_secret");
  const certPem = map.get("inter_cert_pem");
  const keyPem = map.get("inter_key_pem");
  const contaCorrente = map.get("inter_conta_corrente");

  if (!clientId || !clientSecret || !certPem || !keyPem || !contaCorrente) {
    throw new Error(
      "Credenciais Inter nao configuradas. Configure em /configuracoes -> Integracoes -> Banco Inter.",
    );
  }

  const creds: InterCreds = { clientId, clientSecret, certPem, keyPem, contaCorrente };
  credsCache = { creds, expiresAt: Date.now() + 5 * 60 * 1000 }; // 5 min
  return creds;
}

/** Limpa caches (chamar apos salvar novas credenciais) */
export function clearInterCache(): void {
  credsCache = null;
  cachedAgent = null;
  tokenCache = null;
}

async function getAgent(creds: InterCreds): Promise<https.Agent> {
  if (cachedAgent) return cachedAgent;
  cachedAgent = new https.Agent({
    cert: creds.certPem,
    key: creds.keyPem,
    keepAlive: true,
  });
  return cachedAgent;
}

/** Le inter_cron_secret do DB (separado pq sync precisa antes de carregar creds) */
export async function getInterCronSecret(): Promise<string | null> {
  const [row] = await sql<{ valor_encrypted: string }[]>`
    SELECT valor_encrypted FROM alissonerp.configuracoes_secrets
    WHERE chave = 'inter_cron_secret'
  `;
  if (!row?.valor_encrypted) return null;
  const v = parseSecret(row.valor_encrypted);
  return v || null;
}

// ─── HTTP helper com mTLS ─────────────────────────────────────────────────────
type ReqOpts = {
  method: "GET" | "POST" | "DELETE";
  path: string;
  headers?: Record<string, string>;
  body?: string;
  contaCorrente?: boolean; // adicionar header x-conta-corrente
};

async function request(opts: ReqOpts): Promise<{ status: number; body: string; json: unknown }> {
  const creds = await getInterCredentials();
  const agent = await getAgent(creds);
  const url = new URL(opts.path, BASE_URL);
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.body && !headers["content-type"]) headers["content-type"] = "application/json";
  if (opts.contaCorrente) {
    headers["x-conta-corrente"] = creds.contaCorrente;
  }

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        method: opts.method,
        host: url.hostname,
        path: url.pathname + url.search,
        port: 443,
        agent,
        headers,
      },
      (res) => {
        let chunks = "";
        res.on("data", (c) => (chunks += c));
        res.on("end", () => {
          let json: unknown = null;
          try { json = chunks ? JSON.parse(chunks) : null; } catch { /* nao-json */ }
          resolve({ status: res.statusCode ?? 0, body: chunks, json });
        });
      },
    );
    req.on("error", reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

// ─── Logger interno ───────────────────────────────────────────────────────────
async function log(params: {
  contaPagarId?: number;
  operacao: "criar" | "consultar" | "cancelar";
  interPagamentoId?: string;
  statusRetornado?: string;
  sucesso: boolean;
  erro?: string;
  requestBody?: unknown;
  responseBody?: unknown;
}): Promise<void> {
  try {
    await sql`
      INSERT INTO alissonerp.inter_sync_log
        (conta_pagar_id, operacao, inter_pagamento_id, status_retornado, sucesso, erro, request_body, response_body)
      VALUES (
        ${params.contaPagarId ?? null},
        ${params.operacao},
        ${params.interPagamentoId ?? null},
        ${params.statusRetornado ?? null},
        ${params.sucesso},
        ${params.erro ?? null},
        ${params.requestBody ? sql.json(params.requestBody as never) : null},
        ${params.responseBody ? sql.json(params.responseBody as never) : null}
      )
    `;
  } catch (e) {
    console.error("[inter] falha ao gravar inter_sync_log:", e);
  }
}

// ─── OAuth ────────────────────────────────────────────────────────────────────
const SCOPES = [
  "pagamento-pix.write",
  "pagamento-pix.read",
  "pagamento-boleto.write",
  "pagamento-boleto.read",
  "pagamento-darf.write",
].join(" ");

export async function getToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 30_000) {
    return tokenCache.token;
  }
  const creds = await getInterCredentials();

  const body = new URLSearchParams({
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    grant_type: "client_credentials",
    scope: SCOPES,
  }).toString();

  const res = await request({
    method: "POST",
    path: "/oauth/v2/token",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

  if (res.status !== 200 || !res.json) {
    throw new Error(`Inter OAuth falhou (${res.status}): ${res.body}`);
  }

  const j = res.json as { access_token?: string; expires_in?: number };
  if (!j.access_token) {
    throw new Error(`Inter OAuth retornou sem access_token: ${res.body}`);
  }

  tokenCache = {
    token: j.access_token,
    expiresAt: Date.now() + (j.expires_in ?? 3600) * 1000,
  };
  return j.access_token;
}

// ─── Helpers de chamada autenticada ───────────────────────────────────────────
async function authJson(method: "GET" | "POST", path: string, body?: object, contaPagarId?: number, operacao: "criar" | "consultar" | "cancelar" = "criar") {
  const token = await getToken();
  const res = await request({
    method,
    path,
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    contaCorrente: true,
  });

  const sucesso = res.status >= 200 && res.status < 300;
  const j = res.json as Record<string, unknown> | null;
  const interId = (j?.codigoSolicitacao ?? j?.endToEndId ?? j?.id) as string | undefined;
  const status = (j?.situacao ?? j?.status) as string | undefined;

  await log({
    contaPagarId,
    operacao,
    interPagamentoId: interId,
    statusRetornado: status,
    sucesso,
    erro: sucesso ? undefined : `HTTP ${res.status}: ${res.body}`,
    requestBody: body,
    responseBody: j ?? { raw: res.body },
  });

  if (!sucesso) {
    throw new Error(`Inter ${path} falhou (${res.status}): ${res.body}`);
  }
  return j ?? {};
}

// ─── Tipos publicos ───────────────────────────────────────────────────────────
export type InterPagamentoResult = { id: string; status: string };
export type InterPagamentoConsulta = { id: string; status: string; valor: number; dataPagamento?: string };

function extractId(r: Record<string, unknown>): string {
  const id = (r.codigoSolicitacao ?? r.endToEndId ?? r.id) as string | undefined;
  if (!id) throw new Error(`Resposta Inter sem id de pagamento: ${JSON.stringify(r)}`);
  return id;
}
function extractStatus(r: Record<string, unknown>): string {
  return (r.situacao ?? r.status ?? "AGUARDANDO_APROVACAO") as string;
}

// ─── Pix por chave ────────────────────────────────────────────────────────────
export async function criarPix(
  params: { chave: string; valor: number; descricao?: string; dataPagamento?: string },
  contaPagarId?: number,
): Promise<InterPagamentoResult> {
  const body = {
    valor: Number(params.valor.toFixed(2)),
    descricao: params.descricao ?? "",
    dataPagamento: params.dataPagamento,
    destinatario: { tipo: "CHAVE", chave: params.chave },
  };
  const r = await authJson("POST", "/banking/v2/pix", body, contaPagarId, "criar");
  return { id: extractId(r), status: extractStatus(r) };
}

// ─── Pix copia e cola (QR code) ───────────────────────────────────────────────
export async function criarPixCopiaCola(
  params: { qrcode: string; valor: number; descricao?: string },
  contaPagarId?: number,
): Promise<InterPagamentoResult> {
  const body = {
    valor: Number(params.valor.toFixed(2)),
    descricao: params.descricao ?? "",
    destinatario: { tipo: "PIX_COPIA_E_COLA", pixCopiaECola: params.qrcode },
  };
  const r = await authJson("POST", "/banking/v2/pix", body, contaPagarId, "criar");
  return { id: extractId(r), status: extractStatus(r) };
}

// ─── Boleto (linha digitavel) ─────────────────────────────────────────────────
export async function criarBoleto(
  params: { codigoBarras: string; valor: number; dataPagamento?: string },
  contaPagarId?: number,
): Promise<InterPagamentoResult> {
  const body = {
    codBarraLinhaDigitavel: params.codigoBarras,
    valorPagar: Number(params.valor.toFixed(2)),
    dataPagamento: params.dataPagamento,
  };
  const r = await authJson("POST", "/banking/v2/pagamento", body, contaPagarId, "criar");
  return { id: extractId(r), status: extractStatus(r) };
}

// ─── TED ──────────────────────────────────────────────────────────────────────
export async function criarTed(
  params: {
    banco: string;
    agencia: string;
    conta: string;
    digito: string;
    tipoConta: "CC" | "CP";
    cpfCnpj: string;
    nomeFavorecido: string;
    valor: number;
    dataPagamento?: string;
  },
  contaPagarId?: number,
): Promise<InterPagamentoResult> {
  const body = {
    valor: Number(params.valor.toFixed(2)),
    dataPagamento: params.dataPagamento,
    favorecido: {
      cpfCnpj: params.cpfCnpj,
      nome: params.nomeFavorecido,
      contaBancaria: {
        codigoBanco: params.banco,
        agencia: params.agencia,
        conta: params.conta,
        digitoVerificador: params.digito,
        tipoConta: params.tipoConta,
      },
    },
  };
  const r = await authJson("POST", "/banking/v2/pagamento/ted", body, contaPagarId, "criar");
  return { id: extractId(r), status: extractStatus(r) };
}

// ─── Consulta ─────────────────────────────────────────────────────────────────
export async function getPagamento(
  id: string,
  tipo: "pix" | "boleto" | "ted",
  contaPagarId?: number,
): Promise<InterPagamentoConsulta> {
  const path = tipo === "pix" ? `/banking/v2/pix/${id}` : `/banking/v2/pagamento/${id}`;
  const r = await authJson("GET", path, undefined, contaPagarId, "consultar");
  const status = extractStatus(r);
  const valor = Number((r as Record<string, unknown>).valor ?? (r as Record<string, unknown>).valorPagar ?? 0);
  const dataPagamento = ((r as Record<string, unknown>).dataPagamento ?? (r as Record<string, unknown>).dataExecucao) as string | undefined;
  return { id, status, valor, dataPagamento };
}

// ─── Mapeamento de status Inter -> sistema ────────────────────────────────────
export type InterStatusInterno = "pendente_aprovacao" | "aguardando_execucao" | "pago" | "rejeitado" | "cancelado" | "desconhecido";

export function mapearStatusInter(status: string | null | undefined): InterStatusInterno {
  if (!status) return "desconhecido";
  const s = status.toUpperCase();
  if (s === "AGUARDANDO_APROVACAO") return "pendente_aprovacao";
  if (s === "APROVADO") return "aguardando_execucao";
  if (s === "PAGO" || s === "EXECUTADO") return "pago";
  if (s === "REJEITADO" || s === "ERRO") return "rejeitado";
  if (s === "CANCELADO") return "cancelado";
  return "desconhecido";
}
