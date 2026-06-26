import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";
import { zodError } from "@/lib/schemas/common";

const ROLES_FINANCEIRO = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja"];

const ContaPagarPatchSchema = z.object({
  situacao: z.string().optional(),
  valor: z.coerce.number().optional(),
  data_vencimento: z.string().optional(),
  data_pagamento: z.string().optional(),
  obs: z.string().optional(),
}).passthrough();

// Inter status que ainda estão "no ar" — bloqueia edição manual pra evitar
// inconsistência entre o estado interno e o pagamento já em processamento.
const INTER_STATUS_ATIVOS = ["pendente_aprovacao", "processando", "aguardando_aprovacao"];

// ─── PATCH /api/financeiro/contas-pagar/[id] ──────────────────────────────────
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
  const parsed = ContaPagarPatchSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;

  // Carrega estado atual da conta — usado pra validar regras de negócio
  // antes do UPDATE (Inter ativo + auto-fill de data_pagamento).
  const [contaAtual] = await sql`
    SELECT id, situacao, inter_status
    FROM alissonerp.contas_pagar WHERE id = ${contaId}
  `;
  if (!contaAtual) {
    return NextResponse.json({ error: "Conta não encontrada" }, { status: 404 });
  }

  // Bloqueia edição quando há pagamento Inter em andamento — fonte de verdade
  // passa a ser o Inter, qualquer edição manual aqui pode descasar os estados.
  if (contaAtual.inter_status && INTER_STATUS_ATIVOS.includes(String(contaAtual.inter_status))) {
    return NextResponse.json(
      { error: "Conta tem pagamento Inter em andamento. Cancele no Inter antes de editar." },
      { status: 409 },
    );
  }

  // Auto-fill: marcar como pago sem informar data → usa CURRENT_DATE.
  // Tira a necessidade do front mandar os dois campos juntos.
  const dataPagamentoFinal = (body.situacao === "pago" && !body.data_pagamento)
    ? new Date().toISOString().slice(0, 10)
    : (body.data_pagamento ?? null);

  const result = await sql`
    UPDATE alissonerp.contas_pagar SET
      situacao        = COALESCE(${body.situacao ?? null},        situacao),
      valor           = COALESCE(${body.valor ?? null},           valor),
      data_vencimento = COALESCE(${body.data_vencimento ?? null}::date, data_vencimento),
      data_pagamento  = COALESCE(${dataPagamentoFinal}::date,           data_pagamento),
      obs             = COALESCE(${body.obs ?? null},             obs),
      updated_at      = now()
    WHERE id = ${contaId}
    RETURNING id
  `;
  if (result.length === 0) {
    return NextResponse.json({ error: "Conta não encontrada" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
