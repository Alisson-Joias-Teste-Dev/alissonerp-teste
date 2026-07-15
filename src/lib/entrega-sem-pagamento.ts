import sql from "@/lib/db";
import { criarNotificacao } from "@/lib/notificacoes";
import { resolverAprovadores } from "@/lib/aprovacoes";

export const ENTREGA_SEM_PAGAMENTO_TIPO = "entrega_sem_pagamento_total";

const EPS = 0.01;
// O client transacional do pacote postgres nao expõe call signature adequada
// para o TypeScript neste projeto; as rotas existentes usam o mesmo padrão.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbSql = any;

interface TotaisEntregaSemPagamento {
  venda_id: number;
  numero_venda: string | null;
  cliente_id: number | null;
  cliente_nome: string | null;
  data_entrega: string | null;
  total_venda: number;
  valor_confirmado: number;
  valor_a_receber_pagamento: number;
  valor_a_receber_conta: number;
  valor_aberto: number;
  qtd_pagamentos_pendentes: number;
}

function money(v: unknown): number {
  return Math.round(Number(v ?? 0) * 100) / 100;
}

async function calcularTotais(vendaId: number, db: DbSql = sql): Promise<TotaisEntregaSemPagamento> {
  const [row] = await db`
    SELECT
      v.id AS venda_id,
      v.numero_venda,
      v.cliente_id,
      c.nome AS cliente_nome,
      v.data_entrega,
      v.total_venda::numeric AS total_venda,
      COALESCE(SUM(p.valor) FILTER (WHERE p.status = 'confirmado' AND p.data_confirmacao IS NOT NULL), 0)::numeric AS valor_confirmado,
      COALESCE(SUM(p.valor) FILTER (WHERE p.forma = 'A Receber' AND p.status = 'pendente'), 0)::numeric AS valor_a_receber_pagamento,
      (
        SELECT COALESCE(SUM(cr.valor), 0)::numeric
        FROM alissonerp.contas_receber cr
        WHERE cr.venda_erp_id = v.id
          AND cr.situacao = 'pendente'
          AND cr.categoria = 'venda'
      ) AS valor_a_receber_conta,
      COUNT(p.id) FILTER (WHERE p.status = 'pendente')::int AS qtd_pagamentos_pendentes
    FROM alissonerp.vendas_erp v
    LEFT JOIN public.contatos c ON c.id_contato = v.cliente_id
    LEFT JOIN alissonerp.pagamentos_venda p ON p.venda_id = v.id
    WHERE v.id = ${vendaId}
    GROUP BY v.id, c.nome
  `;
  if (!row) throw new Error(`Venda ${vendaId} nao encontrada`);

  const totalVenda = money(row.total_venda);
  const confirmado = money(row.valor_confirmado);
  return {
    venda_id: Number(row.venda_id),
    numero_venda: row.numero_venda ?? null,
    cliente_id: row.cliente_id != null ? Number(row.cliente_id) : null,
    cliente_nome: row.cliente_nome ?? null,
    data_entrega: row.data_entrega ?? null,
    total_venda: totalVenda,
    valor_confirmado: confirmado,
    valor_a_receber_pagamento: money(row.valor_a_receber_pagamento),
    valor_a_receber_conta: money(row.valor_a_receber_conta),
    valor_aberto: Math.max(0, money(totalVenda - confirmado)),
    qtd_pagamentos_pendentes: Number(row.qtd_pagamentos_pendentes ?? 0),
  };
}

export async function vendaTemPagamentoCompleto(vendaId: number): Promise<boolean> {
  const totais = await calcularTotais(vendaId);
  return totais.valor_aberto <= EPS;
}

/**
 * REGRA DE NEGOCIO (crediário ②): a entrega é "levou DEVENDO" quando há A Receber
 * pendente (crédito) — pagamento/forma 'A Receber' ou conta a receber pendente da venda.
 * Isso EXIGE aprovação do SEO antes de entregar.
 * NÃO conta 'Na Entrega' (pago na hora da entrega, motoboy na porta) nem outras
 * formas pendentes que são quitadas no ato — só o crédito de verdade.
 */
export async function vendaEntregaDevendo(vendaId: number): Promise<boolean> {
  const totais = await calcularTotais(vendaId);
  return totais.valor_a_receber_pagamento > EPS || totais.valor_a_receber_conta > EPS;
}

export async function vendaTemExcecaoEntregaAprovada(vendaId: number): Promise<boolean> {
  const [ex] = await sql`
    SELECT id
    FROM alissonerp.vendas_entrega_excecoes_pagamento
    WHERE venda_id = ${vendaId} AND status = 'aprovado'
    LIMIT 1
  `;
  return !!ex;
}

/**
 * REGRA DE NEGOCIO: entrega com pagamento incompleto exige aprovador
 * configurado e gera tarefa, mas NAO baixa estoque neste momento.
 * POR QUE: estoque comercial so sai quando a venda muda para `entregue`.
 * IMPACTO SE REMOVIDO: usuario poderia entregar sem pagamento e sem auditoria.
 */
