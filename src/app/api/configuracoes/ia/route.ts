import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

// GET /api/configuracoes/ia
// Retorna configurações de IA + status de quais providers têm key configurada
export async function GET() {
  // Nunca cachear — a config muda quando o usuário salva
  const headers = { "Cache-Control": "no-store" };

  try {
    const configs = await sql<{ chave: string; valor: string }[]>`
      SELECT chave, valor FROM alissonerp.configuracoes_sistema
      WHERE chave LIKE 'ia_%'
      ORDER BY chave
    `;

    const config: Record<string, string> = {};
    for (const r of configs) config[r.chave] = r.valor;

    // Verificar quais providers têm key (sem expor o valor)
    const secrets = await sql<{ chave: string }[]>`
      SELECT chave FROM alissonerp.configuracoes_secrets
      WHERE chave IN ('ia_key_claude', 'ia_key_openai', 'ia_key_gemini')
        AND valor_encrypted IS NOT NULL
        AND valor_encrypted != ''
    `;

    const keysConfiguradas = new Set(secrets.map((s) => s.chave));

    return NextResponse.json(
      {
        config,
        keys_status: {
          claude: keysConfiguradas.has("ia_key_claude"),
          openai: keysConfiguradas.has("ia_key_openai"),
          gemini: keysConfiguradas.has("ia_key_gemini"),
        },
      },
      { headers }
    );
  } catch (err) {
    console.error("[GET /api/configuracoes/ia] erro:", err);
    // Tabela ainda não existe — retorna defaults sem cache
    return NextResponse.json(
      {
        config: {
          ia_ativa: "true",
          ia_provedor: "claude",
          ia_modelo_claude: "claude-sonnet-4-20250514",
          ia_modelo_openai: "gpt-4o",
          ia_modelo_gemini: "gemini-2.0-flash",
        },
        keys_status: { claude: false, openai: false, gemini: false },
      },
      { headers }
    );
  }
}

// PATCH /api/configuracoes/ia
// Body: { provedor?: string, ativa?: boolean, margem_pedra_pct?: number }
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json() as { provedor?: string; ativa?: boolean; margem_pedra_pct?: number };

    const PROVEDORES_VALIDOS = ["claude", "openai", "gemini"];

    if (body.provedor !== undefined) {
      if (!PROVEDORES_VALIDOS.includes(body.provedor)) {
        return NextResponse.json({ error: "Provedor inválido" }, { status: 400 });
      }
      await sql`
        UPDATE alissonerp.configuracoes_sistema
        SET valor = ${body.provedor}, updated_at = NOW()
        WHERE chave = 'ia_provedor'
      `;
    }

    if (body.ativa !== undefined) {
      await sql`
        UPDATE alissonerp.configuracoes_sistema
        SET valor = ${body.ativa ? "true" : "false"}, updated_at = NOW()
        WHERE chave = 'ia_ativa'
      `;
    }

    if (body.margem_pedra_pct !== undefined) {
      const val = Math.max(0, Math.min(50, Number(body.margem_pedra_pct)));
      await sql`
        INSERT INTO alissonerp.configuracoes_sistema (chave, valor, descricao)
        VALUES ('ia_margem_pedra_pct', ${String(val)}, 'Margem de erro (%) da balança para pedras')
        ON CONFLICT (chave) DO UPDATE SET valor = ${String(val)}, updated_at = NOW()
      `;
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[PATCH /api/configuracoes/ia] erro:", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "Erro ao salvar configuração" },
      { status: 500 }
    );
  }
}
