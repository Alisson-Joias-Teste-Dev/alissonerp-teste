import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";
import { zodError } from "@/lib/schemas/common";

const WooPostSchema = z.object({
  produto_id: z.coerce.number().int().positive(),
  nome: z.string().optional(),
  preco: z.coerce.number().optional(),
  sku: z.string().optional(),
  estoque: z.coerce.number().int().optional(),
}).passthrough();

// ─── POST /api/integracoes/woocommerce ────────────────────────────────────────
// Sincroniza produto do fabricaAJ → WooCommerce via REST API
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  if (!usuario || !isFullAccess(usuario.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = WooPostSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;

  // Buscar credenciais WooCommerce
  let wooUrl = "", wooKey = "", wooSecret = "";
  try {
    const secrets = await sql`
      SELECT chave, valor FROM alissonerp.configuracoes_secrets
      WHERE chave IN ('woo_url', 'woo_consumer_key', 'woo_consumer_secret')
    `;
    for (const s of secrets) {
      const val = String(s.valor).replace(/"/g, "");
      if (s.chave === "woo_url") wooUrl = val;
      if (s.chave === "woo_consumer_key") wooKey = val;
      if (s.chave === "woo_consumer_secret") wooSecret = val;
    }
  } catch { /* sem config */ }

  if (!wooUrl || !wooKey || !wooSecret) {
    return NextResponse.json(
      { error: "Credenciais WooCommerce não configuradas. Adicione em Configurações." },
      { status: 400 }
    );
  }

  // Buscar produto no banco
  const [produto] = await sql`
    SELECT p.id_produto, p.nome, p.sku, p.preco_total_sync, p.situacao
    FROM public.produtos p WHERE p.id_produto = ${body.produto_id}
  `;
  if (!produto) return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 });

  // Montar payload WooCommerce
  const wooPayload: Record<string, unknown> = {};
  if (body.nome || produto.nome) wooPayload.name = body.nome || produto.nome;
  if (body.preco != null || produto.preco_total_sync) wooPayload.regular_price = String(body.preco ?? Number(produto.preco_total_sync));
  if (body.sku || produto.sku) wooPayload.sku = body.sku || produto.sku;
  if (body.estoque != null) {
    wooPayload.manage_stock = true;
    wooPayload.stock_quantity = body.estoque;
  }

  // Enviar para WooCommerce
  const auth = Buffer.from(`${wooKey}:${wooSecret}`).toString("base64");
  const endpoint = `${wooUrl}/wp-json/wc/v3/products`;

  // Buscar produto existente por SKU
  const searchRes = await fetch(`${endpoint}?sku=${encodeURIComponent(produto.sku || "")}`, {
    headers: { Authorization: `Basic ${auth}` },
  });

  let wooProductId: number | null = null;
  if (searchRes.ok) {
    const existing = await searchRes.json() as Array<{ id: number }>;
    if (existing.length > 0) wooProductId = existing[0].id;
  }

  const method = wooProductId ? "PUT" : "POST";
  const url = wooProductId ? `${endpoint}/${wooProductId}` : endpoint;

  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify(wooPayload),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: `WooCommerce ${res.status}: ${err}` }, { status: 502 });
  }

  const result = await res.json() as { id: number };
  return NextResponse.json({
    ok: true,
    woo_product_id: result.id,
    action: wooProductId ? "updated" : "created",
  });
}
