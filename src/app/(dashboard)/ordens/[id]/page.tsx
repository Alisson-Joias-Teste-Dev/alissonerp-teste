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
        u_criador.nome AS created_by_nome,
        COALESCE(vod.venda_id, ve_fallback.id) AS venda_id
      FROM alissonerp.vw_ordem_detalhe vod
      LEFT JOIN alissonerp.ordens o2 ON o2.id = vod.id
      LEFT JOIN alissonerp.usuarios u_criador ON u_criador.id = o2.created_by
      LEFT JOIN alissonerp.vendas_erp ve_fallback
        ON ve_fallback.numero_venda::text = o2.numero_pedido::text
        AND vod.venda_id IS NULL
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

  // Auth: consultora só vê suas ordens; captura role para o client
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  let userRole: string | null = null;
  if (user) {
    const [usuario] = await sql`
      SELECT role, vendedor_id FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
    `;
    userRole = usuario?.role ?? null;
    if (usuario?.role === "consultora" && usuario.vendedor_id != null) {
      const ordemVendedorId = (ordens[0] as any).vendedor_id;
      if (ordemVendedorId !== usuario.vendedor_id) {
        redirect("/ordens");
      }
    }
  }

  // Ficha técnica: tentar view legada (Directus) primeiro, senão tabela ERP nova
  let fichaTecnica = (fichas[0] as any) ?? null;
  if (!fichaTecnica) {
    const fichasErp = await sql`
      SELECT id AS ficha_id, ordem_id, tipo_item, dados, created_at
      FROM alissonerp.fichas_tecnicas
      WHERE ordem_id = ${ordemId}
      ORDER BY id
    `;
    if (fichasErp.length === 1) {
      fichaTecnica = { ...fichasErp[0], _origem: "erp" };
    } else if (fichasErp.length > 1) {
      // Par de alianças — múltiplas fichas
      fichaTecnica = { _origem: "erp_multi", fichas: fichasErp.map((f, i) => ({ ...f, _origem: "erp", _label: `Aliança ${i + 1}` })) };
    }
  }

  return (
    <OrdemDetalheClient
      ordem={ordens[0]}
      apontamentos={apontamentos}
      movEstoque={movEstoque}
      transferencias={transferencias}
      fichaTecnica={fichaTecnica}
      timeline={timeline as any[]}
      userRole={userRole}
    />
  );
}
