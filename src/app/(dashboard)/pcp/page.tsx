import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import KanbanClient from "@/components/KanbanClient";

// Roles que vêem TODOS os PCPs (sem filtro por depósito)
const ROLES_VE_TUDO = ["admin", "desenvolvedor", "gerente_fabrica", "pcp", "gerente_loja"];

export default async function PcpPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  let depositoIdFiltro: number | null = null;
  let userRole: string | null = null;

  if (user) {
    const [usuario] = await sql`
      SELECT role, deposito_id FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
    `;
    userRole = (usuario?.role as string | null) ?? null;
    if (userRole && !ROLES_VE_TUDO.includes(userRole) && usuario?.deposito_id != null) {
      depositoIdFiltro = usuario.deposito_id as number;
    }
  }

  const pcps = depositoIdFiltro != null
    ? await sql`
        SELECT
          v.id, v.ordem_id, v.etapas, v.numero_ordem,
          v.cliente_nome, v.vendedor_nome, v.setor_nome,
          v.peso_final, v.total_metal, v.data_conclusao,
          v.created_at, v.deposito_id, v.setor_id,
          COALESCE(o.eh_teste, false) AS eh_teste
        FROM alissonerp.vw_pcp_erp v
        LEFT JOIN alissonerp.ordens o ON o.id = v.ordem_id
        WHERE v.deposito_id = ${depositoIdFiltro}
        ORDER BY v.id DESC
        LIMIT 300
      `
    : await sql`
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
