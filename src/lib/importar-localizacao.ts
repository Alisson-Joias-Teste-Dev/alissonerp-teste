import sql from "@/lib/db";

/**
 * Importacao da LOCALIZACAO FISICA das pecas a partir da fonte externa (ERP de origem).
 *
 * REGRA DE NEGOCIO:
 *  - A localizacao fisica (ex: "LJ-ET04") ja existe na fonte externa. Em vez de pedir
 *    para os usuarios preencherem, importamos UMA UNICA VEZ para semear o ERP; a partir
 *    dai o ERP vira o dono do dado (edicao manual na tela do estoque comercial).
 *  - Chave de ligacao: itens[].id da fonte  <->  public.produtos.id_api_produto (bigint).
 *  - Gravamos em alissonerp.erp_produtos.localizacao.
 *
 * DOIS CAMINHOS (de proposito):
 *  - importarLocalizacaoDeUmaPeca(): usa o endpoint de ESTOQUE (1 peca por chamada).
 *    Serve para o TESTE com 1 peca antes da migracao completa.
 *  - importarLocalizacoesBloco(): usa a LISTA paginada de produtos (que ja traz a mesma
 *    localizacao em estoque.localizacao) -> ~157 chamadas em vez de ~15,6 mil.
 *
 * IMPACTO SE ALTERADO: quebra a ferramenta de importacao. NAO mexe em saldo de estoque,
 * reservas nem financeiro — so grava um texto informativo na peca.
 */

// Host da fonte externa. Mantido apenas no codigo (nunca aparece na tela para o usuario).
const BASE = "https://api.tiny.com.br/public-api/v3";

