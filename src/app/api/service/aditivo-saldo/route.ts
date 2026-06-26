import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";
import { getParametroNumber, PARAM } from "@/lib/parametros";

// GET /api/service/aditivo-saldo
// Retorna o saldo de Ouro 18k (insumo_id=1) no depósito do operador logado.
// Usado na tela de conclusão para preencher o peso do aditivo automaticamente.
// Auth: is_operador_service = true OU fullAccess

export async function GET(_req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [caller] = await sql`
    SELECT role, deposito_id, is_operador_service
    FROM alissonerp.usuarios
    WHERE id = ${user.id}::uuid
  `;
  if (!caller) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 403 });

  const hasAccess = isFullAccess(caller.role as string) || caller.is_operador_service === true;
  if (!hasAccess) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  if (!caller.deposito_id && !isFullAccess(caller.role as string)) {
    return NextResponse.json({ error: "Usuário não possui depósito/operador vinculado" }, { status: 422 });
  }

  const ouro18kId = await getParametroNumber(PARAM.OURO_18K_INSUMO_ID);

  if (!caller.deposito_id) {
    return NextResponse.json({ deposito_id: null, insumo_id: ouro18kId, saldo: 0 });
  }

  const depositoId = caller.deposito_id as number;

  const [row] = await sql`
    SELECT COALESCE(saldo, 0) AS saldo
    FROM alissonerp.vw_saldo_estoque
    WHERE deposito_id = ${depositoId} AND insumo_id = ${ouro18kId}
  `;

  const saldo = parseFloat(String(row?.saldo ?? 0));

  return NextResponse.json({
    deposito_id: depositoId,
    insumo_id:   ouro18kId,
    saldo:       parseFloat(saldo.toFixed(4)),
  });
}
