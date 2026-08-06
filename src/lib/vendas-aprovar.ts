// ═══════════════════════════════════════════════════════════════════════════
// Helper compartilhado de transição de estado de vendas.
//
// Usado por:
//   - PATCH /api/vendas/[id] (aprovação manual pela vendedora)
//   - POST /api/webhooks/mercado-pago (aprovação automática ao confirmar
//     pagamento MP)
//
// Funções públicas:
//   - sendToTiny(vendaId)        → envia venda pra API Tiny v3 (idempotente
//                                   via guard tiny_pedido_id)
//   - approveVenda(vendaId, uid) → rascunho → aprovado (dispara Tiny + cria
//                                   ordem de orçamento/serviço)
//   - estornarVenda(...)         → reverte pagamento confirmado
//
// FLUXO NOVO (refatoração vendas 06/2026): o fim da venda é a ENTREGA
// (rascunho → aprovado → em_rota → entregue), não mais a "conclusão".
// concluirVenda() foi APOSENTADA: pagamento confirmado NÃO muda mais o
// status da venda. Ordem + Tiny acontecem na APROVAÇÃO (approveVenda);
// a conta a receber é criada pelo trigger ao virar 'entregue' (migration
// 296). Se reativar conclusão por pagamento, o status 'concluido' volta a
// nascer e quebra os relatórios do fluxo novo.
//
// Idempotência é obrigatória: webhook MP reentrega a mesma notificação várias
// vezes. Se já processou, as funções retornam noop sem erro.
// ═══════════════════════════════════════════════════════════════════════════

import sql from "@/lib/db";
import { verificarReposicaoAutomatica } from "@/lib/reposicao-automatica";
import { getDescontoThreshold, buscarLimiteDescontoCartao } from "@/lib/aprovacao-regras";
import { reverterAplicacaoVale } from "@/lib/vale-troca";
import { orcamentoFichaToDados, nomeItemOrdem } from "@/lib/orcamento-ficha-to-dados";

// ─── Tipos internos ──────────────────────────────────────────────────────────

interface VendaFull {
  id: number;
  numero_venda: string;
  situacao: string;
  cliente_id: number | null;
  vendedor_id: number | null;
  orcamento_id: number | null;
  data_venda: string | null;
  data_entrega: string | null;
  total_desconto: number;
  total_frete: number;
  observacoes: string | null;
  observacoes_internas: string | null;
  tiny_pedido_id: string | null;
  cliente_nome: string | null;
  cliente_cpf_cnpj: string | null;
  cliente_id_tiny: number | null;
  vendedor_id_tiny: number | null;
}

const SITUACAO_TINY: Record<string, number> = {
  rascunho: 0, aberto: 1, aprovado: 3, confirmado: 3, concluido: 6, cancelado: 2,
};

// ═══════════════════════════════════════════════════════════════════════════
// Tiny OAuth2 — extraído para src/lib/tiny-auth.ts (módulo leve)
// ═══════════════════════════════════════════════════════════════════════════

import { ensureTinyToken, refreshTinyToken } from "@/lib/tiny-auth";
export { ensureTinyToken, refreshTinyToken };

// ═══════════════════════════════════════════════════════════════════════════
// sendToTiny — envia pedido pro Tiny (idempotente)
// ═══════════════════════════════════════════════════════════════════════════

