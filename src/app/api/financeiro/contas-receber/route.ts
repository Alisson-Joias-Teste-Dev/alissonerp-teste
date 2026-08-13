import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";
import { LIMITS, checkStringLength, payloadTooLargeResponse } from "@/lib/payload-limits";
import { zodError, IdSchema, MoneySchema, DateSchema } from "@/lib/schemas/common";

const ROLES_FINANCEIRO = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja"];

const ContasReceberSchema = z.object({
  descricao: z.string().min(1, "descricao obrigatoria").max(LIMITS.TITULO_MAX),
  cliente_id: IdSchema.optional(),
  valor: MoneySchema.refine((v) => v > 0, { message: "Valor deve ser maior que zero" }),
  data_vencimento: DateSchema.optional(),
  categoria: z.string().max(LIMITS.NOME_MAX).optional(),
  obs: z.string().max(LIMITS.OBSERVACOES_MAX).optional(),
  venda_erp_id: IdSchema.optional(),
});

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
  const mode = url.searchParams.get("mode"); // 'summary' | 'detail' | null (=detail)

  // Cláusula WHERE base — usada por ambos os modos para garantir consistência
  // entre o card de totais (summary) e o drill-down (detail)
  if (mode === "summary") {
    const [resumo] = await sql`
      SELECT
        COUNT(*)::integer            AS total,
        COALESCE(SUM(cr.valor), 0)   AS valor_total,
        COALESCE(
          SUM(
            COALESCE(
              (SELECT SUM(pv.valor_liquido)
               FROM alissonerp.pagamentos_venda pv
               WHERE pv.venda_id = cr.venda_erp_id AND pv.status = 'confirmado'),
              cr.valor
            )
          ), 0
        ) AS valor_liquido_total
      FROM alissonerp.contas_receber cr
      WHERE 1=1
        ${situacao ? sql`AND cr.situacao = ${situacao}` : sql``}
    `;
    return NextResponse.json({
      total: resumo.total,
      valor_total: Number(resumo.valor_total),
      valor_liquido_total: Number(resumo.valor_liquido_total),
    });
  }

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

  const raw = await req.json().catch(() => ({}));
  const parsed = ContasReceberSchema.safeParse(raw);
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