export async function solicitarAprovacaoEntregaSemPagamento(
  vendaId: number,
  solicitanteId: string,
  motivo?: string,
): Promise<{ tarefaId: number; jaExistia: boolean }> {
  const totais = await calcularTotais(vendaId);
  if (totais.valor_aberto <= EPS) {
    throw new Error("Venda ja esta totalmente paga; nao precisa de aprovacao de entrega excepcional");
  }

  // REGRA DE NEGÓCIO: aprovador resolvido pela camada config-first
  // (aprovador_entrega_sem_pagamento) — mesma chave de antes, mesma mensagem de
  // erro quando não configurado; grava o 1º de aprovadores[] na coluna UUID única
  // (responsavel_id / aprovacoes_tarefa.aprovador_id), igual ao padrão do metal.
  const resolucao = await resolverAprovadores("entrega_sem_pagamento");
  if (resolucao.status === "nao_configurado") {
    throw new Error("Aprovador de entrega sem pagamento total nao configurado");
  }
  const aprovadorId = resolucao.aprovadores[0];

  const [existente] = await sql`
    SELECT tarefa_id
    FROM alissonerp.vendas_entrega_excecoes_pagamento
    WHERE venda_id = ${vendaId} AND status = 'pendente'
    LIMIT 1
  `;
  if (existente?.tarefa_id) {
    return { tarefaId: Number(existente.tarefa_id), jaExistia: true };
  }

  const motivoFinal = motivo?.trim() || "Solicitada entrega com pagamento incompleto.";
  const titulo = `Entrega sem pagamento total — Venda ${totais.numero_venda ?? vendaId}`;
  const descricao = [
    "Automacao de Estoque 2.0: liberar entrega antes da quitacao total.",
    `Total da venda: R$ ${totais.total_venda.toFixed(2)}`,
    `Valor confirmado: R$ ${totais.valor_confirmado.toFixed(2)}`,
    `A Receber ja existente: R$ ${Math.max(totais.valor_a_receber_pagamento, totais.valor_a_receber_conta).toFixed(2)}`,
    `Saldo aberto: R$ ${totais.valor_aberto.toFixed(2)}`,
    `Motivo: ${motivoFinal}`,
  ].join("\n");

  const [tarefa] = await sql`
    INSERT INTO alissonerp.tarefas
      (titulo, descricao, responsavel_id, criado_por, prioridade, status, venda_id, tags, tipo)
    VALUES (
      ${titulo}, ${descricao},
      ${aprovadorId}::uuid, ${solicitanteId}::uuid,
      'alta', 'aguardando_aprovacao', ${vendaId},
      ${sql.array(["aprov_entrega_sem_pagamento", "estoque_v2", "financeiro"])},
      ${ENTREGA_SEM_PAGAMENTO_TIPO}
    )
    RETURNING id
  `;

  await sql`
    INSERT INTO alissonerp.aprovacoes_tarefa (tarefa_id, solicitante_id, aprovador_id, status)
    VALUES (${tarefa.id}, ${solicitanteId}::uuid, ${aprovadorId}::uuid, 'pendente')
  `;

  await sql`
    INSERT INTO alissonerp.vendas_entrega_excecoes_pagamento
      (venda_id, tarefa_id, solicitante_id, status, total_venda,
       valor_confirmado_no_momento, valor_a_receber_existente_no_momento,
       valor_aberto_no_momento, motivo_solicitacao)
    VALUES (
      ${vendaId}, ${tarefa.id}, ${solicitanteId}::uuid, 'pendente', ${totais.total_venda},
      ${totais.valor_confirmado}, ${Math.max(totais.valor_a_receber_pagamento, totais.valor_a_receber_conta)},
      ${totais.valor_aberto}, ${motivoFinal}
    )
  `;

  await criarNotificacao({
    usuarioId: aprovadorId,
    tipo: "aprovacao",
    titulo,
    mensagem: descricao,
    remetenteId: solicitanteId,
    link: `/tarefas?abrir=${tarefa.id}`,
    vendaId,
  }).catch(() => {});

  return { tarefaId: Number(tarefa.id), jaExistia: false };
}

/**
 * REGRA DE NEGOCIO: antes da baixa real do estoque por `entregue`, o saldo
 * aberto precisa existir como A Receber exatamente uma vez.
 * POR QUE: evita duplicar credito quando a venda ja nasceu com A Receber, e
 * evita deixar entrega sem cobranca financeira rastreavel.
 * IMPACTO SE REMOVIDO: pode duplicar contas_receber/pagamentos_venda ou sumir
 * saldo aberto do crediario.
 */
