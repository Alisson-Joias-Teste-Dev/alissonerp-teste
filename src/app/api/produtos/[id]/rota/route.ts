import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isProdutosAccess, isFullAccess } from "@/lib/roles";

/**
 * Rota de fabricação por produto (sequência ordenada de setores).
 *
 *   GET /api/produtos/[id]/rota — lista etapas { ordem, setor_id, setor_nome }
 *   PUT /api/produtos/[id]/rota — sobrescreve a lista inteira
 *
 * Body PUT: { etapas: Array<{ setor_id: number }> }  // ordem = posição no array
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
    const rows = await sql`
      SELECT r.ordem, r.setor_id, s.nome AS setor_nome, s.deposito_id
      FROM alissonerp.produto_rota r
      JOIN alissonerp.setores s ON s.id = r.setor_id
      WHERE r.produto_id = ${produtoId}
      ORDER BY r.ordem ASC
    `;
    return NextResponse.json({
      etapas: rows.map((r) => ({
        ordem: Number(r.ordem),
        setor_id: Number(r.setor_id),
        setor_nome: String(r.setor_nome),
        deposito_id: r.deposito_id != null ? Number(r.deposito_id) : null,
      })),
    });
  } catch (err) {
    console.error("[GET /api/produtos/[id]/rota]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

// ─── PUT (sobrescreve a lista) ───────────────────────────────────────────────
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

  let body: { etapas?: Array<{ setor_id?: unknown }> };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  const etapasInput = Array.isArray(body.etapas) ? body.etapas : [];
  const setorIds: number[] = [];
  for (const e of etapasInput) {
    const sid = Number(e?.setor_id);
    if (!Number.isInteger(sid) || sid <= 0) {
      return NextResponse.json({ error: "Etapa com setor_id inválido" }, { status: 400 });
    }
    setorIds.push(sid);
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sql as any).begin(async (tx: typeof sql) => {
      // Confirma que produto existe
      const [prod] = await tx`SELECT id_produto FROM public.produtos WHERE id_produto = ${produtoId}`;
      if (!prod) throw new Error("PRODUTO_NAO_ENCONTRADO");

      // Confirma que todos os setores existem e estão ativos
      if (setorIds.length > 0) {
        const validos = await tx`
          SELECT id FROM alissonerp.setores
          WHERE id = ANY(${setorIds}::int[]) AND ativo = true
        `;
        if (validos.length !== new Set(setorIds).size) {
          throw new Error("SETOR_INVALIDO");
        }
      }

      // Sobrescreve: deleta tudo e re-insere com a ordem do array
      await tx`DELETE FROM alissonerp.produto_rota WHERE produto_id = ${produtoId}`;
      for (let i = 0; i < setorIds.length; i++) {
        await tx`
          INSERT INTO alissonerp.produto_rota (produto_id, ordem, setor_id)
          VALUES (${produtoId}, ${i + 1}, ${setorIds[i]})
        `;
      }
    });

    return NextResponse.json({ ok: true, total: setorIds.length });
  } catch (err) {
    if (err instanceof Error && err.message === "PRODUTO_NAO_ENCONTRADO") {
      return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 });
    }
    if (err instanceof Error && err.message === "SETOR_INVALIDO") {
      return NextResponse.json({ error: "Algum setor enviado não existe ou está inativo" }, { status: 422 });
    }
    console.error("[PUT /api/produtos/[id]/rota]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
