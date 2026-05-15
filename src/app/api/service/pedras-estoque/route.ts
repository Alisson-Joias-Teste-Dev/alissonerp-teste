import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";
import { getParametroNumber, PARAM } from "@/lib/parametros";

export const dynamic = "force-dynamic";

// GET /api/service/pedras-estoque?local_id=3
// Lista pedras (categoria=2) com saldo > 0 no local de estoque informado.
// Retorna id, nome, sku, saldo (g), saldo_ct, quantidade, peso_pedra_ct
// Auth: is_operador_service OR fullAccess

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [caller] = await sql`
    SELECT role, is_operador_service
    FROM alissonerp.usuarios WHERE id = ${user.id}::uuid
  `;
  if (!caller) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 403 });
  const hasAccess = isFullAccess(caller.role as string) || caller.is_operador_service === true;
  if (!hasAccess) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const localId = parseInt(req.nextUrl.searchParams.get("local_id") ?? "3");
  const pedraCategoriaId = await getParametroNumber(PARAM.PEDRA_CATEGORIA_ID);

  const rows = await sql`
    SELECT
      i.id,
      i.nome AS insumo_nome,
      i.sku,
      i.peso_pedra,
      i.peso_pedra_ct,
      sl.saldo,
      sl.saldo_ct,
      sl.quantidade
    FROM alissonerp.vw_saldo_por_local sl
    JOIN alissonerp.insumos i ON i.id = sl.insumo_id
    WHERE sl.local_estoque_id = ${localId}
      AND sl.categoria_id = ${pedraCategoriaId}
      AND sl.saldo > 0
    ORDER BY i.nome
  `;

  return NextResponse.json(rows);
}
