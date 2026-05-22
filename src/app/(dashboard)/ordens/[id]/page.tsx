import sql from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import OrdemDetalheClient from "./OrdemDetalheClient";
import { orcamentoFichaToDados } from "@/lib/orcamento-ficha-to-dados";
import { loadOrcamentoConfig } from "@/lib/orcamento-config";

export const dynamic = 'force-dynamic';

export default async function OrdemDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ordemId = parseInt(id);

  if (isNaN(ordemId)) return notFound();

  const [ordens, apontamentos, movEstoque, transferencias, fichas, timeline, conversaoSku] = await Promise.all([
    sql`
      SELECT vod.*,
        u_criador.nome AS created_by_nome,
        o2.created_by::text AS created_by_uuid,
        COALESCE(o2.venda_id, ve_fallback.id) AS venda_id,
        o2.tipo_ordem::text AS tipo_ordem
      FROM alissonerp.vw_ordem_detalhe vod
      LEFT JOIN alissonerp.ordens o2 ON o2.id = vod.id
      LEFT JOIN alissonerp.usuarios u_criador ON u_criador.id = o2.created_by
      LEFT JOIN alissonerp.vendas_erp ve_fallback
        ON ve_fallback.numero_venda::text = o2.numero_pedido::text
        AND o2.venda_id IS NULL
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
    sql`
      SELECT cs.*, p_orig.nome AS sku_origem_nome, p_orig.sku AS sku_origem_cod,
             p_dest.nome AS sku_destino_nome, p_dest.sku AS sku_destino_cod
      FROM alissonerp.conversoes_sku cs
      LEFT JOIN public.produtos p_orig ON p_orig.id_produto = cs.sku_origem_id
      LEFT JOIN public.produtos p_dest ON p_dest.id_produto = cs.sku_destino_id
      WHERE cs.ordem_id = ${ordemId}
      LIMIT 1
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
      const ordemCreatedBy  = (ordens[0] as any).created_by_uuid;
      const ehDela = ordemVendedorId === usuario.vendedor_id || ordemCreatedBy === user.id;
      if (!ehDela) redirect("/ordens");
    }
  }

  // Signed URLs para fotos da peça (bucket ordem-fotos é PRIVADO)
  const fotoPecaPath  = (ordens[0] as any).foto_peca_servico  as string | null;
  const fotoPeca2Path = (ordens[0] as any).foto_peca_servico_2 as string | null;
  const [fotoPecaSignedUrl, fotoPeca2SignedUrl] = await Promise.all([
    fotoPecaPath
      ? supabase.storage.from("ordem-fotos").createSignedUrl(fotoPecaPath, 3600).then(r => r.data?.signedUrl ?? null)
      : Promise.resolve(null),
    fotoPeca2Path
      ? supabase.storage.from("ordem-fotos").createSignedUrl(fotoPeca2Path, 3600).then(r => r.data?.signedUrl ?? null)
      : Promise.resolve(null),
  ]);

  // Ficha técnica: tentar view legada (Directus) primeiro, senão tabela ERP nova
  let fichaTecnica = (fichas[0] as any) ?? null;
  if (!fichaTecnica) {
    const fichasErp = await sql`
      SELECT id AS ficha_id, ordem_id, tipo_item, dados, created_at
      FROM alissonerp.fichas_tecnicas
      WHERE ordem_id = ${ordemId}
      ORDER BY id
    `;

    // Enriquecimento: se a ordem veio de um orçamento de aliança, busca a
    // ficha original (orcamento_fichas_tecnicas) — que tem ~25 campos vs
    // ~10 no dados gravado — e preenche os campos faltantes. Dados editados
    // manualmente na ficha vencem (merge respeita o que já está salvo).
    const vendaId = (ordens[0] as any).venda_id as number | null;
    let orcFichas: Array<Record<string, unknown>> = [];
    if (vendaId && fichasErp.length > 0) {
      orcFichas = await sql`
        SELECT ft.*
        FROM alissonerp.vendas_erp v
        JOIN alissonerp.orcamentos o ON o.id = v.orcamento_id
        JOIN alissonerp.orcamento_fichas_tecnicas ft
          ON ft.id = o.ficha_tecnica_id OR ft.id = o.ficha_tecnica_2_id
        WHERE v.id = ${vendaId}
        ORDER BY ft.id
      `;
    }
    const enriquecer = (existing: Record<string, unknown>, idx: number): Record<string, unknown> => {
      const orcRow = orcFichas[idx];
      if (!orcRow) return existing;
      const fromOrc = orcamentoFichaToDados(orcRow);
      // existing vence — manual edits preservados; campos só do orçamento entram
      return { ...fromOrc, ...existing };
    };

    if (fichasErp.length === 1) {
      const f = fichasErp[0] as any;
      const dadosObj = typeof f.dados === "string" ? JSON.parse(f.dados) : f.dados;
      f.dados = enriquecer(dadosObj ?? {}, 0);
      fichaTecnica = { ...f, _origem: "erp" };
    } else if (fichasErp.length > 1) {
      // Par de alianças — múltiplas fichas
      fichaTecnica = {
        _origem: "erp_multi",
        fichas: fichasErp.map((f: any, i) => {
          const dadosObj = typeof f.dados === "string" ? JSON.parse(f.dados) : f.dados;
          return { ...f, dados: enriquecer(dadosObj ?? {}, i), _origem: "erp", _label: `Aliança ${i + 1}` };
        }),
      };
    }
  }

  // Labels customizados da ficha (mesma fonte do modal de orçamento). Permite
  // que ourives veja "Tamanho", "Altura da borda", etc — exatamente os nomes
  // que a vendedora configurou na empresa.
  const cfg = await loadOrcamentoConfig().catch(() => null);
  const labelsFicha = cfg?.labels_ficha_tecnica ?? {};

  return (
    <OrdemDetalheClient
      ordem={ordens[0]}
      apontamentos={apontamentos}
      movEstoque={movEstoque}
      transferencias={transferencias}
      fichaTecnica={fichaTecnica}
      timeline={timeline as any[]}
      userRole={userRole}
      conversaoSku={conversaoSku[0] ?? null}
      fotoPecaSignedUrl={fotoPecaSignedUrl}
      fotoPeca2SignedUrl={fotoPeca2SignedUrl}
      labelsFicha={labelsFicha}
    />
  );
}
