import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import sql from "@/lib/db";

interface Params { params: Promise<{ produtoId: string }> }

// GET /api/estoque-comercial/config/[produtoId]
export async function GET(
  _req: NextRequest,
  { params }: Params
) {
  const { produtoId } = await params;
  const id = Number(produtoId);

  const [cfg] = await sql`
    SELECT
      cfg.id,
      cfg.produto_id,
      p.nome   AS nome_produto,
      p.sku,
      cfg.estoque_minimo,
      cfg.ativo,
      cfg.created_at,
      cfg.updated_at
    FROM alissonerp.estoque_comercial_config cfg
    JOIN public.produtos p ON p.id_produto = cfg.produto_id
    WHERE cfg.produto_id = ${id}
  `;

  if (!cfg) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  return NextResponse.json(cfg);
}

// PATCH /api/estoque-comercial/config/[produtoId]
// Cria ou atualiza a config de um produto (upsert)
export async function PATCH(
  req: NextRequest,
  { params }: Params
) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { produtoId } = await params;
  const id = Number(produtoId);
  const body = await req.json() as { estoque_minimo?: number; ativo?: boolean };

  const [cfg] = await sql`
    INSERT INTO alissonerp.estoque_comercial_config (produto_id, estoque_minimo, ativo, created_by)
    VALUES (
      ${id},
      ${body.estoque_minimo ?? 0},
      ${body.ativo ?? true},
      ${user.id}
    )
    ON CONFLICT (produto_id) DO UPDATE SET
      estoque_minimo = EXCLUDED.estoque_minimo,
      ativo          = EXCLUDED.ativo,
      updated_at     = now()
    RETURNING id, produto_id, estoque_minimo, ativo, updated_at
  `;

  return NextResponse.json(cfg);
}
