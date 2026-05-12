import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isProdutosAccess, isFullAccess } from "@/lib/roles";

/**
 * Configuração de produção (reposição automática + tempo de fabricação) por produto.
 *
 *   GET /api/produtos/[id]/reposicao — lê { estoque_minimo, ativo, tempo_fabricacao_dias }
 *   PUT /api/produtos/[id]/reposicao — upsert { estoque_minimo, ativo, tempo_fabricacao_dias }
 */

function parseProdutoId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ─── GET ─────────────────────────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const produtoId = parseProdutoId(id);
  if (!produtoId) return NextResponse.json({ error: "id inválido" }, { status: 400 });

  try {
    const [row] = await sql`
      SELECT estoque_minimo, ativo, tempo_fabricacao_dias
      FROM alissonerp.produto_reposicao_config
      WHERE produto_id = ${produtoId}
    `;
    if (!row) return NextResponse.json({ config: null });
    return NextResponse.json({
      config: {
        estoque_minimo: Number(row.estoque_minimo),
        ativo: Boolean(row.ativo),
        tempo_fabricacao_dias: row.tempo_fabricacao_dias != null ? Number(row.tempo_fabricacao_dias) : null,
      },
    });
  } catch (err) {
    console.error("[GET /api/produtos/[id]/reposicao]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

// ─── PUT (upsert) ────────────────────────────────────────────────────────────
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [u] = await sql`SELECT role::text AS role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid`;
  const role = u?.role ?? null;
  if (!role || (!isFullAccess(role) && !isProdutosAccess(role))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const produtoId = parseProdutoId(id);
  if (!produtoId) return NextResponse.json({ error: "id inválido" }, { status: 400 });

  let body: { estoque_minimo?: unknown; ativo?: unknown; tempo_fabricacao_dias?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  const minimo = Number(body.estoque_minimo);
  if (!Number.isInteger(minimo) || minimo < 0) {
    return NextResponse.json({ error: "estoque_minimo inválido (inteiro >= 0)" }, { status: 400 });
  }
  const ativo = typeof body.ativo === "boolean" ? body.ativo : true;

  // tempo_fabricacao_dias: integer >= 0 ou null (null = sem prazo definido)
  let tempoFab: number | null = null;
  if (body.tempo_fabricacao_dias != null && body.tempo_fabricacao_dias !== "") {
    const n = Number(body.tempo_fabricacao_dias);
    if (!Number.isInteger(n) || n < 0) {
      return NextResponse.json({ error: "tempo_fabricacao_dias inválido (inteiro >= 0 ou null)" }, { status: 400 });
    }
    tempoFab = n;
  }

  try {
    const [prod] = await sql`SELECT id_produto FROM public.produtos WHERE id_produto = ${produtoId}`;
    if (!prod) return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 });

    await sql`
      INSERT INTO alissonerp.produto_reposicao_config (produto_id, estoque_minimo, ativo, tempo_fabricacao_dias)
      VALUES (${produtoId}, ${minimo}, ${ativo}, ${tempoFab})
      ON CONFLICT (produto_id) DO UPDATE SET
        estoque_minimo        = EXCLUDED.estoque_minimo,
        ativo                 = EXCLUDED.ativo,
        tempo_fabricacao_dias = EXCLUDED.tempo_fabricacao_dias,
        updated_at            = NOW()
    `;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[PUT /api/produtos/[id]/reposicao]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
