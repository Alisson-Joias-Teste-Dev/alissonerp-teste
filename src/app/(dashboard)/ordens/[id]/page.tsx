import sql from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import OrdemDetalheClient from "./OrdemDetalheClient";

export const dynamic = 'force-dynamic';

export default async function OrdemDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ordemId = parseInt(id);

  if (isNaN(ordemId)) return notFound();

  const [ordens, apontamentos, movEstoque, transferencias, fichas, timeline] = await Promise.all([
    sql`
      SELECT vod.*,
        u_criador.nome AS created_by_nome
      FROM alissonerp.vw_ordem_detalhe vod
      LEFT JOIN alissonerp.ordens o2 ON o2.id = vod.id
      LEFT JOIN alissonerp.usuarios u_criador ON u_criador.id = o2.created_by
      WHERE vod.id = ${ordemId}
      LIMIT 1
    `,
    sql`
      SELECT *
      FROM alissonerp.vw_apontamentos_ordem
      WHERE ordem_id = ${ordemId}
      ORDER BY data DESC
    `,
    sql`
      SELECT *
      FROM alissonerp.vw_estoque_ordem
      WHERE ordem_id = ${ordemId}
      ORDER BY date_created DESC
    `,
    sql`
      SELECT *
      FROM alissonerp.vw_transferencias_ordem
      WHERE ordem_id = ${ordemId}
      ORDER BY data DESC
    `,
    sql`
      SELECT *
      FROM alissonerp.vw_fichas_tecnicas
      WHERE ordem_id = ${ordemId}
      LIMIT 1
    `,
    sql`
      SELECT *
      FROM alissonerp.vw_timeline_ordem
      WHERE ordem_id = ${ordemId}
      ORDER BY passo
    `,
  ]);

  if (!ordens[0]) return notFound();

  // Consultora só pode ver ordens do seu vendedor_id
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const [usuario] = await sql`
      SELECT role, vendedor_id FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
    `;
    if (usuario?.role === "consultora" && usuario.vendedor_id != null) {
      const ordemVendedorId = (ordens[0] as any).vendedor_id;
      if (ordemVendedorId !== usuario.vendedor_id) {
        redirect("/ordens");
      }
    }
  }

  return (
    <OrdemDetalheClient
      ordem={ordens[0]}
      apontamentos={apontamentos}
      movEstoque={movEstoque}
      transferencias={transferencias}
      fichaTecnica={(fichas[0] as any) ?? null}
      timeline={timeline as any[]}
    />
  );
}
