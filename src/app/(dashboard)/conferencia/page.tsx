import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import ConferenciaClient from "./ConferenciaClient";

export const dynamic = 'force-dynamic';

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

  const [aprovacoes, servicosConferencia] = await Promise.all([
    // ── Aprovações gerais ────────────────────────────────────────────────────
    consultorIdFiltro != null
      ? sql`
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
      : sql`
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
        `,

    // ── Serviços aguardando conferência (foto comparação + reprovação) ───────
    consultorIdFiltro != null
      ? sql`
          SELECT
            ac.id              AS aprovacao_id,
            ac.etapas::text    AS aprovacao_etapas,
            ac.consultora_id,
            s.id               AS servico_id,
            s.tentativa,
            s.peso_entrada,
            s.peso_saida,
            s.consumo_solda,
            s.foto_conclusao   AS foto_conclusao_servico,
            s.concluido_em,
            o.id               AS ordem_id,
            o.numero_ordem,
            o.tipo_ordem::text AS tipo_ordem,
            o.foto_peca_servico,
            o.detalhes_ordem,
            c.nome             AS cliente_nome,
            v.nome             AS consultora_nome,
            d.nome             AS operador_nome
          FROM alissonerp.aprovacoes_consultora ac
          JOIN alissonerp.ordens o ON o.id = ac.ordem_id
          JOIN alissonerp.servicos s
            ON s.ordem_id = o.id AND s.status = 'concluido'
          LEFT JOIN public.contatos c ON c.id_contato = o.cliente_id
          LEFT JOIN public.vendedores v ON v.id_vendedor = ac.consultora_id
          LEFT JOIN alissonerp.depositos d ON d.id = s.operador_id
          WHERE ac.etapas IN ('pendente', 'aguardando')
            AND o.tipo_ordem::text IN ('servico_venda', 'garantia')
            AND ac.consultora_id = ${consultorIdFiltro}
          ORDER BY s.concluido_em DESC
          LIMIT 200
        `
      : sql`
          SELECT
            ac.id              AS aprovacao_id,
            ac.etapas::text    AS aprovacao_etapas,
            ac.consultora_id,
            s.id               AS servico_id,
            s.tentativa,
            s.peso_entrada,
            s.peso_saida,
            s.consumo_solda,
            s.foto_conclusao   AS foto_conclusao_servico,
            s.concluido_em,
            o.id               AS ordem_id,
            o.numero_ordem,
            o.tipo_ordem::text AS tipo_ordem,
            o.foto_peca_servico,
            o.detalhes_ordem,
            c.nome             AS cliente_nome,
            v.nome             AS consultora_nome,
            d.nome             AS operador_nome
          FROM alissonerp.aprovacoes_consultora ac
          JOIN alissonerp.ordens o ON o.id = ac.ordem_id
          JOIN alissonerp.servicos s
            ON s.ordem_id = o.id AND s.status = 'concluido'
          LEFT JOIN public.contatos c ON c.id_contato = o.cliente_id
          LEFT JOIN public.vendedores v ON v.id_vendedor = ac.consultora_id
          LEFT JOIN alissonerp.depositos d ON d.id = s.operador_id
          WHERE ac.etapas IN ('pendente', 'aguardando')
            AND o.tipo_ordem::text IN ('servico_venda', 'garantia')
          ORDER BY s.concluido_em DESC
          LIMIT 200
        `,
  ]);

  return (
    <ConferenciaClient
      aprovacoes={aprovacoes as any[]}
      servicosConferencia={servicosConferencia as any[]}
    />
  );
}
