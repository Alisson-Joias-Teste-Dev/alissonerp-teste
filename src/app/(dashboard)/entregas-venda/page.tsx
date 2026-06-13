/**
 * page.tsx — SSR da tela de listagem de entregas de venda.
 *
 * REGRA DE NEGÓCIO: pré-carrega a primeira página de entregas do banco
 * (ou a página solicitada via searchParams) junto com as contagens para
 * os cards de stats. Aplica filtro de vendedor para consultoras.
 *
 * O QUE: busca dados de entregas_venda, vendas_erp, motoboys e contatos
 * com paginação server-side. Passa tudo serializado para o client component.
 *
 * IMPACTO SE ALTERADO: a query precisa manter compatibilidade com a UI
 * (colunas esperadas pelo EntregasVendaClient) e com a view que alimenta
 * o módulo de entregas. Alterar JOINs ou colunas quebra a listagem.
 *
 * Tabelas envolvidas:
 *   - alissonerp.entregas_venda
 *   - alissonerp.vendas_erp
 *   - alissonerp.motoboys
 *   - public.contatos
 */

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import sql from "@/lib/db";
import EntregasVendaClient from "./EntregasVendaClient";

export const dynamic = "force-dynamic";

// REGRA DE NEGÓCIO: papéis que podem acessar a listagem de entregas.
// "consultora" tem visibilidade restrita (apenas entregas de suas vendas).
const ROLES_PERMITIDOS = ["desenvolvedor", "admin", "gerente_loja", "consultora"];

// ── Tipos ──────────────────────────────────────────────────────────────────────

/** Item de entrega serializado para o client */
export interface EntregaItem {
  id: number;
  venda_id: number | null;
  codigo_entrega: string;
  tipo: string;
  situacao: string;
  forma_entrega: string;
  regiao: string | null;
  motoboy_id: string | null;
  frete_cobrado: number;
  frete_motoboy: number;
  aprovacao_frete_necessaria: boolean;
  data_saida: string | null;
  data_retirada: string | null;
  data_entrega_realizada: string | null;
  data_entrega_prevista: string | null;
  created_at: string;
  numero_venda: string | null;
  total_venda: number | null;
  cliente_nome: string | null;
  motoboy_nome: string | null;
  is_avulso: boolean;
  descricao_avulso: string | null;
}

/** Contagens para os cards de stats */
export interface ContagensEntregas {
  total: number;
  pendente: number;
  em_andamento: number;
  confirmada: number;
}

// ── Props da página (searchParams do Next.js) ─────────────────────────────────
interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

// ── Página SSR ─────────────────────────────────────────────────────────────────

