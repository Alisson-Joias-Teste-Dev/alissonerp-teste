import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";
import { zodError } from "@/lib/schemas/common";

const GatewayPostSchema = z.object({
  nome: z.string().min(1, "obrigatório"),
  tipo: z.enum(["pix", "cartao", "dinheiro", "ouro", "outro"]),
  cor: z.string().optional(),
  obs: z.string().optional(),
}).passthrough();

export async function GET() {
  const gateways = await sql`
    SELECT id, nome, tipo, ativo, cor, obs, created_at::text AS created_at
    FROM alissonerp.fin_gateways
    ORDER BY id ASC
  `;
  return NextResponse.json(gateways);
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  if (!usuario || !isFullAccess(usuario.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = GatewayPostSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { nome, tipo, cor, obs } = parsed.data;

  const [gateway] = await sql`
    INSERT INTO alissonerp.fin_gateways (nome, tipo, cor, obs)
    VALUES (${nome.trim()}, ${tipo}, ${cor || "#6B7280"}, ${obs || null})
    RETURNING id, nome, tipo, ativo, cor, obs, created_at::text AS created_at
  `;
  return NextResponse.json(gateway, { status: 201 });
}
