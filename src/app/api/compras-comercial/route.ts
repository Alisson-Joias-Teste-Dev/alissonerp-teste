import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { normalizeRow } from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";
import { zodError } from "@/lib/schemas/common";

const CompraComercialPostSchema = z.object({
  fornecedor_id: z.coerce.number().int().nullable().optional(),
  obs: z.string().nullable().optional(),
  local_estoque_id: z.coerce.number().int().positive(),
  numero_nf: z.string().nullable().optional(),
  data_compra: z.string().nullable().optional(),
  qtd_parcelas: z.coerce.number().int().min(1),
  primeiro_vencimento: z.string(),
}).passthrough();

// REGRA DE NEGOCIO:
// - O que faz: lista compras comerciais com fornecedor/local e total de itens.
// - Por que: a operacao precisa acompanhar status e totais sem consultar varias telas.
// - Impacto se alterado/removido: dashboard de compras comerciais perde rastreabilidade.
export async function GET(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  void user;

  const situacaoFilter = req.nextUrl.searchParams.get("situacao");
  const localIdFilter = req.nextUrl.searchParams.get("local_id");

  const rows = await sql`
    SELECT c.*,
      ct.nome AS fornecedor_nome,
      le.nome AS local_nome,
      COUNT(ic.id)::int AS total_itens,
      u.nome AS recebido_por_nome
    FROM alissonerp.compras_comercial c
    LEFT JOIN public.contatos ct ON ct.id_contato = c.fornecedor_id
    LEFT JOIN alissonerp.locais_estoque le ON le.id = c.local_estoque_id
    LEFT JOIN alissonerp.itens_compra_comercial ic ON ic.compra_comercial_id = c.id
    LEFT JOIN alissonerp.usuarios u ON u.id = c.recebido_por
    WHERE (${situacaoFilter}::text IS NULL OR c.situacao = ${situacaoFilter})
      AND (${localIdFilter}::int IS NULL OR c.local_estoque_id = ${localIdFilter ? parseInt(localIdFilter) : null})
    GROUP BY c.id, ct.nome, le.nome, u.nome
    ORDER BY c.id DESC
  `;

  const normalized = rows.map((r) =>
    normalizeRow(r as Record<string, unknown>, ["total", "total_itens"], [])
  );
  return NextResponse.json(normalized);
}

// REGRA DE NEGOCIO:
// - O que faz: cria compra comercial com local de estoque e plano financeiro obrigatorios.
// - Por que: local e parcelas definem entrada comercial e contas a pagar automaticas na conclusao.
// - Impacto se alterado/removido: conclusao pode gerar estoque/financeiro incorretos.
export async function POST(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;

  const raw = await req.json().catch(() => ({}));
  const parsed = CompraComercialPostSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);

  const {
    fornecedor_id,
    obs,
    local_estoque_id,
    numero_nf,
    data_compra,
    qtd_parcelas,
    primeiro_vencimento,
  } = parsed.data;

  const [row] = await sql`
    INSERT INTO alissonerp.compras_comercial
      (fornecedor_id, obs, situacao, local_estoque_id, numero_nf, data_compra, qtd_parcelas, primeiro_vencimento, created_by)
    VALUES (
      ${fornecedor_id ?? null},
      ${obs ?? null},
      'rascunho',
      ${local_estoque_id},
      ${numero_nf ?? null},
      ${data_compra ?? null},
      ${qtd_parcelas},
      ${primeiro_vencimento},
      ${user.id}::uuid
    )
    RETURNING *
  `;

  return NextResponse.json(normalizeRow(row as Record<string, unknown>, ["total"], []), { status: 201 });
}