// Limite de chamadas da fonte (~30/min) -> espera entre paginas.
const ESPERA_MS = 2100;
// Paginas processadas por bloco (o front chama em blocos para nao estourar timeout).
// 10 paginas x ~2,1s ~= 21s por bloco: folga confortavel abaixo de timeouts de 30s.
const PAGINAS_POR_BLOCO = 10;
// Itens por pagina na lista.
const LIMITE_PAGINA = 100;

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─── Token da fonte externa (mesmo cofre usado pelo restante do sistema) ──────────
async function obterToken(): Promise<string | null> {
  const [row] = await sql`
    SELECT valor_encrypted FROM alissonerp.configuracoes_secrets WHERE chave = 'tiny_bearer_token'
  `;
  if (!row?.valor_encrypted) return null;
  let token: string;
  try { token = JSON.parse(row.valor_encrypted); } catch { token = String(row.valor_encrypted); }
  return token.replace(/"/g, "").trim();
}

async function renovarToken(): Promise<string | null> {
  const [ciRow] = await sql`SELECT valor_encrypted FROM alissonerp.configuracoes_secrets WHERE chave = 'tiny_client_id'`;
  const [csRow] = await sql`SELECT valor_encrypted FROM alissonerp.configuracoes_secrets WHERE chave = 'tiny_client_secret'`;
  if (!ciRow?.valor_encrypted || !csRow?.valor_encrypted) return null;
  let clientId: string, clientSecret: string;
  try { clientId = JSON.parse(ciRow.valor_encrypted); } catch { clientId = String(ciRow.valor_encrypted); }
  try { clientSecret = JSON.parse(csRow.valor_encrypted); } catch { clientSecret = String(csRow.valor_encrypted); }
  clientId = clientId.replace(/"/g, "").trim();
  clientSecret = clientSecret.replace(/"/g, "").trim();
  try {
    const r = await fetch("https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return null;
    const tokens = await r.json() as { access_token: string };
    await sql`
      INSERT INTO alissonerp.configuracoes_secrets (chave, valor_encrypted)
      VALUES ('tiny_bearer_token', ${JSON.stringify(tokens.access_token)})
      ON CONFLICT (chave) DO UPDATE SET valor_encrypted = ${JSON.stringify(tokens.access_token)}
    `;
    return tokens.access_token;
  } catch { return null; }
}

// Faz um GET autenticado, renovando o token 1x se expirou (401).
async function getComToken(caminho: string, tokenRef: { valor: string }): Promise<Response> {
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const res = await fetch(`${BASE}${caminho}`, {
      headers: { Authorization: `Bearer ${tokenRef.valor}` },
      signal: AbortSignal.timeout(15000),
    });
    if (res.status === 401 && tentativa === 0) {
      const novo = await renovarToken();
      if (novo) { tokenRef.valor = novo; continue; }
    }
    return res;
  }
  // Inalcancavel, mas satisfaz o tipo
  return fetch(`${BASE}${caminho}`, { headers: { Authorization: `Bearer ${tokenRef.valor}` } });
}

// Normaliza a localizacao vinda da fonte: string vazia/espacos => null.
function normalizarLoc(v: unknown): string | null {
  const s = (v == null ? "" : String(v)).trim();
  return s.length > 0 ? s : null;
}

// ─── Tipos de retorno ─────────────────────────────────────────────────────────
export interface ResultadoPeca {
  encontradaNaFonte: boolean;
  idApiProduto: number;
  nomeFonte: string | null;
  localizacaoFonte: string | null;
  gravou: boolean;            // true se atualizou alguma linha em erp_produtos
  erro?: string;
}

export interface ProgressoBloco {
  totalNaFonte: number;       // paginacao.total
  proximoOffset: number;      // onde o proximo bloco comeca
  processadosNoBloco: number;
  atualizados: number;        // pecas que receberam localizacao
  semLocalizacao: number;     // pecas com localizacao vazia na fonte
  semCorrespondencia: number; // id da fonte que nao existe em erp_produtos
  concluido: boolean;
  erro?: string;
}

// ─── TESTE: 1 peca via endpoint de estoque ────────────────────────────────────
// Usa GET /estoque/{id} (endpoint dedicado a peca) para validar o fluxo antes da carga.
export async function importarLocalizacaoDeUmaPeca(idApiProduto: number): Promise<ResultadoPeca> {
  const token = await obterToken();
  if (!token) return { encontradaNaFonte: false, idApiProduto, nomeFonte: null, localizacaoFonte: null, gravou: false, erro: "Token da fonte externa nao configurado" };
  const tokenRef = { valor: token };

  const res = await getComToken(`/estoque/${idApiProduto}`, tokenRef);
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    return { encontradaNaFonte: false, idApiProduto, nomeFonte: null, localizacaoFonte: null, gravou: false, erro: `Fonte respondeu ${res.status}: ${txt.slice(0, 120)}` };
  }
  const data = await res.json() as { nome?: string; localizacao?: string };
  const loc = normalizarLoc(data.localizacao);

  // Grava so quando ha localizacao (carga so preenche, nao apaga o que ja existe).
  let gravou = false;
  if (loc) {
    const r = await sql`
      UPDATE alissonerp.erp_produtos
      SET localizacao = ${loc}, date_updated = now()
      WHERE id_api_produto = ${idApiProduto}::bigint
    `;
    gravou = r.count > 0;
  }
  return {
    encontradaNaFonte: true,
    idApiProduto,
    nomeFonte: data.nome ?? null,
    localizacaoFonte: loc,
    gravou,
  };
}

// ─── MIGRACAO: um bloco da lista paginada ─────────────────────────────────────
// Percorre PAGINAS_POR_BLOCO paginas a partir de `offset`, lendo estoque.localizacao
// de cada item e gravando em erp_produtos. Devolve o progresso para o front continuar.
export async function importarLocalizacoesBloco(offset: number): Promise<ProgressoBloco> {
  const token = await obterToken();
  if (!token) {
    return { totalNaFonte: 0, proximoOffset: offset, processadosNoBloco: 0, atualizados: 0, semLocalizacao: 0, semCorrespondencia: 0, concluido: false, erro: "Token da fonte externa nao configurado" };
  }
  const tokenRef = { valor: token };

  let totalNaFonte = 0;
  let processadosNoBloco = 0;
  let atualizados = 0;
  let semLocalizacao = 0;
  let semCorrespondencia = 0;
  let cursor = offset;

  for (let p = 0; p < PAGINAS_POR_BLOCO; p++) {
    // Respeita o limite de chamadas da fonte (menos na 1a pagina do bloco).
    if (p > 0) await dormir(ESPERA_MS);

    const res = await getComToken(`/produtos?limit=${LIMITE_PAGINA}&offset=${cursor}`, tokenRef);
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return { totalNaFonte, proximoOffset: cursor, processadosNoBloco, atualizados, semLocalizacao, semCorrespondencia, concluido: false, erro: `Fonte respondeu ${res.status}: ${txt.slice(0, 120)}` };
    }
    const data = await res.json() as {
      itens?: Array<{ id?: number; estoque?: { localizacao?: string } }>;
      paginacao?: { total?: number };
    };
    totalNaFonte = Number(data.paginacao?.total ?? totalNaFonte);
    const itens = data.itens ?? [];

    for (const it of itens) {
      processadosNoBloco++;
      const idApi = Number(it.id);
      const loc = normalizarLoc(it.estoque?.localizacao);
      if (!idApi) { continue; }
      if (!loc) { semLocalizacao++; continue; }
      const r = await sql`
        UPDATE alissonerp.erp_produtos
        SET localizacao = ${loc}, date_updated = now()
        WHERE id_api_produto = ${idApi}::bigint
      `;
      if (r.count > 0) atualizados++;
      else semCorrespondencia++;
    }

    cursor += LIMITE_PAGINA;

    // Chegou ao fim da lista.
    if (totalNaFonte > 0 && cursor >= totalNaFonte) {
      return { totalNaFonte, proximoOffset: cursor, processadosNoBloco, atualizados, semLocalizacao, semCorrespondencia, concluido: true };
    }
    if (itens.length === 0) {
      return { totalNaFonte, proximoOffset: cursor, processadosNoBloco, atualizados, semLocalizacao, semCorrespondencia, concluido: true };
    }
  }

  return { totalNaFonte, proximoOffset: cursor, processadosNoBloco, atualizados, semLocalizacao, semCorrespondencia, concluido: false };
}