export default async function EntregasVendaPage({ searchParams }: PageProps) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [usuario] = await sql`
    SELECT role, vendedor_id FROM alissonerp.usuarios
    WHERE id = ${user.id}::uuid LIMIT 1
  `;

  if (!usuario || !ROLES_PERMITIDOS.includes(usuario.role as string)) {
    redirect("/");
  }

  // ── Parâmetros de URL ─────────────────────────────────────────────────────
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const limit = 50;
  const offset = (page - 1) * limit;
  const situacao = typeof params.situacao === "string" ? params.situacao : "";
  const busca = typeof params.busca === "string" ? params.busca : "";
  const dataInicio = typeof params.data_inicio === "string" ? params.data_inicio : "";
  const dataFim = typeof params.data_fim === "string" ? params.data_fim : "";

  const isConsultora = usuario.role === "consultora";
  const vendedorId = usuario.vendedor_id as number | null;

  // ── Filtros ────────────────────────────────────────────────────────────────
  // REGRA DE NEGÓCIO: consultora vê apenas entregas de vendas próprias.
  // IMPACTO SE REMOVIDO: vazamento de dados entre consultoras.
  const whereVendedor = isConsultora && vendedorId
    ? sql`AND ve.vendedor_id = ${vendedorId}`
    : sql``;

  const whereSituacao = situacao
    ? sql`AND ev.situacao = ${situacao}`
    : sql``;

  // Filtro de busca: código de entrega ou número da venda (case-insensitive)
  const whereBusca = busca
    ? sql`AND (ev.codigo_entrega ILIKE ${"%" + busca + "%"} OR ve.numero_venda ILIKE ${"%" + busca + "%"})`
    : sql``;

  // REGRA DE NEGÓCIO: filtro de data por período. data_inicio filtra por
  // created_at >= inicio. data_fim filtra por created_at < fim+1dia (inclui o dia todo).
  const whereDataInicio = dataInicio
    ? sql`AND ev.created_at >= ${dataInicio}::date`
    : sql``;

  const whereDataFim = dataFim
    ? sql`AND ev.created_at < (${dataFim}::date + interval '1 day')`
    : sql``;

  // ── Queries em paralelo: dados + contagens ─────────────────────────────────
  // REGRA DE NEGÓCIO: duas queries separadas em Promise.all para performance.
  // A contagem usa a mesma condição WHERE para consistência com os dados listados.
  // IMPACTO SE ALTERADO: se as condições divergirem, totalPages fica errado.
  const [itemsResult, countResult] = await Promise.all([
    sql`
      SELECT
        ev.id,
        ev.venda_id,
        ev.codigo_entrega,
        ev.tipo,
        ev.situacao,
        ev.forma_entrega,
        ev.regiao,
        ev.motoboy_id,
        ev.frete_cobrado,
        ev.frete_motoboy,
        ev.aprovacao_frete_necessaria,
        ev.data_saida,
        ev.data_retirada,
        ev.data_entrega_realizada,
        ev.data_entrega_prevista,
        ev.created_at,
        ve.numero_venda,
        ve.total_venda,
        COALESCE(c.nome, ca.nome) AS cliente_nome,
        mb.nome AS motoboy_nome,
        ev.is_avulso,
        ev.descricao_avulso
      FROM alissonerp.entregas_venda ev
      LEFT JOIN alissonerp.vendas_erp ve ON ve.id = ev.venda_id
      LEFT JOIN public.contatos c ON c.id_contato = ve.cliente_id
      LEFT JOIN public.contatos ca ON ca.id_contato = ev.contato_id
      LEFT JOIN alissonerp.motoboys mb ON mb.user_id = ev.motoboy_id
      WHERE 1=1
        ${whereVendedor}
        ${whereSituacao}
        ${whereBusca}
        ${whereDataInicio}
        ${whereDataFim}
      ORDER BY ev.created_at DESC, ev.id DESC
      LIMIT ${limit} OFFSET ${offset}
    `,
    sql`
      SELECT
        COUNT(*)::integer                                       AS total,
        COUNT(*) FILTER (WHERE ev.situacao = 'pendente')::integer AS pendente,
        COUNT(*) FILTER (WHERE ev.data_saida IS NOT NULL
                         AND ev.data_entrega_realizada IS NULL
                         AND ev.situacao != 'cancelada')::integer  AS em_andamento,
        COUNT(*) FILTER (WHERE ev.situacao = 'confirmada')::integer AS confirmada
      FROM alissonerp.entregas_venda ev
      LEFT JOIN alissonerp.vendas_erp ve ON ve.id = ev.venda_id
      WHERE 1=1
        ${whereVendedor}
        ${whereSituacao}
        ${whereBusca}
        ${whereDataInicio}
        ${whereDataFim}
    `,
  ]);

  const contagens: ContagensEntregas = {
    total:        Number(countResult[0].total),
    pendente:     Number(countResult[0].pendente ?? 0),
    em_andamento: Number(countResult[0].em_andamento ?? 0),
    confirmada:   Number(countResult[0].confirmada ?? 0),
  };

  const totalItems = contagens.total;
  const totalPages = Math.ceil(totalItems / limit);

  // ── Serialização ───────────────────────────────────────────────────────────
  // REGRA DE NEGÓCIO: campos NUMERIC do PostgreSQL vêm como string.
  // Converter com Number() para o frontend receber números nativos.
  // IMPACTO SE REMOVIDO: frontend recebe strings e formatações/cálculos quebram.
  const items: EntregaItem[] = itemsResult.map((r: Record<string, unknown>) => ({
    id:                          Number(r.id),
    venda_id:                    r.venda_id != null ? Number(r.venda_id) : null,
    codigo_entrega:              String(r.codigo_entrega ?? ""),
    tipo:                        String(r.tipo ?? ""),
    situacao:                    String(r.situacao ?? ""),
    forma_entrega:               String(r.forma_entrega ?? ""),
    regiao:                      r.regiao ? String(r.regiao) : null,
    motoboy_id:                  r.motoboy_id ? String(r.motoboy_id) : null,
    frete_cobrado:               Number(r.frete_cobrado ?? 0),
    frete_motoboy:               Number(r.frete_motoboy ?? 0),
    aprovacao_frete_necessaria:  Boolean(r.aprovacao_frete_necessaria),
    data_saida:                  r.data_saida ? new Date(String(r.data_saida)).toISOString() : null,
    data_retirada:               r.data_retirada ? new Date(String(r.data_retirada)).toISOString() : null,
    data_entrega_realizada:      r.data_entrega_realizada ? new Date(String(r.data_entrega_realizada)).toISOString() : null,
    data_entrega_prevista:       r.data_entrega_prevista ? new Date(String(r.data_entrega_prevista)).toISOString() : null,
    created_at:                  r.created_at ? new Date(String(r.created_at)).toISOString() : "",
    numero_venda:                r.numero_venda ? String(r.numero_venda) : null,
    total_venda:                 r.total_venda ? Number(r.total_venda) : null,
    cliente_nome:                r.cliente_nome ? String(r.cliente_nome) : null,
    motoboy_nome:                r.motoboy_nome ? String(r.motoboy_nome) : null,
    is_avulso:                   Boolean(r.is_avulso),
    descricao_avulso:            r.descricao_avulso ? String(r.descricao_avulso) : null,
  }));

  return (
    <EntregasVendaClient
      items={items}
      contagens={contagens}
      currentPage={page}
      totalPages={totalPages}
      totalItems={totalItems}
      pageSize={limit}
      situacaoFiltro={situacao}
      buscaFiltro={busca}
      dataInicioFiltro={dataInicio}
      dataFimFiltro={dataFim}
      userRole={usuario.role as string}
    />
  );
}
