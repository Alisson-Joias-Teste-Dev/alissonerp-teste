// ═══════════════════════════════════════════════════════════════════════════
// Devolucoes — criacao, aprovacao, inspecao e conclusao
//
// Fluxo: rascunho → (solicitar_aprovacao) → aguardando_aprovacao
//        → (aprovacao via tarefa) → aprovado/rejeitado
//        → (inspecionar todos itens) → concluir → concluido
//
// Conclusao dispara:
//   - vale_troca → gerarValeTroca
//   - reembolso_mp → estornarMP (best-effort)
//   - reembolso_manual → criarContaPagarReembolso
//   - Itens aprovado_retorno → entrada em movimentacoes_estoque_comercial
//   - Itens garantia → apenas marca (integracao com ordens eh separada)
//   - Itens reprovado_descarte → apenas registra
// ═══════════════════════════════════════════════════════════════════════════

import sql from "@/lib/db";
import { gerarValeTroca } from "@/lib/vale-troca";
import { estornarMP, criarContaPagarReembolso } from "@/lib/reembolso";
import { criarNotificacao } from "@/lib/notificacoes";
import { avaliarPrazoDevolucao } from "@/lib/prazo-devolucao";

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type TipoCompensacao = "vale_troca" | "reembolso_mp" | "reembolso_manual";
export type StatusDevolucao = "rascunho" | "aguardando_aprovacao" | "aprovado" | "rejeitado" | "concluido" | "cancelado";
export type CondicaoItem = "pendente" | "aprovado_retorno" | "reprovado_descarte" | "garantia";

export interface ItemDevolucaoInput {
  item_venda_id: number;
  quantidade: number;
}

export interface CriarDevolucaoOpts {
  tipo: "parcial" | "total";
  tipoCompensacao: TipoCompensacao;
  motivo?: string | null;
  foiEntregue: boolean;
  percentualRetencao: number;
}

export interface PatchDevolucao {
  motivo?: string | null;
  tipo?: "parcial" | "total";
  tipoCompensacao?: TipoCompensacao;
  foiEntregue?: boolean;
  percentualRetencao?: number;
}

export interface DevolucaoResult {
  id: number;
  numero: string;
}

