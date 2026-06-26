/**
 * GET /api/cotacao-ouro
 * Retorna a cotacao atual do ouro em BRL para 18k e 24k por grama.
 *
 * Fonte: AwesomeAPI (XAU-BRL). Free, sem auth.
 *   - XAU = troy ounce de ouro puro (31.1035g)
 *   - preco_24k_g  = XAU_BRL / 31.1035
 *   - preco_18k_g  = preco_24k_g * 0.75   (ouro 18k = 750/1000 pureza)
 *
 * Cache em memoria 1h (reset automatico a cada cold-start do lambda/container).
 * Se falhar, retorna fallback estatico com flag `estale: true`.
 */
import { NextResponse, type NextRequest } from "next/server";
import { rateLimit, rateLimitResponse, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

const CACHE_TTL_MS = 60 * 60 * 1000; // 1h
const TROY_OUNCE_G = 31.1035;
const PUREZA_18K   = 0.75;

type Cotacao = {
  preco_24k_g: number;
  preco_18k_g: number;
  variacao_pct_24h: number;
  atualizado_em: string;
  fonte: string;
  estale?: boolean;
};

// Cache em memoria (modulo level)
let cache: { data: Cotacao; expires: number } | null = null;

async function fetchAwesomeAPI(): Promise<Cotacao> {
  const res = await fetch("https://economia.awesomeapi.com.br/json/last/XAU-BRL", {
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`AwesomeAPI ${res.status}`);
  const json = await res.json() as { XAUBRL?: { bid: string; pctChange: string; create_date: string } };
  const row = json.XAUBRL;
  if (!row) throw new Error("Resposta sem XAUBRL");

  const xauBrl = Number(row.bid);
  if (!xauBrl || xauBrl <= 0) throw new Error("bid invalido");

  const preco24k = xauBrl / TROY_OUNCE_G;
  const preco18k = preco24k * PUREZA_18K;

  return {
    preco_24k_g: Number(preco24k.toFixed(2)),
    preco_18k_g: Number(preco18k.toFixed(2)),
    variacao_pct_24h: Number(Number(row.pctChange).toFixed(2)),
    atualizado_em: row.create_date,
    fonte: "AwesomeAPI XAU-BRL",
  };
}

export async function GET(req: NextRequest) {
  // Sem auth: limita por IP (10/min) E global (60/min) pra proteger cota da
  // AwesomeAPI (provedor free, sem renovacao em caso de abuso). O cache de 1h
  // ja absorve grande parte do trafego — limite atinge so quando o cache esta
  // expirado E varias requests entram em paralelo.
  try {
    rateLimit(`cotacao-ouro:ip:${getClientIp(req)}`, 10, 60_000);
    rateLimit(`cotacao-ouro:global`, 60, 60_000);
  } catch (e) {
    const r = rateLimitResponse(e);
    if (r) return r;
    throw e;
  }

  const now = Date.now();

  // Cache hit
  if (cache && cache.expires > now) {
    return NextResponse.json(cache.data);
  }

  try {
    const data = await fetchAwesomeAPI();
    cache = { data, expires: now + CACHE_TTL_MS };
    return NextResponse.json(data);
  } catch (err) {
    console.error("[/api/cotacao-ouro] falha:", err);
    // Se tem cache expirado, devolve ele com flag estale
    if (cache) {
      return NextResponse.json({ ...cache.data, estale: true });
    }
    // Fallback estatico (ouro ~R$ 385/g 18k em 2026 — ordem de grandeza)
    return NextResponse.json(
      {
        preco_24k_g: 513.87,
        preco_18k_g: 385.40,
        variacao_pct_24h: 0,
        atualizado_em: new Date().toISOString(),
        fonte: "fallback estatico",
        estale: true,
      },
      { status: 200 },
    );
  }
}
