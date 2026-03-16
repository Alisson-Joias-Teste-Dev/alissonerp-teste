import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import KanbanClient from "@/components/KanbanClient";

export default async function PcpPage() {
  // Busca role do usuário autenticado para controlar o botão 🧪 Ordem Teste
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  const userRole = (user?.user_metadata?.role as string | undefined) ?? null;

  const pcps = await sql`
    SELECT
      v.id, v.ordem_id, v.etapas, v.numero_ordem,
      v.cliente_nome, v.vendedor_nome, v.setor_nome,
      v.peso_final, v.total_metal, v.data_conclusao,
      v.created_at, v.deposito_id, v.setor_id,
      COALESCE(o.eh_teste, false) AS eh_teste
    FROM alissonerp.vw_pcp_erp v
    LEFT JOIN alissonerp.ordens o ON o.id = v.ordem_id
    ORDER BY v.id DESC
    LIMIT 300
  `;

  return <KanbanClient pcps={pcps} userRole={userRole} />;
}