export async function sendToTiny(vendaId: number): Promise<void> {
  // Idempotência: se já foi enviada, não reenvia
  const [venda] = await sql`
    SELECT v.id, v.numero_venda, v.cliente_id, v.vendedor_id, v.orcamento_id,
      v.data_venda, v.data_entrega, v.total_desconto, v.total_frete,
      v.observacoes, v.observacoes_internas, v.tiny_pedido_id,
      c.nome AS cliente_nome, c.cpf_cnpj AS cliente_cpf_cnpj,
      c.id_api_contato AS cliente_id_tiny,
      vd.id_api_vendedor AS vendedor_id_tiny
    FROM alissonerp.vendas_erp v
    LEFT JOIN public.contatos c ON c.id_contato = v.cliente_id
    LEFT JOIN public.vendedores vd ON vd.id_vendedor = v.vendedor_id
    WHERE v.id = ${vendaId}
  ` as unknown as [VendaFull];

  if (!venda) throw new Error(`Venda ${vendaId} não encontrada`);
  if (venda.tiny_pedido_id) {
    // Já foi enviada — noop idempotente
    return;
  }

  let tinyToken = await ensureTinyToken();

  // Buscar itens + pagamentos
  const itens = await sql`
    SELECT produto_id, nome_produto, sku, quantidade, preco_unitario, observacao
    FROM alissonerp.itens_venda_erp WHERE venda_id = ${vendaId} ORDER BY id
  `;
  const pagamentos = await sql`
    SELECT forma, valor, parcelas, gateway FROM alissonerp.pagamentos_venda WHERE venda_id = ${vendaId} ORDER BY id
  `;

  // Montar pagamento Tiny
  let tinyPagamento: Record<string, unknown> | null = null;
  if (pagamentos.length > 0) {
    const formaPag = pagamentos[0].forma;
    const [fpRow] = await sql`
      SELECT id_api_tiny FROM public.forma_pagamento WHERE descricao = ${formaPag} AND status = true LIMIT 1
    `;
    if (fpRow?.id_api_tiny) {
      tinyPagamento = { formaRecebimento: { id: Number(fpRow.id_api_tiny) } };
      const gateway = pagamentos[0].gateway;
      if (gateway) {
        const [mpRow] = await sql`
          SELECT mp.id_api_tiny FROM public.meio_pagamento mp
          JOIN public.forma_pagamento fp ON fp.id = mp.forma_pagamento_id
          WHERE fp.descricao = ${formaPag} AND mp.descricao = ${gateway} AND mp.status = true
          LIMIT 1
        `;
        if (mpRow?.id_api_tiny) {
          tinyPagamento.meioPagamento = { id: Number(mpRow.id_api_tiny) };
        }
      }
    }
  }

  const produtoIds = itens.map(i => i.produto_id).filter(Boolean);
  const produtosTiny = produtoIds.length > 0 ? await sql`
    SELECT id_produto, id_api_produto FROM alissonerp.produtos_compat WHERE id_produto = ANY(${produtoIds}) AND id_api_produto IS NOT NULL
  ` : [];
  const tinyIdMap = new Map(
    produtosTiny
      .filter(p => p.id_api_produto)
      .map(p => [Number(p.id_produto), Number(p.id_api_produto)])
  );

  // Validar antes de chamar a API — evita erro críptico do Tiny
  if (!Number(venda.cliente_id_tiny)) {
    const clienteNome = venda.cliente_nome || `ID ${venda.cliente_id}`;
    const msg = `Cliente "${clienteNome}" não está vinculado ao Tiny. Abra a ficha do cliente, adicione o ID Tiny e tente novamente.`;
    await sql`
      UPDATE alissonerp.vendas_erp SET tiny_sync_status = 'erro', tiny_sync_at = NOW(), tiny_sync_erro = ${msg}
      WHERE id = ${vendaId}
    `;
    throw new Error(`${msg}`);
  }

  const dataVenda = venda.data_venda
    ? new Date(venda.data_venda).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  const pedidoV3: Record<string, unknown> = {
    numeroPedido: venda.numero_venda,
    idContato: Number(venda.cliente_id_tiny),
    situacao: SITUACAO_TINY["aberto"],
    data: dataVenda,
    ...(Number(venda.total_frete) > 0 ? { valorFrete: Number(venda.total_frete) } : {}),
    ...(venda.observacoes ? { observacoes: venda.observacoes } : {}),
    ...(venda.observacoes_internas ? { observacoesInternas: venda.observacoes_internas } : {}),
    ...(venda.vendedor_id_tiny ? { vendedor: { id: Number(venda.vendedor_id_tiny) } } : {}),
    ...(tinyPagamento ? { pagamento: tinyPagamento } : {}),
    itens: (() => {
      const isOrcamento = !!venda.orcamento_id;
      const TINY_PRODUTO_GENERICO = 746056974; // Aliança Personalizada

      if (!isOrcamento) {
        const semProduto = itens.filter(i => !i.produto_id || !tinyIdMap.has(Number(i.produto_id)));
        if (semProduto.length > 0) {
          throw new Error(`Produto "${semProduto[0].nome_produto}" não está cadastrado no Tiny. Vincule o produto antes de aprovar.`);
        }
      }

      return itens.map((item) => {
        const tinyProdId = tinyIdMap.get(Number(item.produto_id));
        const prodId = tinyProdId || (isOrcamento ? TINY_PRODUTO_GENERICO : 0);
        return {
          produto: {
            id: prodId,
            ...(item.sku ? { codigo: item.sku } : {}),
            descricao: item.nome_produto || "Produto",
            tipo: "P",
          },
          quantidade: Number(item.quantidade),
          valorUnitario: Number(item.preco_unitario),
          ...(item.observacao ? { infoAdicional: item.observacao } : {}),
        };
      });
    })(),
  };

  async function enviarParaTiny(token: string): Promise<Response> {
    return fetch("https://api.tiny.com.br/public-api/v3/pedidos", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify(pedidoV3),
      signal: AbortSignal.timeout(15000),
    });
  }

  let tinyRes: Response;
  try {
    tinyRes = await enviarParaTiny(tinyToken);
    if (tinyRes.status === 401) {
      const newToken = await refreshTinyToken();
      if (newToken) {
        tinyToken = newToken;
        tinyRes = await enviarParaTiny(tinyToken);
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Falha na comunicação com o Tiny";
    await sql`
      UPDATE alissonerp.vendas_erp SET tiny_sync_status = 'erro', tiny_sync_at = NOW(), tiny_sync_erro = ${msg}
      WHERE id = ${vendaId}
    `;
    throw new Error(`${msg}`);
  }

  if (!tinyRes.ok) {
    const errBody = await tinyRes.text();
    let erroMsg = "";
    if (tinyRes.status === 401) {
      erroMsg = "Token do Tiny expirado. Vá em Configurações > Integrações e clique 'Reconectar Tiny'.";
    } else {
      erroMsg = `Tiny API ${tinyRes.status}`;
      try {
        const errJson = JSON.parse(errBody);
        const msg = errJson.message || errJson.error || errJson.descricao || errJson.mensagem || "";
        const erros = Array.isArray(errJson.erros)
          ? errJson.erros.map((e: Record<string, string>) => e.mensagem || e.campo || JSON.stringify(e)).join("; ")
          : Array.isArray(errJson.detalhes)
          ? errJson.detalhes.map((e: Record<string, string>) => `${e.campo}: ${e.mensagem}`).join("; ")
          : "";
        erroMsg = [msg, erros].filter(Boolean).join(" — ") || `${erroMsg}: ${JSON.stringify(errJson).slice(0, 300)}`;
      } catch { erroMsg += errBody ? `: ${errBody.slice(0, 300)}` : ""; }
    }
    await sql`
      UPDATE alissonerp.vendas_erp SET tiny_sync_status = 'erro', tiny_sync_at = NOW(), tiny_sync_erro = ${erroMsg}
      WHERE id = ${vendaId}
    `;
    throw new Error(`${erroMsg}`);
  }

  const tinyData = await tinyRes.json() as { id?: number; numeroPedido?: string };
  await sql`
    UPDATE alissonerp.vendas_erp SET
      tiny_pedido_id   = ${String(tinyData.id ?? "")},
      tiny_sync_status = 'sincronizado',
      tiny_sync_at     = NOW(),
      tiny_sync_erro   = NULL
    WHERE id = ${vendaId}
  `;
}

// ═══════════════════════════════════════════════════════════════════════════
// Criação automática de ordem a partir de orçamento (extraído do PATCH)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * REGRA DE NEGÓCIO (27/07/2026, Jonathan) — ORDEM DE ALIANÇA NÃO NASCE SOZINHA.
 *
 * O QUE: orçamento de aliança (`orcamentos.tipo = 'alianca'`) só gera ordem
 * quando `opts.aroConfirmado` é true — o que acontece exclusivamente pelo
 * endpoint POST /api/vendas/[id]/abrir-ordem, depois de alguém confirmar a
 * numeração do aro de cada aliança. A aprovação da venda (approveVenda) chama
 * esta função SEM a flag, então a aliança sai daqui sem ordem, de propósito.
 *
 * POR QUE: o aro é obrigatório no orçamento, mas na venda o cliente muitas
 * vezes ainda não sabe o tamanho do dedo. A consultora digitava um número
 * qualquer para conseguir fechar a venda e a ordem nascia aqui no mesmo
 * instante — a fábrica recebia a numeração chutada e produzia no tamanho
 * errado.
 *
 * IMPACTO SE A FLAG FOR REMOVIDA/IGNORADA: volta a criação automática e o bug
 * do tamanho errado na fábrica volta com ela. Peça personalizada
 * (`tipo != 'alianca'`) NÃO passa por esta trava — continua automática, porque
 * não tem aro para confirmar.
 */
export async function criarOrdemDoOrcamento(
  vendaId: number,
  userId: string,
  opts: { aroConfirmado?: boolean } = {}
): Promise<{ id: number; numero_ordem: string } | null> {
  // Ficha técnica COMPLETA (mesmos campos do antigo inline do PATCH /api/vendas/[id]):
  // sem os campos de perfil/friso/canal/pedra a ordem nasce com ficha incompleta
  // e a fábrica produz a peça errada (bug recorrente do QuadradoCanal).
  const [vendaOrc] = await sql`
    SELECT v.orcamento_id, v.cliente_id, v.vendedor_id, v.data_entrega,
           v.numero_venda,
           o.id AS orc_id, o.tipo, o.peso, o.numero_orcamento, o.nome_modelo,
           o.foto_3d, o.ficha_tecnica_id, o.ficha_tecnica_2_id, o.quantidade,
           o.ordem_gerada_id,
           ft.perfil, ft.modelo, ft.aro_numeracao, ft.largura, ft.espessura,
           ft.peso_estimado, ft.densidade_ouro, ft.cor_metal,
           ft.tipo_fonte, ft.texto, ft.qtd_pedras, ft.tamanho_pedra,
           ft.tipo_aplicacao_pedra, ft.pedras_detalhadas,
           ft.diametro, ft.profundidade_concava, ft.dome_porcentagem,
           ft.has_friso, ft.friso_kind, ft.friso_tipo, ft.friso_lado,
           ft.friso_largura, ft.friso_profundidade, ft.friso_offset,
           ft.canal_largura, ft.canal_borda_altura, ft.chanfro_tamanho,
           ft.pedra_fileiras, ft.pedra_drill, ft.pedra_meia_lua,
           ft.pedra_volta_completa, ft.tipo_pedra,
           -- Peso das FICHAS (anel 1 + anel 2). Para aliança é a mesma conta que
           -- alimenta orcamentos.peso (pricing.weight + pricing2.weight), com uma
           -- diferença que importa: quando o aro é confirmado diferente do orçado,
           -- as fichas já estão com o peso do aro REAL e o orcamentos.peso segue
           -- sendo o do orçamento (base do preço, que não muda). A ordem tem que
           -- sair com o peso da ficha, senão o ourives recebe grama que não fecha.
           (SELECT COALESCE(SUM(f.peso_estimado), 0)
              FROM alissonerp.orcamento_fichas_tecnicas f
             WHERE f.id IN (o.ficha_tecnica_id, o.ficha_tecnica_2_id)) AS peso_fichas_total
    FROM alissonerp.vendas_erp v
    LEFT JOIN alissonerp.orcamentos o ON o.id = v.orcamento_id
    LEFT JOIN alissonerp.orcamento_fichas_tecnicas ft ON ft.id = o.ficha_tecnica_id
    WHERE v.id = ${vendaId} AND v.orcamento_id IS NOT NULL
  `;
  if (!vendaOrc?.orc_id) return null;

  // Trava da aliança (ver bloco de regra acima da função). Fica ANTES de tudo:
  // nenhuma escrita acontece quando a ordem não pode nascer ainda.
  if (vendaOrc.tipo === "alianca" && !opts.aroConfirmado) {
    console.log(
      `[criarOrdemDoOrcamento] venda=${vendaId}: orçamento de aliança — ordem NÃO criada automaticamente. ` +
      `Aguardando confirmação do aro em /api/vendas/${vendaId}/abrir-ordem.`
    );
    return null;
  }

  if (vendaOrc.ordem_gerada_id) {
    // Ordem já foi criada — idempotente
    const [existente] = await sql`
      SELECT id, numero_ordem FROM alissonerp.ordens WHERE id = ${vendaOrc.ordem_gerada_id}
    `;
    if (existente) return { id: Number(existente.id), numero_ordem: String(existente.numero_ordem) };
    return null;
  }

  let ordemCriada: { id: number; numero_ordem: string } | null = null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sql as any).begin(async (tx: typeof sql) => {
    // C3: Lock no orçamento para evitar criação de ordens duplicadas em retries simultâneos
    const [orcLock] = await tx`
      SELECT id, ordem_gerada_id FROM alissonerp.orcamentos WHERE id = ${vendaOrc.orc_id} FOR UPDATE
    `;
    if (orcLock?.ordem_gerada_id) {
      const [existenteTx] = await tx`
        SELECT id, numero_ordem FROM alissonerp.ordens WHERE id = ${orcLock.ordem_gerada_id}
      `;
      if (existenteTx) {
        ordemCriada = { id: Number(existenteTx.id), numero_ordem: String(existenteTx.numero_ordem) };
        return;
      }
    }

    const [{ max_id_ali }] = await tx`SELECT COALESCE(MAX(id), 0) AS max_id_ali FROM alissonerp.ordens`;
    const [{ max_id_dir }] = await tx`SELECT COALESCE(MAX(id), 0) AS max_id_dir FROM directus.ordens`;
    const nextNum = Math.max(Number(max_id_ali), Number(max_id_dir)) + 1;
    const numeroOrdem = "C-" + String(nextNum).padStart(4, "0");
    const isPar = Number(vendaOrc.quantidade) === 2;
    const pesoItem1 = Number(vendaOrc.peso_estimado ?? vendaOrc.peso ?? 0);
    // Aliança: peso da ORDEM = soma das fichas (peso do aro confirmado).
    // Peça personalizada: segue no orcamentos.peso, comportamento original.
    // Fallback no orcamentos.peso protege ficha legada sem peso_estimado.
    const pesoFichas = Number(vendaOrc.peso_fichas_total ?? 0);
    const pesoNeg = vendaOrc.tipo === "alianca" && pesoFichas > 0
      ? pesoFichas
      : Number(vendaOrc.peso ?? vendaOrc.peso_estimado ?? 0);

    const [ordem] = await tx`
      INSERT INTO alissonerp.ordens (
        numero_ordem, tipo_ordem, situacao, status, rota,
        cliente_id, vendedor_id, peso_metal_negociado,
        data_entrega, detalhes_ordem, foto_peca_servico, venda_id,
        numero_pedido, created_at
      ) VALUES (
        ${numeroOrdem}, 'fabricacao'::alissonerp.enum_tipo_ordem,
        'criado', 'aguardando', 'pcp',
        ${vendaOrc.cliente_id}, ${vendaOrc.vendedor_id},
        ${pesoNeg}, ${vendaOrc.data_entrega},
        ${'Venda #' + vendaOrc.numero_venda + ' / Orçamento ' + vendaOrc.numero_orcamento + (isPar ? ' (Par)' : '')},
        ${vendaOrc.foto_3d ?? null}, ${vendaId},
        ${vendaOrc.numero_venda ?? null}, NOW()
      ) RETURNING id, numero_ordem
    `;
    ordemCriada = { id: Number(ordem.id), numero_ordem: String(ordem.numero_ordem) };

    // Item 1 + ficha técnica — montados via helper compartilhado
    // (src/lib/orcamento-ficha-to-dados.ts), mesma fonte única de verdade do
    // antigo inline do PATCH. Cobre TODOS os campos de perfil/friso/canal/pedra.
    const nomeItem = vendaOrc.tipo === "alianca"
      ? nomeItemOrdem(vendaOrc as unknown as Record<string, unknown>, isPar ? "Aliança 1 - " : "Aliança ")
      : `Peça Personalizada`;
    await tx`
      INSERT INTO alissonerp.itens_ordem (ordem_id, nome_produto, quantidade, peso_estimado)
      VALUES (${ordem.id}, ${nomeItem}, 1, ${pesoItem1})
    `;

    const tipoItem = vendaOrc.tipo === "alianca" ? "alianca" : "peca_personalizada";
    const dadosFicha: Record<string, unknown> = vendaOrc.tipo === "alianca"
      ? orcamentoFichaToDados(vendaOrc as unknown as Record<string, unknown>)
      : {
          ...(vendaOrc.peso_estimado ? { peso_estimado: vendaOrc.peso_estimado } : {}),
          ...(vendaOrc.cor_metal ? { cor_metal: vendaOrc.cor_metal } : {}),
          ...(vendaOrc.pedras_detalhadas ? { pedras_detalhadas: vendaOrc.pedras_detalhadas } : {}),
        };
    // dados gravado com ::text::jsonb (NAO JSON.stringify+::jsonb direto). REGRA: o driver
    // postgres, ao castar a string JS direto pra ::jsonb, re-serializa e grava a ficha como
    // STRING dentro de JSON (double-encoded). Forcar ::text primeiro faz o PG fazer o parse e
    // gravar OBJETO limpo. IMPACTO se voltar pro ::jsonb: ficha tecnica corrompida no banco.
    await tx`
      INSERT INTO alissonerp.fichas_tecnicas (ordem_id, tipo_item, dados, created_by)
      VALUES (${ordem.id}, ${tipoItem}, ${JSON.stringify(dadosFicha)}::text::jsonb, ${userId}::uuid)
    `;

    if (Number(vendaOrc.quantidade) === 2 && vendaOrc.ficha_tecnica_2_id) {
      const [ft2] = await tx`
        SELECT perfil, modelo, aro_numeracao, largura, espessura, peso_estimado,
               densidade_ouro, cor_metal, tipo_fonte, texto, qtd_pedras, tamanho_pedra,
               tipo_aplicacao_pedra, pedras_detalhadas,
               diametro, profundidade_concava, dome_porcentagem,
               has_friso, friso_kind, friso_tipo, friso_lado,
               friso_largura, friso_profundidade, friso_offset,
               canal_largura, canal_borda_altura, chanfro_tamanho,
               pedra_fileiras, pedra_drill, pedra_meia_lua,
               pedra_volta_completa, tipo_pedra
        FROM alissonerp.orcamento_fichas_tecnicas WHERE id = ${vendaOrc.ficha_tecnica_2_id}
      `;
      if (ft2) {
        const ft2Row = ft2 as unknown as Record<string, unknown>;
        const nomeItem2 = nomeItemOrdem(ft2Row, "Aliança 2 - ");
        const peso2 = Number(ft2.peso_estimado ?? 0);
        await tx`
          INSERT INTO alissonerp.itens_ordem (ordem_id, nome_produto, quantidade, peso_estimado)
          VALUES (${ordem.id}, ${nomeItem2}, 1, ${peso2})
        `;
        const dadosFicha2 = orcamentoFichaToDados(ft2Row);
        await tx`
          INSERT INTO alissonerp.fichas_tecnicas (ordem_id, tipo_item, dados, created_by)
          VALUES (${ordem.id}, 'alianca', ${JSON.stringify(dadosFicha2)}::text::jsonb, ${userId}::uuid)
        `;
      }
    }

    // Auditoria criada e aprovada automaticamente pelo trigger trg_auto_auditoria_loja
    // (migration 186) — não inserir manualmente para evitar unique constraint violation

    await tx`
      UPDATE alissonerp.orcamentos
      SET ordem_gerada_id = ${ordem.id}, updated_at = NOW()
      WHERE id = ${vendaOrc.orc_id}
    `;
  });

  return ordemCriada;
}

