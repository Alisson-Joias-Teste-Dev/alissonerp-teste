import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { zodError } from "@/lib/schemas/common";

const SolicitarDescontoSchema = z.object({
  venda_id: z.coerce.number().int().nullable().optional(),
  item_id: z.coerce.number().int().nullable().optional(),
  produto_nome: z.string().min(1, "obrigatório"),
  preco_lista: z.coerce.number(),
  pct_desconto: z.coerce.number(),
  preco_solicitado: z.coerce.number(),
}).passthrough();

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [u] = await sql`
    SELECT nome FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;

  const raw = await req.json().catch(() => ({}));
  const parsed = SolicitarDescontoSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;

  const nomeSolicitante = (u?.nome as string) || user.email || "";

  const [row] = await sql`
    INSERT INTO alissonerp.solicitacoes_desconto
      (venda_id, item_id, produto_nome, preco_lista, pct_desconto_solicitado,
       preco_solicitado, solicitado_por_id, solicitado_por_nome)
    VALUES
      (${body.venda_id ?? null}, ${body.item_id ?? null}, ${body.produto_nome},
       ${body.preco_lista}, ${body.pct_desconto}, ${body.preco_solicitado},
       ${user.id}::uuid, ${nomeSolicitante})
    RETURNING id, status, created_at
  `;

  return NextResponse.json(row, { status: 201 });
}
