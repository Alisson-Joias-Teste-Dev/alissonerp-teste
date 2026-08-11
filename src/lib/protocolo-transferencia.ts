/**
 * Protocolo de TRANSFERÊNCIA DE ESTOQUE — regra de negócio central.
 *
 * O QUE: move produto do estoque comercial de um local para outro
 *   (Loja → Fábrica, Reposição → Loja, ...) com rastreio de quem transportou.
 *   Três passos: solicitar (reserva) → coletar (saída na origem) → receber
 *   (entrada no destino). Quando origem e destino ficam no mesmo prédio, o passo
 *   da coleta não existe e o recebimento faz saída e entrada no mesmo ato.
 *
 * POR QUE: mover peça entre locais já era possível pela tela de estoque, mas sem
 *   foto, sem transportador e sem ninguém assumir o caminho. Agora toda
 *   transferência nasce de um protocolo — porta única.
 *
 * IMPACTO SE ALTERADO/REMOVIDO: sem a reserva do passo 1, a consultora vende no
 *   PDV peça já prometida ao outro local; sem o cancelamento, solicitação
 *   abandonada segura a peça para sempre.
 *
 * NÃO DUPLICA NADA: o movimento de estoque em si continua sendo feito pelos
 *   gatilhos de `transferencias_estoque_comercial` (saída ao criar `pendente`,
 *   entrada ao concluir, estorno ao cancelar). Este arquivo só decide QUANDO
 *   criar, concluir ou cancelar essas linhas.
 *
 * Ver docs/regras-negocio/protocolo.md §5.
 */
import sql from "@/lib/db";

export const TIPO_PROTOCOLO_TRANSFERENCIA = "transferencia";

/**
 * REGRA: "Em Trânsito" (e o sub-local por motoboy debaixo dele) NÃO é destino
 * escolhível. Trânsito aqui é a própria transferência em `pendente` — a peça já
 * saiu da origem e ainda não entrou no destino, e a `vw_saldo_estoque_comercial_v2`
 * já expõe isso na coluna `em_transito`. Deixar escolher esse local criaria uma
 * segunda contabilidade do mesmo estado.
 * IMPACTO SE REMOVIDO: peça "entregue ao motoboy" viraria saldo parado num local
 * que ninguém confere no inventário.
 */
export const LOCAL_EM_TRANSITO_ID = 6;

export type ItemTransferencia = { produto_id: number; quantidade: number };

export class ErroTransferencia extends Error {
  status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.name = "ErroTransferencia";
    this.status = status;
  }
}

/**
 * Filtro dos locais que podem ser origem/destino. Usado no backend (validação) e
 * no frontend (montagem do select) — fonte única, para a tela nunca oferecer um
 * local que a API vai recusar.
 */
export function localElegivelTransferencia(local: { id: number; ativo?: boolean; parent_local_id?: number | null }): boolean {
  if (local.ativo === false) return false;
  if (local.id === LOCAL_EM_TRANSITO_ID) return false;
  if (local.parent_local_id === LOCAL_EM_TRANSITO_ID) return false;
  return true;
}

/**
 * Valida o trajeto pedido. Origem e destino têm de existir, estar ativos, ser
 * diferentes e não ser o trânsito. A constraint `chk_protocolo_transferencia_trajeto`
 * repete a parte essencial no banco — aqui é para o usuário ver o motivo em português.
 */
export async function validarTrajeto(
  tx: typeof sql,
  localOrigemId: number,
  localDestinoId: number
): Promise<{ origem: string; destino: string }> {
  if (localOrigemId === localDestinoId) {
    throw new ErroTransferencia("Origem e destino devem ser diferentes.", 400);
  }

  const locais = await tx`
    SELECT id, nome, ativo, parent_local_id
    FROM alissonerp.locais_estoque
    WHERE id IN (${localOrigemId}, ${localDestinoId})
  `;

  const origem = locais.find((l) => Number(l.id) === localOrigemId);
  const destino = locais.find((l) => Number(l.id) === localDestinoId);

  if (!origem) throw new ErroTransferencia("Local de origem não encontrado.", 400);
  if (!destino) throw new ErroTransferencia("Local de destino não encontrado.", 400);

  for (const l of [origem, destino]) {
    if (!localElegivelTransferencia(l as { id: number; ativo: boolean; parent_local_id: number | null })) {
      throw new ErroTransferencia(`O local "${l.nome}" não pode ser usado em transferência.`, 400);
    }
  }

  return { origem: origem.nome as string, destino: destino.nome as string };
}

