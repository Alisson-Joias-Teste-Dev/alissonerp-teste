import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import MovimentacaoInternaClient from "./MovimentacaoInternaClient";

export const dynamic = 'force-dynamic';

/**
 * REGRA DE NEGÓCIO: Movimentação Interna registra retirada/devolução de
 * produto entre estoquista e consultora, dentro da mesma loja — sem PCP,
 * sem aprovação de consultora, sem role própria (qualquer usuário
 * autenticado abre e conclui). É só auditoria: quem abriu, quem confirmou,
 * foto obrigatória nas duas pontas.
 *
 * Reaproveita a tabela alissonerp.protocolos (tipo_protocolo='interno') e
 * alissonerp.protocolo_produtos por trás — mas fica fora da tela Protocolo
 * (que é especificamente sobre transporte Loja↔Fábrica com motoboy) para
 * não confundir os dois conceitos.
 */
export default async function MovimentacaoInternaPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  const rows = user ? await sql`
    SELECT
      p.id,
      p.etapas::text,
      p.data_conclusao,
      p.created_at,
      p.foto_criacao,
      p.foto_conclusao,
      m.nome AS criado_por_nome,
      r.nome AS concluido_por_nome,
      COALESCE(
        (SELECT json_agg(json_build_object('nome', pr.nome, 'sku', pr.sku) ORDER BY pr.nome)
         FROM alissonerp.protocolo_produtos pp
         JOIN public.produtos pr ON pr.id_produto = pp.produto_id
         WHERE pp.protocolo_id = p.id),
        '[]'::json
      ) AS produtos
    FROM alissonerp.protocolos p
    LEFT JOIN alissonerp.usuarios m ON m.id = p.created_by
    LEFT JOIN alissonerp.usuarios r ON r.id = p.recebedor_id
    WHERE p.tipo_protocolo = 'interno'
    ORDER BY p.id DESC
    LIMIT 200
  ` : [];

  return <MovimentacaoInternaClient rows={rows as any[]} />;
}
