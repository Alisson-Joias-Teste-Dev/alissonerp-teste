import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import sql from "@/lib/db";
import { zodError } from "@/lib/schemas/common";

const FichaTecPostSchema = z.object({
  ordem_id: z.coerce.number().int().positive(),
  tipo_item: z.string().min(1, "obrigatório"),
  dados: z.record(z.string(), z.unknown()),
}).passthrough();

// POST /api/fichas-tecnicas
// Body: { ordem_id, tipo_item, dados }
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const raw = await req.json().catch(() => ({}));
  const parsed = FichaTecPostSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { ordem_id, tipo_item, dados } = parsed.data;

  const [ficha] = await sql`
    INSERT INTO alissonerp.fichas_tecnicas (ordem_id, tipo_item, dados, created_by)
    VALUES (${ordem_id}, ${tipo_item}, ${JSON.stringify(dados)}::text::jsonb, ${user.id}::uuid)
    RETURNING id
  `;

  return NextResponse.json({ id: ficha.id }, { status: 201 });
}
