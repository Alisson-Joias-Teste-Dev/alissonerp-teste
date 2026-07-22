/**
 * pagamento-motoboy.ts — lógica COMPARTILHADA do pagamento em lote do
 * motoboy (`alissonerp.pagamentos_motoboy` / `pagamentos_motoboy_itens`).
 *
 * O QUE: extrai de `POST /api/entregas-venda/motoboy/pagar` a transação que
 * de fato CRIA o pagamento (INSERT do cabeçalho + itens + conta a pagar),
 * para que a reforma da aba "Pagamento do motoboy" (21/07/2026 — relatórios
 * persistidos, ver migration 358 e docs/regras-negocio/entregas.md §12.8)
 * possa "Confirmar pagamento" a partir de um relatório salvo SEM duplicar
 * essa lógica — é o mesmo pedido explícito da task: "reusar o fluxo que já
 * persiste hoje... NÃO crie um segundo caminho de pagamento".
 *
 * Dois chamadores:
 *   1. `motoboy/pagar/route.ts` (inalterado no comportamento — só passou a
 *      chamar esta função em vez de ter o INSERT inline).
 *   2. `motoboy/relatorio-pagamento/[id]/confirmar/route.ts` (novo) — chama
 *      dentro da MESMA transação em que também atualiza o relatório
 *      (status -> 'pago'), garantindo atomicidade entre "criar o pagamento"
 *      e "travar o relatório".
 *
 * IMPACTO SE ALTERADO: mexer aqui muda o pagamento nos DOIS pontos de
 * entrada. Remover a validação de unicidade permite pagamento duplicado;
 * remover a validação de motoboy_id permite pagar entrega de outro motoboy.
 */
import type sql from "@/lib/db";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbTx = any;

/** Papéis que podem confirmar pagamento do motoboy — mesma lista em toda a família de rotas `motoboy/*`. */
export const ROLES_PAGAMENTO_MOTOBOY = ["desenvolvedor", "admin", "gerente_loja"];

export interface EntregaParaPagar {
  id: number;
  frete_motoboy: number;
  codigo_entrega: string;
}

export interface CriarPagamentoMotoboyInput {
  motoboyId: string;
  motoboyNome: string;
  entregas: EntregaParaPagar[];
  observacoes?: string | null;
  dataVencimento: string;
  userId: string;
}

export interface CriarPagamentoMotoboyResultado {
  pagamentoId: number;
  valorTotal: number;
}

/**
 * Valida (dentro da MESMA transação `tx`) que as entregas pedidas ainda
 * pertencem ao motoboy, estão confirmadas e NÃO foram pagas — mesma condição
 * usada por `motoboy/relatorio-pagamento` (`foi_pago`) e `motoboy/minhas`.
 * Retorna só as entregas que passam (filtro defensivo — quem chama já deve
 * ter filtrado antes, isto é a ÚLTIMA barreira antes do INSERT).
 */
export async function buscarEntregasValidasParaPagar(
  tx: DbTx,
  motoboyId: string,
  entregaIds: number[],
): Promise<EntregaParaPagar[]> {
  const rows: Record<string, unknown>[] = await tx`
    SELECT ev.id, ev.frete_motoboy, ev.codigo_entrega, ev.situacao
    FROM alissonerp.entregas_venda ev
    WHERE ev.id = ANY(${entregaIds})
      AND ev.motoboy_id = ${motoboyId}::uuid
      AND ev.situacao = 'confirmada'
      AND NOT EXISTS (
        SELECT 1 FROM alissonerp.pagamentos_motoboy_itens pmi
        WHERE pmi.entrega_id = ev.id
      )
  `;
  return rows.map((r) => ({
    id: Number(r.id),
    frete_motoboy: Number(r.frete_motoboy ?? 0),
    codigo_entrega: String(r.codigo_entrega ?? ""),
  }));
}

/**
 * Cria o pagamento em lote de fato — cabeçalho `pagamentos_motoboy`, itens
 * `pagamentos_motoboy_itens` (1 por entrega) e a conta a pagar
 * correspondente no financeiro. DEVE rodar dentro de uma transação (`tx` já
 * aberta pelo chamador — `sql.begin`) para que o commit/rollback seja
 * atômico com qualquer outra coisa que o chamador grave na mesma transação
 * (ex.: o UPDATE do relatório em `confirmar/route.ts`).
 *
 * REGRA DE NEGÓCIO: `entregas` já deve vir filtrada (ver
 * `buscarEntregasValidasParaPagar`) — esta função não valida de novo, só
 * grava. Se `entregas` vier vazia, o INSERT de `pagamentos_motoboy` falha no
 * CHECK `valor_total > 0` (proteção adicional, mas o chamador deve checar
 * `entregas.length === 0` ANTES e devolver 400 com mensagem clara).
 */
