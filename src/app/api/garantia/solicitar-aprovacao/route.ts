// POST /api/garantia/solicitar-aprovacao
// Abre o pedido de aprovação para abrir garantia FORA do prazo de 7 dias úteis.
// NÃO cria a ordem — a ordem nasce depois, em POST /api/ordens, que consome a
// aprovação (uso único). Ver src/lib/garantia/solicitar-aprovacao.ts e
// docs/regras-negocio/ordens.md §3.
// Body: { venda_id, tipos_servico_ids: number[], motivo? }

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { zodError, IdSchema } from "@/lib/schemas/common";
import {
  criarSolicitacaoGarantiaForaPrazo,
  GarantiaAprovacaoError,
} from "@/lib/garantia/solicitar-aprovacao";

const Schema = z.object({
  venda_id: IdSchema,
  tipos_servico_ids: z.array(z.number().int()).min(1, "Selecione pelo menos um tipo de serviço").max(50),
  motivo: z.string().max(1000).nullable().optional(),
}).passthrough();

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const raw = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { venda_id, tipos_servico_ids, motivo } = parsed.data;

  try {
    const r = await criarSolicitacaoGarantiaForaPrazo({
      vendaId: venda_id,
      tiposServicoIds: tipos_servico_ids,
      motivo: motivo ?? null,
      user: { id: user.id, email: user.email },
    });
    return NextResponse.json(r, { status: r.ja_existia ? 200 : 201 });
  } catch (err) {
    if (err instanceof GarantiaAprovacaoError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
