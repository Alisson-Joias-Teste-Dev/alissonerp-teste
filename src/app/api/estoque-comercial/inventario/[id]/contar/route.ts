import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { zodError } from "@/lib/schemas/common";

interface Params { params: Promise<{ id: string }> }

const ROLES_CONTAR = [
  "desenvolvedor", "admin", "gerente_fabrica", "gerente_loja",
  "estoquista_fabrica", "estoquista_loja"
];

const ContarPostSchema = z.object({
  contagens: z.array(z.object({
    produto_id: z.coerce.number().int().positive(),
    quantidade_contada: z.coerce.number().int(),
  })).min(1, "ao menos uma contagem"),
}).passthrough();

// POST /api/estoque-comercial/inventario/[id]/contar
// Registra a contagem de um ou mais itens
export async function POST(
  req: NextRequest,
  { params }: Params
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  if (!usuario || !ROLES_CONTAR.includes(usuario.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const invId = Number(id);

  // Verificar inventário existe e está aberto
  const [inv] = await sql`
    SELECT id, status FROM alissonerp.inventarios_comercial WHERE id = ${invId}
  `;
  if (!inv) return NextResponse.json({ error: "Inventário não encontrado" }, { status: 404 });
  if (inv.status === 'concluido' || inv.status === 'cancelado') {
    return NextResponse.json({ error: `Inventário já está ${inv.status}` }, { status: 409 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = ContarPostSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;

  // Atualizar status para em_contagem se ainda está aberto
  if (inv.status === 'aberto') {
    await sql`
      UPDATE alissonerp.inventarios_comercial SET status = 'em_contagem' WHERE id = ${invId}
    `;
  }

  // Registrar cada contagem
  let atualizados = 0;
  for (const c of body.contagens) {
    if (c.quantidade_contada < 0) continue;

    const [item] = await sql`
      UPDATE alissonerp.itens_inventario_comercial
      SET quantidade_contada = ${c.quantidade_contada},
          diferenca = ${c.quantidade_contada} - quantidade_sistema,
          contado_por = ${user.id},
          contado_em = now()
      WHERE inventario_id = ${invId} AND produto_id = ${c.produto_id}
      RETURNING id
    `;
    if (item) atualizados++;
  }

  return NextResponse.json({ atualizados });
}
