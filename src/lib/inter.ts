/**
 * Cliente Banco Inter — API Pagamentos (Pix / Boleto / TED)
 *
 * Auth: OAuth2 client_credentials + mTLS (cert + key)
 * Docs: https://developers.bancointer.com.br/
 *
 * Envs obrigatorias:
 *   INTER_CLIENT_ID
 *   INTER_CLIENT_SECRET
 *   INTER_CERT_PATH      (caminho absoluto do .crt)
 *   INTER_KEY_PATH       (caminho absoluto do .key)
 *   INTER_CONTA_CORRENTE (numero da conta corrente Inter)
 *
 * Todas as chamadas sao logadas em alissonerp.inter_sync_log.
 */
import https from "node:https";
import fs from "node:fs";
import sql from "@/lib/db";

const BASE_URL = "https://cdpj.partners.bancointer.com.br";

// ─── Token cache em memoria ───────────────────────────────────────────────────
type TokenCache = { token: string; expiresAt: number };
let tokenCache: TokenCache | null = null;

function ensureEnv(): void {
  if (!process.env.INTER_CLIENT_ID) {
    throw new Error("Credenciais Inter nao configuradas — defina INTER_CLIENT_ID no .env.local");
  }
  if (!process.env.INTER_CLIENT_SECRET) {
    throw new Error("Credenciais Inter nao configuradas — defina INTER_CLIENT_SECRET no .env.local");
  }
  if (!process.env.INTER_CERT_PATH || !process.env.INTER_KEY_PATH) {
    throw new Error("Credenciais Inter nao configuradas — defina INTER_CERT_PATH e INTER_KEY_PATH no .env.local");
  }
}

let cachedAgent: https.Agent | null = null;
function getAgent(): https.Agent {
  if (cachedAgent) return cachedAgent;
  ensureEnv();
  cachedAgent = new https.Agent({
    cert: fs.readFileSync(process.env.INTER_CERT_PATH!),
    key: fs.readFileSync(process.env.INTER_KEY_PATH!),
    keepAlive: true,
  });
  return cachedAgent;
}

// ─── HTTP helper com mTLS ─────────────────────────────────────────────────────
type ReqOpts = {
  method: "GET" | "POST" | "DELETE";
  path: string;
  headers?: Record<string, string>;
  body?: string;
  contaCorrente?: boolean; // adicionar header x-conta-corrente
};

function request(opts: ReqOpts): Promise<{ status: number; body: string; json: unknown }> {
  const agent = getAgent();
  const url = new URL(opts.path, BASE_URL);
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.body && !headers["content-type"]) headers["content-type"] = "application/json";
  if (opts.contaCorrente && process.env.INTER_CONTA_CORRENTE) {
    headers["x-conta-corrente"] = process.env.INTER_CONTA_CORRENTE;
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
  ensureEnv();

  const body = new URLSearchParams({
    client_id: process.env.INTER_CLIENT_ID!,
    client_secret: process.env.INTER_CLIENT_SECRET!,
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
