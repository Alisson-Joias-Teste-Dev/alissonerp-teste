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
import { getSaldoDisponivel } from "@/lib/saldo-credito";
import { approveVenda } from "@/lib/vendas-aprovar";
import { getDescontoThreshold } from "@/lib/aprovacao-regras";
import { criarNotificacao } from "@/lib/notificacoes";
import { resolverAprovadores } from "@/lib/aprovacoes";
// REGRA DE NEGÓCIO (Fase 3g.2): reusa a mesma HttpError que a Fase 3e criou em
// devolucoes.ts (mesmo padrão em todo o projeto — ver comentário na classe) em
// vez de duplicar a classe aqui.
import { HttpError } from "@/lib/devolucoes";

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface SubmissaoResult {
  precisa_aprovacao: boolean;
  tipo?: "gerente" | "diretor";
  tarefa_id?: number;
  message?: string;
  // Camada 2 (prevenção): bloqueio de validação ANTES de criar a tarefa — ex.:
  // cliente sem celular. Quando preenchido, o chamador deve devolver 409 com
  // esta mensagem e NÃO seguir o fluxo de aprovação.
  erro?: string;
}

interface AprovacaoResult {
  ok: boolean;
  acao: "aprovado" | "rejeitado" | "erro" | "cartao_liberado" | "cartao_rejeitado";
  ordem_criada?: string;
  tiny_erro?: string;
  message?: string;
  // true quando a venda ficou de fato 'aprovado' (approveVenda rodou ok).
  // false quando ainda falta confirmar pagamento de entrada (espera legítima)
  // OU quando o approveVenda falhou (ver erro_aprovacao).
  venda_aprovada?: boolean;
  // Só preenchido no caso de FALHA: todos os pagamentos de entrada já estavam
  // confirmados, o crédito foi aprovado, mas o approveVenda lançou erro (ex.:
  // cliente sem celular). Sinaliza ao chamador que a aprovação deve ser
  // revertida pra permitir nova tentativa.
  erro_aprovacao?: string;
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

  // Camada 2 (prevenção na origem): NÃO deixa nem PEDIR aprovação de crédito se
  // o cliente não tem celular. O approveVenda (no fim do fluxo) exige celular
  // pra mandar o código de entrega por WhatsApp e falharia lá na frente,
  // deixando a venda presa em rascunho. Barrando aqui, a consultora cadastra o
  // celular ANTES de mandar pro aprovador — o problema não chega a nascer.
  // (O telefone fixo NÃO conta — WhatsApp exige celular; mesma regra do approveVenda.)
  const celularCliente = String(venda.cliente_celular ?? "").trim();
  if (!celularCliente) {
    return {
      precisa_aprovacao: false,
      erro: "Cadastre o celular do cliente antes de pedir aprovação de crédito — o código de entrega é enviado por WhatsApp.",
    };
  }

  // Saldo GERAL (regra v2.78.0): limite − todo o A Receber pendente, derivado ao
  // vivo (não o contador antigo). Cabe no disponível → gerente aprova; senão → CEO.
  const { disponivel: saldoAtual } = await getSaldoDisponivel();
  const tipo: "gerente" | "diretor" = valorAReceber <= saldoAtual ? "gerente" : "diretor";

  // 3. Encontrar aprovador (fora da tx — só leitura)
  // REGRA DE NEGÓCIO (Fase 3g.2, política config-first estrita —
  // 03b-config-first-estrito.md): a regra de saldo ACIMA só ROTEIA qual tarefa
  // nasce (gerente/diretor) — quem PODE decidir agora é 100% a config
  // (aprovadora_credito_gerente / aprovador_credito_diretor), sem fallback por
  // cargo. Sem aprovador configurado, a solicitação NÃO nasce (409 — o
  // endpoint que chama esta função trata o HttpError e devolve a mensagem ao
  // front, ver vendas/[id]/solicitar-aprovacao/route.ts).
  const eventoCredito = tipo === "diretor" ? "credito_diretor" : "credito_gerente";
  const resolAprovador = await resolverAprovadores(eventoCredito);
  if (resolAprovador.status === "nao_configurado") {
    throw new HttpError(409, `Aprovador de crédito (${tipo}) não configurado. Defina em Configurações › Aprovadores.`);
  }
  const aprovadorId = resolAprovador.aprovadores[0]; // aprovacoes_tarefa.aprovador_id / responsavel_id é UUID único

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
      `\n\n⚠️ ACIMA DO SALDO — liberação de crédito acima do limite disponível. NÃO afeta a comissão da consultora (a comissão segue o valor recebido).`;

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
           v.total_comissao, v.data_venda::text AS data_venda
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

