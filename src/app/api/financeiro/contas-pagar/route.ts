import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";
import { LIMITS, checkStringLength, payloadTooLargeResponse } from "@/lib/payload-limits";
import { zodError, IdSchema, MoneySchema, DateSchema } from "@/lib/schemas/common";

const ROLES_FINANCEIRO = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja"];

const ContasPagarSchema = z.object({
  descricao: z.string().min(1, "descricao obrigatoria").max(LIMITS.TITULO_MAX),
  fornecedor_id: IdSchema.optional(),
  valor: MoneySchema.refine((v) => v > 0, { message: "Valor deve ser maior que zero" }),
  data_vencimento: DateSchema.optional(),
  categoria: z.string().max(LIMITS.NOME_MAX).optional(),
  obs: z.string().max(LIMITS.OBSERVACOES_MAX).optional(),
  compra_id: IdSchema.optional(),
});

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

  const raw = await req.json().catch(() => ({}));
  const parsed = ContasPagarSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;

  // Defesa em profundidade — zod ja limita, helper retorna 413 explicito.
  try {
    checkStringLength("descricao", body.descricao, LIMITS.TITULO_MAX);
    checkStringLength("obs", body.obs, LIMITS.OBSERVACOES_MAX);
    checkStringLength("categoria", body.categoria, LIMITS.NOME_MAX);
  } catch (e) {
    const r = payloadTooLargeResponse(e);
    if (r) return r;
    throw e;
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
