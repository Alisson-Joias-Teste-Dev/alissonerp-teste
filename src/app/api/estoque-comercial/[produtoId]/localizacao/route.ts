import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";

interface Params { params: Promise<{ produtoId: string }> }

// ─── PATCH /api/estoque-comercial/[produtoId]/localizacao ─────────────────────
// Edicao MANUAL da localizacao da peca (o ERP e o dono do dado depois da carga inicial).
// Body: { localizacao }. String vazia limpa o campo. So admin/dev.
// REGRA: grava apenas o texto da localizacao em erp_produtos; nao toca em estoque.
export async function PATCH(req: NextRequest, { params }: Params) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  if (!usuario || !isFullAccess(usuario.role)) {
    return NextResponse.json({ error: "Sem permissão — apenas admin/dev" }, { status: 403 });
  }

  const { produtoId } = await params;
  const id = Number(produtoId);
  if (!id) return NextResponse.json({ error: "Produto inválido" }, { status: 400 });

  let body: { localizacao?: string } = {};
  try { body = await req.json(); } catch { body = {}; }
  const bruta = (body.localizacao ?? "").trim();
  const loc = bruta.length > 0 ? bruta : null; // vazio => limpa

  const r = await sql`
    UPDATE alissonerp.erp_produtos
    SET localizacao = ${loc}, date_updated = now()
    WHERE produto_id = ${id}::bigint
  `;

  // 0 linhas = peca sem cadastro estendido no ERP (nao da pra gravar aqui). Aviso claro.
  if (r.count === 0) {
    return NextResponse.json(
      { error: "Esta peça não tem cadastro no ERP de produtos — não é possível gravar a localização." },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true, localizacao: loc });
}
