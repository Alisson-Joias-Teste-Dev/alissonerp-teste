import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";

const ROLES_FINANCEIRO = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja"];

// ─── GET /api/financeiro/contas-receber ───────────────────────────────────────
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
    SELECT cr.*,
      c.nome AS cliente_nome_ref
    FROM alissonerp.contas_receber cr
    LEFT JOIN public.contatos c ON c.id_contato = cr.cliente_id
    WHERE 1=1
      ${situacao ? sql`AND cr.situacao = ${situacao}` : sql``}
    ORDER BY cr.data_vencimento ASC NULLS LAST, cr.created_at DESC
    LIMIT 200
  `;

  return NextResponse.json(contas.map((c) => ({
    ...c,
    valor: Number(c.valor),
    cliente_nome: c.cliente_nome || c.cliente_nome_ref,
  })));
}

// ─── POST /api/financeiro/contas-receber ──────────────────────────────────────
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
    cliente_id?: number;
    valor: number;
    data_vencimento?: string;
    categoria?: string;
    obs?: string;
    venda_erp_id?: number;
  };

  if (!body.descricao?.trim() || !body.valor) {
    return NextResponse.json({ error: "descricao e valor obrigatórios" }, { status: 400 });
  }
  if (body.valor <= 0) {
    return NextResponse.json({ error: "Valor deve ser maior que zero" }, { status: 400 });
  }

  let cliente_nome: string | null = null;
  if (body.cliente_id) {
    const [c] = await sql`SELECT nome FROM public.contatos WHERE id_contato = ${body.cliente_id}`;
    cliente_nome = c?.nome ?? null;
  }

  const [conta] = await sql`
    INSERT INTO alissonerp.contas_receber
      (descricao, cliente_id, cliente_nome, valor, data_vencimento, categoria, obs, venda_erp_id, created_by)
    VALUES (
      ${body.descricao.trim()}, ${body.cliente_id ?? null}, ${cliente_nome},
      ${body.valor}, ${body.data_vencimento ?? null}, ${body.categoria ?? null},
      ${body.obs ?? null}, ${body.venda_erp_id ?? null}, ${user.id}::uuid
    )
    RETURNING id, created_at
  `;

  return NextResponse.json(conta, { status: 201 });
}