  // 3. Aprovado — processar conforme tipo.
  //
  // REGRA DE NEGÓCIO (decisão Jonathan, 03/08/2026): a aprovação de crédito
  // — gerente OU diretor — NÃO mexe mais na comissão da consultora. A comissão
  // SEGUE O DINHEIRO RECEBIDO, e isso o fechamento já faz sozinho: paga
  // `total_comissao × (pagamento confirmado ÷ total_venda)` por pagamento
  // comissionável, e o A Receber (crediário) só entra quando a parcela é de fato
  // paga (ver fechamentos/route.ts e comercial.md §2).
  //
  // POR QUÊ: o antigo zeramento do diretor (crédito acima do saldo) apagava a
  // comissão INTEIRA na aprovação — inclusive a parte já paga em dinheiro real —,
  // o que era injusto e obrigava a restaurar 1 a 1 na mão todo mês (22 vendas de
  // julho/2026 restauradas antes desta correção; ver comercial.md §2). Sem zerar,
  // o número teórico fica de pé e o fechamento distribui na medida certa.
  //
  // IMPACTO SE REVERTIDO: volta o zeramento e a esteira de correção manual. A
  // aprovação do diretor continua servindo pra LIBERAR a venda acima do limite
  // (quem pode aprovar), só não penaliza mais a comissão.
  //
  // tipo 'gerente' → nada a fazer (saldo é derivado ao vivo, sem contador a
  // debitar). tipo 'diretor' → também nada a fazer na comissão.

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
  // Preenchido só quando todos os pagamentos já estavam confirmados mas o
  // approveVenda lançou erro (ex.: cliente sem celular). É o sinal pro chamador
  // reverter a aprovação da tarefa e deixar reprocessável. NÃO confundir com a
  // espera legítima por confirmação de pagamento (todosOutrosConfirmados=false).
  let erroAprovacao: string | undefined;

  if (todosOutrosConfirmados) {
    try {
      const result = await approveVenda(vendaId, aprovadorId, { tinyBestEffort: true });
      ordemCriada = result.ordem_criada;
      tinyErro = result.tiny_erro;
      vendaAprovada = true;
    } catch (err) {
      erroAprovacao = err instanceof Error ? err.message : String(err);
      console.error(`[processarAprovacaoCredito] approveVenda falhou:`, err);
    }
  }

  // A venda aprovou de fato → limpa o vínculo da tarefa de crédito. Sem isso o
  // campo ficava preso e o guard de "aprovação pendente" travava a venda pra
  // sempre (a tarefa fica como histórico, ligada à venda por venda_id).
  if (vendaAprovada) {
    await sql`
      UPDATE alissonerp.vendas_erp
      SET aprovacao_credito_tarefa_id = NULL, updated_at = NOW()
      WHERE id = ${vendaId}
    `;
  }

  // 6. Notificar consultora
  const msgOk = !todosOutrosConfirmados
    ? `Crédito aprovado — aguardando confirmação dos demais pagamentos da Venda ${vendaInfo.numero_venda}`
    : vendaAprovada
      ? (tipo === "gerente"
          ? `Crédito aprovado pelo gerente — Venda ${vendaInfo.numero_venda} aprovada`
          : `Crédito aprovado pelo diretor — Venda ${vendaInfo.numero_venda} aprovada`)
      : `Crédito aprovado, mas a aprovação da venda falhou: ${erroAprovacao}`;

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
    venda_aprovada: vendaAprovada,
    erro_aprovacao: erroAprovacao,
  };
}
