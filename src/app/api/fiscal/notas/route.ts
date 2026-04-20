import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { hasRole, ROLES_FISCAL } from "@/lib/roles";

async function getUserRole(userId: string): Promise<string | null> {
  const [row] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${userId}::uuid
  `;
  return row?.role ?? null;
}

// ─── GET /api/fiscal/notas ────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });

  const role = await getUserRole(user.id);
  if (!hasRole(role, ROLES_FISCAL))
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const empresaId = sp.get("empresa_emitente_id");
  const modelo = sp.get("modelo");
  const status = sp.get("status");
  const origemTabela = sp.get("origem_tabela");
  const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10));
  const perPage = Math.min(100, Math.max(1, parseInt(sp.get("per_page") ?? "20", 10)));
  const offset = (page - 1) * perPage;

  try {
    // Contar total
    interface CountRow { total: string }
    const [countRow] = await sql<CountRow[]>`
      SELECT COUNT(*)::text AS total
      FROM alissonerp.notas_fiscais nf
      WHERE 1=1
        AND (${empresaId}::int IS NULL OR nf.empresa_emitente_id = ${empresaId}::int)
        AND (${modelo}::int IS NULL OR nf.modelo = ${modelo}::int)
        AND (${status} IS NULL OR nf.status = ${status})
        AND (${origemTabela} IS NULL OR nf.origem_tabela = ${origemTabela})
    `;

    const totalCount = parseInt(countRow?.total ?? "0", 10);

    // Buscar notas
    const rows = await sql`
      SELECT
        nf.id,
        nf.modelo,
        nf.serie,
        nf.numero,
        nf.chave_44,
        nf.empresa_emitente_id,
        e.razao_social AS emitente_nome,
        nf.tipo_operacao,
        nf.origem_tabela,
        nf.origem_id,
        nf.cliente_contato_id,
        nf.natureza_operacao,
        nf.valor_produtos,
        nf.valor_desconto,
        nf.valor_frete,
        nf.valor_total,
        nf.status,
        nf.focus_ref,
        nf.pdf_danfe_url,
        nf.codigo_sefaz,
        nf.mensagem_sefaz,
        nf.ambiente,
        nf.created_at,
        nf.updated_at
      FROM alissonerp.notas_fiscais nf
      LEFT JOIN alissonerp.empresas_emitentes e ON e.id = nf.empresa_emitente_id
      WHERE 1=1
        AND (${empresaId}::int IS NULL OR nf.empresa_emitente_id = ${empresaId}::int)
        AND (${modelo}::int IS NULL OR nf.modelo = ${modelo}::int)
        AND (${status} IS NULL OR nf.status = ${status})
        AND (${origemTabela} IS NULL OR nf.origem_tabela = ${origemTabela})
      ORDER BY nf.created_at DESC
      LIMIT ${perPage} OFFSET ${offset}
    `;

    return NextResponse.json({
      data: rows,
      pagination: {
        page,
        per_page: perPage,
        total_count: totalCount,
        total_pages: Math.ceil(totalCount / perPage),
      },
    });
  } catch (err) {
    console.error("[GET /api/fiscal/notas]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
