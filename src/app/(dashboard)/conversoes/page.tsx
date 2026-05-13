import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import ConversoesListClient from "./ConversoesListClient";

export const dynamic = 'force-dynamic';

export default async function ConversoesPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  let userRole: string | null = null;
  if (user) {
    const [u] = await sql`
      SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
    `;
    userRole = u?.role ?? null;
  }

  const conversoes = await sql`
    SELECT
      o.id AS ordem_id,
      o.numero_ordem,
      o.created_at,
      o.status::text AS ordem_status,
      o.situacao::text AS ordem_situacao,
      ce.id AS conversao_id,
      ce.status_conversao,
      ce.peso_total,
      ce.quantidade_total,
      ce.foto_abertura,
      ce.aprovado_em,
      ce.recusado_em,
      ce.created_at AS conversao_created_at,
      u.nome AS criado_por_nome,
      t.status::text AS tarefa_status
    FROM alissonerp.conversoes_estoque ce
    JOIN alissonerp.ordens o ON o.id = ce.ordem_id
    LEFT JOIN alissonerp.usuarios u ON u.id = ce.created_by
    LEFT JOIN alissonerp.tarefas t ON t.id = ce.tarefa_aprovacao_id
    ORDER BY ce.created_at DESC
    LIMIT 100
  `;

  return (
    <ConversoesListClient
      conversoes={conversoes}
      userRole={userRole}
    />
  );
}
