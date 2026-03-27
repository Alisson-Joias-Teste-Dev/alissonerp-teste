import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";

// GET /api/service/operadores
// Lista depósitos de operadores com is_operador_service=true.
// Exclui o próprio caller. Inclui qtd_servicos em andamento.
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

  const meuDepositoId = caller.deposito_id as number | null;

  const rows = await sql`
    SELECT
      d.id,
      d.nome,
      (
        SELECT COUNT(*)::int
        FROM alissonerp.servicos s
        WHERE s.operador_id = d.id
          AND s.status = 'em_servico'
      ) AS qtd_servicos
    FROM alissonerp.depositos d
    JOIN alissonerp.usuarios u ON u.deposito_id = d.id
    WHERE u.is_operador_service = true
      AND (${meuDepositoId} IS NULL OR d.id != ${meuDepositoId})
    ORDER BY d.nome
  `;

  return NextResponse.json(rows);
}
