import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import ConferenciaClient from "./ConferenciaClient";

export default async function ConferenciaPage() {
  // Auth — consultora vê só as conferências vinculadas ao seu vendedor_id (= consultora_id)
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  let consultorIdFiltro: number | null = null;
  if (user) {
    const [usuario] = await sql`
      SELECT role, vendedor_id FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
    `;
    if (usuario?.role === "consultora" && usuario.vendedor_id != null) {
      consultorIdFiltro = usuario.vendedor_id as number;
    }
  }

  const aprovacoes = consultorIdFiltro != null
    ? await sql`
        SELECT
          ac.id,
          ac.etapas::text,
          ac.ordem_id,
          ac.consultora_id,
          ac.obs,
          ac.created_at,
          ac.updated_at,
          o.numero_ordem,
          o.tipo_ordem::text,
          o.peso_metal_negociado,
          o.data_entrega,
          v.nome AS consultora_nome,
          c.nome AS cliente_nome
        FROM alissonerp.aprovacoes_consultora ac
        LEFT JOIN alissonerp.ordens o ON o.id = ac.ordem_id
        LEFT JOIN public.vendedores v ON v.id_vendedor = ac.consultora_id
        LEFT JOIN public.contatos c ON c.id_contato = o.cliente_id
        WHERE ac.consultora_id = ${consultorIdFiltro}
        ORDER BY ac.id DESC
        LIMIT 500
      `
    : await sql`
        SELECT
          ac.id,
          ac.etapas::text,
          ac.ordem_id,
          ac.consultora_id,
          ac.obs,
          ac.created_at,
          ac.updated_at,
          o.numero_ordem,
          o.tipo_ordem::text,
          o.peso_metal_negociado,
          o.data_entrega,
          v.nome AS consultora_nome,
          c.nome AS cliente_nome
        FROM alissonerp.aprovacoes_consultora ac
        LEFT JOIN alissonerp.ordens o ON o.id = ac.ordem_id
        LEFT JOIN public.vendedores v ON v.id_vendedor = ac.consultora_id
        LEFT JOIN public.contatos c ON c.id_contato = o.cliente_id
        ORDER BY ac.id DESC
        LIMIT 500
      `;

  return <ConferenciaClient aprovacoes={aprovacoes as any[]} />;
}
