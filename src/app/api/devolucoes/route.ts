import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { hasRole, ROLES_DEVOLUCAO_ABRIR } from "@/lib/roles";
import {
  criarDevolucao,
  type CriarDevolucaoOpts,
  type ItemDevolucaoInput,
  type TipoCompensacao,
} from "@/lib/devolucoes";
// Ownership (escopo "só as vendas dela"): consultora só lista/cria devolução das
// próprias vendas. Reusa os helpers já usados no módulo de vendas (auth-vendas).
import { getUserVendedorId, isVendasFullAccess, requireVendaOwnership } from "@/lib/auth-vendas";
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
  if (!hasRole(role, ROLES_DEVOLUCAO_ABRIR)) {
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
  // B1 (bug da busca): a pesquisa por nome era feita SO no front, sobre a pagina
  // ja carregada — quem estava em outra pagina "sumia". Agora filtra no servidor
  // por nome do cliente, numero da devolucao e numero da venda.
  const busca = (searchParams.get("busca") ?? "").trim() || null;

  // ESCOPO (só as vendas dela): consultora vê só as devoluções das próprias vendas;
  // roles full (admin/dev/diretor/gerente_loja) veem todas (meuVendedorId = null).
  // INLINE de propósito (NÃO usar ownershipWhereVendas): postgres@3 perde a inferência
  // de fragmento quando o `sql` vem de outro módulo async — dava "syntax error at or
  // near AND" e quebrava a listagem. Usamos o mesmo padrão parametrizado das outras
  // condições do WHERE. Falha clara (401/403) se a consultora não tiver vendedor vinculado.
  let meuVendedorId: number | null = null;
  if (!isVendasFullAccess(role)) {
    try {
      meuVendedorId = await getUserVendedorId(user.id);
    } catch (e) {
      const st = (e as { status?: number }).status ?? 403;
      return NextResponse.json({ error: (e as Error).message }, { status: st });
    }
  }

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
      AND (${busca}::text IS NULL
           OR d.numero ILIKE '%' || ${busca} || '%'
           OR v.numero_venda ILIKE '%' || ${busca} || '%'
           OR c.nome ILIKE '%' || ${busca} || '%')
      AND (${meuVendedorId}::int IS NULL OR v.vendedor_id = ${meuVendedorId})
    ORDER BY d.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const [{ total }] = await sql`
    SELECT COUNT(*)::int AS total
    FROM alissonerp.devolucoes_venda d
    JOIN alissonerp.vendas_erp v ON v.id = d.venda_id
    LEFT JOIN public.contatos c  ON c.id_contato = v.cliente_id
    WHERE (${status}::text IS NULL OR d.status = ${status})
      AND (${vendaId}::int IS NULL OR d.venda_id = ${vendaId})
      AND (${clienteId}::int IS NULL OR v.cliente_id = ${clienteId})
      AND (${busca}::text IS NULL
           OR d.numero ILIKE '%' || ${busca} || '%'
           OR v.numero_venda ILIKE '%' || ${busca} || '%'
           OR c.nome ILIKE '%' || ${busca} || '%')
      AND (${meuVendedorId}::int IS NULL OR v.vendedor_id = ${meuVendedorId})
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
  if (!hasRole(role, ROLES_DEVOLUCAO_ABRIR)) {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = DevolucaoPostSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;

  // ESCOPO (só as vendas dela): consultora só cria devolução da PRÓPRIA venda.
  // Roles full (admin/dev/diretor/gerentes) passam direto. Lança 403 se não for
  // dona, 404 se a venda não existir. Reusa a mesma trava do módulo de vendas.
  try {
    await requireVendaOwnership({ id: user.id, role: role ?? "", email: "" }, body.venda_id);
  } catch (e) {
    const st = (e as { status?: number }).status ?? 403;
    return NextResponse.json({ error: (e as Error).message }, { status: st });
  }

  // REGRA DE NEGÓCIO: devolução só pode ser criada para vendas entregues
  // Validação server-side para evitar bypass via API direta
  // IMPACTO SE REMOVIDO: permitiria devolver vendas que ainda não foram entregues ao cliente
  const [venda] = await sql`
    SELECT status AS situacao FROM alissonerp.vendas_erp WHERE id = ${body.venda_id}
  `;
  if (!venda) {
    return NextResponse.json({ error: "Venda não encontrada" }, { status: 404 });
  }
  if (venda.situacao !== "entregue") {
    return NextResponse.json(
      { error: `Venda está em situação '${venda.situacao}' — só é possível devolver vendas entregues` },
      { status: 409 }
    );
  }

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