/**
 * REGRA: só sai da origem o que está DISPONÍVEL (saldo físico menos o que já está
 * reservado para venda, ordem ou outro protocolo). Mesma checagem que a tela de
 * estoque comercial já fazia antes de transferir.
 * IMPACTO SE REMOVIDO: dá para prometer à fábrica a peça que a consultora acabou
 * de vender, e o conflito só aparece na entrega.
 */
export async function validarSaldoDisponivel(
  tx: typeof sql,
  itens: ItemTransferencia[],
  localOrigemId: number
): Promise<void> {
  for (const item of itens) {
    const [saldo] = await tx`
      SELECT COALESCE(SUM(disponivel), 0) AS disponivel, MAX(nome_produto) AS nome_produto, MAX(sku) AS sku
      FROM alissonerp.vw_saldo_estoque_comercial_v2
      WHERE produto_id = ${item.produto_id} AND local_estoque_id = ${localOrigemId}
    `;
    const disponivel = Number(saldo?.disponivel ?? 0);
    if (disponivel < item.quantidade) {
      const rotulo = saldo?.sku ? `${saldo.sku} — ${saldo.nome_produto}` : `produto ${item.produto_id}`;
      throw new ErroTransferencia(
        `Saldo insuficiente na origem para ${rotulo}. Disponível: ${disponivel}, pedido: ${item.quantidade}.`
      );
    }
  }
}

/**
 * Passo 1 — solicitação: guarda os itens e RESERVA cada um no local de origem.
 * A peça continua no saldo físico (ela não saiu do lugar), mas some do disponível,
 * então ninguém vende no PDV enquanto o transporte não acontece.
 */
export async function reservarItensProtocolo(
  tx: typeof sql,
  protocoloId: number,
  itens: ItemTransferencia[],
  localOrigemId: number,
  userId: string
): Promise<void> {
  for (const item of itens) {
    await tx`
      INSERT INTO alissonerp.protocolo_produtos (protocolo_id, produto_id, quantidade)
      VALUES (${protocoloId}, ${item.produto_id}, ${item.quantidade})
    `;
    await tx`
      INSERT INTO alissonerp.reservas_estoque_comercial
        (produto_id, quantidade, local_estoque_id, status, protocolo_id, created_by)
      VALUES
        (${item.produto_id}, ${item.quantidade}, ${localOrigemId}, 'ativo', ${protocoloId}, ${userId}::uuid)
    `;
  }
}

/**
 * Passo 2 — a peça sai da origem.
 *
 * O QUE: cria uma linha de `transferencias_estoque_comercial` por item (status
 *   `pendente`, que o gatilho `fn_transferencia_ec_envio` converte em SAÍDA na
 *   origem) e EFETIVA as reservas do protocolo.
 * POR QUE a reserva vira `efetivado` e não `cancelado`: a reserva cumpriu seu
 *   papel — segurou a peça até o transporte. Cancelar daria a entender que a
 *   solicitação foi desfeita, e o saldo ficaria contado duas vezes (a saída já
 *   tirou a peça do físico; manter a reserva ativa tiraria de novo do disponível).
 * IMPACTO SE ALTERADO: reserva esquecida em `ativo` deixa o disponível negativo
 *   no local de origem.
 *
 * Usado tanto na coleta pelo motoboy quanto no recebimento de trajeto sem
 * transporte — nesse caso saída e entrada acontecem no mesmo ato.
 */
