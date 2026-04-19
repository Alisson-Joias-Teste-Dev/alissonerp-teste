import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";

const ONCA_TROY_GRAMAS = 31.1034768;

// ─── GET /api/configuracoes/cotacoes ──────────────────────────────────────────
// Retorna cotações atuais + config de automação
export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [params] = await sql`SELECT ouro, dollar, euro, prata FROM public.parametros LIMIT 1`;

  let config = { auto_ativo: false, provedor: "openexchangerates", ultimo_update: null as string | null, api_key_configured: false };
  try {
    const rows = await sql`
      SELECT chave, valor FROM alissonerp.configuracoes_sistema
      WHERE chave IN ('cotacao_auto_ativo', 'cotacao_provedor', 'cotacao_ultimo_update')
    `;
    for (const r of rows) {
      if (r.chave === "cotacao_auto_ativo") config.auto_ativo = r.valor === "true" || r.valor === true;
      if (r.chave === "cotacao_provedor") config.provedor = String(r.valor).replace(/"/g, "");
      if (r.chave === "cotacao_ultimo_update") config.ultimo_update = String(r.valor).replace(/"/g, "");
    }
  } catch { /* tabela pode não ter as chaves ainda */ }

  // Verificar se API key está configurada (sem expor o valor)
  try {
    const [keyRow] = await sql`
      SELECT 1 FROM alissonerp.configuracoes_secrets WHERE chave = 'cotacao_api_key'
    `;
    config.api_key_configured = !!keyRow;
  } catch { /* sem secrets */ }

  return NextResponse.json({
    cotacoes: {
      ouro: Number(params.ouro),
      dollar: Number(params.dollar),
      euro: Number(params.euro),
      prata: Number(params.prata),
    },
    config,
  });
}

// ─── POST /api/configuracoes/cotacoes ─────────────────────────────────────────
// Busca cotações de API externa e atualiza parametros
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  if (!usuario || !isFullAccess(usuario.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  // Buscar API key do configuracoes_secrets
  let apiKey = "";
  try {
    const [row] = await sql`
      SELECT valor FROM alissonerp.configuracoes_secrets WHERE chave = 'cotacao_api_key'
    `;
    if (row) apiKey = String(row.valor).replace(/"/g, "");
  } catch { /* sem key configurada */ }

  if (!apiKey) {
    return NextResponse.json(
      { error: "API key de cotações não configurada. Vá em Configurações > Cotações." },
      { status: 400 }
    );
  }

  try {
    // Open Exchange Rates (gratuito, base USD)
    const res = await fetch(
      `https://openexchangerates.org/api/latest.json?app_id=${apiKey}&symbols=BRL,XAU,XAG,EUR`
    );
    if (!res.ok) {
      const txt = await res.text();
      return NextResponse.json({ error: `Erro API cotações: ${res.status} — ${txt}` }, { status: 502 });
    }

    const data = await res.json() as {
      rates: { BRL: number; XAU: number; XAG: number; EUR: number };
    };

    const { BRL, XAU, XAG, EUR } = data.rates;

    // Fórmulas do n8n (replicadas fielmente)
    // Open Exchange Rates: XAU = troy ounces per 1 USD (inverse of price). 1/XAU = USD per troy ounce.
    // XAG segue a mesma lógica (troy ounces per 1 USD)
    const ouro_brl_grama = (1 / XAU) * BRL / ONCA_TROY_GRAMAS;  // BRL por grama de ouro 24k
    const prata_brl_grama = (1 / XAG) * BRL / ONCA_TROY_GRAMAS; // BRL por grama de prata
    const dolar_brl = BRL;                                        // USD → BRL
    const euro_brl = BRL / EUR;                                   // EUR → BRL

    // Atualizar parametros
    await sql`
      UPDATE public.parametros SET
        ouro   = ${Number(ouro_brl_grama.toFixed(2))},
        dollar = ${Number(dolar_brl.toFixed(4))},
        euro   = ${Number(euro_brl.toFixed(4))},
        prata  = ${Number(prata_brl_grama.toFixed(2))}
    `;

    // Registrar timestamp
    const agora = new Date().toISOString();
    await sql`
      INSERT INTO alissonerp.configuracoes_sistema (chave, valor, descricao, updated_at, updated_by)
      VALUES ('cotacao_ultimo_update', ${JSON.stringify(agora)}, 'Última atualização automática de cotações', now(), ${user.id}::uuid)
      ON CONFLICT (chave) DO UPDATE SET valor = ${JSON.stringify(agora)}, updated_at = now(), updated_by = ${user.id}::uuid
    `;

    return NextResponse.json({
      ok: true,
      cotacoes: {
        ouro: Number(ouro_brl_grama.toFixed(2)),
        dollar: Number(dolar_brl.toFixed(4)),
        euro: Number(euro_brl.toFixed(4)),
        prata: Number(prata_brl_grama.toFixed(2)),
      },
      fonte: "openexchangerates.org",
      atualizado_em: agora,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Falha ao buscar cotações: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}

// ─── PATCH /api/configuracoes/cotacoes ────────────────────────────────────────
// Salva configuração de automação (api_key, auto_ativo, provedor)
export async function PATCH(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  if (!usuario || !isFullAccess(usuario.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const body = await req.json() as {
    api_key?: string;
    auto_ativo?: boolean;
    provedor?: string;
  };

  if (body.api_key !== undefined) {
    await sql`
      INSERT INTO alissonerp.configuracoes_secrets (chave, valor)
      VALUES ('cotacao_api_key', ${JSON.stringify(body.api_key)})
      ON CONFLICT (chave) DO UPDATE SET valor = ${JSON.stringify(body.api_key)}
    `;
  }

  if (body.auto_ativo !== undefined) {
    await sql`
      INSERT INTO alissonerp.configuracoes_sistema (chave, valor, descricao, updated_at, updated_by)
      VALUES ('cotacao_auto_ativo', ${JSON.stringify(body.auto_ativo)}, 'Atualização automática de cotações', now(), ${user.id}::uuid)
      ON CONFLICT (chave) DO UPDATE SET valor = ${JSON.stringify(body.auto_ativo)}, updated_at = now(), updated_by = ${user.id}::uuid
    `;
  }

  if (body.provedor !== undefined) {
    await sql`
      INSERT INTO alissonerp.configuracoes_sistema (chave, valor, descricao, updated_at, updated_by)
      VALUES ('cotacao_provedor', ${JSON.stringify(body.provedor)}, 'Provedor de cotações', now(), ${user.id}::uuid)
      ON CONFLICT (chave) DO UPDATE SET valor = ${JSON.stringify(body.provedor)}, updated_at = now(), updated_by = ${user.id}::uuid
    `;
  }

  return NextResponse.json({ ok: true });
}
