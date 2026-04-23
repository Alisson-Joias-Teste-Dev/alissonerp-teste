import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/tiny/sync-produtos
//
// Worker de sincronização de produtos fabricaAJ → Tiny ERP (v3).
// Deve ser chamado por cron 1×/min. Processa até BATCH_SIZE itens por rodada,
// respeitando o rate limit do Tiny (60 req/min no plano Evoluir).
//
// Fluxo:
//   1. Pega até BATCH_SIZE itens com status='pendente' da fila
//   2. Para cada produto: busca dados em public.produtos + alissonerp.erp_produtos
//   3. Envia para Tiny: POST (create) ou PUT (update)
//   4. Na criação: salva id retornado em public.produtos.id_api_produto
//   5. Marca ok / erro na fila
// ═══════════════════════════════════════════════════════════════════════════════

const BATCH_SIZE = 40; // conservador — deixa margem para outros endpoints
const MAX_TENTATIVAS = 5;

// GET — status da fila (para UI e debug)
export async function GET() {
  const [counts] = await sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'pendente')     AS pendente,
      COUNT(*) FILTER (WHERE status = 'processando')  AS processando,
      COUNT(*) FILTER (WHERE status = 'ok')           AS ok,
      COUNT(*) FILTER (WHERE status = 'erro')         AS erro
    FROM alissonerp.tiny_sync_produtos
  `;
  return NextResponse.json(counts);
}

export async function POST(req: NextRequest) {
  // Aceita chamada de cron (sem auth) ou interna com header
  const authHeader = req.headers.get("x-cron-secret");
  const cronSecret = process.env.CRON_SECRET ?? "fabricaaj-cron";
  if (authHeader && authHeader !== cronSecret) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  // Buscar token Tiny
  const [tokenRow] = await sql`
    SELECT valor_encrypted FROM alissonerp.configuracoes_secrets WHERE chave = 'tiny_bearer_token'
  `;
  if (!tokenRow?.valor_encrypted) {
    return NextResponse.json({ error: "Token Tiny não configurado" }, { status: 400 });
  }
  let tinyToken: string;
  try { tinyToken = JSON.parse(tokenRow.valor_encrypted); } catch { tinyToken = String(tokenRow.valor_encrypted); }
  tinyToken = tinyToken.replace(/"/g, "").trim();

  // Pegar lote de pendentes (excluindo os que já excederam tentativas)
  const fila = await sql`
    SELECT produto_id, operacao, tentativas
    FROM alissonerp.tiny_sync_produtos
    WHERE status = 'pendente' AND tentativas < ${MAX_TENTATIVAS}
    ORDER BY updated_at ASC
    LIMIT ${BATCH_SIZE}
  `;

  if (fila.length === 0) {
    return NextResponse.json({ ok: true, processados: 0, mensagem: "Fila vazia" });
  }

  // Marcar como 'processando' para evitar processamento duplicado
  const ids = fila.map(r => r.produto_id);
  await sql`
    UPDATE alissonerp.tiny_sync_produtos
    SET status = 'processando', updated_at = NOW()
    WHERE produto_id = ANY(${ids})
  `;

  let ok = 0, erros = 0;

  for (const item of fila) {
    const produtoId = Number(item.produto_id);
    try {
      // Buscar dados do produto
      const [prod] = await sql`
        SELECT
          p.id_produto, p.sku, p.nome, p.tipo_metal, p.situacao,
          p.peso_precificado, p.markup, p.fator, p.categoria_precificacao,
          p.categoria, p.preco_sync, p.preco_tiny, p.id_api_produto,
          p.unidade, p.tem_pedra_preciosa,
          ep.cor_metal, ep.largura_aro, ep.altura_aro, ep.base, ep.fornecedor,
          ep.eh_pai, ep.eh_variacao, ep.parent_id
        FROM public.produtos p
        LEFT JOIN alissonerp.erp_produtos ep ON ep.produto_id = p.id_produto
        WHERE p.id_produto = ${produtoId}
      `;

      if (!prod) {
        await marcarErro(produtoId, "Produto não encontrado no banco");
        erros++;
        continue;
      }

      // Montar payload Tiny v3 (produtos)
      const preco = Number(prod.preco_tiny ?? prod.preco_sync ?? 0);
      const payload: Record<string, unknown> = {
        nome: prod.nome,
        codigo: prod.sku,
        tipo: "P",
        situacao: prod.situacao === "A" ? "A" : "I",
        unidadeMedida: prod.unidade ?? "UN",
        ...(preco > 0 ? { preco } : {}),
        ...(prod.peso_precificado ? { pesoBruto: Number(prod.peso_precificado) } : {}),
        ...(prod.fornecedor ? { fornecedor: { nome: String(prod.fornecedor) } } : {}),
      };

      const isUpdate = item.operacao === "update" && prod.id_api_produto;
      let res: Response;

      if (isUpdate) {
        res = await fetch(`https://api.tiny.com.br/public-api/v3/produtos/${prod.id_api_produto}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${tinyToken}` },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(12000),
        });
      } else {
        res = await fetch("https://api.tiny.com.br/public-api/v3/produtos", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${tinyToken}` },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(12000),
        });
      }

      if (res.status === 401) {
        // Token expirado — tenta renovar e recolocar na fila
        const novoToken = await renovarToken();
        if (novoToken) tinyToken = novoToken;
        await sql`
          UPDATE alissonerp.tiny_sync_produtos
          SET status = 'pendente', tentativas = tentativas + 1, updated_at = NOW()
          WHERE produto_id = ${produtoId}
        `;
        continue;
      }

      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        let errMsg = `Tiny ${res.status}`;
        try {
          const j = JSON.parse(errBody);
          const msg = j.message || j.error || j.descricao || "";
          const erros_arr = Array.isArray(j.erros)
            ? j.erros.map((e: Record<string,string>) => e.mensagem || e.campo || JSON.stringify(e)).join("; ")
            : "";
          errMsg = [msg, erros_arr].filter(Boolean).join(" — ") || `${errMsg}: ${errBody.slice(0, 200)}`;
        } catch { errMsg += errBody ? `: ${errBody.slice(0, 200)}` : ""; }
        await marcarErro(produtoId, errMsg);
        erros++;
        continue;
      }

      // Sucesso — se foi create, salvar id_api_produto
      if (!isUpdate) {
        try {
          const data = await res.json() as { id?: number; data?: { id?: number } };
          const tinyId = data?.id ?? data?.data?.id;
          if (tinyId) {
            await sql`UPDATE public.produtos SET id_api_produto = ${tinyId} WHERE id_produto = ${produtoId}`;
          }
        } catch { /* ignorar falha de parse — produto foi criado */ }
      }

      await sql`
        UPDATE alissonerp.tiny_sync_produtos
        SET status = 'ok', erro = NULL, updated_at = NOW()
        WHERE produto_id = ${produtoId}
      `;
      ok++;

    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await marcarErro(produtoId, msg);
      erros++;
    }
  }

  return NextResponse.json({ ok: true, processados: fila.length, sucesso: ok, erros });
}

async function marcarErro(produtoId: number, erro: string) {
  await sql`
    UPDATE alissonerp.tiny_sync_produtos
    SET status = 'erro', tentativas = tentativas + 1, erro = ${erro}, updated_at = NOW()
    WHERE produto_id = ${produtoId}
  `;
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
    const tokens = await r.json() as { access_token: string; refresh_token?: string };
    await sql`INSERT INTO alissonerp.configuracoes_secrets (chave, valor_encrypted) VALUES ('tiny_bearer_token', ${JSON.stringify(tokens.access_token)}) ON CONFLICT (chave) DO UPDATE SET valor_encrypted = ${JSON.stringify(tokens.access_token)}`;
    return tokens.access_token;
  } catch { return null; }
}
