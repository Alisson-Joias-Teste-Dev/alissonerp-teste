import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { zodError } from "@/lib/schemas/common";

const FULL_ROLES = ["desenvolvedor", "admin"];

const SolicitacaoDescontoPatchSchema = z.object({
  status: z.enum(["aprovado", "rejeitado"]),
  observacao: z.string().optional(),
}).passthrough();

// GET — qualquer usuário autenticado pode checar o status (para polling)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const [row] = await sql`
    SELECT id, status, pct_desconto_solicitado, preco_solicitado, autorizado_por_nome
    FROM alissonerp.solicitacoes_desconto
    WHERE id = ${Number(id)}
  `;
  if (!row) return NextResponse.json({ error: "Não encontrada" }, { status: 404 });

  return NextResponse.json(row);
}

// PATCH — somente direção (admin/desenvolvedor) pode aprovar ou rejeitar
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [u] = await sql`SELECT nome, role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  if (!u || !FULL_ROLES.includes(u.role as string)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const raw = await req.json().catch(() => ({}));
  const parsed = SolicitacaoDescontoPatchSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;

  const [solicitacao] = await sql`
    SELECT id, item_id, venda_id, pct_desconto_solicitado, preco_solicitado,
           preco_lista, status AS current_status
    FROM alissonerp.solicitacoes_desconto
    WHERE id = ${Number(id)}
  `;
  if (!solicitacao) return NextResponse.json({ error: "Não encontrada" }, { status: 404 });
  if (solicitacao.current_status !== "pendente") {
    return NextResponse.json({ error: "Solicitação já processada" }, { status: 409 });
  }

  const nomeAuth = (u.nome as string) || user.email || "";

  await sql`
    UPDATE alissonerp.solicitacoes_desconto
    SET status             = ${body.status},
        autorizado_por_id  = ${user.id}::uuid,
        autorizado_por_nome = ${nomeAuth},
        observacao         = COALESCE(${body.observacao ?? null}, observacao),
        updated_at         = now()
    WHERE id = ${Number(id)}
  `;

  // Se aprovado e item já existe: aplicar desconto diretamente no item
  if (body.status === "aprovado" && solicitacao.item_id) {
    const pct        = Number(solicitacao.pct_desconto_solicitado);
    const precoLista = Number(solicitacao.preco_lista);
    const precoUnit  = precoLista * (1 - pct / 100);

    const [item] = await sql`
      SELECT quantidade FROM alissonerp.itens_venda_erp WHERE id = ${solicitacao.item_id}
    `;
    if (item) {
      const totalItem    = precoUnit * Number(item.quantidade);
      const pctComissao  = 0; // acima de 30% não gera comissão
      await sql`
        UPDATE alissonerp.itens_venda_erp
        SET pct_desconto          = ${pct},
            preco_unitario        = ${precoUnit},
            total_item            = ${totalItem},
            pct_comissao          = ${pctComissao},
            valor_comissao        = 0,
            desconto_autorizado_por = ${user.id}::uuid
        WHERE id = ${solicitacao.item_id}
      `;
    }
  }

  return NextResponse.json({ ok: true, status: body.status });
}
