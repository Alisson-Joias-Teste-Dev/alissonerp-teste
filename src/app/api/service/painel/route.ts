import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess, ROLES_SERVICE_PANEL } from "@/lib/roles";
import { normalizeRow } from "@/lib/db";

// GET /api/service/painel
// Visão gerencial de todos os serviços com filtros opcionais.
// Query params: ?status=em_servico|concluido|reprovado&operador_id=X&inicio=YYYY-MM-DD&fim=YYYY-MM-DD
// Auth: role em ROLES_SERVICE_PANEL OU fullAccess

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [caller] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid
  `;
  if (!caller) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 403 });

  const hasAccess =
    isFullAccess(caller.role as string) ||
    ROLES_SERVICE_PANEL.includes(caller.role as typeof ROLES_SERVICE_PANEL[number]);
  if (!hasAccess) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const statusFiltro     = sp.get("status") || null;
  const operadorIdFiltro = sp.get("operador_id") ? parseInt(sp.get("operador_id")!) : null;
  const ordemIdFiltro    = sp.get("ordem_id")    ? parseInt(sp.get("ordem_id")!)    : null;
  const inicio           = sp.get("inicio") || null;
  const fim              = sp.get("fim")    || null;

  const rows = await sql`
    SELECT
      s.id,
      s.ordem_id,
      s.pcp_id,
      s.operador_id,
      s.tentativa,
      s.peso_entrada,
      s.peso_saida,
      s.usou_solda,
      s.peso_fio_antes,
      s.peso_fio_depois,
      s.consumo_solda,
      s.colocou_pedra,
      s.pedras_colocadas,
      s.status,
      s.foto_recebimento,
      s.foto_conclusao,
      s.foto_fio_solda,
      s.motivo_reprovacao,
      s.foto_reprovacao,
      s.reprovado_em,
      s.recebido_em,
      s.concluido_em,
      s.created_at,
      o.numero_ordem,
      o.tipo_ordem::text AS tipo_ordem,
      o.detalhes_ordem,
      o.foto_peca_servico,
      o.peso_peca_servico,
      c.nome AS cliente_nome,
      d.nome AS operador_nome,
      u.nome AS concluido_por_nome
    FROM alissonerp.servicos s
    JOIN alissonerp.ordens o ON o.id = s.ordem_id
    LEFT JOIN public.contatos c ON c.id_contato = o.cliente_id
    LEFT JOIN alissonerp.depositos d ON d.id = s.operador_id
    LEFT JOIN alissonerp.usuarios u ON u.id = s.concluido_por::uuid
    WHERE (${statusFiltro}::text IS NULL OR s.status = ${statusFiltro})
      AND (${operadorIdFiltro}::int IS NULL OR s.operador_id = ${operadorIdFiltro})
      AND (${ordemIdFiltro}::int IS NULL OR s.ordem_id = ${ordemIdFiltro})
      AND (${inicio}::timestamptz IS NULL OR s.created_at >= ${inicio}::timestamptz)
      AND (${fim}::timestamptz IS NULL OR s.created_at <= ${fim}::timestamptz + INTERVAL '1 day')
    ORDER BY s.tentativa ASC, s.created_at DESC
  `;

  const servicos = rows.map(r => normalizeRow(r as Record<string, unknown>, [
    "peso_entrada", "peso_saida", "peso_fio_antes", "peso_fio_depois", "consumo_solda", "peso_peca_servico",
  ], ["pedras_colocadas"]));

  return NextResponse.json({ servicos });
}
