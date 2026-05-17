/**
 * POST /api/site/sync/[id]
 *
 * Sincroniza UM produto individual com o WooCommerce — cria se não existir
 * (POST /products), atualiza se já estiver no site (PUT /products/{id}).
 *
 * Usa a mesma lógica do /api/site/sync massivo, mas isolada a 1 produto.
 * Não exige que `publicado_no_site` seja true (permite enviar avulso).
 *
 * Retorna: { ok, wc_product_id, wc_permalink, status_sync, ultimo_erro }
 */
import { NextRequest, NextResponse } from "next/server";
import { authOr401 } from "@/lib/auth-server";
import { temAcessoModulo } from "@/lib/permissoes";
import sql from "@/lib/db";
import { tabelaExiste } from "@/lib/schema-check";
import { upsertProduto, sincronizarVariacoes, type WCProductPayload } from "@/lib/woocommerce";
import { internalError } from "@/lib/api-error";

const MSG_MIGRACAO = "Migration 159 pendente. Execute: node scripts/apply_159.mjs";

interface CfgRow {
  site_url: string | null;
  consumer_key: string | null;
  consumer_secret: string | null;
  ativo: boolean;
  sincronizar_estoque: boolean;
  sincronizar_preco: boolean;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const produtoId = Number(id);
  if (!produtoId) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

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

    // Carrega credenciais
    const [cfg] = await sql<CfgRow[]>`
      SELECT site_url, consumer_key, consumer_secret, ativo,
             sincronizar_estoque, sincronizar_preco
      FROM alissonerp.site_config WHERE id = 1
    `;
    if (!cfg?.ativo) {
      return NextResponse.json(
        { error: "Integração desativada. Ative em /site → Integração." },
        { status: 400 }
      );
    }
    if (!cfg.site_url || !cfg.consumer_key || !cfg.consumer_secret) {
      return NextResponse.json(
        { error: "Credenciais WooCommerce incompletas." },
        { status: 400 }
      );
    }

    // Carrega dados do produto (nome, sku, preço, saldo consolidado, mapping atual)
    const [alvo] = await sql<{
      produto_id: number; sku: string; nome: string;
      preco: number | null; saldo: number; wc_product_id: number | null;
    }[]>`
      SELECT
        p.id_produto AS produto_id, p.sku, p.nome,
        -- Preço calculado pelo ERP (preco_sync → preco_curva runtime → filhos → preco_tiny)
        COALESCE(
          NULLIF(p.preco_sync::numeric, 0),
          CASE
            WHEN p.peso_precificado > 0 AND p.markup > 0
             AND (SELECT ouro FROM public.parametros LIMIT 1) > 0
            THEN ROUND(p.peso_precificado::numeric * (SELECT ouro FROM public.parametros LIMIT 1)::numeric
                     * p.markup::numeric * COALESCE(p.fator::numeric, 1) / 10)::numeric * 10
          END,
          (
            SELECT MIN(COALESCE(
              NULLIF(fp.preco_sync::numeric, 0),
              CASE
                WHEN fp.peso_precificado > 0 AND fp.markup > 0
                 AND (SELECT ouro FROM public.parametros LIMIT 1) > 0
                THEN ROUND(fp.peso_precificado::numeric * (SELECT ouro FROM public.parametros LIMIT 1)::numeric
                         * fp.markup::numeric * COALESCE(fp.fator::numeric, 1) / 10)::numeric * 10
              END,
              NULLIF(fp.preco_tiny::numeric, 0)
            ))
            FROM alissonerp.erp_produtos pai_e
            INNER JOIN alissonerp.erp_produtos filho_e ON filho_e.parent_id = pai_e.id
            INNER JOIN public.produtos fp ON fp.id_produto = filho_e.produto_id
            WHERE pai_e.produto_id = p.id_produto
          ),
          NULLIF(p.preco_tiny::numeric, 0),
          0
        ) AS preco,
        GREATEST(
          COALESCE((
            SELECT SUM(CASE WHEN m.tipo = 'entrada' THEN m.quantidade ELSE -m.quantidade END)::int
            FROM alissonerp.movimentacoes_estoque_comercial m
            WHERE m.produto_id = p.id_produto AND m.status = 'efetivado'
          ), 0),
          COALESCE((
            SELECT SUM(CASE WHEN m_f.tipo = 'entrada' THEN m_f.quantidade ELSE -m_f.quantidade END)::int
            FROM alissonerp.erp_produtos pp
            INNER JOIN alissonerp.erp_produtos fp ON fp.parent_id = pp.id
            INNER JOIN public.produtos fpr ON fpr.id_produto = fp.produto_id
            INNER JOIN alissonerp.movimentacoes_estoque_comercial m_f ON m_f.produto_id = fpr.id_produto AND m_f.status = 'efetivado'
            WHERE pp.produto_id = p.id_produto
          ), 0),
          COALESCE((
            SELECT SUM(v.saldo)::int FROM alissonerp.vw_estoque_directus_saldo v
            WHERE v.insumo_sku = p.sku
          ), 0)
        ) AS saldo,
        sp.wc_product_id
      FROM public.produtos p
      LEFT JOIN alissonerp.site_produtos sp ON sp.produto_id = p.id_produto
      WHERE p.id_produto = ${produtoId} AND p.situacao = 'A'
      LIMIT 1
    `;
    if (!alvo) {
      return NextResponse.json({ error: "Produto não encontrado ou inativo" }, { status: 404 });
    }

