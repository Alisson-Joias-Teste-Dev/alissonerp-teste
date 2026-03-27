import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";
import { normalizeRow } from "@/lib/db";

// GET /api/service/meus
// Lista serviços atribuídos ao operador logado (pelo deposito_id do usuário).
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
    return NextResponse.json({ error: "Usuário não possui depósito/operador vinculado" }, { status: 422 });
  }

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
      prev_svc.motivo_reprovacao AS motivo_reprovacao_anterior,
      prev_svc.foto_reprovacao   AS foto_reprovacao_anterior
    FROM alissonerp.servicos s
    JOIN alissonerp.ordens o ON o.id = s.ordem_id
    LEFT JOIN public.contatos c ON c.id_contato = o.cliente_id
    LEFT JOIN alissonerp.depositos d ON d.id = s.operador_id
    LEFT JOIN LATERAL (
      SELECT motivo_reprovacao, foto_reprovacao
      FROM alissonerp.servicos prev
      WHERE prev.ordem_id = s.ordem_id
        AND prev.tentativa = s.tentativa - 1
        AND prev.status = 'reprovado'
      LIMIT 1
    ) prev_svc ON true
    WHERE s.operador_id = ${caller.deposito_id as number}
      AND s.status IN ('em_servico', 'aguardando')
    ORDER BY s.created_at ASC
  `;

  const servicos = rows.map(r => normalizeRow(r as Record<string, unknown>, [
    "peso_entrada", "peso_saida", "peso_fio_antes", "peso_fio_depois", "consumo_solda", "peso_peca_servico",
  ], ["pedras_colocadas"]));

  return NextResponse.json({ servicos });
}
