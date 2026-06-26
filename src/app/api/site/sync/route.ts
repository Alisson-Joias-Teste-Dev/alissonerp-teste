/**
 * GET  /api/site/sync — resumo de status dos produtos publicados.
 * POST /api/site/sync — dispara sincronização de todos os publicados.
 *
 * IMPORTANTE: a chamada real à API WooCommerce ainda é STUB nesta fase —
 * o POST itera os produtos, monta payload (sku, regular_price, stock_quantity,
 * manage_stock, status) e, se tiver credenciais salvas, tenta enviar via
 * `POST /wp-json/wc/v3/products/batch`. Se credenciais ausentes, marca como
 * "pendente" e retorna { ok: 0, erros: 0, skipped: N }.
 *
 * Autenticação: Basic auth com consumer_key:consumer_secret (WooCommerce
 * recomenda HTTPS + Basic; sem HTTPS, usar OAuth 1.0a — fora de escopo aqui).
 */
import { NextRequest, NextResponse } from "next/server";
import { authOr401 } from "@/lib/auth-server";
import { temAcessoModulo } from "@/lib/permissoes";
import sql from "@/lib/db";
import { tabelaExiste } from "@/lib/schema-check";
import { upsertProduto, sincronizarVariacoes, type WCProductPayload } from "@/lib/woocommerce";
import { internalError } from "@/lib/api-error";

const MSG_MIGRACAO = "Migration 159 pendente. Execute: node scripts/apply_159.mjs";

interface SiteConfigRow {
  site_url: string | null;
  consumer_key: string | null;
  consumer_secret: string | null;
  ativo: boolean;
  sincronizar_estoque: boolean;
  sincronizar_preco: boolean;
}

async function carregarConfig(): Promise<SiteConfigRow | null> {
  const [row] = await sql<SiteConfigRow[]>`
    SELECT site_url, consumer_key, consumer_secret, ativo,
           sincronizar_estoque, sincronizar_preco
    FROM alissonerp.site_config WHERE id = 1
  `;
  return row ?? null;
}

async function resumo() {
  const [r] = await sql<{
    total: number; publicados: number; ok: number; pendentes: number; erros: number;
  }[]>`
    SELECT
      (SELECT COUNT(*)::int FROM public.produtos WHERE situacao = 'A')                         AS total,
      COUNT(*) FILTER (WHERE publicado_no_site = true)::int                                    AS publicados,
      COUNT(*) FILTER (WHERE publicado_no_site = true AND status_sync = 'ok')::int             AS ok,
      COUNT(*) FILTER (WHERE publicado_no_site = true AND status_sync = 'pendente')::int       AS pendentes,
      COUNT(*) FILTER (WHERE publicado_no_site = true AND status_sync = 'erro')::int           AS erros
    FROM alissonerp.site_produtos
  `;
  return r ?? { total: 0, publicados: 0, ok: 0, pendentes: 0, erros: 0 };
}

export async function GET(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!(await temAcessoModulo(user.role, "produtos", "ler"))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  try {
    if (!(await tabelaExiste("alissonerp", "site_produtos")) ||
        !(await tabelaExiste("alissonerp", "site_config"))) {
      return NextResponse.json({
        resumo: { total: 0, publicados: 0, ok: 0, pendentes: 0, erros: 0 },
        migracao_pendente: true,
        mensagem: MSG_MIGRACAO,
      });
    }
    return NextResponse.json({ resumo: await resumo() });
  } catch (err) {
    return internalError("[GET /api/site/sync]", err);
  }
}