    // Garante linha em site_produtos (pra marcar status mesmo se ainda não publicou)
    await sql`
      INSERT INTO alissonerp.site_produtos (produto_id, sku, publicado_no_site, status_sync)
      VALUES (${alvo.produto_id}, ${alvo.sku}, true, 'pendente')
      ON CONFLICT (produto_id) DO UPDATE SET
        publicado_no_site = true,
        status_sync = 'pendente'
    `;

    const payload: WCProductPayload = {
      name: alvo.nome,
      sku:  alvo.sku,
    };
    if (cfg.sincronizar_preco && alvo.preco != null && alvo.preco > 0) {
      payload.regular_price = String(Math.round(Number(alvo.preco)));
    }
    if (cfg.sincronizar_estoque) {
      payload.manage_stock   = true;
      payload.stock_quantity = Math.max(0, Number(alvo.saldo ?? 0));
      payload.stock_status   = Number(alvo.saldo ?? 0) > 0 ? "instock" : "outofstock";
    }

    const resultado = await upsertProduto(
      {
        site_url: cfg.site_url,
        consumer_key: cfg.consumer_key,
        consumer_secret: cfg.consumer_secret,
      },
      payload,
      alvo.wc_product_id,
    );

    if (resultado.ok) {
      // ── Sincronização de variações (produtos variable no WC) ─────────────
      // WC ignora regular_price/stock do produto-pai quando type=variable.
      // Cada variação tem seu próprio preço/estoque — fazemos PUT em cada uma,
      // casando por SKU com os filhos no ERP.
      let variacoesInfo: {
        tentadas: number;
        ok: number;
        erros: Array<{ sku: string; msg: string }>;
        precos_variacoes: number[];
      } = { tentadas: 0, ok: 0, erros: [], precos_variacoes: [] };

      let precoPaiAlinhado: number | null = null;

      if (resultado.type === "variable" && resultado.wc_product_id) {
        // Pré-carrega preço ERP calculado + saldo dos filhos em bulk
        const filhos = await sql<{ sku: string; preco: number; saldo: number }[]>`
          SELECT
            p.sku,
            COALESCE(
              NULLIF(p.preco_sync::numeric, 0),
              CASE
                WHEN p.peso_precificado > 0 AND p.markup > 0
                 AND (SELECT ouro FROM public.parametros LIMIT 1) > 0
                THEN ROUND(p.peso_precificado::numeric * (SELECT ouro FROM public.parametros LIMIT 1)::numeric
                         * p.markup::numeric * COALESCE(p.fator::numeric, 1) / 10)::numeric * 10
              END,
              NULLIF(p.preco_tiny::numeric, 0),
              0
            )::float                                 AS preco,
            COALESCE((
              SELECT SUM(CASE WHEN m.tipo = 'entrada' THEN m.quantidade ELSE -m.quantidade END)::int
              FROM alissonerp.movimentacoes_estoque_comercial m
              WHERE m.produto_id = p.id_produto AND m.status = 'efetivado'
            ), 0)::int                               AS saldo
          FROM public.produtos p
          WHERE p.sku LIKE ${alvo.sku + "-%"}
        `;
        const porSku = new Map(filhos.map(r => [r.sku, { preco: Number(r.preco), saldo: Number(r.saldo) }]));

        variacoesInfo = await sincronizarVariacoes(
          { site_url: cfg.site_url, consumer_key: cfg.consumer_key, consumer_secret: cfg.consumer_secret },
          resultado.wc_product_id,
          (sku) => porSku.get(sku) ?? null,
          {
            sync_preco: cfg.sincronizar_preco,
            sync_estoque: cfg.sincronizar_estoque,
            preco_pai: Number(alvo.preco ?? 0),
          },
        );

        // ── Alinha preço do PAI no ERP com o dos filhos ──────────────────
        // Se todas as variações têm o mesmo preço, o pai passa a refletir ele.
        // Se há preços diferentes, o pai recebe o MENOR (comportamento similar
        // ao WooCommerce, que mostra "a partir de R$ X").
        // Só atualiza se o preço efetivo divergir do preco_tiny atual do pai.
        if (variacoesInfo.precos_variacoes.length > 0) {
          const menor = Math.min(...variacoesInfo.precos_variacoes);
          const precoPaiAtual = Math.round(Number(alvo.preco ?? 0));
          if (menor > 0 && menor !== precoPaiAtual) {
            await sql`
              UPDATE public.produtos
              SET preco_tiny = ${menor}
              WHERE id_produto = ${alvo.produto_id}
            `;
            precoPaiAlinhado = menor;
          }
        }
      }

      // Marca OK só se o pai foi OK (variações com erro só viram alerta no retorno).
      const temErroVar = variacoesInfo.erros.length > 0;
      await sql`
        UPDATE alissonerp.site_produtos
        SET wc_product_id       = ${resultado.wc_product_id},
            wc_permalink        = ${resultado.wc_permalink},
            status_sync         = ${temErroVar ? "erro" : "ok"},
            ultimo_erro         = ${temErroVar ? `${variacoesInfo.erros.length} variação(ões) falharam: ${variacoesInfo.erros[0]?.msg ?? ""}` : null},
            ultima_tentativa_at = NOW()
        WHERE produto_id = ${alvo.produto_id}
      `;
      await sql`UPDATE alissonerp.site_config SET ultima_sync_at = NOW() WHERE id = 1`;

      return NextResponse.json({
        ok: !temErroVar,
        wc_product_id: resultado.wc_product_id,
        wc_permalink: resultado.wc_permalink,
        status_sync: temErroVar ? "erro" : "ok",
        acao: resultado.action, // create | update | lookup_update | conflict_update
        tipo: resultado.type,   // simple | variable | ...
        variacoes: variacoesInfo,
        preco_pai_alinhado: precoPaiAlinhado, // se diferente do atual, foi atualizado no ERP
      });
    } else {
      const msg = resultado.error ?? "Erro desconhecido";
      await sql`
        UPDATE alissonerp.site_produtos
        SET status_sync         = 'erro',
            ultimo_erro         = ${msg},
            ultima_tentativa_at = NOW()
        WHERE produto_id = ${alvo.produto_id}
      `;
      return NextResponse.json({
        ok: false,
        status_sync: "erro",
        ultimo_erro: msg,
        acao: resultado.action,
      }, { status: 502 });
    }
  } catch (err) {
    return internalError("[POST /api/site/sync/[id]]", err, "Erro ao sincronizar");
  }
}
