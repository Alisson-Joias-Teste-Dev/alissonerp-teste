import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import MovimentacaoInternaClient from "./MovimentacaoInternaClient";

export const dynamic = 'force-dynamic';

/**
 * REGRA DE NEGOCIO: Movimentacao Interna registra o ciclo de uma peca que sai
 * do estoque da loja para a consultora e depois se resolve — sem PCP, sem
 * aprovacao, sem role propria. Ciclo: solicitado -> entregue -> recebido ->
 * finalizado (devolvido ao estoque | cliente levou). Cada passo grava quem fez,
 * quando, e (nos passos fisicos) uma foto. Independente do modulo Protocolo.
 */
export default async function MovimentacaoInternaPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  const rows = user ? await sql`
    SELECT
      s.id,
      s.status::text,
      s.descricao,
      s.created_at,
      s.entregue_em,
      s.recebido_em,
      s.finalizado_em,
      s.motivo_final,
      s.foto_entrega,
      s.foto_recebimento,
      s.foto_devolucao,
      sol.nome AS solicitante_nome,
      ent.nome AS entregue_por_nome,
      rec.nome AS recebido_por_nome,
      fin.nome AS finalizado_por_nome,
      COALESCE(
        (SELECT json_agg(json_build_object('nome', pr.nome, 'sku', pr.sku) ORDER BY pr.nome)
         FROM alissonerp.solicitacao_peca_produtos spp
         JOIN public.produtos pr ON pr.id_produto = spp.produto_id
         WHERE spp.solicitacao_id = s.id),
        '[]'::json
      ) AS produtos
    FROM alissonerp.solicitacoes_peca s
    LEFT JOIN alissonerp.usuarios sol ON sol.id = s.solicitante_id
    LEFT JOIN alissonerp.usuarios ent ON ent.id = s.entregue_por_id
    LEFT JOIN alissonerp.usuarios rec ON rec.id = s.recebido_por_id
    LEFT JOIN alissonerp.usuarios fin ON fin.id = s.finalizado_por_id
    ORDER BY s.id DESC
    LIMIT 200
  ` : [];

  return <MovimentacaoInternaClient rows={rows as any[]} />;
}
