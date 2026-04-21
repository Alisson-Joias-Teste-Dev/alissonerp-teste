import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";

// GET /api/service/meu-estoque
// Lista insumos com saldo > 0 no depósito do operador (exclui ouro bruto insumo_id=1).
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

  if (!caller.deposito_id) {
    return NextResponse.json({ insumos: [] });
  }

  const depositoId = caller.deposito_id as number;

  const insumos = await sql`
    SELECT
      vs.insumo_id,
      i.nome        AS insumo_nome,
      i.sku,
      i.unidade,
      SUM(vs.saldo) AS saldo
    FROM alissonerp.vw_saldo_estoque vs
    JOIN alissonerp.insumos i ON i.id = vs.insumo_id
    WHERE vs.deposito_id = ${depositoId}
      AND vs.insumo_id   != 1
      AND vs.saldo        > 0.0001
    GROUP BY vs.insumo_id, i.nome, i.sku, i.unidade
    HAVING SUM(vs.saldo) > 0.0001
    ORDER BY i.nome
  `;

  return NextResponse.json({
    deposito_id: depositoId,
    insumos: insumos.map(r => ({
      insumo_id:   r.insumo_id,
      insumo_nome: r.insumo_nome,
      sku:         r.sku ?? null,
      unidade:     r.unidade ?? "g",
      saldo:       parseFloat(parseFloat(String(r.saldo)).toFixed(4)),
    })),
  });
}
