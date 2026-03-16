import sql from "@/lib/db";
import { notFound } from "next/navigation";
import OrdemDetalheClient from "./OrdemDetalheClient";

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
      SELECT *
      FROM alissonerp.vw_ordem_detalhe
      WHERE id = ${ordemId}
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