// ═══════════════════════════════════════════════════════════════════════════
// Criação automática de ordem de serviço (tipo_venda = 'servico')
// ═══════════════════════════════════════════════════════════════════════════

export async function criarOrdemDeServico(
  vendaId: number,
): Promise<{ id: number; numero_ordem: string } | null> {
  const [venda] = await sql`
    SELECT id, tipo_venda, orcamento_id, cliente_id, vendedor_id,
           data_entrega, numero_venda
    FROM alissonerp.vendas_erp
    WHERE id = ${vendaId} AND tipo_venda = 'servico' AND orcamento_id IS NULL
  `;
  if (!venda) return null;

  const itens = await sql`
    SELECT produto_id, nome_produto, sku, quantidade, observacao
    FROM alissonerp.itens_venda_erp WHERE venda_id = ${vendaId} ORDER BY id
  `;

  let ordemCriada: { id: number; numero_ordem: string } | null = null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sql as any).begin(async (tx: typeof sql) => {
    // C3: Lock na venda para evitar criação de ordens duplicadas em requests simultâneos
    await tx`SELECT id FROM alissonerp.vendas_erp WHERE id = ${vendaId} FOR UPDATE`;

    // Idempotência dentro da tx: re-verifica após adquirir lock
    const [existenteTx] = await tx`
      SELECT id, numero_ordem FROM alissonerp.ordens WHERE venda_id = ${vendaId} LIMIT 1
    `;
    if (existenteTx) {
      ordemCriada = { id: Number(existenteTx.id), numero_ordem: String(existenteTx.numero_ordem) };
      return;
    }

    const [{ max_id_ali }] = await tx`SELECT COALESCE(MAX(id), 0) AS max_id_ali FROM alissonerp.ordens`;
    const [{ max_id_dir }] = await tx`SELECT COALESCE(MAX(id), 0) AS max_id_dir FROM directus.ordens`;
    const nextNum = Math.max(Number(max_id_ali), Number(max_id_dir)) + 1;
    const numeroOrdem = "C-" + String(nextNum).padStart(4, "0");

    const detalhes = itens.map((i) => i.nome_produto).filter(Boolean).join(", ")
      || `Venda V-${String(vendaId).padStart(5, "0")}`;

    const [ordem] = await tx`
      INSERT INTO alissonerp.ordens (
        numero_ordem, tipo_ordem, situacao, status, rota,
        cliente_id, vendedor_id, data_entrega, detalhes_ordem,
        venda_id, numero_pedido, created_at
      ) VALUES (
        ${numeroOrdem},
        'servico_venda'::alissonerp.enum_tipo_ordem,
        'criado', 'aguardando', 'protocolo',
        ${venda.cliente_id ?? null},
        ${venda.vendedor_id ?? null},
        ${venda.data_entrega ?? null},
        ${detalhes},
        ${vendaId},
        ${venda.numero_venda ?? null},
        NOW()
      ) RETURNING id, numero_ordem
    `;
    ordemCriada = { id: Number(ordem.id), numero_ordem: String(ordem.numero_ordem) };

    for (const item of itens) {
      await tx`
        INSERT INTO alissonerp.itens_ordem (ordem_id, produto_id, nome_produto, sku, quantidade)
        VALUES (
          ${ordem.id},
          ${item.produto_id ?? null},
          ${item.nome_produto},
          ${item.sku ?? null},
          ${Number(item.quantidade)}
        )
      `;
    }

    // Auditoria criada e aprovada automaticamente pelo trigger trg_auto_auditoria_loja
  });

  return ordemCriada;
}

