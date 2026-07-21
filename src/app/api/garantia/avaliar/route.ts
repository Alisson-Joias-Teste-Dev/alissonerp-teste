// POST /api/garantia/avaliar — só leitura. Diz se uma garantia pode ser aberta
// (dada a venda + os tipos de serviço escolhidos), para o modal antecipar o aviso
// ANTES de a consultora preencher foto/peso/vídeo. NÃO cria nada.
// A regra vive em src/lib/garantia/prazo-garantia.ts (fonte única) — este endpoint
// só a expõe pro front; a trava REAL é no POST /api/ordens. Ver ordens.md §4.
// Body: { venda_id, tipos_servico_ids: number[] }

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { zodError, IdSchema } from "@/lib/schemas/common";
import { avaliarGarantia } from "@/lib/garantia/prazo-garantia";

const Schema = z.object({
  venda_id: IdSchema,
  tipos_servico_ids: z.array(z.number().int()).max(50).default([]),
}).passthrough();

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const raw = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);

  const aval = await avaliarGarantia(sql, parsed.data.venda_id, parsed.data.tipos_servico_ids);
  return NextResponse.json(aval);
}