export async function POST(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!(await temAcessoModulo(user.role, "produtos", "escrever"))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  try {
    if (!(await tabelaExiste("alissonerp", "site_config")) ||
        !(await tabelaExiste("alissonerp", "site_produtos"))) {
      return NextResponse.json({ error: MSG_MIGRACAO }, { status: 503 });
    }

    const cfg = await carregarConfig();
    if (!cfg?.ativo) {
      return NextResponse.json(
        { error: "Integração com o site está desativada. Ative em /site → Integração." },
        { status: 400 }
      );
    }
    if (!cfg.site_url || !cfg.consumer_key || !cfg.consumer_secret) {
      return NextResponse.json(
        { error: "Credenciais WooCommerce incompletas (site_url, consumer_key e consumer_secret)." },
        { status: 400 }
      );
    }

    // Lista a sincronizar: publicado_no_site = true (com saldo consolidado)
    const alvos = await sql<{
      produto_id: number; sku: string; nome: string;
      preco: number | null; saldo: number; wc_product_id: number | null;
    }[]>`
      SELECT
        p.id_produto AS produto_id, p.sku, p.nome,
        pp.preco_venda AS preco,
        COALESCE(est.disponivel, 0)::int AS saldo,
        sp.wc_product_id
      FROM alissonerp.site_produtos sp
      JOIN public.produtos p ON p.id_produto = sp.produto_id
      LEFT JOIN alissonerp.vw_produto_preco pp ON pp.id_produto = p.id_produto
      LEFT JOIN alissonerp.vw_saldo_estoque_comercial est ON est.produto_id = p.id_produto
      WHERE sp.publicado_no_site = true AND p.situacao = 'A'
    `;

    const creds = {
      site_url: cfg.site_url,
      consumer_key: cfg.consumer_key,
      consumer_secret: cfg.consumer_secret,
    };

    let okCount = 0;
    let erroCount = 0;
    const erros: Array<{ sku: string; msg: string }> = [];

    // Uma request por produto via helper `upsertProduto` — resolve conflitos
    // de SKU existente (product_invalid_sku) fazendo lookup por SKU ou
    // aproveitando o resource_id sugerido pelo próprio WC.
    for (const alvo of alvos) {
      const payload: WCProductPayload = { name: alvo.nome, sku: alvo.sku };
      if (cfg.sincronizar_preco && alvo.preco != null && alvo.preco > 0) {
        payload.regular_price = String(Math.round(Number(alvo.preco)));
      }
      if (cfg.sincronizar_estoque) {
        payload.manage_stock   = true;
        payload.stock_quantity = Math.max(0, Number(alvo.saldo ?? 0));
        payload.stock_status   = Number(alvo.saldo ?? 0) > 0 ? "instock" : "outofstock";
      }

      const r = await upsertProduto(creds, payload, alvo.wc_product_id);

      if (r.ok) {
        // Se é variable, sincroniza variações também
        let varMsg: string | null = null;
        if (r.type === "variable" && r.wc_product_id) {
          const filhos = await sql<{ sku: string; preco: number; saldo: number }[]>`
            SELECT p.sku,
                   COALESCE(pp.preco_venda, 0)::float AS preco,
                   COALESCE(est.disponivel, 0)::int   AS saldo
            FROM public.produtos p
            LEFT JOIN alissonerp.vw_produto_preco pp ON pp.id_produto = p.id_produto
            LEFT JOIN alissonerp.vw_saldo_estoque_comercial est ON est.produto_id = p.id_produto
            WHERE p.sku LIKE ${alvo.sku + "-%"}
          `;
          const porSku = new Map(filhos.map(f => [f.sku, { preco: Number(f.preco), saldo: Number(f.saldo) }]));
          const vi = await sincronizarVariacoes(
            creds, r.wc_product_id,
            (sku) => porSku.get(sku) ?? null,
            { sync_preco: cfg.sincronizar_preco, sync_estoque: cfg.sincronizar_estoque, preco_pai: Number(alvo.preco ?? 0) },
          );
          if (vi.erros.length > 0) {
            varMsg = `${vi.erros.length} var falharam: ${vi.erros[0].msg}`;
          }
          // Preço do pai é calculado pela view vw_produto_preco — não precisa persistir
        }

        await sql`
          UPDATE alissonerp.site_produtos
          SET wc_product_id       = ${r.wc_product_id},
              wc_permalink        = ${r.wc_permalink},
              status_sync         = ${varMsg ? "erro" : "ok"},
              ultimo_erro         = ${varMsg},
              ultima_tentativa_at = NOW()
          WHERE produto_id = ${alvo.produto_id}
        `;
        if (varMsg) {
          erros.push({ sku: alvo.sku, msg: varMsg });
          erroCount += 1;
        } else {
          okCount += 1;
        }
      } else {
        const msg = r.error ?? "Erro";
        erros.push({ sku: alvo.sku, msg });
        await sql`
          UPDATE alissonerp.site_produtos
          SET status_sync         = 'erro',
              ultimo_erro         = ${msg},
              ultima_tentativa_at = NOW()
          WHERE produto_id = ${alvo.produto_id}
        `;
        erroCount += 1;
      }
    }

    // Atualiza timestamp global
    await sql`UPDATE alissonerp.site_config SET ultima_sync_at = NOW() WHERE id = 1`;

    return NextResponse.json({
      ok: okCount,
      erros: erroCount,
      total: alvos.length,
      detalhes_erro: erros.slice(0, 10),
      resumo: await resumo(),
    });
  } catch (err) {
    return internalError("[POST /api/site/sync]", err, "Erro ao sincronizar");
  }
}
