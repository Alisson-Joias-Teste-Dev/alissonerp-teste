import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { hasRole, ROLES_DEVOLUCAO } from "@/lib/roles";
import {
  criarDevolucao,
  type CriarDevolucaoOpts,
  type ItemDevolucaoInput,
  type TipoCompensacao,
} from "@/lib/devolucoes";
import { internalError } from "@/lib/api-error";
import { zodError, IdSchema, PercentSchema } from "@/lib/schemas/common";

const ItemDevolucaoSchema = z.object({
  item_venda_id: IdSchema,
  quantidade: z.number().positive(),
});

const DevolucaoPostSchema = z.object({
  venda_id: IdSchema,
  tipo: z.enum(["parcial", "total"]),
  motivo: z.string().max(5000).nullable().optional(),
  tipo_compensacao: z.string().min(1, "tipo_compensacao obrigatorio").max(50),
  foi_entregue: z.boolean().optional(),
  percentual_retencao: PercentSchema.optional(),
  itens: z.array(ItemDevolucaoSchema).min(1, "itens obrigatorio").max(100),
});

async function getUserRole(userId: string): Promise<string | null> {
  const [row] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${userId}::uuid
  `;
  return row?.role ?? null;
}

// ─── GET /api/devolucoes ─────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });

  const role = await getUserRole(user.id);
  if (!hasRole(role, ROLES_DEVOLUCAO)) {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const vendaIdParam = searchParams.get("venda_id");
  const clienteIdParam = searchParams.get("cliente_id");
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? "20")));
  const offset = (page - 1) * limit;

  const vendaId = vendaIdParam ? Number(vendaIdParam) : null;
  const clienteId = clienteIdParam ? Number(clienteIdParam) : null;

  const rows = await sql`
    SELECT d.id, d.numero, d.venda_id, d.tipo, d.motivo, d.status, d.tipo_compensacao,
           d.valor_total_devolvido, d.valor_retido, d.valor_compensacao,
           d.percentual_retencao, d.foi_entregue, d.tarefa_id,
           d.criado_por, d.aprovador_id, d.created_at, d.updated_at, d.aprovado_em,
           v.numero_venda, v.cliente_id,
           c.nome AS cliente_nome
    FROM alissonerp.devolucoes_venda d
    JOIN alissonerp.vendas_erp v ON v.id = d.venda_id
    LEFT JOIN public.contatos c  ON c.id_contato = v.cliente_id
    WHERE (${status}::text IS NULL OR d.status = ${status})
      AND (${vendaId}::int IS NULL OR d.venda_id = ${vendaId})
      AND (${clienteId}::int IS NULL OR v.cliente_id = ${clienteId})
    ORDER BY d.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const [{ total }] = await sql`
    SELECT COUNT(*)::int AS total
    FROM alissonerp.devolucoes_venda d
    JOIN alissonerp.vendas_erp v ON v.id = d.venda_id
    WHERE (${status}::text IS NULL OR d.status = ${status})
      AND (${vendaId}::int IS NULL OR d.venda_id = ${vendaId})
      AND (${clienteId}::int IS NULL OR v.cliente_id = ${clienteId})
  `;

  return NextResponse.json({
    data: rows.map((r) => ({
      ...r,
      valor_total_devolvido: Number(r.valor_total_devolvido),
      valor_retido: Number(r.valor_retido),
      valor_compensacao: Number(r.valor_compensacao),
      percentual_retencao: Number(r.percentual_retencao),
    })),
    page, limit, total,
  });
}

// ─── POST /api/devolucoes ────────────────────────────────────────────────────
// Body: {
//   venda_id, tipo ('parcial'|'total'), motivo?, tipo_compensacao,
//   foi_entregue, percentual_retencao,
//   itens: [{ item_venda_id, quantidade }]
// }
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });

  const role = await getUserRole(user.id);
  if (!hasRole(role, ROLES_DEVOLUCAO)) {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = DevolucaoPostSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;

  try {
    const opts: CriarDevolucaoOpts = {
      tipo: body.tipo,
      tipoCompensacao: body.tipo_compensacao as TipoCompensacao,
      motivo: body.motivo ?? null,
      foiEntregue: body.foi_entregue ?? false,
      percentualRetencao: body.percentual_retencao ?? (body.foi_entregue ? 0 : 70),
    };
    const dev = await criarDevolucao(body.venda_id, body.itens as ItemDevolucaoInput[], opts, user.id);
    return NextResponse.json(dev, { status: 201 });
  } catch (err) {
    return internalError("[POST /api/devolucoes]", err, "Erro ao criar devolucao", 400);
  }
}
