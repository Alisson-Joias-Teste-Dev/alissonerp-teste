// ═══════════════════════════════════════════════════════════════════════════
// Saldo de Crédito Gerente + Aprovação em Cascata
//
// Fluxo: venda com "A Receber" → aprovação automática do gerente_loja
// (se dentro do saldo) ou diretor (se acima do saldo, com perda de comissão).
//
// Usado por:
//   - POST /api/vendas/[id]/solicitar-aprovacao
//   - PATCH /api/tarefas/[id]/aprovacao (hook quando tarefa tem venda_id)
// ═══════════════════════════════════════════════════════════════════════════

import sql from "@/lib/db";
import { getSaldoAtual, debitarSaldo } from "@/lib/saldo-credito";
import { approveVenda } from "@/lib/vendas-aprovar";
import { getDescontoThreshold } from "@/lib/aprovacao-regras";
import { criarNotificacao } from "@/lib/notificacoes";

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface SubmissaoResult {
  precisa_aprovacao: boolean;
  tipo?: "gerente" | "diretor";
  tarefa_id?: number;
  message?: string;
  // Camada 2 (prevenção): bloqueio de validação ANTES de criar a tarefa de crédito
  // (ex.: cliente sem celular). Quando preenchido, a rota devolve 409 com a mensagem
  // e NÃO submete o crédito. Impacto se removido: venda de crediário sem celular
  // chega ao approveVenda e fica presa em rascunho (bug que esta camada previne).
  erro?: string;
}

