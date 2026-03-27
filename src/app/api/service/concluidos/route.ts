import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { normalizeRow } from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";

// GET /api/service/concluidos?inicio=YYYY-MM-DD&fim=YYYY-MM-DD
// Retorna serviços concluídos pelo operador logado no período (default: últimos 30 dias).
// Auth: is_operador_service = true OU fullAccess

export async function GET(req: NextRequest) {
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

  const { searchParams } = new URL(req.url);
  const hoje = new Date().toISOString().split("T")[0];
  const inicio = searchParams.get("inicio") ?? (() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split("T")[0];
  })();
  const fim = searchParams.get("fim") ?? hoje;

  const rows = await sql`
    SELECT
      s.id,
      s.ordem_id,
      s.tentativa,
      s.peso_entrada,
      s.peso_saida,
      s.usou_solda,
      s.consumo_solda,
      s.colocou_pedra,
      s.concluido_em,
      o.numero_ordem,
      o.tipo_ordem::text AS tipo_ordem,
      o.detalhes_ordem,
      o.foto_peca_servico
    FROM alissonerp.servicos s
    JOIN alissonerp.ordens o ON o.id = s.ordem_id
    WHERE s.status = 'concluido'
      AND s.concluido_por = ${user.id}::uuid
      AND s.concluido_em >= ${inicio}::timestamptz
      AND s.concluido_em <= (${fim}::date + interval '1 day')
    ORDER BY s.concluido_em DESC
  `;

  const servicos = rows.map(r => normalizeRow(r as Record<string, unknown>, [
    "peso_entrada", "peso_saida", "consumo_solda",
  ], []));

  return NextResponse.json({ servicos });
}
