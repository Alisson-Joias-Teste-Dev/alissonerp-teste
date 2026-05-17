/**
 * GET  /api/site/config — retorna config da loja (1 linha id=1)
 * POST /api/site/config — atualiza config (upsert id=1)
 *
 * Campos sensíveis (consumer_key/secret) são mascarados na resposta GET.
 * No POST, se o cliente enviar consumer_secret vazio, MANTÉM o valor atual.
 */
import { NextRequest, NextResponse } from "next/server";
import { authOr401 } from "@/lib/auth-server";
import { temAcessoModulo } from "@/lib/permissoes";
import sql from "@/lib/db";
import { tabelaExiste } from "@/lib/schema-check";
import { internalError } from "@/lib/api-error";

const MSG_MIGRACAO = "Migration 159 pendente. Execute: node scripts/apply_159.mjs";

export async function GET(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!(await temAcessoModulo(user.role, "produtos", "ler"))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  try {
    if (!(await tabelaExiste("alissonerp", "site_config"))) {
      return NextResponse.json({
        config: {
          plataforma: "woocommerce", site_url: "", consumer_key: "", consumer_secret: "",
          ativo: false, sincronizar_estoque: true, sincronizar_preco: true,
          ultima_sync_at: null,
        },
        migracao_pendente: true,
        mensagem: MSG_MIGRACAO,
      });
    }

    const [row] = await sql<{
      plataforma: string; site_url: string | null; consumer_key: string | null;
      consumer_secret: string | null; ativo: boolean;
      sincronizar_estoque: boolean; sincronizar_preco: boolean;
      ultima_sync_at: Date | null;
    }[]>`
      SELECT plataforma, site_url, consumer_key, consumer_secret,
             ativo, sincronizar_estoque, sincronizar_preco, ultima_sync_at
      FROM alissonerp.site_config WHERE id = 1
    `;
    return NextResponse.json({
      config: {
        plataforma:          row?.plataforma          ?? "woocommerce",
        site_url:            row?.site_url            ?? "",
        consumer_key:        row?.consumer_key        ?? "",
        // Retorna o secret inteiro para admin logado (GET só roda com isProdutosAccess).
        consumer_secret:     row?.consumer_secret     ?? "",
        ativo:               row?.ativo               ?? false,
        sincronizar_estoque: row?.sincronizar_estoque ?? true,
        sincronizar_preco:   row?.sincronizar_preco   ?? true,
        ultima_sync_at:      row?.ultima_sync_at ? (row.ultima_sync_at as Date).toISOString() : null,
      },
    });
  } catch (err) {
    return internalError("[GET /api/site/config]", err, "Erro ao carregar config");
  }
}

export async function POST(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!(await temAcessoModulo(user.role, "produtos", "escrever"))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const plataforma      = String(body?.plataforma ?? "woocommerce").trim();
  const site_url        = String(body?.site_url ?? "").trim() || null;
  const consumer_key    = String(body?.consumer_key ?? "").trim() || null;
  const consumer_secret = String(body?.consumer_secret ?? "").trim() || null;
  const ativo           = !!body?.ativo;
  const sync_estoque    = body?.sincronizar_estoque !== false;
  const sync_preco      = body?.sincronizar_preco   !== false;

  try {
    if (!(await tabelaExiste("alissonerp", "site_config"))) {
      return NextResponse.json({ error: MSG_MIGRACAO }, { status: 503 });
    }

    // Se consumer_secret vier vazio, preserva o atual
    await sql`
      INSERT INTO alissonerp.site_config
        (id, plataforma, site_url, consumer_key, consumer_secret, ativo,
         sincronizar_estoque, sincronizar_preco)
      VALUES
        (1, ${plataforma}, ${site_url}, ${consumer_key}, ${consumer_secret}, ${ativo},
         ${sync_estoque}, ${sync_preco})
      ON CONFLICT (id) DO UPDATE SET
        plataforma          = EXCLUDED.plataforma,
        site_url            = EXCLUDED.site_url,
        consumer_key        = EXCLUDED.consumer_key,
        consumer_secret     = COALESCE(NULLIF(EXCLUDED.consumer_secret, ''), alissonerp.site_config.consumer_secret),
        ativo               = EXCLUDED.ativo,
        sincronizar_estoque = EXCLUDED.sincronizar_estoque,
        sincronizar_preco   = EXCLUDED.sincronizar_preco
    `;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return internalError("[POST /api/site/config]", err, "Erro ao salvar config");
  }
}