// ═══════════════════════════════════════════════════════════════════════════
// approveVenda — rascunho → aprovado (dispara Tiny)
//
// opts.tinyBestEffort: se true, falha do Tiny NÃO impede a aprovação. Erro
// é salvo em tiny_sync_erro e a venda segue pra aprovado normalmente. Usado
// pelo webhook MP — pagamento confirmado pelo banco não deve ficar refém
// do estado da integração Tiny (que pode ter token expirado, etc).
// ═══════════════════════════════════════════════════════════════════════════

export interface ApproveVendaOpts {
  tinyBestEffort?: boolean;
}

export async function approveVenda(
  vendaId: number,
  userId: string,
  opts: ApproveVendaOpts = {}
): Promise<{ ok: true; ordem_criada?: string; ja_aprovada?: boolean; tiny_erro?: string }> {
  const approveVendaThreshold = await getDescontoThreshold(vendaId);
  const [venda] = await sql`
    SELECT v.id, v.situacao, v.bloqueado, v.tiny_pedido_id,
           v.desconto_aprovado_por,
           EXISTS(
             SELECT 1 FROM alissonerp.itens_venda_erp
             WHERE venda_id = ${vendaId} AND pct_desconto > ${approveVendaThreshold}
           ) AS tem_desconto_alto
    FROM alissonerp.vendas_erp v WHERE v.id = ${vendaId}
  `;
  if (!venda) throw new Error(`Venda ${vendaId} não encontrada`);
  if (venda.bloqueado) throw new Error("Venda bloqueada");

  // Idempotência: já aprovada ou concluída
  if (venda.situacao === "aprovado" || venda.situacao === "concluido" || venda.situacao === "confirmado") {
    return { ok: true, ja_aprovada: true };
  }

  // ── Celular obrigatório para aprovar (Etapa 3 — decisão Jonathan 11/06) ───
  // REGRA DE NEGÓCIO: a partir da aprovação entra a entrega, e o código de
  // retirada (Código A) é enviado por WhatsApp. Sem celular do cliente o código
  // não tem para onde ir. Por isso NÃO se aprova venda cujo cliente não tem
  // celular cadastrado. O telefone fixo NÃO conta — WhatsApp exige celular.
  // IMPACTO SE REMOVIDO: vendas aprovadas sem como mandar o código ao cliente.
  const [clienteCel] = await sql`
    SELECT c.celular
    FROM alissonerp.vendas_erp v
    LEFT JOIN public.contatos c ON c.id_contato = v.cliente_id
    WHERE v.id = ${vendaId}
  `;
  const celular = ((clienteCel?.celular ?? "") as string).trim();
  if (!celular) {
    throw new Error(
      "Cliente sem celular cadastrado. O código de entrega é enviado por WhatsApp — cadastre o celular do cliente antes de aprovar a venda.",
    );
  }

  // ── Bloquear aprovação se cartão foi liberado mas sem pagamento ainda ────
  // REGRA DE NEGÓCIO (Fase 5, 15/07): limite do cartão vem de
  // configuracoes_sistema.limite_desconto_cartao_pct (fallback 20% no código
  // se a chave ainda não existir) — antes era o literal 20 hardcoded aqui.
  const limiteCartaoApprove = await buscarLimiteDescontoCartao();
  const [cartaoBlock] = await sql`
    SELECT
      (SELECT desconto_cartao_aprovado_por FROM alissonerp.vendas_erp WHERE id = ${vendaId}) IS NOT NULL AS cartao_ja_liberado,
      EXISTS(SELECT 1 FROM alissonerp.itens_venda_erp WHERE venda_id = ${vendaId} AND pct_desconto > ${limiteCartaoApprove}) AS tem_desconto_cartao,
      EXISTS(SELECT 1 FROM alissonerp.pagamentos_venda WHERE venda_id = ${vendaId} AND status = 'confirmado') AS tem_pagamento_confirmado
  `;
  if (cartaoBlock?.cartao_ja_liberado && cartaoBlock?.tem_desconto_cartao && !cartaoBlock?.tem_pagamento_confirmado) {
    console.log(`[approveVenda] SKIP venda=${vendaId}: cartão liberado pela trigger, sem pagamentos confirmados ainda`);
    return { ok: true, ja_aprovada: true };
  }

  // ── Bloquear aprovação se desconto > threshold não aprovado ──────────────
  if (venda.tem_desconto_alto && !venda.desconto_aprovado_por) {
    console.error(`[approveVenda] BLOQUEADO venda=${vendaId}: desconto >${approveVendaThreshold}% sem aprovação (desconto_aprovado_por=NULL)`);
    await sql`
      INSERT INTO alissonerp.webhook_log (webhook_nome, payload, response_status, erro)
      VALUES ('approveVenda_bloqueado', ${JSON.stringify({ vendaId, userId, motivo: "desconto_pendente" })}::text::jsonb, 409, 'desconto >${approveVendaThreshold}% sem aprovação')
    `.catch((e) => console.error("[approveVenda] webhook_log falhou:", e));
    throw new Error(`Venda tem desconto acima de ${approveVendaThreshold}% aguardando aprovação. Solicite aprovação de desconto antes de prosseguir.`);
  }

  // ── Bloquear aprovação se sobra saldo SEM forma de pagamento declarada ────
  // O QUE: soma TODOS os pagamentos lançados na venda — qualquer forma, qualquer
  // status (pendente ou confirmado) — e recusa a aprovação se essa soma não
  // fechar o total_venda.
  //
  // POR QUE (levantamento 06/08/2026, dados de produção): a venda 15861 foi
  // aprovada com R$ 2.000 de Pix num total de R$ 20.524. O saldo de R$ 18.524
  // não tinha NENHUM plano declarado, e o gatilho fn_venda_gerar_conta_receber
  // caiu no ELSE genérico e INVENTOU um crediário — 1 conta a receber vencendo
  // na data de entrega. Ninguém decidiu esse prazo: o sistema chutou.
  // A trava exige que o saldo seja DECLARADO (lançar o 'A Receber', o vale, o
  // dinheiro que falta) antes de aprovar. Quem decide o plano é a consultora.
  //
  // POR QUE contar pendente TAMBÉM: o fluxo normal da loja aprova a venda com o
  // Pix/cartão do Mercado Pago ainda aguardando confirmação — o webhook confirma
  // segundos depois. Exigir "confirmado" barraria ~429 vendas boas por mês.
  // A pergunta certa é "foi declarado?", não "já caiu na conta?".
  //
  // POR QUE NÃO exigir credi_tipo: 4 em cada 10 'A Receber' da loja são lançados
  // sem prazo preenchido (20/mês só em julho). Exigir prazo barraria fluxo real.
  // O que a trava garante é que o saldo EXISTE declarado, não o prazo dele.
  //
  // POR QUE só 'confirmado' e 'pendente': pagamento 'estornado'/'cancelado' NÃO
  // é pagamento — deixou de existir. Contá-lo deixaria a venda passar na trava
  // com o dinheiro já devolvido ao cliente (84 estornos e 20 cancelados vivos
  // em produção hoje).
  //
  // Tolerância de R$ 0,01 — mesma dos demais guards de pagamento do sistema
  // (rota PUT /api/vendas/[id]), evita ruído de arredondamento em numeric.
  //
  // IMPACTO SE REMOVIDO: volta a existir venda aprovada com saldo em aberto que
  // ninguém declarou, e o gatilho volta a inventar prazo de crediário sozinho.
  // Backtest contra as 179 aprovações reais de 18/03 a 05/08/2026: barraria de
  // 11 a 16 (a faixa vem de estornos posteriores, que não dá pra reconstruir).
  //
  // A regra vive em verificarSaldoDeclarado() (fim deste arquivo) porque a rota
  // POST /api/vendas/[id]/solicitar-aprovacao precisa da MESMA conta para
  // devolver 409 com mensagem clara — ela não pode expor o erro do approveVenda
  // (cai em internalError, que mascara tudo em "Erro ao aprovar venda").
  const saldo = await verificarSaldoDeclarado(vendaId);
  if (!saldo.ok) {
    console.error(`[approveVenda] BLOQUEADO venda=${vendaId}: ${saldo.mensagem}`);
    await sql`
      INSERT INTO alissonerp.webhook_log (webhook_nome, payload, response_status, erro)
      VALUES ('approveVenda_bloqueado', ${JSON.stringify({
        vendaId,
        userId,
        motivo: "saldo_nao_declarado",
        total_venda: saldo.total,
        total_declarado: saldo.declarado,
        falta: saldo.falta,
      })}::text::jsonb, 409, ${saldo.mensagem})
    `.catch((e) => console.error("[approveVenda] webhook_log falhou:", e));
    throw new Error(saldo.mensagem);
  }

  // 1. Envia pro Tiny (noop se tiny_pedido_id já existe)
  let tinyErro: string | undefined;
  try {
    await sendToTiny(vendaId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (opts.tinyBestEffort) {
      console.error(`[approveVenda] Tiny falhou mas tinyBestEffort=true, continuando: ${msg}`);
      tinyErro = msg;
      // sendToTiny já grava tiny_sync_erro no banco antes do throw
    } else {
      throw err;
    }
  }

  // 2. Atualiza situação para aprovado
  await sql`
    UPDATE alissonerp.vendas_erp
    SET situacao = 'aprovado', updated_at = NOW()
    WHERE id = ${vendaId} AND situacao NOT IN ('aprovado', 'concluido', 'confirmado', 'cancelado')
  `;

  // 3. Criar ordem (orçamento ou serviço) — best-effort
  let ordemCriada: string | undefined;
  try {
    const ordem = await criarOrdemDoOrcamento(vendaId, userId);
    if (ordem) ordemCriada = ordem.numero_ordem;
  } catch (err) {
    console.error(`[approveVenda] Erro ao criar ordem (orcamento) p/ venda ${vendaId}:`, err);
  }
  if (!ordemCriada) {
    try {
      const ordemSvc = await criarOrdemDeServico(vendaId);
      if (ordemSvc) ordemCriada = ordemSvc.numero_ordem;
    } catch (err) {
      console.error(`[approveVenda] Erro ao criar ordem (servico) p/ venda ${vendaId}:`, err);
    }
  }

  // 4. Reposição automática — aprovação NÃO baixa estoque comercial.
  //    Itens da venda mantêm reserva ativa; a saída efetivada ocorre somente
  //    quando a venda muda para `entregue`. Aqui verificamos reposição de forma
  //    best-effort para antecipar falta sem bloquear a aprovação.
  try {
    const itensProdutos = await sql`
      SELECT DISTINCT produto_id
      FROM alissonerp.itens_venda_erp
      WHERE venda_id = ${vendaId} AND produto_id IS NOT NULL
    `;
    const produtoIds = itensProdutos.map((r) => Number(r.produto_id));
    if (produtoIds.length > 0) {
      await verificarReposicaoAutomatica({ userId, produtoIds });
    }
  } catch (err) {
    console.error(`[approveVenda] Reposição automática falhou (não-bloqueante) p/ venda ${vendaId}:`, err);
  }

  // 5. Registrar metal de upgrade no cofre_ouro_rastreios (na aprovação)
  // REGRA DE NEGÓCIO (Produto Upgrade): o metal do cliente só entra no cofre
  // quando a venda é aprovada. Enquanto rascunho, o metal não é da empresa.
  // cofre_registrado = true impede dupla entrada (idempotência).
  try {
    const [upgradeVenda] = await sql`
      SELECT ve.numero_venda
      FROM alissonerp.vendas_erp ve WHERE ve.id = ${vendaId}
    `;

    const upgradeItens = await sql`
      SELECT iuv.item_venda_id, iuv.peso_gramas, iuv.foto_balanca_path,
             ive.sku, ive.nome_produto
      FROM alissonerp.itens_venda_upgrade iuv
      JOIN alissonerp.itens_venda_erp ive ON ive.id = iuv.item_venda_id
      WHERE ive.venda_id = ${vendaId}
        AND iuv.cofre_registrado = false
    `;

    for (const item of upgradeItens) {
      const gramas = Number(item.peso_gramas);
      const origemNome = `Upgrade Venda ${String(upgradeVenda?.numero_venda ?? vendaId)} — ${String(item.sku ?? item.nome_produto ?? "")}`;

      await sql`
        INSERT INTO alissonerp.cofre_ouro_rastreios
          (evento, gramas, origem_nome, observacao, created_at)
        VALUES
          ('entrada_upgrade', ${gramas}, ${origemNome},
           ${`Upgrade venda ${String(upgradeVenda?.numero_venda ?? vendaId)}`},
           NOW())
      `;
    }

    if (upgradeItens.length > 0) {
      await sql`
        UPDATE alissonerp.itens_venda_upgrade iuv
        SET cofre_registrado = true
        FROM alissonerp.itens_venda_erp ive
        WHERE ive.id = iuv.item_venda_id
          AND ive.venda_id = ${vendaId}
          AND iuv.cofre_registrado = false
      `;
    }
  } catch (err) {
    console.error(`[approveVenda] Erro ao registrar upgrade no cofre p/ venda ${vendaId}:`, err);
    // best-effort: venda ja foi aprovada, metal pode ser reconciliado depois
  }

  return {
    ok: true,
    ...(ordemCriada ? { ordem_criada: ordemCriada } : {}),
    ...(tinyErro ? { tiny_erro: tinyErro } : {}),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// estornarVenda — reverte pagamento confirmado (refund / cancelamento / chargeback)
//
// Regras de negócio (definidas pelo Jonathan):
//   - Se a venda TINHA outros pagamentos confirmados além do que foi estornado:
//       → venda volta pra 'rascunho' (vendedora recobra o valor estornado)
//   - Se esse era o ÚNICO pagamento confirmado:
//       → venda vai pra 'cancelado' (trigger 111 reverte estoque comercial
//          automaticamente)
//
// Em ambos os casos:
//   - pagamentos_venda.status → 'estornado' (o pagamento estornado)
//   - contas_receber em 'pago' ou 'pendente' → 'cancelado' (manual, porque
//     trigger 113 só cancela CR pendente via situacao, e nossa CR foi marcada
//     como 'pago' pelo fn_cr_marcar_pago_mp)
//
// Idempotente: se pagamento já está 'estornado', retorna { ja_estornado: true }.
//
// Usado pelo webhook MP quando o status do payment MP vira refunded, cancelled
// (após confirmado) ou charged_back.
// ═══════════════════════════════════════════════════════════════════════════

// "mantida_terminal": venda já estava entregue/concluido (ponto final do fluxo
// novo 06/2026) — o estorno registra a devolução do pagamento e cancela a conta
// a receber, mas NÃO desfaz a entrega voltando pra rascunho. Correção de venda
// entregue é via cancelamento ou solicitação de alteração (decisão Jonathan).
export type EstornoAcao = "cancelada" | "revertida_rascunho" | "ja_estornado" | "mantida_terminal";

export interface EstornarVendaResult {
  ok: true;
  acao: EstornoAcao;
  outros_confirmados: number;
  cr_canceladas: number;
}

export async function estornarVenda(
  vendaId: number,
  pagamentoId: number,
  motivoPayload: Record<string, unknown>
): Promise<EstornarVendaResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return await (sql as any).begin(async (tx: typeof sql): Promise<EstornarVendaResult> => {
    // 1. Bloqueia pagamento + venda para evitar race entre dois estornos simultâneos.
    // Captura a situacao para decidir se o estorno pode reverter o status (fluxo novo).
    const [vendaLock] = await tx`
      SELECT id, situacao FROM alissonerp.vendas_erp WHERE id = ${vendaId} FOR UPDATE
    `;
    const situacaoAtual = vendaLock?.situacao as string | undefined;
    // Entregue/concluido = ponto final (trava de status, migration 297): o estorno
    // NÃO volta pra rascunho nem cancela essas vendas — só devolve o pagamento e
    // cancela a CR. Sem este guard, o UPDATE pra rascunho seria recusado pela trava.
    const ehTerminal = situacaoAtual === "entregue" || situacaoAtual === "concluido";
    const [pag] = await tx`
      SELECT id, venda_id, status, gateway_payload, forma, valor, vale_troca_id
      FROM alissonerp.pagamentos_venda
      WHERE id = ${pagamentoId} AND venda_id = ${vendaId}
      FOR UPDATE
    `;
    if (!pag) throw new Error(`Pagamento ${pagamentoId} não encontrado na venda ${vendaId}`);

    // Idempotência: já estornado anteriormente
    if (pag.status === "estornado") {
      return { ok: true, acao: "ja_estornado", outros_confirmados: 0, cr_canceladas: 0 };
    }

    // 2. Conta outros pagamentos confirmados (excluindo esse)
    const [{ outros_confirmados }] = await tx`
      SELECT COUNT(*)::int AS outros_confirmados
      FROM alissonerp.pagamentos_venda
      WHERE venda_id = ${vendaId}
        AND id != ${pagamentoId}
        AND status = 'confirmado'
    `;
    const nOutros = Number(outros_confirmados);

    // 3. Marca o pagamento como estornado + guarda motivo
    const payloadAntigo = (pag.gateway_payload as Record<string, unknown> | null) ?? {};
    const novoPayload = {
      ...payloadAntigo,
      ...motivoPayload,
      estornado_em: new Date().toISOString(),
    };
    await tx`
      UPDATE alissonerp.pagamentos_venda
      SET
        status          = 'estornado',
        gateway_payload = ${JSON.stringify(novoPayload)}::jsonb
      WHERE id = ${pagamentoId}
    `;

    // #2 (auditoria 16/06): se o pagamento estornado era Vale-Troca, devolve o
    // credito ao vale — volta a 'ativo' com o valor aplicado. Sem isto,
    // cancelar/estornar uma venda paga com vale queimava o credito do cliente.
    // O troco-filho (se houve) NAO e tocado: ja e credito separado e legitimo,
    // mantendo a cadeia de troco conservada (#6).
    if (pag.forma === "Vale-Troca" && pag.vale_troca_id) {
      await reverterAplicacaoVale(tx, Number(pag.vale_troca_id), Number(pag.valor), null);
    }

    // 4. Decide ação sobre a venda
    let acao: EstornoAcao;
    if (ehTerminal) {
      // Venda entregue/concluida = ponto final: NÃO mexe no status. O pagamento
      // já foi marcado estornado e a CR será cancelada abaixo. A correção da
      // venda em si (se necessária) é via cancelamento ou solicitação de alteração.
      acao = "mantida_terminal";
    } else if (nOutros > 0) {
      // Ainda há outros pagamentos confirmados → volta pra rascunho
      // pra vendedora recobrar o valor estornado (ou cancelar manualmente)
      await tx`
        UPDATE alissonerp.vendas_erp
        SET situacao = 'rascunho', updated_at = NOW()
        WHERE id = ${vendaId} AND situacao NOT IN ('cancelado')
      `;
      acao = "revertida_rascunho";
    } else {
      // Era a única forma de pagamento → cancela venda totalmente.
      // Trigger 111 (fn_estoque_comercial_cancelamento_venda) reverte o
      // estoque comercial automaticamente em BEFORE UPDATE.
      await tx`
        UPDATE alissonerp.vendas_erp
        SET situacao = 'cancelado', updated_at = NOW()
        WHERE id = ${vendaId} AND situacao NOT IN ('cancelado')
      `;
      acao = "cancelada";
    }

    // 5. Cancela contas_receber dessa venda.
    // Trigger 113 (fn_venda_cancelar_conta_receber) só age em CR 'pendente',
    // mas a nossa CR foi marcada como 'pago' pelo fn_cr_marcar_pago_mp. Então
    // fazemos UPDATE manual abrangendo 'pendente' + 'pago'.
    const crResult = await tx`
      UPDATE alissonerp.contas_receber
      SET situacao = 'cancelado', updated_at = NOW()
      WHERE venda_erp_id = ${vendaId}
        AND situacao IN ('pago', 'pendente')
      RETURNING id
    `;

    return {
      ok: true,
      acao,
      outros_confirmados: nOutros,
      cr_canceladas: crResult.length,
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// verificarSaldoDeclarado — a venda pode ser aprovada com este saldo?
//
// REGRA DE NEGÓCIO (06/08/2026, decisão do Jonathan): não se aprova venda que
// tenha saldo SEM forma de pagamento declarada. Se falta dinheiro, alguém tem
// que dizer COMO ele vai entrar (Pix, cartão, vale, ouro, ou "A Receber") —
// não o sistema adivinhar.
//
// Fonte única da regra: usada pelo approveVenda (trava de verdade, vale para
// os 8 caminhos que aprovam venda) e pela rota solicitar-aprovacao (só para
// devolver a mensagem certa à consultora antes de tentar aprovar).
//
// IMPACTO SE ALTERADO: mudar a conta aqui muda a trava dos dois lugares de uma
// vez — é essa a intenção. Não copiar a query para outro arquivo.
// ═══════════════════════════════════════════════════════════════════════════

export interface SaldoDeclarado {
  ok: boolean;
  total: number;
  declarado: number;
  falta: number;
  mensagem: string;
}

export async function verificarSaldoDeclarado(vendaId: number): Promise<SaldoDeclarado> {
  const [row] = await sql`
    SELECT
      v.total_venda::numeric AS total_venda,
      COALESCE((
        SELECT SUM(p.valor) FROM alissonerp.pagamentos_venda p
        WHERE p.venda_id = v.id AND p.status IN ('confirmado', 'pendente')
      ), 0)::numeric AS total_declarado
    FROM alissonerp.vendas_erp v
    WHERE v.id = ${vendaId}
  `;

  const total = Number(row?.total_venda ?? 0);
  const declarado = Number(row?.total_declarado ?? 0);
  const falta = Number((total - declarado).toFixed(2));

  // Tolerância de R$ 0,01 — mesma dos demais guards de pagamento (rota PUT
  // /api/vendas/[id]); evita ruído de arredondamento em numeric.
  if (falta <= 0.01) {
    return { ok: true, total, declarado, falta: 0, mensagem: "" };
  }

  const faltaFmt = falta.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return {
    ok: false,
    total,
    declarado,
    falta,
    mensagem: `Falta ${faltaFmt} sem forma de pagamento. Lance o valor que falta (ou declare como "A Receber") antes de aprovar a venda.`,
  };
}
