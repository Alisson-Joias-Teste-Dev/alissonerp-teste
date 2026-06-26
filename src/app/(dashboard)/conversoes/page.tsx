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

  // Conversões de Metal
  const metal = await sql`
    SELECT
      o.id AS ordem_id,
      o.numero_ordem,
      o.created_at,
      ce.id AS conversao_id,
      ce.status_conversao,
      ce.peso_total,
      ce.quantidade_total,
      ce.foto_abertura,
      ce.aprovado_em,
      ce.recusado_em,
      ce.created_at AS conversao_created_at,
      u.nome AS criado_por_nome,
      t.status::text AS tarefa_status,
      'metal' AS tipo
    FROM alissonerp.conversoes_estoque ce
    JOIN alissonerp.ordens o ON o.id = ce.ordem_id
    LEFT JOIN alissonerp.usuarios u ON u.id = ce.created_by
    LEFT JOIN alissonerp.tarefas t ON t.id = ce.tarefa_aprovacao_id
    ORDER BY ce.created_at DESC
    LIMIT 100
  `;

  // Conversões de SKU
  const sku = await sql`
    SELECT
      o.id AS ordem_id,
      o.numero_ordem,
      o.created_at,
      cs.id AS conversao_id,
      cs.status_conversao,
      cs.sku_origem_peso AS peso_total,
      cs.sku_origem_quantidade AS quantidade_total,
      cs.foto_abertura,
      cs.aprovado_em,
      cs.recusado_em,
      cs.created_at AS conversao_created_at,
      u.nome AS criado_por_nome,
      t.status::text AS tarefa_status,
      'sku' AS tipo,
      p_orig.nome AS sku_origem_nome,
      p_orig.sku AS sku_origem_cod,
      p_dest.nome AS sku_destino_nome,
      p_dest.sku AS sku_destino_cod,
      cs.sku_destino_quantidade_desejada
    FROM alissonerp.conversoes_sku cs
    JOIN alissonerp.ordens o ON o.id = cs.ordem_id
    LEFT JOIN alissonerp.usuarios u ON u.id = cs.created_by
    LEFT JOIN alissonerp.tarefas t ON t.id = cs.tarefa_aprovacao_id
    LEFT JOIN public.produtos p_orig ON p_orig.id_produto = cs.sku_origem_id
    LEFT JOIN public.produtos p_dest ON p_dest.id_produto = cs.sku_destino_id
    ORDER BY cs.created_at DESC
    LIMIT 100
  `;

  // Merge and sort
  const conversoes = [...metal, ...sku].sort((a: any, b: any) =>
    new Date(b.conversao_created_at).getTime() - new Date(a.conversao_created_at).getTime()
  );

  return (
    <ConversoesListClient
      conversoes={conversoes}
      userRole={userRole}
    />
  );
}
