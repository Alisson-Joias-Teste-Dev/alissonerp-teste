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
//
// BLOCO 5 (jul/2026) — `estoquista_loja` entrou aqui. O papel já podia CRIAR
// frete avulso direto desde o BLOCO 3 (`podeCriarFreteAvulsoDireto`), mas não
// tinha CAMINHO até a tela (403 neste gate — achado registrado em
// docs/regras-negocio/entregas.md §8, resolvido agora). PEDIDO DO JONATHAN:
// "o usuário do estoque tenha acesso às entregas avulsas... que toda entrega
// chegue pra ele acompanhar". DECISÃO (mais simples e reversível, tomada sem
// resposta a tempo do Jonathan — revisar se ele quiser recorte mais estrito):
// como não existe filtro por tipo/ownership pra este papel (só `isConsultora`
// filtra por vendedor, abaixo), `estoquista_loja` passa a ver TODAS as
// entregas (avulsas e normais), não só as avulsas. IMPACTO SE REMOVIDO: volta
// o 403 e o estoque perde visibilidade das corridas.
const ROLES_PERMITIDOS = ["desenvolvedor", "admin", "gerente_loja", "consultora", "estoquista_loja"];

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

/**
 * REGRA DE NEGÓCIO (reforma da tela Entregas, 21/07 — mockup aprovado pelo
 * Jonathan): a lista única com chips virou 3 ABAS, separando o que hoje se
 * misturava na mesma tabela:
 *   - `retirada`  -> forma_entrega='retirada' (colunas Motoboy/Frete e o
 *     card de saldo de frete não se aplicam, ficam ocultos).
 *   - `motoboy`   -> forma_entrega='motoboy' (colunas completas). `correios`
 *     é uma REGIÃO (entregas_venda.regiao), não uma forma_entrega — uma
 *     corrida "Correios" já é forma_entrega='motoboy' com regiao='correios',
 *     então cai nesta aba naturalmente (nenhum registro fica sem aba).
 *   - `pagamento` -> não lista entregas nenhuma; é o relatório/acerto de
 *     motoboy (PagamentoMotoboyPainel, reaproveitado do que já existia em
 *     PagarMotoboyModal). Não precisa dos dados desta página (busca os
 *     próprios via API client-side) — a SSR pula as duas queries.
 * IMPACTO SE REMOVIDO: as abas "Retirada"/"Motoboy" voltam a mostrar tudo
 * misturado; qualquer valor de aba diferente destes 3 cai no default
 * ('retirada') — nunca em SQL livre.
 */
export type AbaEntrega = "retirada" | "motoboy" | "pagamento";

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

  // REGRA DE NEGÓCIO (migration 353 — REVERTIDO na virada V2): o portão
  // especial para o liberador de frete avulso (aba "Solicitações") foi
  // removido junto com a aba — volta a ser role-only. A V3 recria o acesso
  // à solicitação/decisão de outra forma (tarefa, não uma aba própria aqui).
  if (!usuario || !ROLES_PERMITIDOS.includes(usuario.role as string)) {
    redirect("/");
  }

  // ── Parâmetros de URL ─────────────────────────────────────────────────────
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  // REGRA DE NEGÓCIO (reforma da tela Entregas, 21/07 — mockup aprovado):
  // paginação de 10 por página (era 50) — rodapé "1–10 de N" com navegação,
  // sem rolagem infinita. IMPACTO SE ALTERADO: recarregar() em
  // EntregasVendaClient.tsx usa este mesmo valor via prop `pageSize` — mudar
  // aqui sem mudar lá desalinha a paginação client-side.
  const limit = 10;
  const offset = (page - 1) * limit;
  const situacao = typeof params.situacao === "string" ? params.situacao : "";
  const busca = typeof params.busca === "string" ? params.busca : "";
  const dataInicio = typeof params.data_inicio === "string" ? params.data_inicio : "";
  const dataFim = typeof params.data_fim === "string" ? params.data_fim : "";
  // REGRA DE NEGÓCIO (reforma da tela Entregas — 3 abas, ver AbaEntrega
  // acima): valor inválido/ausente cai no default 'retirada'. Nunca usado em
  // SQL livre — só decide qual filtro fixo de forma_entrega aplicar.
  const abaParam = typeof params.aba === "string" ? params.aba : "";
  const aba: AbaEntrega = (["retirada", "motoboy", "pagamento"] as const).includes(abaParam as AbaEntrega)
    ? (abaParam as AbaEntrega)
    : "retirada";

  const isConsultora = usuario.role === "consultora";
  const vendedorId = usuario.vendedor_id as number | null;

  // ── Filtros ────────────────────────────────────────────────────────────────
  // REGRA DE NEGÓCIO: consultora vê apenas entregas de vendas próprias.
  // IMPACTO SE REMOVIDO: vazamento de dados entre consultoras.
  const whereVendedor = isConsultora && vendedorId
    ? sql`AND ve.vendedor_id = ${vendedorId}`
    : sql``;

  // REGRA DE NEGÓCIO (frete avulso): a lista operacional NÃO mostra
  // 'cancelada' nem 'solicitada' por padrão — 'solicitada' é a etapa
  // "aguardando liberação" do avulso e não é uma entrega operável ainda
  // (fix do vazamento SSR mantido da virada V2 — mesmo sem a aba própria de
  // solicitações, o default continua excluindo os dois).
  // IMPACTO SE REMOVIDO: solicitações pendentes de liberação vazam para a
  // lista principal e inflam a contagem "total" para todo mundo.
  const whereSituacao = situacao
    ? sql`AND ev.situacao = ${situacao}`
    : sql`AND ev.situacao NOT IN ('cancelada', 'solicitada')`;

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

  // REGRA DE NEGÓCIO (reforma da tela Entregas — 3 abas): 'retirada' e
  // 'motoboy' filtram por forma_entrega igual ao nome da aba; 'pagamento'
  // não lista entregas (ver AbaEntrega acima) — as duas queries abaixo nem
  // rodam nesse caso.
  // IMPACTO SE REMOVIDO: as abas voltam a mostrar retirada+motoboy misturados.
  const whereFormaEntrega = aba !== "pagamento"
    ? sql`AND ev.forma_entrega = ${aba}`
    : sql``;

  // ── Queries em paralelo: dados + contagens ─────────────────────────────────
  // REGRA DE NEGÓCIO: duas queries separadas em Promise.all para performance.
  // A contagem usa a mesma condição WHERE para consistência com os dados listados.
  // Pulam inteiramente na aba 'pagamento' — ela não lista entregas (é o
  // relatório de acerto de motoboy, dados próprios via PagamentoMotoboyPainel).
  // IMPACTO SE ALTERADO: se as condições divergirem, totalPages fica errado.
  const [itemsResult, countResult]: [Record<string, unknown>[], Record<string, unknown>[]] = aba === "pagamento"
    ? [[], [{ total: 0, pendente: 0, em_andamento: 0, confirmada: 0 }]]
    : await Promise.all([
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
        ${whereFormaEntrega}
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
        ${whereFormaEntrega}
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
      aba={aba}
    />
  );
}