export interface ConclusaoResult {
  ok: boolean;
  acoes: string[];
  vale_troca_id?: number;
  vale_troca_numero?: string;
  reembolso_id?: number;
  reembolso_status?: string;
  reembolso_erro?: string;
  conta_pagar_id?: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

// ═══════════════════════════════════════════════════════════════════════════
// recomputarTotais — calcula o valor a compensar (vale/reembolso) da devolucao.
//
// REGRA DE NEGOCIO (decisao Jonathan): o credito NUNCA pode passar do que o
//   cliente EFETIVAMENTE PAGOU. Por isso o valor das mercadorias devolvidas e
//   capado pela FRACAO PAGA da venda: credito_do_item = valor_item × (pago / total_venda).
//   Ex.: comprou 10k, pagou so 3k, devolve tudo -> vale = 3k (nao 10k).
//   - Guard de LEGADO: venda SEM nenhum registro em pagamentos_venda (vendas
//     migradas) -> fracao = 1 (comportamento antigo), para nao zerar o vale de
//     venda antiga ja paga.
//   - Denominador = total_venda (frete entra como nao-reembolsavel, a favor da empresa).
//   - Retencao % continua valendo, aplicada sobre a base proporcional.
//   - valor_retido fica = total − compensacao (reconcilia o display e embute a
//     parte nao paga + a retencao de politica).
// IMPACTO SE REMOVIDO: volta a gerar vale pelo valor cheio dos itens, podendo
//   creditar mais do que o cliente pagou (entrega com pagamento parcial).
// ═══════════════════════════════════════════════════════════════════════════
async function recomputarTotais(devolucaoId: number, txClient?: any): Promise<void> {
  const runner = txClient ?? sql;
  const [row] = await runner`
    SELECT
      COALESCE(SUM(valor_total), 0)      AS total,
      (SELECT percentual_retencao FROM alissonerp.devolucoes_venda WHERE id = ${devolucaoId}) AS pct
    FROM alissonerp.devolucoes_itens
    WHERE devolucao_id = ${devolucaoId}
  `;
  const total = parseFloat(row?.total ?? "0"); // valor das mercadorias devolvidas (preco pago por item × qtd)
  const pct = parseFloat(row?.pct ?? "0");

  // Quanto o cliente pagou da venda (e se ha pagamento rastreado).
  const [pg] = await runner`
    SELECT
      v.total_venda::numeric AS total_venda,
      COALESCE((SELECT SUM(p.valor) FROM alissonerp.pagamentos_venda p
                WHERE p.venda_id = v.id AND p.status = 'confirmado'), 0)::numeric AS pago,
      (SELECT COUNT(*) FROM alissonerp.pagamentos_venda p WHERE p.venda_id = v.id)::int AS n_pag
    FROM alissonerp.devolucoes_venda d
    JOIN alissonerp.vendas_erp v ON v.id = d.venda_id
    WHERE d.id = ${devolucaoId}
  `;
  const totalVenda = parseFloat(pg?.total_venda ?? "0");
  const pago = parseFloat(pg?.pago ?? "0");
  const nPag = Number(pg?.n_pag ?? 0);

  // Fracao paga: legado (sem pagamento rastreado) ou total_venda invalido -> 1.
  const fracao = nPag === 0 || totalVenda <= 0 ? 1 : Math.min(1, pago / totalVenda);

  const valorPagoNosItens = round2(total * fracao);            // teto = o que o cliente pagou nesses itens
  const retidoPolitica = round2((valorPagoNosItens * pct) / 100);
  const compensacao = round2(valorPagoNosItens - retidoPolitica);
  const retido = round2(total - compensacao);                  // reconcilia: total = retido + compensacao

  await runner`
    UPDATE alissonerp.devolucoes_venda
    SET valor_total_devolvido = ${total},
        valor_retido          = ${retido},
        valor_compensacao     = ${compensacao},
        updated_at            = now()
    WHERE id = ${devolucaoId}
  `;
}

// ═══════════════════════════════════════════════════════════════════════════
// criarDevolucao
// ═══════════════════════════════════════════════════════════════════════════
export async function criarDevolucao(
  vendaId: number,
  itens: ItemDevolucaoInput[],
  opts: CriarDevolucaoOpts,
  userId: string,
): Promise<DevolucaoResult> {
  if (!Array.isArray(itens) || itens.length === 0) {
    throw new Error("Informe ao menos um item para devolucao");
  }

  // Validar venda
  const [venda] = await sql`
    SELECT id FROM alissonerp.vendas_erp WHERE id = ${vendaId}
  `;
  if (!venda) throw new Error(`Venda ${vendaId} nao encontrada`);

  // Normalizar pct retencao — respeita 0..100; default: 30 se !entregue (loja fica com 30%, cliente recebe 70%), 0 se entregue
  let pct = Number(opts.percentualRetencao);
  if (!Number.isFinite(pct) || pct < 0) pct = opts.foiEntregue ? 0 : 30;
  if (pct > 100) pct = 100;

  return sql.begin(async (tx: any) => {
    // INSERT cabecalho com numero sequencial
    const [dev] = await tx`
      INSERT INTO alissonerp.devolucoes_venda (
        numero, venda_id, tipo, motivo, status, tipo_compensacao,
        percentual_retencao, foi_entregue, criado_por
      ) VALUES (
        'DV-' || LPAD(nextval('alissonerp.devolucoes_seq')::text, 5, '0'),
        ${vendaId},
        ${opts.tipo},
        ${opts.motivo ?? null},
        'rascunho',
        ${opts.tipoCompensacao},
        ${pct},
        ${opts.foiEntregue},
        ${userId}::uuid
      )
      RETURNING id, numero
    `;

    // INSERT itens
    for (const it of itens) {
      if (!it.item_venda_id || !it.quantidade || it.quantidade <= 0) {
        throw new Error("Cada item precisa de item_venda_id e quantidade > 0");
      }

      const [iv] = await tx`
        SELECT id, produto_id, preco_unitario, quantidade
        FROM alissonerp.itens_venda_erp
        WHERE id = ${it.item_venda_id} AND venda_id = ${vendaId}
      `;
      if (!iv) throw new Error(`Item ${it.item_venda_id} nao pertence a venda ${vendaId}`);
      if (it.quantidade > Number(iv.quantidade)) {
        throw new Error(`Quantidade ${it.quantidade} excede item #${it.item_venda_id}`);
      }

      const valorUnit = parseFloat(iv.preco_unitario);
      const valorTotal = round2(valorUnit * it.quantidade);

      await tx`
        INSERT INTO alissonerp.devolucoes_itens (
          devolucao_id, item_venda_id, produto_id, quantidade,
          valor_unitario, valor_total, condicao
        ) VALUES (
          ${dev.id}, ${it.item_venda_id}, ${iv.produto_id}, ${it.quantidade},
          ${valorUnit}, ${valorTotal}, 'pendente'
        )
      `;
    }

    // Recomputar totais
    await recomputarTotais(dev.id, tx);

    return { id: dev.id as number, numero: dev.numero as string };
  }) as Promise<DevolucaoResult>;
}

// ═══════════════════════════════════════════════════════════════════════════
// atualizarDevolucao — so em rascunho
// ═══════════════════════════════════════════════════════════════════════════
export async function atualizarDevolucao(
  id: number,
  patch: PatchDevolucao,
  _userId: string,
): Promise<void> {
  const [dev] = await sql`
    SELECT status FROM alissonerp.devolucoes_venda WHERE id = ${id}
  `;
  if (!dev) throw new Error("Devolucao nao encontrada");
  if (dev.status !== "rascunho") {
    throw new Error(`Devolucao nao editavel (status=${dev.status})`);
  }

  if (patch.motivo !== undefined) {
    await sql`UPDATE alissonerp.devolucoes_venda SET motivo = ${patch.motivo ?? null} WHERE id = ${id}`;
  }
  if (patch.tipo !== undefined) {
    if (patch.tipo !== "parcial" && patch.tipo !== "total") {
      throw new Error("tipo invalido");
    }
    await sql`UPDATE alissonerp.devolucoes_venda SET tipo = ${patch.tipo} WHERE id = ${id}`;
  }
  if (patch.tipoCompensacao !== undefined) {
    await sql`UPDATE alissonerp.devolucoes_venda SET tipo_compensacao = ${patch.tipoCompensacao} WHERE id = ${id}`;
  }
  if (patch.foiEntregue !== undefined) {
    await sql`UPDATE alissonerp.devolucoes_venda SET foi_entregue = ${patch.foiEntregue} WHERE id = ${id}`;
  }
  if (patch.percentualRetencao !== undefined) {
    let pct = Number(patch.percentualRetencao);
    if (!Number.isFinite(pct) || pct < 0) pct = 0;
    if (pct > 100) pct = 100;
    await sql`UPDATE alissonerp.devolucoes_venda SET percentual_retencao = ${pct} WHERE id = ${id}`;
  }

  await recomputarTotais(id);
}

// ═══════════════════════════════════════════════════════════════════════════
// solicitarAprovacaoDevolucao — cria tarefa + aprovacoes_tarefa + notificacao
// ═══════════════════════════════════════════════════════════════════════════
export async function solicitarAprovacaoDevolucao(
  id: number,
  userId: string,
): Promise<{ tarefa_id: number }> {
  const [dev] = await sql`
    SELECT d.id, d.numero, d.status, d.valor_total_devolvido, d.valor_compensacao,
           d.percentual_retencao, d.tipo_compensacao, d.venda_id,
           v.numero_venda, v.cliente_id,
           c.nome AS cliente_nome
    FROM alissonerp.devolucoes_venda d
    JOIN alissonerp.vendas_erp v ON v.id = d.venda_id
    LEFT JOIN public.contatos c  ON c.id_contato = v.cliente_id
    WHERE d.id = ${id}
  `;
  if (!dev) throw new Error("Devolucao nao encontrada");
  if (dev.status !== "rascunho") {
    throw new Error(`Devolucao ja foi submetida (status=${dev.status})`);
  }

  // Aprovador: se a devolução está FORA DO PRAZO (7 dias úteis a partir da entrega
  // real ao cliente), usa o aprovador configurado ESPECIFICAMENTE para isso (lista
  // aberta em Configurações). Dentro do prazo, mantém o comportamento atual
  // (aprovadora_credito_gerente → fallback gerente/diretor/admin).
  const prazo = await avaliarPrazoDevolucao(dev.venda_id);
  const chaveAprovador = prazo.dentroPrazo
    ? "aprovadora_credito_gerente"
    : "aprovador_devolucao_fora_prazo";
  let aprovadorId: string | undefined;
  const [config] = await sql`
    SELECT valor FROM alissonerp.configuracoes_sistema
    WHERE chave = ${chaveAprovador}
  `;
  if (config?.valor) {
    const [g] = await sql`
      SELECT id FROM alissonerp.usuarios
      WHERE id = ${config.valor}::uuid AND ativo = true
    `;
    if (g) aprovadorId = String(g.id);
  }
  if (!aprovadorId) {
    const [gerente] = await sql`
      SELECT id FROM alissonerp.usuarios
      WHERE role IN ('gerente_loja','diretor','admin','desenvolvedor') AND ativo = true
      ORDER BY CASE role
        WHEN 'gerente_loja' THEN 1
        WHEN 'diretor'      THEN 2
        WHEN 'admin'        THEN 3
        ELSE 4
      END LIMIT 1
    `;
    if (!gerente) throw new Error("Nenhum aprovador ativo encontrado");
    aprovadorId = String(gerente.id);
  }

  const [solicitante] = await sql`
    SELECT nome FROM alissonerp.usuarios WHERE id = ${userId}::uuid
  `;

  const valorTotal = parseFloat(dev.valor_total_devolvido);
  const valorComp = parseFloat(dev.valor_compensacao);
  const pct = parseFloat(dev.percentual_retencao);

  const labelComp: Record<string, string> = {
    vale_troca: "Vale-Troca",
    reembolso_mp: "Reembolso MP (automatico)",
    reembolso_manual: "Reembolso manual (contas a pagar)",
  };

  const avisoPrazo = prazo.dentroPrazo
    ? ""
    : `⚠️ FORA DO PRAZO de 7 dias úteis: a venda foi entregue ao cliente há ${prazo.diasUteis} dias úteis.\n`;
  const descricao =
    avisoPrazo +
    `Devolucao ${dev.numero} — Venda ${dev.numero_venda} — ${dev.cliente_nome ?? "sem cliente"}\n` +
    `Valor total devolvido: R$ ${valorTotal.toFixed(2)}\n` +
    `Retencao: ${pct.toFixed(2)}% (R$ ${(valorTotal - valorComp).toFixed(2)})\n` +
    `Compensacao: R$ ${valorComp.toFixed(2)} via ${labelComp[dev.tipo_compensacao] ?? dev.tipo_compensacao}\n` +
    `Solicitado por: ${solicitante?.nome ?? "desconhecido"}`;

  const titulo = `Aprovacao devolucao — ${dev.numero} (R$ ${valorComp.toFixed(2)})`;

  const result = (await sql.begin(async (tx: any) => {
    const [tarefa] = await tx`
      INSERT INTO alissonerp.tarefas
        (titulo, descricao, responsavel_id, criado_por, prioridade, status, tags)
      VALUES
        (${titulo}, ${descricao}, ${aprovadorId}::uuid, ${userId}::uuid,
         'alta', 'aguardando_aprovacao', ${sql.array(["devolucao"])})
      RETURNING id
    `;

    await tx`
      INSERT INTO alissonerp.aprovacoes_tarefa (tarefa_id, solicitante_id, aprovador_id, status)
      VALUES (${tarefa.id}, ${userId}::uuid, ${aprovadorId}::uuid, 'pendente')
    `;

    await tx`
      UPDATE alissonerp.devolucoes_venda
      SET status = 'aguardando_aprovacao', tarefa_id = ${tarefa.id}, updated_at = now()
      WHERE id = ${id}
    `;

    return { tarefa_id: tarefa.id as number };
  })) as { tarefa_id: number };

  // Notificar (best-effort)
  await criarNotificacao({
    usuarioId: aprovadorId,
    tipo: "aprovacao",
    titulo,
    mensagem: descricao,
    remetenteId: userId,
    link: `/devolucoes/${id}`,
  }).catch((e) => console.error("[devolucoes] best-effort falhou (notificação):", e));

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// processarAprovacaoDevolucao — chamado pelo hook em /api/tarefas/[id]/aprovacao
// ═══════════════════════════════════════════════════════════════════════════
export async function processarAprovacaoDevolucao(
  tarefaId: number,
  aprovadorId: string,
  decisao: "aprovado" | "rejeitado",
  motivo?: string,
): Promise<{ ok: boolean; devolucao_id?: number; status?: string; message?: string }> {
  const [dev] = await sql`
    SELECT d.id, d.numero, d.criado_por, d.status
    FROM alissonerp.devolucoes_venda d
    WHERE d.tarefa_id = ${tarefaId}
  `;
  if (!dev) {
    return { ok: false, message: "Nenhuma devolucao vinculada a esta tarefa" };
  }
  if (dev.status !== "aguardando_aprovacao") {
    return { ok: false, devolucao_id: dev.id, status: dev.status, message: "Devolucao nao esta aguardando aprovacao" };
  }

  if (decisao === "rejeitado") {
    await sql`
      UPDATE alissonerp.devolucoes_venda
      SET status = 'rejeitado', rejeitado_motivo = ${motivo ?? null},
          aprovador_id = ${aprovadorId}::uuid, updated_at = now()
      WHERE id = ${dev.id}
    `;

    await criarNotificacao({
      usuarioId: String(dev.criado_por),
      tipo: "aprovacao",
      titulo: "Devolucao rejeitada — " + dev.numero,
      mensagem: motivo ?? "Devolucao rejeitada",
      remetenteId: aprovadorId,
      link: `/devolucoes/${dev.id}`,
    }).catch((e) => console.error("[devolucoes] best-effort falhou (notificação):", e));

    return { ok: true, devolucao_id: dev.id, status: "rejeitado" };
  }

  // aprovado
  await sql`
    UPDATE alissonerp.devolucoes_venda
    SET status = 'aprovado', aprovador_id = ${aprovadorId}::uuid,
        aprovado_em = now(), updated_at = now()
    WHERE id = ${dev.id}
  `;

  await criarNotificacao({
    usuarioId: String(dev.criado_por),
    tipo: "aprovacao",
    titulo: "Devolucao aprovada — " + dev.numero,
    mensagem: "Devolucao aprovada. Inspecione os itens e conclua.",
    remetenteId: aprovadorId,
    link: `/devolucoes/${dev.id}`,
  }).catch((e) => console.error("[devolucoes] best-effort falhou (notificação):", e));

  return { ok: true, devolucao_id: dev.id, status: "aprovado" };
}

// ═══════════════════════════════════════════════════════════════════════════
// solicitarAprovacaoEstoqueDevolucao — gate do ESTOQUE antes de gerar o vale
//
// Regra de negocio:
//   O QUE: apos a devolucao estar 'aprovado' e com todos os itens inspecionados,
//     o "Concluir" NAO gera mais o vale direto: cria uma tarefa de aprovacao para
//     o pessoal do ESTOQUE (aprovador_devolucao_estoque nas Configuracoes; fallback
//     por cargo de fabrica). A devolucao vai para 'aguardando_aprovacao_estoque'.
//     Ao aprovar (processarAprovacaoEstoqueDevolucao), o estoque e movimentado e o
//     vale/reembolso e gerado (concluirDevolucao).
//   POR QUE: pedido — toda devolucao passa pela conferencia do estoque antes de
//     virar credito.
//   IMPACTO SE REMOVIDO: o vale volta a ser gerado sem conferencia do estoque.
// ═══════════════════════════════════════════════════════════════════════════
export async function solicitarAprovacaoEstoqueDevolucao(
  id: number,
  userId: string,
): Promise<{ tarefa_id: number }> {
  const [dev] = await sql`
    SELECT d.id, d.numero, d.status, d.valor_compensacao, d.venda_id,
           v.numero_venda, c.nome AS cliente_nome
    FROM alissonerp.devolucoes_venda d
    JOIN alissonerp.vendas_erp v ON v.id = d.venda_id
    LEFT JOIN public.contatos c  ON c.id_contato = v.cliente_id
    WHERE d.id = ${id}
  `;
  if (!dev) throw new Error("Devolucao nao encontrada");
  if (dev.status !== "aprovado") {
    throw new Error(`Devolucao precisa estar 'aprovado' para ir ao estoque (status=${dev.status})`);
  }
  const [pend] = await sql`
    SELECT COUNT(*) AS cnt FROM alissonerp.devolucoes_itens
    WHERE devolucao_id = ${id} AND condicao = 'pendente'
  `;
  if (Number(pend.cnt) > 0) {
    throw new Error(`${pend.cnt} item(ns) ainda pendente(s) de inspecao`);
  }

  // Aprovador do estoque: config -> fallback por cargo de fabrica/estoque.
  let aprovadorId: string | undefined;
  const [cfg] = await sql`
    SELECT valor FROM alissonerp.configuracoes_sistema WHERE chave = 'aprovador_devolucao_estoque'
  `;
  if (cfg?.valor) {
    const [g] = await sql`
      SELECT id FROM alissonerp.usuarios WHERE id = ${cfg.valor}::uuid AND ativo = true
    `;
    if (g) aprovadorId = String(g.id);
  }
  if (!aprovadorId) {
    const [g] = await sql`
      SELECT id FROM alissonerp.usuarios
      WHERE role IN ('gerente_fabrica','estoquista_fabrica','admin','desenvolvedor') AND ativo = true
      ORDER BY CASE role
        WHEN 'gerente_fabrica'     THEN 1
        WHEN 'estoquista_fabrica'  THEN 2
        WHEN 'admin'               THEN 3
        ELSE 4
      END LIMIT 1
    `;
    if (!g) throw new Error("Nenhum aprovador de estoque ativo encontrado");
    aprovadorId = String(g.id);
  }

  const [solicitante] = await sql`SELECT nome FROM alissonerp.usuarios WHERE id = ${userId}::uuid`;
  const valorComp = parseFloat(dev.valor_compensacao);
  const titulo = `Aprovacao de estoque — devolucao ${dev.numero}`;
  const descricao =
    `Conferencia do estoque da devolucao ${dev.numero} — Venda ${dev.numero_venda} — ${dev.cliente_nome ?? "sem cliente"}\n` +
    `Compensacao a gerar: R$ ${valorComp.toFixed(2)}\n` +
    `Ao APROVAR, o estoque e movimentado e o vale/reembolso e gerado (conclui a devolucao).\n` +
    `Solicitado por: ${solicitante?.nome ?? "desconhecido"}`;

  const result = (await sql.begin(async (tx: any) => {
    const [tarefa] = await tx`
      INSERT INTO alissonerp.tarefas
        (titulo, descricao, responsavel_id, criado_por, prioridade, status, tags)
      VALUES
        (${titulo}, ${descricao}, ${aprovadorId}::uuid, ${userId}::uuid,
         'alta', 'aguardando_aprovacao', ${sql.array(["devolucao", "devolucao_estoque"])})
      RETURNING id
    `;
    await tx`
      INSERT INTO alissonerp.aprovacoes_tarefa (tarefa_id, solicitante_id, aprovador_id, status)
      VALUES (${tarefa.id}, ${userId}::uuid, ${aprovadorId}::uuid, 'pendente')
    `;
    await tx`
      UPDATE alissonerp.devolucoes_venda
      SET status = 'aguardando_aprovacao_estoque', tarefa_id = ${tarefa.id}, updated_at = now()
      WHERE id = ${id}
    `;
    return { tarefa_id: tarefa.id as number };
  })) as { tarefa_id: number };

  await criarNotificacao({
    usuarioId: aprovadorId,
    tipo: "aprovacao",
    titulo,
    mensagem: descricao,
    remetenteId: userId,
    link: `/devolucoes/${id}`,
  }).catch((e) => console.error("[devolucoes] best-effort falhou (notif estoque):", e));

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// processarAprovacaoEstoqueDevolucao — chamado pelo hook em /api/tarefas/[id]/aprovacao
//   APROVADO  -> conclui a devolucao (gera vale/estoque) via concluirDevolucao
//   REJEITADO -> volta para 'aprovado' (permite reinspecionar/reenviar)
// ═══════════════════════════════════════════════════════════════════════════
export async function processarAprovacaoEstoqueDevolucao(
  tarefaId: number,
  aprovadorId: string,
  decisao: "aprovado" | "rejeitado",
  motivo?: string,
): Promise<{ ok: boolean; devolucao_id?: number; status?: string; message?: string }> {
  const [dev] = await sql`
    SELECT id, numero, criado_por, status
    FROM alissonerp.devolucoes_venda WHERE tarefa_id = ${tarefaId}
  `;
  if (!dev) return { ok: false, message: "Nenhuma devolucao vinculada a esta tarefa" };
  if (dev.status !== "aguardando_aprovacao_estoque") {
    return { ok: false, devolucao_id: dev.id, status: dev.status, message: "Devolucao nao esta aguardando aprovacao do estoque" };
  }

  if (decisao === "rejeitado") {
    await sql`
      UPDATE alissonerp.devolucoes_venda
      SET status = 'aprovado', rejeitado_motivo = ${motivo ?? null}, updated_at = now()
      WHERE id = ${dev.id}
    `;
    await criarNotificacao({
      usuarioId: String(dev.criado_por),
      tipo: "aprovacao",
      titulo: "Estoque reprovou — devolucao " + dev.numero,
      mensagem: motivo ?? "Conferencia de estoque reprovada. Revise os itens e reenvie.",
      remetenteId: aprovadorId,
      link: `/devolucoes/${dev.id}`,
    }).catch((e) => console.error("[devolucoes] best-effort falhou (notif):", e));
    return { ok: true, devolucao_id: dev.id, status: "aprovado" };
  }

  // Aprovado: volta para 'aprovado' (contrato do concluirDevolucao) e conclui.
  await sql`
    UPDATE alissonerp.devolucoes_venda
    SET status = 'aprovado', aprovador_id = ${aprovadorId}::uuid, updated_at = now()
    WHERE id = ${dev.id}
  `;
  await concluirDevolucao(dev.id, aprovadorId);

  await criarNotificacao({
    usuarioId: String(dev.criado_por),
    tipo: "aprovacao",
    titulo: "Estoque aprovou — devolucao " + dev.numero,
    mensagem: "Estoque conferido. Vale/reembolso gerado e devolucao concluida.",
    remetenteId: aprovadorId,
    link: `/devolucoes/${dev.id}`,
  }).catch((e) => console.error("[devolucoes] best-effort falhou (notif):", e));

  return { ok: true, devolucao_id: dev.id, status: "concluido" };
}

// ═══════════════════════════════════════════════════════════════════════════
// inspecionarItem — so quando devolucao.status = 'aprovado'
// ═══════════════════════════════════════════════════════════════════════════
export async function inspecionarItem(
  itemId: number,
  condicao: CondicaoItem,
  observacao: string | null,
  userId: string,
): Promise<void> {
  if (!["aprovado_retorno", "reprovado_descarte", "garantia"].includes(condicao)) {
    throw new Error("condicao invalida");
  }

  const [item] = await sql`
    SELECT di.id, di.devolucao_id, d.status AS dev_status
    FROM alissonerp.devolucoes_itens di
    JOIN alissonerp.devolucoes_venda d ON d.id = di.devolucao_id
    WHERE di.id = ${itemId}
  `;
  if (!item) throw new Error("Item da devolucao nao encontrado");
  if (item.dev_status !== "aprovado") {
    throw new Error(`Inspecao permitida apenas com devolucao aprovada (status=${item.dev_status})`);
  }

  await sql`
    UPDATE alissonerp.devolucoes_itens
    SET condicao            = ${condicao},
        inspecao_por        = ${userId}::uuid,
        inspecao_em         = now(),
        inspecao_observacao = ${observacao ?? null}
    WHERE id = ${itemId}
  `;
}

// ═══════════════════════════════════════════════════════════════════════════
// concluirDevolucao — so quando TODOS itens inspecionados
// Dispara vale/reembolso + movimenta estoque
// ═══════════════════════════════════════════════════════════════════════════
export async function concluirDevolucao(
  id: number,
  userId: string,
): Promise<ConclusaoResult> {
  const [dev] = await sql`
    SELECT d.id, d.numero, d.status, d.tipo_compensacao, d.valor_compensacao,
           d.venda_id, v.cliente_id, v.numero_venda
    FROM alissonerp.devolucoes_venda d
    JOIN alissonerp.vendas_erp v ON v.id = d.venda_id
    WHERE d.id = ${id}
  `;
  if (!dev) throw new Error("Devolucao nao encontrada");
  if (dev.status !== "aprovado") {
    throw new Error(`Devolucao nao esta em status aprovado (status=${dev.status})`);
  }

  // Verificar que todos itens foram inspecionados
  const [pend] = await sql`
    SELECT COUNT(*) AS cnt FROM alissonerp.devolucoes_itens
    WHERE devolucao_id = ${id} AND condicao = 'pendente'
  `;
  if (Number(pend.cnt) > 0) {
    throw new Error(`${pend.cnt} item(ns) ainda pendente(s) de inspecao`);
  }

  const itens = await sql`
    SELECT id, produto_id, quantidade, condicao
    FROM alissonerp.devolucoes_itens
    WHERE devolucao_id = ${id}
  `;

  const valorCompensacao = parseFloat(dev.valor_compensacao);
  const acoes: string[] = [];
  const result: ConclusaoResult = { ok: true, acoes };

  // 1. Movimentar estoque para itens aprovado_retorno (entrada)
  for (const it of itens) {
    if (it.condicao === "aprovado_retorno" && it.produto_id) {
      const qtd = Math.max(1, Math.round(Number(it.quantidade)));
      await sql`
        INSERT INTO alissonerp.movimentacoes_estoque_comercial (
          produto_id, tipo, quantidade, motivo,
          referencia_id, referencia_tipo, devolucao_id,
          local_estoque_id, observacao, created_by
        ) VALUES (
          ${it.produto_id}, 'entrada', ${qtd}, 'devolucao',
          ${dev.venda_id}, 'venda_erp', ${id},
          2, ${"Devolucao " + dev.numero}, ${userId}::uuid
        )
      `;
      // Garantir que produto tem config no estoque comercial (upsert)
      await sql`
        INSERT INTO alissonerp.estoque_comercial_config (produto_id, ativo, estoque_minimo)
        VALUES (${it.produto_id}, true, 0)
        ON CONFLICT (produto_id) DO UPDATE SET ativo = true
      `.catch((e) => console.error("[devolucoes] best-effort falhou (notificação):", e));
      acoes.push(`entrada estoque produto ${it.produto_id} qtd ${qtd}`);
    } else if (it.condicao === "garantia") {
      acoes.push(`item ${it.id} marcado como garantia (integracao com ordem separada)`);
    } else if (it.condicao === "reprovado_descarte") {
      acoes.push(`item ${it.id} descartado (sem movimentacao)`);
    }
  }

  // 2. Gerar compensacao
  if (valorCompensacao > 0) {
    if (dev.tipo_compensacao === "vale_troca") {
      const vale = await gerarValeTroca(id, dev.cliente_id, valorCompensacao, userId);
      result.vale_troca_id = vale.id;
      result.vale_troca_numero = vale.numero;
      acoes.push(`vale-troca ${vale.numero} gerado (R$ ${valorCompensacao.toFixed(2)})`);
    } else if (dev.tipo_compensacao === "reembolso_mp") {
      // Buscar payment_id do MP do 1o pagamento aprovado da venda
      const [pag] = await sql`
        SELECT gateway_id FROM alissonerp.pagamentos_venda
        WHERE venda_id = ${dev.venda_id}
          AND gateway = 'mercadopago'
          AND gateway_id IS NOT NULL
          AND status IN ('aprovado','approved','confirmado','concluido')
        ORDER BY id ASC LIMIT 1
      `;

      if (pag?.gateway_id) {
        const mp = await estornarMP(String(pag.gateway_id), valorCompensacao, userId, id);
        result.reembolso_id = mp.reembolso_id;
        result.reembolso_status = mp.status;
        if (mp.erro) result.reembolso_erro = mp.erro;
        acoes.push(`reembolso MP ${mp.status}${mp.erro ? " — " + mp.erro : ""}`);

        // Fallback automatico se falhou
        if (mp.status === "falhou") {
          const cp = await criarContaPagarReembolso(
            id, dev.cliente_id, valorCompensacao,
            `Reembolso devolucao ${dev.numero} — falha MP`,
            userId,
          );
          result.conta_pagar_id = cp.conta_pagar_id;
          acoes.push(`fallback conta_pagar #${cp.conta_pagar_id}`);
        }
      } else {
        // Sem pagamento MP → fallback manual
        const cp = await criarContaPagarReembolso(
          id, dev.cliente_id, valorCompensacao,
          `Reembolso devolucao ${dev.numero} — sem pagamento MP`,
          userId,
        );
        result.conta_pagar_id = cp.conta_pagar_id;
        result.reembolso_id = cp.reembolso_id;
        acoes.push(`reembolso manual (sem MP) conta_pagar #${cp.conta_pagar_id}`);
      }
    } else if (dev.tipo_compensacao === "reembolso_manual") {
      const cp = await criarContaPagarReembolso(
        id, dev.cliente_id, valorCompensacao,
        `Reembolso devolucao ${dev.numero}`,
        userId,
      );
      result.conta_pagar_id = cp.conta_pagar_id;
      result.reembolso_id = cp.reembolso_id;
      acoes.push(`conta_pagar #${cp.conta_pagar_id} criada`);
    }
  }

  // 3. Marcar como concluido
  await sql`
    UPDATE alissonerp.devolucoes_venda
    SET status = 'concluido', updated_at = now()
    WHERE id = ${id}
  `;

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// cancelarDevolucao — so rascunho ou rejeitada
// ═══════════════════════════════════════════════════════════════════════════
export async function cancelarDevolucao(id: number, _userId: string): Promise<void> {
  const [dev] = await sql`
    SELECT status FROM alissonerp.devolucoes_venda WHERE id = ${id}
  `;
  if (!dev) throw new Error("Devolucao nao encontrada");
  if (!["rascunho", "rejeitado"].includes(dev.status)) {
    throw new Error(`Devolucao nao cancelavel (status=${dev.status})`);
  }

  await sql`
    UPDATE alissonerp.devolucoes_venda
    SET status = 'cancelado', updated_at = now()
    WHERE id = ${id}
  `;
}
