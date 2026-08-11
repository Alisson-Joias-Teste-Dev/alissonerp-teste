import { createServerSupabase } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import sql from "@/lib/db";
import AuditoriaDetalhe from "@/components/estoque-comercial/auditoria/AuditoriaDetalhe";

export const dynamic = "force-dynamic";

export default async function AuditoriaDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const auditoriaId = Number(id);

  const [auditoria] = await sql`
    SELECT
      a.id, a.local_estoque_id, le.nome AS local_nome,
      a.status, a.obs, a.total_itens, a.itens_contados, a.itens_divergentes,
      a.created_at, a.data_conclusao,
      uc.email AS criado_por_email
    FROM alissonerp.auditorias_estoque a
    LEFT JOIN alissonerp.locais_estoque le ON le.id = a.local_estoque_id
    LEFT JOIN auth.users uc ON uc.id = a.created_by
    WHERE a.id = ${auditoriaId}
  `;

  if (!auditoria) {
    return (
      <div className="p-6 text-center text-gray-500">
        Auditoria não encontrada.
      </div>
    );
  }

  const itens = await sql`
    SELECT
      ai.id, ai.auditoria_id, ai.produto_id, ai.sku, ai.nome_produto,
      ai.quantidade_sistema, ai.quantidade_contada,
      ai.localizacao_fisica, ai.consultora,
      ai.status, ai.validado, ai.observacao, ai.contado_em,
      ai.venda_id, ai.venda_numero
    FROM alissonerp.auditorias_estoque_itens ai
    WHERE ai.auditoria_id = ${auditoriaId}
    ORDER BY
      CASE ai.status
        WHEN 'pendente' THEN 0
        WHEN 'aguardando' THEN 1
        WHEN 'resolvido' THEN 2
        ELSE 3
      END,
      ai.nome_produto
  `;

  return (
    <AuditoriaDetalhe
      auditoriaId={auditoriaId}
      auditoriaInicial={auditoria}
      itensIniciais={itens}
    />
  );
}