export async function criarPagamentoMotoboyTx(
  tx: DbTx,
  input: CriarPagamentoMotoboyInput,
): Promise<CriarPagamentoMotoboyResultado> {
  const { motoboyId, motoboyNome, entregas, observacoes, dataVencimento, userId } = input;

  const valorTotal = entregas.reduce((sum, e) => sum + e.frete_motoboy, 0);

  const [pagamento] = await tx`
    INSERT INTO alissonerp.pagamentos_motoboy
      (motoboy_id, valor_total, observacoes, created_by)
    VALUES
      (${motoboyId}::uuid, ${valorTotal}, ${observacoes ?? null}, ${userId}::uuid)
    RETURNING id
  `;

  for (const e of entregas) {
    await tx`
      INSERT INTO alissonerp.pagamentos_motoboy_itens
        (pagamento_id, entrega_id, frete_motoboy)
      VALUES
        (${Number(pagamento.id)}, ${e.id}, ${e.frete_motoboy})
    `;
  }

  // REGRA DE NEGÓCIO: ao pagar motoboy, criar conta a pagar no financeiro.
  // Isso faz o pagamento aparecer em Contas a Pagar e no fluxo de caixa.
  // Categoria 'motoboy' permite filtrar/fechar por tipo de despesa.
  const codigosStr = entregas.map((e) => e.codigo_entrega).join(", ");
  await tx`
    INSERT INTO alissonerp.contas_pagar
      (descricao, valor, data_vencimento, situacao, categoria, obs, created_by)
    VALUES
      (
        ${`Pagamento ${motoboyNome} — ${entregas.length} entregas`},
        ${valorTotal},
        ${dataVencimento}::date,
        'pendente',
        'motoboy',
        ${`Entregas: ${codigosStr}. ${observacoes ?? ""}`},
        ${userId}::uuid
      )
  `;

  return { pagamentoId: Number(pagamento.id), valorTotal };
}

/** Data de vencimento padrão (hoje + 7 dias) quando não informada — mesmo default de sempre. */
export function vencimentoPadrao(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
}

// Tipo do cliente sql (postgres.js) — usado só para tipar parâmetros que
// recebem o client já importado pelo chamador (route.ts), nunca instanciado
// aqui (nunca abrir conexão própria fora de src/lib/db.ts).
export type SqlClient = typeof sql;

/**
 * PAGE_SIZE_RELATORIOS_PAGAMENTO_MOTOBOY — paginação da LISTA de relatórios
 * na aba "Pagamento do motoboy" (mockup aprovado, 21/07/2026): 10 por
 * página, mesmo padrão já usado na listagem de entregas (page.tsx).
 */
export const PAGE_SIZE_RELATORIOS_PAGAMENTO_MOTOBOY = 10;

export interface RelatorioPagamentoMotoboyListItem {
  id: number;
  motoboy_id: string;
  motoboy_nome: string;
  data_inicio: string;
  data_fim: string;
  status: "aguardando" | "pago";
  total_sugerido: number;
  quantidade_corridas: number;
  created_at: string;
  pago_em: string | null;
}

/**
 * Lista PAGINADA dos relatórios de pagamento já criados (aguardando e pagos
 * — NUNCA somem, ver critério de aceite da task). Usada tanto pelo SSR
 * (`page.tsx`, primeira carga + navegação de página via Paginacao/Link)
 * quanto pela rota `GET /motoboy/relatorio-pagamento` (refresh client-side
 * depois de criar/confirmar um relatório, sem navegação de página) — MESMA
 * função nos dois lugares, evita duas cópias da mesma consulta.
 *
 * SEM N+1: quantidade_corridas vem de um LEFT JOIN + COUNT agregado na
 * própria consulta paginada, não uma query por relatório.
 */
export async function listarRelatoriosPagamentoMotoboy(
  db: SqlClient,
  { page, limit }: { page: number; limit: number },
): Promise<{ items: RelatorioPagamentoMotoboyListItem[]; total: number }> {
  const offset = (page - 1) * limit;

  const [rows, countRows]: [Record<string, unknown>[], Record<string, unknown>[]] = await Promise.all([
    db`
      SELECT
        r.id, r.motoboy_id, r.data_inicio, r.data_fim, r.status,
        r.total_sugerido, r.created_at, r.pago_em,
        mb.nome AS motoboy_nome,
        COUNT(i.id)::integer AS quantidade_corridas
      FROM alissonerp.relatorios_pagamento_motoboy r
      LEFT JOIN alissonerp.motoboys mb ON mb.user_id = r.motoboy_id
      LEFT JOIN alissonerp.relatorios_pagamento_motoboy_itens i ON i.relatorio_id = r.id
      GROUP BY r.id, mb.nome
      ORDER BY r.created_at DESC, r.id DESC
      LIMIT ${limit} OFFSET ${offset}
    `,
    db`SELECT COUNT(*)::integer AS total FROM alissonerp.relatorios_pagamento_motoboy`,
  ]);

  const items: RelatorioPagamentoMotoboyListItem[] = rows.map((r) => ({
    id: Number(r.id),
    motoboy_id: String(r.motoboy_id),
    motoboy_nome: (r.motoboy_nome as string | null) ?? "—",
    // O driver devolve colunas DATE/TIMESTAMP como objeto Date; String(date) geraria
    // "Wed Jul 21 2026 ..." e quebraria o fmtData da tela. Normaliza para ISO
    // (mesmo padrão de entregas-venda/page.tsx). DATE só a parte da data.
    data_inicio: new Date(String(r.data_inicio)).toISOString().slice(0, 10),
    data_fim: new Date(String(r.data_fim)).toISOString().slice(0, 10),
    status: r.status as "aguardando" | "pago",
    total_sugerido: Number(r.total_sugerido ?? 0),
    quantidade_corridas: Number(r.quantidade_corridas ?? 0),
    created_at: r.created_at ? new Date(String(r.created_at)).toISOString() : "",
    pago_em: r.pago_em ? new Date(String(r.pago_em)).toISOString() : null,
  }));

  return { items, total: Number(countRows[0]?.total ?? 0) };
}