export async function registrarSaidaProtocolo(
  tx: typeof sql,
  protocoloId: number,
  userId: string
): Promise<number[]> {
  const [prot] = await tx`
    SELECT id, local_origem_id, local_destino_id
    FROM alissonerp.protocolos
    WHERE id = ${protocoloId}
  `;
  if (!prot?.local_origem_id || !prot?.local_destino_id) {
    throw new ErroTransferencia("Protocolo de transferência sem trajeto definido.", 400);
  }

  const itens = await tx`
    SELECT produto_id, quantidade
    FROM alissonerp.protocolo_produtos
    WHERE protocolo_id = ${protocoloId}
    ORDER BY id
  `;
  if (itens.length === 0) {
    throw new ErroTransferencia("Protocolo de transferência sem nenhuma peça.", 400);
  }

  const itensTipados: ItemTransferencia[] = itens.map((i) => ({
    produto_id: Number(i.produto_id),
    quantidade: Number(i.quantidade),
  }));

  await validarSaldoDisponivelDescontandoProprio(tx, protocoloId, itensTipados, prot.local_origem_id);

  const criadas: number[] = [];
  for (const item of itensTipados) {
    const [transf] = await tx`
      INSERT INTO alissonerp.transferencias_estoque_comercial
        (produto_id, quantidade, local_origem_id, local_destino_id,
         ordem_solicitacao, protocolo_id, created_by)
      VALUES
        (${item.produto_id}, ${item.quantidade}, ${prot.local_origem_id}, ${prot.local_destino_id},
         ${"Protocolo #" + protocoloId}, ${protocoloId}, ${userId}::uuid)
      RETURNING id, movimento_saida_id
    `;
    criadas.push(transf.id);
    await carimbarProtocoloNoMovimento(tx, transf.movimento_saida_id, protocoloId);
  }

  await tx`
    UPDATE alissonerp.reservas_estoque_comercial
    SET status = 'efetivado', efetivado_em = now()
    WHERE protocolo_id = ${protocoloId} AND status = 'ativo'
  `;

  return criadas;
}

/**
 * Carimba o protocolo no movimento de estoque que o gatilho acabou de criar.
 *
 * O QUE: preenche `movimentacoes_estoque_comercial.protocolo_id` (coluna que já
 *   existia, usada pela conversão de SKU) e acrescenta o número do protocolo na
 *   observação da linha.
 * POR QUE: quem audita o extrato de um produto vê "Transferência #281 → Fabrica"
 *   e precisa saber qual protocolo autorizou aquilo — quem pediu, quem levou,
 *   quem recebeu e as fotos estão todos pendurados no protocolo, não na
 *   transferência.
 * IMPACTO SE REMOVIDO: a saída e a entrada continuam corretas, mas voltam a ser
 *   órfãs no extrato: dá para ver que a peça se moveu e não POR QUE se moveu.
 *
 * Feito aqui e não dentro do gatilho de propósito: `fn_transferencia_ec_envio` e
 * `fn_transferencia_ec_recebimento` servem TODAS as transferências, inclusive as
 * criadas direto pela tela de estoque (sem protocolo). Mexer neles para uma
 * coluna que só a transferência-de-protocolo usa arriscaria o caminho antigo.
 */
async function carimbarProtocoloNoMovimento(
  tx: typeof sql,
  movimentoId: number | null | undefined,
  protocoloId: number
): Promise<void> {
  if (!movimentoId) return;
  await tx`
    UPDATE alissonerp.movimentacoes_estoque_comercial
    SET protocolo_id = ${protocoloId},
        observacao = COALESCE(observacao, '') || ' · protocolo #' || ${protocoloId}::text
    WHERE id = ${movimentoId} AND protocolo_id IS NULL
  `;
}

/**
 * Mesma checagem de saldo do passo 1, mas somando de volta a reserva DESTE
 * protocolo — senão a peça que ele mesmo reservou apareceria como indisponível e
 * a coleta seria recusada pela própria solicitação que a criou.
 */