interface AprovacaoResult {
  ok: boolean;
  acao: "aprovado" | "rejeitado" | "erro" | "cartao_liberado" | "cartao_rejeitado";
  ordem_criada?: string;
  tiny_erro?: string;
  message?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// submeterVendaParaAprovacaoCredito
//
// Chamada quando consultora clica "Aprovar" numa venda com A Receber.
// Cria tarefa automática para gerente_loja ou diretor, dependendo do saldo.
// ═══════════════════════════════════════════════════════════════════════════

export async function submeterVendaParaAprovacaoCredito(
  vendaId: number,
  userId: string,
): Promise<SubmissaoResult> {
  // 1. Calcular valor real a receber: total_venda - já confirmados (não depende do valor digitado pelo usuário)
  const [totais] = await sql`
    SELECT
      v.total_venda::numeric AS total_venda,
      COALESCE(SUM(p.valor) FILTER (WHERE p.status = 'confirmado'), 0)::numeric AS confirmados,
      COALESCE(SUM(p.valor) FILTER (WHERE p.forma = 'A Receber' AND p.status = 'pendente'), 0)::numeric AS a_receber_pendente
    FROM alissonerp.vendas_erp v
    LEFT JOIN alissonerp.pagamentos_venda p ON p.venda_id = v.id
    WHERE v.id = ${vendaId}
    GROUP BY v.total_venda
  `;
  if (!totais || Number(totais.a_receber_pendente) <= 0) {
    return { precisa_aprovacao: false };
  }
  const valorAReceber = Math.max(0, Number(totais.total_venda) - Number(totais.confirmados));

  // 2. Buscar dados da venda + determinar tipo
  const [venda] = await sql`
    SELECT v.id, v.numero_venda, v.total_venda, v.total_comissao,
           c.nome AS cliente_nome, c.celular AS cliente_celular
    FROM alissonerp.vendas_erp v
    LEFT JOIN public.contatos c ON c.id_contato = v.cliente_id
    WHERE v.id = ${vendaId}
  `;
  if (!venda) throw new Error(`Venda ${vendaId} não encontrada`);

  // Camada 2 (prevenção): crédito (crediário) EXIGE celular do cliente — é por ele que
  // o cliente é cobrado/notificado. Sem celular, bloqueia ANTES de criar a tarefa e de
  // tocar no saldo, devolvendo 'erro' pra consultora cadastrar o celular e tentar de novo.
  // Impacto se removido: a venda chega ao approveVenda e fica presa em rascunho.
  if (!venda.cliente_celular || String(venda.cliente_celular).trim() === "") {
    return {
      precisa_aprovacao: false,
      erro: "Cliente sem celular cadastrado. Cadastre o celular do cliente antes de aprovar o crédito.",
    };
  }

  const saldoAtual = await getSaldoAtual();
  const tipo: "gerente" | "diretor" = valorAReceber <= saldoAtual ? "gerente" : "diretor";

  // 3. Encontrar aprovador (fora da tx — só leitura)
  let aprovadorId = "";
  if (tipo === "gerente") {
    const [config] = await sql`
      SELECT valor FROM alissonerp.configuracoes_sistema WHERE chave = 'aprovadora_credito_gerente'
    `;
    if (config?.valor) {
      const [gerenteConfig] = await sql`
        SELECT id FROM alissonerp.usuarios WHERE id = ${config.valor}::uuid AND ativo = true
      `;
      if (gerenteConfig?.id) aprovadorId = gerenteConfig.id;
    }
    if (!aprovadorId) {
      const [gerente] = await sql`
        SELECT id FROM alissonerp.usuarios
        WHERE role = 'gerente_loja' AND ativo = true
        ORDER BY id LIMIT 1
      `;
      if (!gerente) throw new Error("Nenhum gerente de loja ativo encontrado");
      aprovadorId = gerente.id;
    }
  } else {
    // Buscar da config primeiro; fallback diretor→admin→dev
    const [config] = await sql`
      SELECT valor FROM alissonerp.configuracoes_sistema WHERE chave = 'aprovador_credito_diretor'
    `;
    if (config?.valor) {
      const [diretorConfig] = await sql`
        SELECT id FROM alissonerp.usuarios WHERE id = ${config.valor}::uuid AND ativo = true
      `;
      if (diretorConfig?.id) aprovadorId = diretorConfig.id;
    }
    if (!aprovadorId) {
      const [diretor] = await sql`
        SELECT id FROM alissonerp.usuarios
        WHERE role IN ('diretor', 'admin', 'desenvolvedor') AND ativo = true
        ORDER BY CASE role WHEN 'diretor' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END
        LIMIT 1
      `;
      if (!diretor) throw new Error("Nenhum diretor ou admin ativo encontrado");
      aprovadorId = diretor.id;
    }
  }

  // 4. Buscar nome do solicitante
  const [solicitante] = await sql`
    SELECT nome FROM alissonerp.usuarios WHERE id = ${userId}::uuid
  `;

  // 5. Operação crítica com lock — dentro de UMA transação
  return await sql.begin(async (tx: any) => {
    // Lock na venda: só um request por vez cria tarefa de crédito
    await tx`SELECT id FROM alissonerp.vendas_erp WHERE id = ${vendaId} FOR UPDATE`;

    // Re-verificar após lock (pode ter sido criada por outro request)
    const [jaExiste] = await tx`
      SELECT id FROM alissonerp.tarefas
      WHERE venda_id = ${vendaId} AND status = 'aguardando_aprovacao'
      LIMIT 1
    `;
    if (jaExiste) {
      return {
        precisa_aprovacao: true,
        tipo: undefined,
        tarefa_id: jaExiste.id,
        message: "Já existe uma aprovação pendente para esta venda",
      };
    }

    const descGerente = `Venda ${venda.numero_venda} — ${venda.cliente_nome ?? "sem cliente"}\n` +
      `Valor total: R$ ${Number(venda.total_venda).toFixed(2)}\n` +
      `A Receber: R$ ${valorAReceber.toFixed(2)}\n` +
      `Saldo disponível: R$ ${saldoAtual.toFixed(2)}\n` +
      `Solicitado por: ${solicitante?.nome ?? "desconhecido"}`;

    const descDiretor = descGerente +
      `\n\n⚠️ ACIMA DO SALDO — aprovação pelo diretor zera a comissão da consultora (R$ ${Number(venda.total_comissao).toFixed(2)})`;

    const tituloTarefa = tipo === "gerente"
      ? `Aprovação crédito — ${venda.numero_venda} (R$ ${valorAReceber.toFixed(2)})`
      : `⚠️ Crédito s/ saldo — ${venda.numero_venda} (R$ ${valorAReceber.toFixed(2)})`;

    const [tarefa] = await tx`
      INSERT INTO alissonerp.tarefas
        (titulo, descricao, responsavel_id, criado_por, prioridade, status, venda_id, tags)
      VALUES
        (${tituloTarefa}, ${tipo === "gerente" ? descGerente : descDiretor},
         ${aprovadorId}::uuid, ${userId}::uuid,
         ${tipo === "gerente" ? "alta" : "urgente"},
         'aguardando_aprovacao', ${vendaId},
         ${tx.array(["credito_loja", tipo])})
      RETURNING id
    `;

    await tx`
      INSERT INTO alissonerp.aprovacoes_tarefa (tarefa_id, solicitante_id, aprovador_id, status)
      VALUES (${tarefa.id}, ${userId}::uuid, ${aprovadorId}::uuid, 'pendente')
    `;

    await tx`
      UPDATE alissonerp.vendas_erp
      SET aprovacao_credito_tipo = ${tipo},
          aprovacao_credito_tarefa_id = ${tarefa.id},
          updated_at = NOW()
      WHERE id = ${vendaId}
    `;

    // Notificação (fora da tx — falha não aborta a criação)
    // (a notificação é criada após o commit, usando sql normal)
    return {
      tarefa_id: tarefa.id,
      aprovadorId,
      tituloTarefa,
      descGerente,
      descDiretor,
    };
  }).then(async (result) => {
    if (!result) return { precisa_aprovacao: false };
    const { tarefa_id, aprovadorId: apId, tituloTarefa, descGerente, descDiretor } = result as any;

    // Notificar aprovador; o helper tambem tenta entregar no celular.
    await criarNotificacao({
      usuarioId: apId,
      tipo: "aprovacao",
      titulo: tituloTarefa,
      mensagem: tipo === "gerente" ? descGerente : descDiretor,
      remetenteId: userId,
      link: `/tarefas?abrir=${tarefa_id}`,
    }).catch((e) => console.error("[vendas-credito-aprovar] best-effort falhou (notificação/webhook):", e));

    return {
      precisa_aprovacao: true,
      tipo,
      tarefa_id,
      message: tipo === "gerente"
        ? "Venda enviada para aprovação do gerente de loja"
        : "Venda excede saldo do gerente — enviada para aprovação do diretor",
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// processarAprovacaoCredito
//
// Chamada quando o gerente/diretor responde à aprovação na tarefa.
// Se aprovado: debita saldo (gerente) ou zera comissão (diretor), aprova venda.
// Se rejeitado: limpa referência e notifica consultora.
// ═══════════════════════════════════════════════════════════════════════════

export async function processarAprovacaoCredito(
  tarefaId: number,
  aprovadorId: string,
  decisao: "aprovado" | "rejeitado",
  motivo?: string,
): Promise<AprovacaoResult> {
  // 1. Buscar tarefa e venda vinculada
  const [tarefa] = await sql`
    SELECT t.id, t.venda_id, t.tipo AS tipo_tarefa, t.criado_por,
           v.id AS vid, v.numero_venda, v.situacao, v.aprovacao_credito_tipo,
           v.total_comissao
    FROM alissonerp.tarefas t
    JOIN alissonerp.vendas_erp v ON v.id = t.venda_id
    WHERE t.id = ${tarefaId}
  `;
  if (!tarefa || !tarefa.venda_id) {
    return { ok: false, acao: "erro", message: "Tarefa sem venda vinculada" };
  }

  const vendaId = tarefa.venda_id as number;
  const tipo = tarefa.aprovacao_credito_tipo as "gerente" | "diretor";

  // 1a. Aprovação para Cartão de Crédito (tipo cartao_desconto)
  // Usa campo próprio aprovacao_cartao_desconto_tarefa_id — não mexe no campo de crédito
  if (tarefa.tipo_tarefa === "cartao_desconto") {
    if (decisao === "aprovado") {
      await sql`
        UPDATE alissonerp.vendas_erp
        SET aprovacao_cartao_desconto_tarefa_id = NULL,
            desconto_cartao_aprovado_por = ${aprovadorId}::uuid,
            desconto_cartao_aprovado_em  = NOW(),
            updated_at = NOW()
        WHERE id = ${vendaId}
      `;
      if (tarefa.criado_por) {
        await criarNotificacao({
          usuarioId: String(tarefa.criado_por),
          tipo: "aprovacao",
          titulo: "Cartão de crédito liberado!",
          mensagem: `O cartão de crédito foi liberado para a venda ${tarefa.numero_venda}.`,
          remetenteId: aprovadorId,
          vendaId,
          link: `/vendas/${vendaId}`,
        }).catch((e) => console.error("[vendas-credito-aprovar] best-effort falhou (notificação/webhook):", e));
      }
      return { ok: true, acao: "cartao_liberado", message: "Cartão de crédito liberado para esta venda." };
    } else {
      await sql`
        UPDATE alissonerp.vendas_erp
        SET aprovacao_cartao_desconto_tarefa_id = NULL, updated_at = NOW()
        WHERE id = ${vendaId}
      `;
      if (tarefa.criado_por) {
        await criarNotificacao({
          usuarioId: String(tarefa.criado_por),
          tipo: "aprovacao",
          titulo: "Cartão de crédito não aprovado",
          mensagem: motivo ?? `O uso do cartão de crédito foi recusado para a venda ${tarefa.numero_venda}`,
          remetenteId: aprovadorId,
          vendaId,
          link: `/vendas/${vendaId}`,
        }).catch((e) => console.error("[vendas-credito-aprovar] best-effort falhou (notificação/webhook):", e));
      }
      return { ok: true, acao: "cartao_rejeitado", message: "Cartão de crédito rejeitado." };
    }
  }

  // 1b. Bloquear se venda tem desconto > threshold não aprovado
  const credThreshold = await getDescontoThreshold(vendaId);
  const [descCheck] = await sql`
    SELECT
      v.desconto_aprovado_por,
      EXISTS(
        SELECT 1 FROM alissonerp.itens_venda_erp
        WHERE venda_id = ${vendaId} AND pct_desconto > ${credThreshold}
      ) AS tem_desconto_alto
    FROM alissonerp.vendas_erp v WHERE v.id = ${vendaId}
  `;
  if (descCheck?.tem_desconto_alto && !descCheck?.desconto_aprovado_por) {
    console.error(`[processarAprovacaoCredito] BLOQUEADO venda=${vendaId}: desconto >${credThreshold}% sem aprovação`);
    await sql`
      INSERT INTO alissonerp.webhook_log (webhook_nome, payload, response_status, erro)
      VALUES ('processarAprovacaoCredito_bloqueado', ${JSON.stringify({ vendaId, aprovadorId, decisao, motivo: "desconto_pendente" })}::text::jsonb, 409, 'desconto >${credThreshold}% sem aprovação')
    `.catch((e) => console.error("[vendas-credito-aprovar] best-effort falhou (notificação/webhook):", e));
    return { ok: false, acao: "erro", message: `Venda tem desconto acima de ${credThreshold}% aguardando aprovação. Solicite aprovação de desconto antes de aprovar crédito.` };
  }

  // 2. Se rejeitado → limpa e notifica
  if (decisao === "rejeitado") {
    await sql`
      UPDATE alissonerp.vendas_erp
      SET aprovacao_credito_tarefa_id = NULL,
          aprovacao_credito_tipo = NULL,
          updated_at = NOW()
      WHERE id = ${vendaId}
    `;

    // Notificar consultora tambem no celular quando houver assinatura push.
    await criarNotificacao({
      usuarioId: String(tarefa.criado_por),
      tipo: "aprovacao",
      titulo: "Crédito rejeitado — " + tarefa.numero_venda,
      mensagem: motivo ?? "Aprovação de crédito foi rejeitada pelo aprovador",
      remetenteId: aprovadorId,
      link: `/vendas/${vendaId}`,
    }).catch((e) => console.error("[vendas-credito-aprovar] best-effort falhou (notificação/webhook):", e));

    return { ok: true, acao: "rejeitado", message: "Aprovação de crédito rejeitada" };
  }

  // 3. Aprovado — processar conforme tipo
  const [aReceber] = await sql`
    SELECT COALESCE(SUM(valor), 0) AS total
    FROM alissonerp.pagamentos_venda
    WHERE venda_id = ${vendaId} AND forma = 'A Receber' AND status = 'pendente'
  `;
  const valorAReceber = parseFloat(aReceber.total);

  if (tipo === "gerente") {
    // 3a. Debitar saldo do gerente
    await debitarSaldo(valorAReceber, vendaId, aprovadorId);

    await sql`
      UPDATE alissonerp.vendas_erp
      SET credito_gerente_usado = ${valorAReceber}, updated_at = NOW()
      WHERE id = ${vendaId}
    `;
  } else {
    // 3b. Diretor: zerar comissão de todos os itens
    await sql`
      UPDATE alissonerp.itens_venda_erp
      SET pct_comissao = 0, valor_comissao = 0
      WHERE venda_id = ${vendaId}
    `;
    await sql`
      UPDATE alissonerp.vendas_erp
      SET total_comissao = 0, updated_at = NOW()
      WHERE id = ${vendaId}
    `;
  }

  // 4. Criar conta a receber manual (só valor do A Receber, não total_venda)
  const [vendaInfo] = await sql`
    SELECT v.numero_venda, v.data_entrega, v.cliente_id,
           c.nome AS cliente_nome
    FROM alissonerp.vendas_erp v
    LEFT JOIN public.contatos c ON c.id_contato = v.cliente_id
    WHERE v.id = ${vendaId}
  `;

  // A conta a receber NAO e mais criada aqui. Quem cria e o gatilho
  // trg_venda_gerar_conta_receber (AFTER UPDATE), disparado pelo approveVenda
  // abaixo ao mudar a situacao para 'aprovado'. O gatilho le o plano do A Receber
  // (credi_tipo/credi_param/credi_vencimento) e gera as contas com o vencimento
  // correto (mensal / em X dias / sinal 7 dias uteis). Antes, este INSERT criava
  // 1 conta com vencimento = data_entrega, ignorando o parcelamento/sinal.

  // 5. Verificar se TODOS os outros pagamentos (não-A Receber) estão confirmados
  const [outrosPendentes] = await sql`
    SELECT COUNT(*) AS cnt FROM alissonerp.pagamentos_venda
    WHERE venda_id = ${vendaId} AND forma != 'A Receber' AND status = 'pendente'
  `;
  const todosOutrosConfirmados = Number(outrosPendentes.cnt) === 0;

  // Só aprova a venda quando todos os pagamentos de entrada estão confirmados
  let ordemCriada: string | undefined;
  let tinyErro: string | undefined;
  let vendaAprovada = false;

  if (todosOutrosConfirmados) {
    try {
      const result = await approveVenda(vendaId, aprovadorId, { tinyBestEffort: true });
      ordemCriada = result.ordem_criada;
      tinyErro = result.tiny_erro;
      vendaAprovada = true;
    } catch (err) {
      tinyErro = err instanceof Error ? err.message : String(err);
      console.error(`[processarAprovacaoCredito] approveVenda falhou:`, err);
    }
  }

  // 6. Notificar consultora
  const msgOk = todosOutrosConfirmados
    ? (tipo === "gerente"
        ? `Crédito aprovado pelo gerente — Venda ${vendaInfo.numero_venda} aprovada`
        : `Crédito aprovado pelo diretor — Venda ${vendaInfo.numero_venda} aprovada (comissão zerada)`)
    : `Crédito aprovado — aguardando confirmação dos demais pagamentos da Venda ${vendaInfo.numero_venda}`;

  await criarNotificacao({
    usuarioId: String(tarefa.criado_por),
    tipo: "aprovacao",
    titulo: msgOk,
    mensagem: motivo ?? msgOk,
    remetenteId: aprovadorId,
    link: `/vendas/${vendaId}`,
  }).catch((e) => console.error("[vendas-credito-aprovar] best-effort falhou (notificação/webhook):", e));

  return {
    ok: true,
    acao: "aprovado",
    ordem_criada: ordemCriada,
    tiny_erro: tinyErro,
    message: msgOk,
  };
}
