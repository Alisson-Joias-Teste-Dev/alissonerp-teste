import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { normalizeRow } from "@/lib/db";
import { getParametroNumber, PARAM } from "@/lib/parametros";
import { authOr401 } from "@/lib/auth-server";
import { zodError } from "@/lib/schemas/common";

const CompraPostSchema = z.object({
  fornecedor_id: z.coerce.number().int().nullable().optional(),
  obs: z.string().nullable().optional(),
  local_destino_id: z.coerce.number().int().nullable().optional(),
  numero_nf: z.string().nullable().optional(),
  data_compra: z.string().nullable().optional(),
}).passthrough();

// GET /api/compras — lista todas as compras com JOIN locais_estoque + fornecedor
// Query params: ?situacao=rascunho&local_id=1
export async function GET(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  void user;

  const situacaoFilter = req.nextUrl.searchParams.get("situacao");
  const localIdFilter  = req.nextUrl.searchParams.get("local_id");

  let rows;
  if (situacaoFilter && localIdFilter) {
    rows = await sql`
      SELECT c.*,
        c.status AS situacao,
        c.observacao AS obs,
        ct.nome   AS fornecedor_nome,
        le.nome   AS local_nome,
        COUNT(ic.id)::int AS total_itens,
        u.nome    AS recebido_por_nome
      FROM alissonerp.compras c
      LEFT JOIN public.contatos ct ON ct.id_contato = c.fornecedor_id
      LEFT JOIN alissonerp.locais_estoque le ON le.id = c.local_destino_id
      LEFT JOIN alissonerp.itens_compra ic ON ic.compra_id = c.id
      LEFT JOIN alissonerp.usuarios u ON u.id = c.recebido_por
      WHERE c.status = ${situacaoFilter}
        AND c.local_destino_id = ${parseInt(localIdFilter)}
      GROUP BY c.id, ct.nome, le.nome, u.nome
      ORDER BY c.id DESC
    `;
  } else if (situacaoFilter) {
    rows = await sql`
      SELECT c.*,
        c.status AS situacao,
        c.observacao AS obs,
        ct.nome   AS fornecedor_nome,
        le.nome   AS local_nome,
        COUNT(ic.id)::int AS total_itens,
        u.nome    AS recebido_por_nome
      FROM alissonerp.compras c
      LEFT JOIN public.contatos ct ON ct.id_contato = c.fornecedor_id
      LEFT JOIN alissonerp.locais_estoque le ON le.id = c.local_destino_id
      LEFT JOIN alissonerp.itens_compra ic ON ic.compra_id = c.id
      LEFT JOIN alissonerp.usuarios u ON u.id = c.recebido_por
      WHERE c.status = ${situacaoFilter}
      GROUP BY c.id, ct.nome, le.nome, u.nome
      ORDER BY c.id DESC
    `;
  } else if (localIdFilter) {
    rows = await sql`
      SELECT c.*,
        c.status AS situacao,
        c.observacao AS obs,
        ct.nome   AS fornecedor_nome,
        le.nome   AS local_nome,
        COUNT(ic.id)::int AS total_itens,
        u.nome    AS recebido_por_nome
      FROM alissonerp.compras c
      LEFT JOIN public.contatos ct ON ct.id_contato = c.fornecedor_id
      LEFT JOIN alissonerp.locais_estoque le ON le.id = c.local_destino_id
      LEFT JOIN alissonerp.itens_compra ic ON ic.compra_id = c.id
      LEFT JOIN alissonerp.usuarios u ON u.id = c.recebido_por
      WHERE c.local_destino_id = ${parseInt(localIdFilter)}
      GROUP BY c.id, ct.nome, le.nome, u.nome
      ORDER BY c.id DESC
    `;
  } else {
    rows = await sql`
      SELECT c.*,
        c.status AS situacao,
        c.observacao AS obs,
        ct.nome   AS fornecedor_nome,
        le.nome   AS local_nome,
        COUNT(ic.id)::int AS total_itens,
        u.nome    AS recebido_por_nome
      FROM alissonerp.compras c
      LEFT JOIN public.contatos ct ON ct.id_contato = c.fornecedor_id
      LEFT JOIN alissonerp.locais_estoque le ON le.id = c.local_destino_id
      LEFT JOIN alissonerp.itens_compra ic ON ic.compra_id = c.id
      LEFT JOIN alissonerp.usuarios u ON u.id = c.recebido_por
      GROUP BY c.id, ct.nome, le.nome, u.nome
      ORDER BY c.id DESC
    `;
  }

  const normalized = rows.map((r) =>
    normalizeRow(r as Record<string, unknown>, ["total", "total_itens"], [])
  );
  return NextResponse.json(normalized);
}

// POST /api/compras — created_by vem da sessao (nunca do body).
// Body: { fornecedor_id?, obs?, local_destino_id?, numero_nf?, data_compra? }
export async function POST(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;

  const localEstoqueDefault = await getParametroNumber(PARAM.LOCAL_ESTOQUE_DEFAULT_ID);
  const raw = await req.json().catch(() => ({}));
  const parsed = CompraPostSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { fornecedor_id, obs, local_destino_id, numero_nf, data_compra } = parsed.data;

  const [row] = await sql`
    INSERT INTO alissonerp.compras
      (fornecedor_id, observacao, status, local_destino_id, numero_nf, data_compra, created_by)
    VALUES (
      ${fornecedor_id ?? null},
      ${obs ?? null},
      'rascunho',
      ${local_destino_id ?? localEstoqueDefault},
      ${numero_nf ?? null},
      ${data_compra ?? null},
      ${user.id}::uuid
    )
    RETURNING *
  `;

  return NextResponse.json(normalizeRow(row as Record<string, unknown>, ["total"], []), { status: 201 });
}