async function garantirAReceberSemDuplicar(vendaId: number, userId: string, tx: DbSql): Promise<number> {
  await tx`SELECT id FROM alissonerp.vendas_erp WHERE id = ${vendaId} FOR UPDATE`;
  const totais = await calcularTotais(vendaId, tx);
  const saldoAberto = totais.valor_aberto;
  if (saldoAberto <= EPS) return 0;

  await tx`
    UPDATE alissonerp.pagamentos_venda
    SET status = 'cancelado', gateway_payload = COALESCE(gateway_payload, '{}'::jsonb) || ${JSON.stringify({ cancelado_por_entrega_sem_pagamento: true })}::jsonb
    WHERE venda_id = ${vendaId}
      AND status = 'pendente'
      AND forma != 'A Receber'
  `;

  const pagamentosAReceber = await tx`
    SELECT id, valor
    FROM alissonerp.pagamentos_venda
    WHERE venda_id = ${vendaId} AND forma = 'A Receber' AND status = 'pendente'
    ORDER BY id
    FOR UPDATE
  `;
  const totalPagAReceber = money(pagamentosAReceber.reduce((acc: number, p: Record<string, unknown>) => acc + Number(p.valor ?? 0), 0));
  const diffPag = money(saldoAberto - totalPagAReceber);
  if (diffPag > EPS) {
    if (pagamentosAReceber[0]?.id) {
      await tx`
        UPDATE alissonerp.pagamentos_venda
        SET valor = valor + ${diffPag}
        WHERE id = ${pagamentosAReceber[0].id}
      `;
    } else {
      await tx`
        INSERT INTO alissonerp.pagamentos_venda
          (venda_id, forma, valor, parcelas, status, source)
        VALUES (${vendaId}, 'A Receber', ${diffPag}, 1, 'pendente', 'a_receber')
      `;
    }
  }

  const contas = await tx`
    SELECT id, valor
    FROM alissonerp.contas_receber
    WHERE venda_erp_id = ${vendaId}
      AND situacao = 'pendente'
      AND categoria = 'venda'
    ORDER BY id
    FOR UPDATE
  `;
  const totalContas = money(contas.reduce((acc: number, cr: Record<string, unknown>) => acc + Number(cr.valor ?? 0), 0));
  const diffConta = money(saldoAberto - totalContas);
  if (diffConta > EPS) {
    if (contas[0]?.id) {
      await tx`
        UPDATE alissonerp.contas_receber
        SET valor = valor + ${diffConta},
            obs = CONCAT(COALESCE(obs, ''), ${`\n[Automacao Estoque 2.0] Complemento A Receber de R$ ${diffConta.toFixed(2)} para cobrir entrega sem pagamento total.`}),
            updated_at = NOW()
        WHERE id = ${contas[0].id}
      `;
    } else {
      await tx`
        INSERT INTO alissonerp.contas_receber
          (descricao, cliente_id, cliente_nome, venda_erp_id, valor, data_vencimento, situacao, categoria, obs, created_by)
        VALUES (
          ${`A Receber — Entrega sem pagamento total Venda ${totais.numero_venda ?? vendaId}`},
          ${totais.cliente_id}, ${totais.cliente_nome}, ${vendaId}, ${diffConta},
          ${totais.data_entrega ?? null}, 'pendente', 'venda',
          ${`Automacao Estoque 2.0: saldo aberto gerado antes da entrega excepcional.`},
          ${userId}::uuid
        )
      `;
    }
  }

  return saldoAberto;
}

export async function processarAprovacaoEntregaSemPagamento(
  tarefaId: number,
  aprovadorId: string,
  decisao: "aprovado" | "rejeitado",
  motivo?: string,
): Promise<{ ok: true; decisao: "aprovado" | "rejeitado"; venda_id: number; saldo_aberto?: number }> {
  const [ex] = await sql`
    SELECT id, venda_id, status
    FROM alissonerp.vendas_entrega_excecoes_pagamento
    WHERE tarefa_id = ${tarefaId}
    LIMIT 1
  `;
  if (!ex) throw new Error("Excecao de entrega sem pagamento nao encontrada");
  if (ex.status !== "pendente") {
    return { ok: true, decisao: ex.status, venda_id: Number(ex.venda_id) };
  }

  if (decisao === "rejeitado") {
    await sql`
      UPDATE alissonerp.vendas_entrega_excecoes_pagamento
      SET status = 'rejeitado', aprovador_id = ${aprovadorId}::uuid,
          motivo_decisao = ${motivo ?? null}, respondido_em = NOW(), updated_at = NOW()
      WHERE id = ${ex.id}
    `;
    return { ok: true, decisao, venda_id: Number(ex.venda_id) };
  }

  let saldoAberto = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await sql.begin(async (tx: any) => {
    // Garante que o saldo aberto exista como A Receber/conta a receber exatamente
    // uma vez (cobrança rastreável) — idempotente.
    saldoAberto = await garantirAReceberSemDuplicar(Number(ex.venda_id), aprovadorId, tx);
    await tx`
      UPDATE alissonerp.vendas_entrega_excecoes_pagamento
      SET status = 'aprovado', aprovador_id = ${aprovadorId}::uuid,
          motivo_decisao = ${motivo ?? null}, respondido_em = NOW(), updated_at = NOW()
      WHERE id = ${ex.id}
    `;
    // MODEL A (Jonathan 21/06): a aprovação só LIBERA — NÃO marca a venda como
    // 'entregue'. A consultora faz a entrega normal depois (motoboy/retirada com
    // código). O `vendaTemExcecaoEntregaAprovada` é o que destrava o criarEntrega.
  });

  return { ok: true, decisao, venda_id: Number(ex.venda_id), saldo_aberto: saldoAberto };
}
