import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { hasRole, ROLES_DEVOLUCAO } from "@/lib/roles";
import {
  criarDevolucao,
  type CriarDevolucaoOpts,
  type ItemDevolucaoInput,
  type TipoCompensacao,
} from "@/lib/devolucoes";

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

  const body = await req.json() as {
    venda_id: number;
    tipo: "parcial" | "total";
    motivo?: string | null;
    tipo_compensacao: TipoCompensacao;
    foi_entregue?: boolean;
    percentual_retencao?: number;
    itens: ItemDevolucaoInput[];
  };

  if (!body.venda_id) return NextResponse.json({ error: "venda_id obrigatorio" }, { status: 400 });
  if (!body.tipo) return NextResponse.json({ error: "tipo obrigatorio" }, { status: 400 });
  if (!body.tipo_compensacao) return NextResponse.json({ error: "tipo_compensacao obrigatorio" }, { status: 400 });
  if (!Array.isArray(body.itens) || body.itens.length === 0) {
    return NextResponse.json({ error: "itens obrigatorio" }, { status: 400 });
  }

  try {
    const opts: CriarDevolucaoOpts = {
      tipo: body.tipo,
      tipoCompensacao: body.tipo_compensacao,
      motivo: body.motivo ?? null,
      foiEntregue: body.foi_entregue ?? false,
      percentualRetencao: body.percentual_retencao ?? (body.foi_entregue ? 0 : 70),
    };
    const dev = await criarDevolucao(body.venda_id, body.itens, opts, user.id);
    return NextResponse.json(dev, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
