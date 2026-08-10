import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";
import { zodError } from "@/lib/schemas/common";

const ROLES_FINANCEIRO = ["desenvolvedor", "admin", "administrativo", "financeiro", "gerente_loja"];

const ContaReceberPatchSchema = z.object({
  situacao: z.string().optional(),
  valor: z.coerce.number().optional(),
  data_vencimento: z.string().optional(),
  data_recebimento: z.string().optional(),
  obs: z.string().optional(),
}).passthrough();

// ─── PATCH /api/financeiro/contas-receber/[id] ────────────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  // Permissão: mesmo padrão das rotas coletivas (GET/POST)
  const [usuario] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario || (!ROLES_FINANCEIRO.includes(usuario.role) && !isFullAccess(usuario.role))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const contaId = Number(id);
  if (!id || isNaN(contaId) || contaId <= 0) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = ContaReceberPatchSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;

  // Auto-fill: marcar como recebido/pago sem informar data → usa CURRENT_DATE.
  const marcouRecebido = body.situacao === "pago" || body.situacao === "recebido";
  const dataRecebimentoFinal = (marcouRecebido && !body.data_recebimento)
    ? new Date().toISOString().slice(0, 10)
    : (body.data_recebimento ?? null);

  const result = await sql`
    UPDATE alissonerp.contas_receber SET
      status            = COALESCE(${body.situacao ?? null},                status),
      valor             = COALESCE(${body.valor ?? null},                   valor),
      data_vencimento   = COALESCE(${body.data_vencimento ?? null}::date,   data_vencimento),
      data_recebimento  = COALESCE(${dataRecebimentoFinal}::date,           data_recebimento),
      observacao        = COALESCE(${body.obs ?? null},                     observacao),
      updated_at        = now()
    WHERE id = ${contaId}
    RETURNING id
  `;
  if (result.length === 0) {
    return NextResponse.json({ error: "Conta não encontrada" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
