import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";

const ROLES_FINANCEIRO = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja"];

// ─── GET /api/financeiro/contas-pagar ─────────────────────────────────────────
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  if (!usuario || (!ROLES_FINANCEIRO.includes(usuario.role) && !isFullAccess(usuario.role))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const url = new URL(req.url);
  const situacao = url.searchParams.get("situacao");

  const contas = await sql`
    SELECT cp.*,
      c.nome AS fornecedor_nome_ref
    FROM alissonerp.contas_pagar cp
    LEFT JOIN public.contatos c ON c.id_contato = cp.fornecedor_id
    WHERE 1=1
      ${situacao ? sql`AND cp.situacao = ${situacao}` : sql``}
    ORDER BY cp.data_vencimento ASC NULLS LAST, cp.created_at DESC
    LIMIT 200
  `;

  return NextResponse.json(contas.map((c) => ({
    ...c,
    valor: Number(c.valor),
    fornecedor_nome: c.fornecedor_nome || c.fornecedor_nome_ref,
  })));
}

// ─── POST /api/financeiro/contas-pagar ────────────────────────────────────────
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [uPost] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  if (!uPost || (!ROLES_FINANCEIRO.includes(uPost.role) && !isFullAccess(uPost.role))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const body = await req.json() as {
    descricao: string;
    fornecedor_id?: number;
    valor: number;
    data_vencimento?: string;
    categoria?: string;
    obs?: string;
    compra_id?: number;
  };

  if (!body.descricao?.trim() || !body.valor) {
    return NextResponse.json({ error: "descricao e valor obrigatórios" }, { status: 400 });
  }

  let fornecedor_nome: string | null = null;
  if (body.fornecedor_id) {
    const [f] = await sql`SELECT nome FROM public.contatos WHERE id_contato = ${body.fornecedor_id}`;
    fornecedor_nome = f?.nome ?? null;
  }

  const [conta] = await sql`
    INSERT INTO alissonerp.contas_pagar
      (descricao, fornecedor_id, fornecedor_nome, valor, data_vencimento, categoria, obs, compra_id, created_by)
    VALUES (
      ${body.descricao.trim()}, ${body.fornecedor_id ?? null}, ${fornecedor_nome},
      ${body.valor}, ${body.data_vencimento ?? null}, ${body.categoria ?? null},
      ${body.obs ?? null}, ${body.compra_id ?? null}, ${user.id}::uuid
    )
    RETURNING id, created_at
  `;

  return NextResponse.json(conta, { status: 201 });
}
