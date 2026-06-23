import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";

// ─── POST /api/estoque-comercial/sync-tiny ────────────────────────────────────
// Push estoque fabricaAJ → Tiny via API v3
// Docs: https://api-docs.erp.olist.com/api-reference/estoque/atualizar-o-estoque-de-um-produto
// Endpoint: POST https://api.tiny.com.br/public-api/v3/estoque/{idProduto}
// Auth: Bearer token (OAuth2)
export async function POST() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  if (!usuario || !isFullAccess(usuario.role)) {
    return NextResponse.json({ error: "Sem permissão — apenas admin/dev" }, { status: 403 });
  }

  // Buscar Bearer token OAuth2 do Tiny
  const [tokenRow] = await sql`
    SELECT valor_encrypted FROM alissonerp.configuracoes_secrets WHERE chave = 'tiny_bearer_token'
  `;
  const [tokenRowLegacy] = !tokenRow ? await sql`
    SELECT valor_encrypted FROM alissonerp.configuracoes_secrets WHERE chave = 'tiny_api_token'
  ` : [tokenRow];

  const rawToken = tokenRowLegacy?.valor_encrypted ?? tokenRow?.valor_encrypted;
  if (!rawToken) {
    return NextResponse.json({ error: "Token do Tiny não configurado" }, { status: 400 });
  }
  let tinyToken: string;
  try { tinyToken = JSON.parse(rawToken); } catch { tinyToken = String(rawToken); }
  tinyToken = tinyToken.replace(/"/g, "").trim();
  if (!tinyToken) return NextResponse.json({ error: "Token do Tiny inválido" }, { status: 400 });

  // Buscar produtos ativos com saldo consolidado + id_api_tiny (ID do produto no Tiny)
  const produtos = await sql`
    SELECT
      ec.produto_id,
      p.sku,
      p.nome AS nome_produto,
      p.id_api_tiny,
      COALESCE(s.saldo_fisico, 0) AS saldo
    FROM alissonerp.estoque_comercial_config ec
    JOIN alissonerp.produtos_compat p ON p.id_produto = ec.produto_id
    LEFT JOIN alissonerp.vw_saldo_estoque_comercial_consolidado s ON s.produto_id = ec.produto_id
    WHERE ec.ativo = true
      AND p.id_api_tiny IS NOT NULL
    ORDER BY p.nome
  `;

  if (produtos.length === 0) {
    return NextResponse.json({ error: "Nenhum produto ativo com id_api_tiny encontrado" }, { status: 404 });
  }

  const resultados: Array<{
    produto_id: number;
    sku: string;
    nome: string;
    saldo: number;
    status: "ok" | "erro";
    erro?: string;
  }> = [];

  for (let idx = 0; idx < produtos.length; idx++) {
    const prod = produtos[idx];
    const sku = prod.sku as string || "";
    const saldo = Number(prod.saldo ?? 0);
    const tinyProdId = prod.id_api_tiny;

    if (!tinyProdId) {
      resultados.push({ produto_id: prod.produto_id as number, sku, nome: prod.nome_produto as string, saldo, status: "erro", erro: "Sem id_api_tiny" });
      continue;
    }

    // Rate limiting: Tiny API ~30 req/min → esperar 2.1s entre requests
    if (idx > 0) await new Promise((r) => setTimeout(r, 2100));

    try {
      // API v3: POST /estoque/{idProduto}
      const payload = {
        tipo: "B",                // B = Balanço (seta valor absoluto)
        quantidade: saldo,
        precoUnitario: 0,         // Não atualizar preço
        observacoes: "Sync fabricaAJ → Tiny",
      };

      const res = await fetch(`https://api.tiny.com.br/public-api/v3/estoque/${tinyProdId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${tinyToken}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        resultados.push({
          produto_id: prod.produto_id as number, sku, nome: prod.nome_produto as string, saldo,
          status: "erro", erro: `HTTP ${res.status}: ${errText.slice(0, 100)}`,
        });
        continue;
      }

      const data = await res.json() as { idLancamento?: number };

      resultados.push({
        produto_id: prod.produto_id as number,
        sku,
        nome: prod.nome_produto as string,
        saldo,
        status: "ok",
      });

    } catch (e) {
      console.error(`[estoque-comercial/sync-tiny] produto=${prod.produto_id} sku=${sku} falhou:`, e);
      resultados.push({
        produto_id: prod.produto_id as number,
        sku,
        nome: prod.nome_produto as string,
        saldo,
        status: "erro",
        erro: "Falha de comunicação com Tiny",
      });
    }
  }

  const totalOk = resultados.filter((r) => r.status === "ok").length;
  const totalErro = resultados.filter((r) => r.status === "erro").length;

  return NextResponse.json({
    ok: totalErro === 0,
    total: resultados.length,
    sincronizados: totalOk,
    erros: totalErro,
    detalhes: resultados,
  });
}