async function validarSaldoDisponivelDescontandoProprio(
  tx: typeof sql,
  protocoloId: number,
  itens: ItemTransferencia[],
  localOrigemId: number
): Promise<void> {
  for (const item of itens) {
    const [saldo] = await tx`
      SELECT
        COALESCE(SUM(v.disponivel), 0) AS disponivel,
        MAX(v.nome_produto) AS nome_produto,
        MAX(v.sku) AS sku,
        COALESCE((
          SELECT SUM(r.quantidade)
          FROM alissonerp.reservas_estoque_comercial r
          WHERE r.protocolo_id = ${protocoloId}
            AND r.produto_id = ${item.produto_id}
            AND r.local_estoque_id = ${localOrigemId}
            AND r.status = 'ativo'
        ), 0) AS reservado_por_este
      FROM alissonerp.vw_saldo_estoque_comercial_v2 v
      WHERE v.produto_id = ${item.produto_id} AND v.local_estoque_id = ${localOrigemId}
    `;
    const disponivel = Number(saldo?.disponivel ?? 0) + Number(saldo?.reservado_por_este ?? 0);
    if (disponivel < item.quantidade) {
      const rotulo = saldo?.sku ? `${saldo.sku} — ${saldo.nome_produto}` : `produto ${item.produto_id}`;
      throw new ErroTransferencia(
        `Saldo insuficiente na origem para ${rotulo}. Disponível: ${disponivel}, pedido: ${item.quantidade}.`
      );
    }
  }
}

/**
 * Passo 3 — a peça entra no destino.
 *
 * Conclui as transferências pendentes do protocolo (o gatilho
 * `fn_transferencia_ec_recebimento` faz a ENTRADA no destino). Se o protocolo é
 * de trajeto sem transporte (nunca passou pela coleta), a saída é registrada
 * agora, no mesmo ato — é o caso de Reposição → Loja, mesmo prédio.
 */
export async function receberTransferenciaProtocolo(
  tx: typeof sql,
  protocoloId: number,
  userId: string
): Promise<void> {
  const pendentes = await tx`
    SELECT id FROM alissonerp.transferencias_estoque_comercial
    WHERE protocolo_id = ${protocoloId} AND status = 'pendente'
  `;

  if (pendentes.length === 0) {
    const [jaConcluida] = await tx`
      SELECT id FROM alissonerp.transferencias_estoque_comercial
      WHERE protocolo_id = ${protocoloId} AND status = 'concluido'
      LIMIT 1
    `;
    if (jaConcluida) return; // já recebido — nada a fazer (PATCH repetido)
    await registrarSaidaProtocolo(tx, protocoloId, userId);
  }

  const concluidas = await tx`
    UPDATE alissonerp.transferencias_estoque_comercial
    SET status = 'concluido', recebido_por = ${userId}::uuid
    WHERE protocolo_id = ${protocoloId} AND status = 'pendente'
    RETURNING movimento_entrada_id
  `;

  // A entrada no destino também aponta o protocolo — mesma razão da saída.
  for (const t of concluidas) {
    await carimbarProtocoloNoMovimento(tx, t.movimento_entrada_id as number | null, protocoloId);
  }
}

/**
 * Cancelamento.
 *
 * O QUE: solta a reserva ainda ativa e, se a peça já tinha saído, cancela a
 *   transferência — o gatilho marca a saída como `estornado` e a peça volta ao
 *   saldo da origem (sem criar entrada, senão o estoque inflaria +1: foi o bug
 *   corrigido na migration 360).
 * POR QUE: solicitação abandonada seguraria a peça para sempre. O módulo já tem
 *   47 protocolos de ida parados em `pendente` desde março — o mesmo modo de
 *   falha aqui tiraria peça do estoque disponível indefinidamente.
 */
export async function cancelarTransferenciaProtocolo(
  tx: typeof sql,
  protocoloId: number
): Promise<void> {
  await tx`
    UPDATE alissonerp.transferencias_estoque_comercial
    SET status = 'cancelado'
    WHERE protocolo_id = ${protocoloId} AND status = 'pendente'
  `;
  await tx`
    UPDATE alissonerp.reservas_estoque_comercial
    SET status = 'cancelado', cancelado_em = now()
    WHERE protocolo_id = ${protocoloId} AND status = 'ativo'
  `;
}
