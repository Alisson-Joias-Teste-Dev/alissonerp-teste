import sql from "@/lib/db";
import { notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { getPublicUrl } from "@/lib/storage";
import ConversaoDetalheClient from "./ConversaoDetalheClient";
import ConversaoSkuDetalheClient from "./ConversaoSkuDetalheClient";

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
    SELECT id, numero_ordem, tipo_ordem::text, status::text, situacao::text,
           rota::text, created_at, updated_at, created_by
    FROM alissonerp.ordens WHERE id = ${ordemId}
      AND tipo_ordem::text IN ('conversao', 'conversao_sku')
    LIMIT 1
  `;
  if (!ordem) return notFound();

  // ── Conversão de Metal ──
  if (ordem.tipo_ordem === "conversao") {
    const [conversao] = await sql`
      SELECT ce.*, u_aprov.nome AS aprovado_por_nome,
             u_recus.nome AS recusado_por_nome, u_criador.nome AS criado_por_nome
      FROM alissonerp.conversoes_estoque ce
      LEFT JOIN alissonerp.usuarios u_aprov ON u_aprov.id = ce.aprovado_por
      LEFT JOIN alissonerp.usuarios u_recus ON u_recus.id = ce.recusado_por
      LEFT JOIN alissonerp.usuarios u_criador ON u_criador.id = ce.created_by
      WHERE ce.ordem_id = ${ordemId} LIMIT 1
    `;
    if (!conversao) return notFound();

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
      FROM alissonerp.tarefas WHERE id = ${conversao.tarefa_aprovacao_id} LIMIT 1
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

  // ── Conversão de SKU ──
  const [conv] = await sql`
    SELECT cs.*, lo.nome AS local_origem_nome, ld.nome AS local_destino_nome,
           p_orig.nome AS sku_origem_nome, p_orig.sku AS sku_origem_cod,
           p_dest.nome AS sku_destino_nome, p_dest.sku AS sku_destino_cod,
           u_aprov.nome AS aprovado_por_nome,
           u_recus.nome AS recusado_por_nome,
           u_criador.nome AS criado_por_nome,
           os.numero_ordem AS servico_numero,
           os.status::text AS servico_status
    FROM alissonerp.conversoes_sku cs
    LEFT JOIN alissonerp.locais_estoque lo ON lo.id = cs.local_origem_id
    LEFT JOIN alissonerp.locais_estoque ld ON ld.id = cs.local_destino_id
    LEFT JOIN public.produtos p_orig ON p_orig.id_produto = cs.sku_origem_id
    LEFT JOIN public.produtos p_dest ON p_dest.id_produto = cs.sku_destino_id
    LEFT JOIN alissonerp.usuarios u_aprov ON u_aprov.id = cs.aprovado_por
    LEFT JOIN alissonerp.usuarios u_recus ON u_recus.id = cs.recusado_por
    LEFT JOIN alissonerp.usuarios u_criador ON u_criador.id = cs.created_by
    LEFT JOIN alissonerp.ordens os ON os.id = cs.ordem_servico_id
    WHERE cs.ordem_id = ${ordemId} LIMIT 1
  `;
  if (!conv) return notFound();

  if (conv.foto_abertura) conv.foto_abertura = getPublicUrl("conversao-fotos", conv.foto_abertura);
  if (conv.foto_recusa)   conv.foto_recusa   = getPublicUrl("conversao-fotos", conv.foto_recusa);
  if (conv.foto_balanca_final) conv.foto_balanca_final = getPublicUrl("conversao-fotos", conv.foto_balanca_final);
  if (conv.foto_sobra)   conv.foto_sobra   = getPublicUrl("conversao-fotos", conv.foto_sobra);

  const [tarefa] = await sql`
    SELECT id, status::text, prioridade::text
    FROM alissonerp.tarefas WHERE id = ${conv.tarefa_aprovacao_id} LIMIT 1
  `;

  return (
    <ConversaoSkuDetalheClient
      ordem={ordem}
      conversao={conv}
      tarefa={tarefa ?? null}
      userRole={userRole}
      userNome={userNome}
    />
  );
}
