import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

interface Params { params: Promise<{ id: string }> }

export async function GET(
  _req: NextRequest,
  { params }: Params
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const auditoriaId = Number(id);

  const [auditoria] = await sql`
    SELECT a.id, a.local_estoque_id, le.nome AS local_nome,
      a.status, a.observacao AS obs, a.total_itens, a.itens_contados, a.itens_divergentes,
      a.created_at, a.data_conclusao, uc.email AS criado_por_email
    FROM alissonerp.auditorias_estoque a
    LEFT JOIN alissonerp.locais_estoque le ON le.id = a.local_estoque_id
    LEFT JOIN auth.users uc ON uc.id = a.created_by
    WHERE a.id = ${auditoriaId}
  `;

  if (!auditoria) return NextResponse.json({ error: "Auditoria não encontrada" }, { status: 404 });

  const itens = await sql`
    SELECT ai.id, ai.auditoria_id, ai.produto_id, ai.sku, ai.nome_produto,
      ai.quantidade_sistema, ai.quantidade_contada,
      ai.localizacao_fisica, ai.consultora,
      ai.status, ai.validado, ai.observacao, ai.contado_em,
      ai.venda_id, ai.venda_numero
    FROM alissonerp.auditorias_estoque_itens ai
    WHERE auditoria_id = ${auditoriaId}
    ORDER BY
      CASE ai.status WHEN 'pendente' THEN 0 WHEN 'aguardando' THEN 1 WHEN 'resolvido' THEN 2 ELSE 3 END,
      ai.contado_em DESC
  `;

  return NextResponse.json({ auditoria, itens });
}
