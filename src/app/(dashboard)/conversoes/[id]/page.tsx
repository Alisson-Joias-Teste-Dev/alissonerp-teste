import sql from "@/lib/db";
import { notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { getPublicUrl } from "@/lib/storage";
import ConversaoDetalheClient from "./ConversaoDetalheClient";

export const dynamic = 'force-dynamic';

export default async function ConversaoDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ordemId = parseInt(id);

  if (isNaN(ordemId)) return notFound();

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  let userRole: string | null = null;
  let userNome: string | null = null;

  if (user) {
    const [usuario] = await sql`
      SELECT role, nome FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
    `;
    userRole = usuario?.role ?? null;
    userNome = usuario?.nome ?? null;
  }

  const [ordem] = await sql`
    SELECT
      o.id, o.numero_ordem, o.status::text, o.situacao::text, o.rota::text,
      o.created_at, o.updated_at, o.created_by,
      u.nome AS created_by_nome
    FROM alissonerp.ordens o
    LEFT JOIN alissonerp.usuarios u ON u.id = o.created_by
    WHERE o.id = ${ordemId} AND o.tipo_ordem::text = 'conversao'
    LIMIT 1
  `;

  if (!ordem) return notFound();

  const [conversao] = await sql`
    SELECT
      ce.*,
      u_aprov.nome AS aprovado_por_nome,
      u_recus.nome AS recusado_por_nome,
      u_criador.nome AS criado_por_nome
    FROM alissonerp.conversoes_estoque ce
    LEFT JOIN alissonerp.usuarios u_aprov ON u_aprov.id = ce.aprovado_por
    LEFT JOIN alissonerp.usuarios u_recus ON u_recus.id = ce.recusado_por
    LEFT JOIN alissonerp.usuarios u_criador ON u_criador.id = ce.created_by
    WHERE ce.ordem_id = ${ordemId}
    LIMIT 1
  `;

  if (!conversao) return notFound();

  // Converter paths de fotos para URLs públicas
  if (conversao.foto_abertura) conversao.foto_abertura = getPublicUrl("conversao-fotos", conversao.foto_abertura);
  if (conversao.foto_recusa)    conversao.foto_recusa    = getPublicUrl("conversao-fotos", conversao.foto_recusa);

  const itens = await sql`
    SELECT ci.*, p.nome AS produto_nome, p.sku
    FROM alissonerp.conversao_itens ci
    JOIN public.produtos p ON p.id_produto = ci.produto_id
    WHERE ci.conversao_id = ${conversao.id}
  `;

  const [tarefa] = await sql`
    SELECT id, status::text, prioridade::text
    FROM alissonerp.tarefas
    WHERE id = ${conversao.tarefa_aprovacao_id}
    LIMIT 1
  `;

  return (
    <ConversaoDetalheClient
      ordem={ordem}
      conversao={conversao}
      itens={itens}
      tarefa={tarefa ?? null}
      userRole={userRole}
      userNome={userNome}
    />
  );
}
