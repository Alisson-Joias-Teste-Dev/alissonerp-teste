import sql from "@/lib/db";

interface SyncResult {
  ok: boolean;
  tinyId?: number;
  erro?: string;
}

async function obterTokenTiny(): Promise<string | null> {
  const [row] = await sql`
    SELECT valor_encrypted FROM alissonerp.configuracoes_secrets WHERE chave = 'tiny_bearer_token'
  `;
  if (!row?.valor_encrypted) return null;
  let token: string;
  try { token = JSON.parse(row.valor_encrypted); } catch { token = String(row.valor_encrypted); }
  return token.replace(/"/g, "").trim();
}

async function renovarTokenTiny(): Promise<string | null> {
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

async function marcarErro(produtoId: number, erro: string) {
  await sql`
    UPDATE alissonerp.tiny_sync_produtos
    SET status = 'erro', tentativas = tentativas + 1, erro = ${erro}, updated_at = NOW()
    WHERE produto_id = ${produtoId}
  `;
}

export async function syncProdutoToTiny(produtoId: number, operacao: string): Promise<SyncResult> {
  try {
    let tinyToken = await obterTokenTiny();
    if (!tinyToken) {
      const msg = "Token Tiny não configurado";
      await marcarErro(produtoId, msg);
      return { ok: false, erro: msg };
    }

    const [prod] = await sql`
      SELECT
        p.id_produto, p.sku, p.nome, p.tipo_metal, p.situacao,
        p.peso_precificado, p.markup, p.fator, p.categoria_precificacao,
        p.categoria, p.preco_sync, p.preco_tiny, p.id_api_produto,
        p.unidade, p.tem_pedra_preciosa,
        ep.cor_metal, ep.largura_aro, ep.altura_aro, ep.base, ep.fornecedor,
        ep.eh_pai, ep.eh_variacao, ep.parent_id
      FROM alissonerp.produtos_compat p
      LEFT JOIN alissonerp.erp_produtos ep ON ep.produto_id = p.id_produto
      WHERE p.id_produto = ${produtoId}
    `;

    if (!prod) {
      const msg = "Produto não encontrado no banco";
      await marcarErro(produtoId, msg);
      return { ok: false, erro: msg };
    }

    const preco = Number(prod.preco_tiny ?? prod.preco_sync ?? 0);
    const payload: Record<string, unknown> = {
      descricao: prod.nome,
      sku: prod.sku,
      tipo: "S",
      situacao: prod.situacao === "A" ? "A" : "I",
      unidade: prod.unidade ?? "UN",
      precos: { preco: preco > 0 ? preco : 0, precoPromocional: 0 },
    };

    const isUpdate = operacao === "update" && prod.id_api_produto;
    let tentouRenovar = false;

    for (let tentativa = 0; tentativa < 2; tentativa++) {
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

      if (res.status === 401 && !tentouRenovar) {
        const novoToken = await renovarTokenTiny();
        if (novoToken) {
          tinyToken = novoToken;
          tentouRenovar = true;
          continue;
        }
      }

      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        let errMsg = `Tiny ${res.status}`;
        try {
          const j = JSON.parse(errBody);
          const msg = j.message || j.error || j.descricao || "";
          const erros_arr = Array.isArray(j.erros)
            ? j.erros.map((e: Record<string, string>) => e.mensagem || e.campo || JSON.stringify(e)).join("; ")
            : "";
          errMsg = [msg, erros_arr].filter(Boolean).join(" — ") || `${errMsg}: ${errBody.slice(0, 200)}`;
        } catch { errMsg += errBody ? `: ${errBody.slice(0, 200)}` : ""; }
        await marcarErro(produtoId, errMsg);
        return { ok: false, erro: errMsg };
      }

      let tinyId = prod.id_api_produto;
      if (!isUpdate) {
        try {
          const data = await res.json() as { id?: number; data?: { id?: number } };
          tinyId = data?.id ?? data?.data?.id;
          if (tinyId) {
            await sql`UPDATE alissonerp.erp_produtos SET id_api_produto = ${tinyId} WHERE produto_id = ${produtoId}`;
          }
        } catch { /* ignorar */ }
      }

      await sql`
        UPDATE alissonerp.tiny_sync_produtos
        SET status = 'ok', erro = NULL, updated_at = NOW()
        WHERE produto_id = ${produtoId}
      `;

      return { ok: true, tinyId };
    }

    const msg = "Não foi possível autenticar com o Tiny após renovar token";
    await marcarErro(produtoId, msg);
    return { ok: false, erro: msg };

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await marcarErro(produtoId, msg);
    return { ok: false, erro: msg };
  }
}
