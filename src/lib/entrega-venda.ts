/**
 * entrega-venda.ts — Lógica de entregas parciais/totais de vendas
 *
 * Módulo "Estoque 2.0" que gerencia entregas de vendas aprovadas,
 * com suporte a:
 *   - Retirada na loja (cliente busca)
 *   - Motoboy (entrega domiciliar em Fortaleza/região)
 *   - Correios (envio postal)
 *   - Geração de códigos de verificação para segurança
 *
 * REGRA DE NEGÓCIO: Uma venda "aprovada" pode ser entregue em uma ou mais
 * remessas (entregas parciais). Cada entrega tem seus próprios códigos de
 * verificação (código cliente + código motoboy quando aplicável).
 * A entrega NÃO depende de pagamento integral — a baixa de estoque ocorre
 * na confirmação do recebimento pelo cliente (ou retirada do motoboy).
 *
 * IMPACTO SE ALTERADO: este módulo controla a baixa efetiva de estoque
 * comercial e a rastreabilidade de entregas. Qualquer alteração nos fluxos
 * de código, confirmação ou cancelamento pode gerar inconsistência de estoque,
 * entregas duplicadas ou perda de rastreio.
 *
 * Tabelas envolvidas (criadas na migration 285):
 *   - alissonerp.entregas_venda
 *   - alissonerp.entregas_venda_itens
 *   - alissonerp.vw_entregas_pendentes (view)
 */

import sql from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { enviarCodigoWhatsAppDetalhado, enviarCodigoClienteEmRota, enviarConfirmacaoEntregaConcluida } from "@/lib/whatsapp";
import { uploadFile } from "@/lib/storage";

// O client transacional do pacote postgres não expõe call signature adequada
// para o TypeScript neste projeto; as rotas existentes usam o mesmo padrão.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbSql = any;

// ─── Tipos ────────────────────────────────────────────────────────────────────

/** Item de saldo pendente para entrega, vindo da view vw_entregas_pendentes */
export interface SaldoPendenteItem {
  itemVendaId: number;
  nomeProduto: string;
  sku: string;
  qtdVendida: number;
  qtdEntregue: number;
  saldoPendente: number;
}

/** Parâmetros para criação de uma nova entrega */
export interface CriarEntregaParams {
  vendaId: number;
  tipo: "parcial" | "total";
  formaEntrega: "retirada" | "motoboy";
  itens: Array<{ itemVendaId: number; quantidade: number }>;
  regiao?: "fortaleza" | "fora_fortaleza" | "longe" | "correios";
  motoboyId?: string; // UUID
  freteCobrado?: number;
  observacoes?: string;
}

/** Item de entrega retornado após criação */
export interface EntregaItem {
  id: number;
  entregaId: number;
  itemVendaId: number;
  quantidade: number;
  baixaEstoqueRealizada: boolean;
}

/** Registro completo de entrega retornado após criação */
export interface Entrega {
  id: number;
  vendaId: number;
  codigoEntrega: string;
  codigoCliente: string;
  codigoMotoboy: string | null;
  tipo: string;
  formaEntrega: string;
  situacao: string;
  regiao: string | null;
  motoboyId: string | null;
  freteCobrado: number;
  freteMotoboy: number;
  aprovacaoFreteNecessaria: boolean;
  dataSaida: string | null;
  dataRetirada: string | null;
  dataEntregaRealizada: string | null;
  dataEntregaPrevista: string | null;
  correiosRastreio: string | null;
  correiosDataPostagem: string | null;
  observacoes: string | null;
  itens: EntregaItem[];
  createdAt: string;
  /** Se o código foi enviado com sucesso via WhatsApp */
  whatsappEnviado: boolean;
  /** Mensagem de erro do WhatsApp (se houve falha) */
  whatsappErro: string | null;
  /** Nome do cliente (preenchido se WhatsApp foi enviado ou se sem número) */
  clienteNome: string | null;
  /** Telefone do cliente (se disponível no cadastro) */
  clienteTelefone: string | null;
  /** Se o código B foi enviado com sucesso via WhatsApp para o motoboy */
  whatsappMotoboyEnviado: boolean;
  /** Mensagem de erro do WhatsApp do motoboy (se houve falha) */
  whatsappMotoboyErro: string | null;
  /** Nome do motoboy (preenchido se entrega via motoboy) */
  motoboyNome: string | null;
  /** Telefone do motoboy (se disponível no cadastro) */
  motoboyTelefone: string | null;
}

/** Resultado da confirmação de entrega */
export interface ConfirmacaoResult {
  etapa: "retirada_loja" | "entrega_cliente";
  situacao: string;
}

/** Dados para atualização de transporte */
export interface AtualizarTransporteParams {
  regiao?: string;
  motoboyId?: string;
  freteMotoboy?: number;
  dataEntregaPrevista?: string;
}

interface ItemBaixaEntrega {
  itemVendaId: number;
  produtoId: number;
  quantidadeEntregue: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Arredonda valor monetário para 2 casas decimais.
 * O QUE: normaliza floats para o padrão NUMERIC(15,2) do banco.
 * POR QUE: operações de ponto flutuante em JS podem gerar imprecisão
 * (ex: 19.9 + 0.1 = 19.9999999...), causando divergências com o banco.
 * IMPACTO SE REMOVIDO: valores podem ser salvos com mais de 2 casas decimais,
 * quebrando cálculos de frete e conciliação financeira.
 */
function money(v: unknown): number {
  return Math.round(Number(v ?? 0) * 100) / 100;
}

function fmBRL(v: number): string {
  return `R$ ${v.toFixed(2)}`;
}

/**
 * Baixa no estoque comercial apenas os itens confirmados nesta entrega.
 *
 * REGRA DE NEGÓCIO: entrega parcial não pode efetivar todas as reservas da
 * venda. Cada confirmação baixa somente os itens/quantidades selecionados no
 * modal. Se o item vendido tinha 2 unidades e entregou 1, a reserva ativa fica
 * com 1 unidade restante; se entregou tudo, a reserva vira efetivada.
 *
 * O QUE: para cada item da entrega ainda sem baixa, cria movimento de saída,
 * reduz/efetiva reservas de estoque comercial e marca RFIDs daquele item como
 * vendidos até a quantidade entregue.
 *
 * POR QUE: o trigger antigo da venda só sabe baixar a venda inteira quando a
 * situação vira "entregue". Este módulo precisa suportar baixa parcial antes da
 * venda inteira terminar.
 *
 * IMPACTO SE ALTERADO: baixar a venda inteira na primeira entrega parcial tira
 * estoque de itens ainda não entregues; não reduzir a reserva deixa saldo preso
 * e disponível incorreto no estoque comercial.
 */
async function baixarEstoqueDaEntrega(
  tx: DbSql,
  entregaId: number,
  vendaId: number,
  usuarioId: string,
): Promise<void> {
  const [venda] = await tx`
    SELECT numero_venda
    FROM alissonerp.vendas_erp
    WHERE id = ${vendaId}
    LIMIT 1
  `;
  const numeroVenda = String(venda?.numero_venda ?? vendaId);

  const itens: ItemBaixaEntrega[] = (await tx`
    SELECT
      evi.item_venda_id,
      ive.produto_id,
      evi.quantidade_entregue
    FROM alissonerp.entregas_venda_itens evi
    JOIN alissonerp.itens_venda_erp ive ON ive.id = evi.item_venda_id
    WHERE evi.entrega_id = ${entregaId}
      AND evi.baixa_estoque_realizada = false
      AND ive.produto_id IS NOT NULL
    ORDER BY evi.id
  `).map((row: Record<string, unknown>) => ({
    itemVendaId: Number(row.item_venda_id),
    produtoId: Number(row.produto_id),
    quantidadeEntregue: Number(row.quantidade_entregue),
  }));

  for (const item of itens) {
    let restanteParaBaixar = item.quantidadeEntregue;

    const reservas = await tx`
      SELECT id, quantidade, local_estoque_id
      FROM alissonerp.reservas_estoque_comercial
      WHERE item_venda_id = ${item.itemVendaId}
        AND venda_id = ${vendaId}
        AND status = 'ativo'
      ORDER BY created_at, id
      FOR UPDATE
    `;

    for (const reserva of reservas) {
      if (restanteParaBaixar <= 0) break;

      const reservaQuantidade = Number(reserva.quantidade);
      const quantidadeBaixada = Math.min(reservaQuantidade, restanteParaBaixar);

      const [movimento] = await tx`
        INSERT INTO alissonerp.movimentacoes_estoque_comercial
          (produto_id, tipo, quantidade, motivo, referencia_id, referencia_tipo,
           local_estoque_id, status, observacao, created_by)
        VALUES
          (${item.produtoId}, 'saida', ${quantidadeBaixada}, 'venda', ${vendaId}, 'vendas_erp',
           COALESCE(${reserva.local_estoque_id}, 2), 'efetivado',
           ${`Entrega venda #${numeroVenda}`},
           ${usuarioId}::uuid)
        RETURNING id
      `;

      if (quantidadeBaixada >= reservaQuantidade) {
        await tx`
          UPDATE alissonerp.reservas_estoque_comercial
          SET status = 'efetivado', efetivado_em = now(), movimento_id = ${movimento.id}
          WHERE id = ${reserva.id}
        `;
      } else {
        await tx`
          UPDATE alissonerp.reservas_estoque_comercial
          SET quantidade = quantidade - ${quantidadeBaixada}
          WHERE id = ${reserva.id}
        `;
      }

      restanteParaBaixar -= quantidadeBaixada;
    }

    if (restanteParaBaixar > 0) {
      throw new Error(
        `Reserva insuficiente para baixar o item ${item.itemVendaId}. ` +
          `Faltam ${restanteParaBaixar} unidade(s) reservada(s).`,
      );
    }

    // REGRA DE NEGÓCIO: RFID representa peça física. Em entrega parcial,
    // somente a quantidade entregue daquele item deve virar "vendido"; as
    // demais etiquetas continuam reservadas até nova entrega.
    await tx`
      WITH selecionadas AS (
        SELECT id
        FROM alissonerp.joias_rfid
        WHERE venda_id = ${vendaId}
          AND item_venda_id = ${item.itemVendaId}
          AND status = 'reservado'
        ORDER BY reservado_em NULLS LAST, id
        LIMIT ${item.quantidadeEntregue}
      )
      UPDATE alissonerp.joias_rfid j
      SET status = 'vendido', sold_at = now()
      FROM selecionadas s
      WHERE j.id = s.id
    `;
  }
}

/**
 * Marca a venda como entregue somente quando não resta saldo confirmado pendente.
 *
 * REGRA DE NEGÓCIO: venda parcialmente entregue permanece `aprovado` para o
 * botão de entrega continuar disponível. Quando a soma das entregas confirmadas
 * cobre todos os itens/quantidades da venda, a venda muda para `entregue`.
 *
 * IMPACTO SE ALTERADO: marcar `entregue` cedo fecha a venda sem entregar tudo;
 * nunca marcar `entregue` impede financeiro/relatórios de reconhecerem a baixa.
 */
async function marcarVendaEntregueSeCompleta(
  tx: DbSql,
  vendaId: number,
): Promise<boolean> {
  const [pendencia] = await tx`
    SELECT COUNT(*)::integer AS total
    FROM (
      SELECT
        iv.id,
        iv.quantidade,
        COALESCE(SUM(ei.quantidade_entregue) FILTER (
          WHERE ev.situacao <> 'cancelada'
            AND ei.baixa_estoque_realizada = true
        ), 0) AS quantidade_confirmada
      FROM alissonerp.itens_venda_erp iv
      LEFT JOIN alissonerp.entregas_venda_itens ei ON ei.item_venda_id = iv.id
      LEFT JOIN alissonerp.entregas_venda ev ON ev.id = ei.entrega_id
      WHERE iv.venda_id = ${vendaId}
      GROUP BY iv.id, iv.quantidade
      HAVING iv.quantidade > COALESCE(SUM(ei.quantidade_entregue) FILTER (
        WHERE ev.situacao <> 'cancelada'
          AND ei.baixa_estoque_realizada = true
      ), 0)
    ) pendentes
  `;

  if (Number(pendencia.total) > 0) return false;

  await tx`
    UPDATE alissonerp.vendas_erp
    SET situacao = 'entregue', updated_at = now()
    WHERE id = ${vendaId}
      AND situacao <> 'entregue'
  `;

  return true;
}

// ─── 1. Geração de Códigos ────────────────────────────────────────────────────

/**
 * Gera código de entrega no formato ENT-YYYYMMDD-XXXXX.
 * REGRA DE NEGÓCIO: cada entrega recebe um código sequencial por dia,
 * facilitando rastreamento e organização operacional.
 * O QUE: consulta o maior código do dia atual e incrementa o sequencial.
 * POR QUE: formato padronizado permite identificar a data da entrega
 * pelo código, útil para logística e suporte ao cliente.
 * IMPACTO SE ALTERADO: mudar o formato quebra queries de busca por prefixo
 * e pode gerar códigos duplicados se o sequencial não for respeitado.
 */
export async function gerarCodigoEntrega(db: DbSql): Promise<string> {
  const hoje = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `ENT-${hoje}-`;

  const rows = await db`
    SELECT codigo_entrega
    FROM alissonerp.entregas_venda
    WHERE codigo_entrega LIKE ${prefix + "%"}
    ORDER BY codigo_entrega DESC
    LIMIT 1
  `;

  let seq = 1;
  if (rows.length > 0) {
    const lastCode: string = rows[0].codigo_entrega;
    const lastSeq = parseInt(lastCode.replace(prefix, ""), 10);
    if (!isNaN(lastSeq)) {
      seq = lastSeq + 1;
    }
  }

  return `${prefix}${String(seq).padStart(5, "0")}`;
}

/**
 * Gera código numérico de 6 dígitos único para verificação.
 * REGRA DE NEGÓCIO: ao criar uma entrega, são gerados dois códigos:
 *   - Código A (codigo_cliente): entregue ao cliente
 *   - Código B (codigo_motoboy): entregue ao motoboy (se aplicável)
 * Ambos devem ser únicos entre si e entre todas as entregas ativas.
 * O QUE: gera número aleatório de 6 dígitos e verifica unicidade
 * contra as colunas codigo_cliente e codigo_motoboy.
 * POR QUE: evita que dois clientes/motoboys tenham o mesmo código,
 * o que poderia causar retirada indevida de mercadoria.
 * IMPACTO SE REMOVIDO: códigos duplicados permitiriam que uma pessoa
 * retirasse a entrega de outra, gerando prejuízo e disputas.
 */
export async function gerarCodigoVerificacao(db: DbSql): Promise<string> {
  // Tenta até 20 vezes gerar um código único (probabilidade de colisão é baixíssima)
  for (let tentativa = 0; tentativa < 20; tentativa++) {
    const code = String(Math.floor(100000 + Math.random() * 900000));

    const [existe] = await db`
      SELECT 1
      FROM alissonerp.entregas_venda
      WHERE codigo_cliente = ${code} OR codigo_motoboy = ${code}
      LIMIT 1
    `;

    if (!existe) {
      return code;
    }
  }

  throw new Error(
    "Não foi possível gerar código de verificação único após 20 tentativas. " +
      "Verifique se há muitos códigos ativos no sistema.",
  );
}

// ─── 2. Cálculo de Frete ──────────────────────────────────────────────────────

/**
 * Calcula o valor do frete de motoboy por região.
 * REGRA DE NEGÓCIO: valores fixos definidos pela gerência.
 *   - Fortaleza: R$ 20,00 (entrega urbana)
 *   - Fora de Fortaleza (região metropolitana): R$ 50,00
 *   - Longe / Correios: R$ 0,00 (frete calculado manualmente ou via Correios)
 * O QUE: retorna o valor em reais para a região informada.
 * POR QUE: centraliza a tabela de fretes em um único ponto,
 * evitando valores divergentes entre UI e backend.
 * IMPACTO SE ALTERADO: mudar valores aqui altera o cálculo de
 * aprovacao_frete_necessaria e o valor cobrado do cliente.
 */
export function calcularValorMotoboy(
  regiao: string,
): number {
  switch (regiao) {
    case "fortaleza":
      return 20;
    case "fora_fortaleza":
      return 50;
    case "longe":
    case "correios":
      return 0;
    default:
      return 0;
  }
}

// ─── 3. Consulta de Saldo Pendente ────────────────────────────────────────────

/**
 * Calcula o saldo pendente de entrega para cada item de uma venda.
 * REGRA DE NEGÓCIO: uma venda pode ter entregas parciais. O saldo pendente
 * é a quantidade vendida menos a quantidade já entregue (em entregas não canceladas).
 * O QUE: consulta a view vw_entregas_pendentes que já faz o JOIN e cálculo.
 * POR QUE: a view é a fonte única da verdade para saldo de entrega,
 * garantindo consistência entre o módulo de entregas e o frontend.
 * IMPACTO SE ALTERADO: se a view for modificada, este método precisa
 * acompanhar as mudanças de colunas. Se esta função for removida,
 * o frontend perde a capacidade de mostrar quais itens ainda podem ser entregues.
 */
export async function calcularSaldoPendente(
  vendaId: number,
): Promise<SaldoPendenteItem[]> {
  const rows = await sql`
    SELECT
      item_venda_id,
      nome_produto,
      sku,
      qtd_vendida,
      qtd_entregue,
      saldo_pendente
    FROM alissonerp.vw_entregas_pendentes
    WHERE venda_id = ${vendaId}
      AND saldo_pendente > 0
    ORDER BY item_venda_id
  `;

  return rows.map((r: Record<string, unknown>) => ({
    itemVendaId: Number(r.item_venda_id),
    nomeProduto: String(r.nome_produto ?? ""),
    sku: r.sku ? String(r.sku) : "",
    qtdVendida: Number(r.qtd_vendida),
    qtdEntregue: Number(r.qtd_entregue),
    saldoPendente: Number(r.saldo_pendente),
  }));
}

// ─── 4. Criação de Entrega ────────────────────────────────────────────────────

/**
 * Cria uma nova entrega (parcial ou total) para uma venda.
 *
 * REGRA DE NEGÓCIO: entregas são criadas a partir de vendas aprovadas.
 * Cada entrega gera códigos de verificação e pode ser:
 *   - Retirada na loja: cliente apresenta código A para retirar
 *   - Motoboy: motoboy retira com código B, entrega ao cliente com código A
 *
 * VALIDAÇÕES:
 *   1. Venda deve existir e não estar cancelada
 *   2. Quantidade de cada item <= saldo pendente (view vw_entregas_pendentes)
 *   3. Se tipo='total': todos os itens com saldo pendente devem ser cobertos
 *   4. Se forma='motoboy': motoboyId é obrigatório
 *   5. Frete: se frete_cobrado < frete_motoboy calculado, requer aprovação
 *
 * O QUE: em uma transação atômica, gera códigos, insere registro de entrega
 * e seus itens e registra auditoria.
 *
 * POR QUE: atomicidade garante que não fiquem códigos órfãos ou itens de
 * entrega sem a entrega principal em caso de falha parcial.
 *
 * IMPACTO SE ALTERADO: o fluxo de validação de saldo pendente é crítico —
 * se falhar, pode permitir entregar mais itens do que o vendido, gerando
 * estoque negativo e prejuízo financeiro.
 */
export async function criarEntrega(
  params: CriarEntregaParams,
  userId: string,
): Promise<Entrega> {
  // ─── Validações pré-transação ─────────────────────────────────────────────

  // 1. Venda existe e não está cancelada
  const [venda] = await sql`
    SELECT id, situacao, numero_venda, cliente_id
    FROM alissonerp.vendas_erp
    WHERE id = ${params.vendaId}
  `;

  if (!venda) {
    throw new Error(`Venda ${params.vendaId} não encontrada.`);
  }

  if (venda.situacao === "cancelado") {
    throw new Error(
      `Venda ${venda.numero_venda ?? params.vendaId} está cancelada. ` +
        "Não é possível criar entrega para venda cancelada.",
    );
  }

  // 2. Validar que há itens para entregar
  if (!params.itens || params.itens.length === 0) {
    throw new Error(
      "É necessário informar pelo menos um item para a entrega.",
    );
  }

  // 3. Validar saldo pendente de cada item
  const saldoPendente = await calcularSaldoPendente(params.vendaId);

  if (saldoPendente.length === 0) {
    throw new Error(
      `Venda ${venda.numero_venda ?? params.vendaId} não possui itens com saldo pendente para entrega.`,
    );
  }

  const saldoMap = new Map<number, number>();
  for (const s of saldoPendente) {
    saldoMap.set(s.itemVendaId, s.saldoPendente);
  }

  // Valida cada item da entrega
  for (const item of params.itens) {
    const disponivel = saldoMap.get(item.itemVendaId);

    if (disponivel === undefined) {
      throw new Error(
        `Item de venda ${item.itemVendaId} não encontrado no saldo pendente ` +
          `da venda ${venda.numero_venda ?? params.vendaId}.`,
      );
    }

    if (item.quantidade <= 0) {
      throw new Error(
        `Quantidade inválida (${item.quantidade}) para o item ${item.itemVendaId}. ` +
          "A quantidade deve ser maior que zero.",
      );
    }

    if (item.quantidade > disponivel) {
      throw new Error(
        `Saldo insuficiente para o item ${item.itemVendaId}: ` +
          `${disponivel} disponível, ${item.quantidade} solicitado.`,
      );
    }
  }

  // 4. Se tipo='total': todos os itens com saldo pendente devem ser cobertos integralmente
  if (params.tipo === "total") {
    for (const s of saldoPendente) {
      const itemEntrega = params.itens.find(
        (i) => i.itemVendaId === s.itemVendaId,
      );

      if (!itemEntrega) {
        throw new Error(
          `Entrega do tipo "total" deve incluir todos os itens pendentes. ` +
            `Item ${s.itemVendaId} (${s.nomeProduto}) não foi informado.`,
        );
      }

      if (itemEntrega.quantidade !== s.saldoPendente) {
        throw new Error(
          `Entrega do tipo "total" deve entregar todo o saldo pendente. ` +
            `Item ${s.itemVendaId} (${s.nomeProduto}): saldo ${s.saldoPendente}, ` +
            `solicitado ${itemEntrega.quantidade}.`,
        );
      }
    }
  }

  // 5. Se forma='motoboy': motoboyId é obrigatório
  if (params.formaEntrega === "motoboy" && !params.motoboyId) {
    throw new Error(
      "Motoboy é obrigatório para entregas do tipo 'motoboy'. " +
        "Informe o motoboyId.",
    );
  }

  // 6. Cálculo do frete
  const regiao = params.regiao ?? null;
  const freteMotoboyCalculado = regiao
    ? calcularValorMotoboy(regiao)
    : 0;
  const freteCobrado = money(params.freteCobrado ?? 0);
  const aprovacaoFreteNecessaria =
    params.formaEntrega === "motoboy" &&
    freteCobrado < freteMotoboyCalculado;

  // ─── Transação atômica ────────────────────────────────────────────────────

  const entregaBase = await sql.begin(async (tx: DbSql) => {
    // Gerar códigos dentro da transação para atomicidade
    const codigoEntrega = await gerarCodigoEntrega(tx);
    const codigoCliente = await gerarCodigoVerificacao(tx);

    let codigoMotoboy: string | null = null;
    if (params.formaEntrega === "motoboy") {
      codigoMotoboy = await gerarCodigoVerificacao(tx);
    }

    // Inserir entrega
    const [entregaRow] = await tx`
      INSERT INTO alissonerp.entregas_venda (
        venda_id, codigo_entrega, codigo_cliente, codigo_motoboy,
        tipo, forma_entrega, situacao, regiao,
        motoboy_id, frete_cobrado, frete_motoboy,
        aprovacao_frete_necessaria, observacoes,
        created_by
      ) VALUES (
        ${params.vendaId}, ${codigoEntrega}, ${codigoCliente},
        ${codigoMotoboy ?? null},
        ${params.tipo}, ${params.formaEntrega}, 'pendente',
        ${regiao},
        ${params.motoboyId ?? null}::uuid,
        ${freteCobrado}, ${freteMotoboyCalculado},
        ${aprovacaoFreteNecessaria},
        ${params.observacoes ?? null},
        ${userId}::uuid
      )
      RETURNING *
    `;

    const entregaId: number = Number(entregaRow.id);

    // Inserir itens da entrega
    const itensInseridos: EntregaItem[] = [];

    for (const item of params.itens) {
      const [itemRow] = await tx`
        INSERT INTO alissonerp.entregas_venda_itens (
          entrega_id, item_venda_id, quantidade_entregue, baixa_estoque_realizada
        ) VALUES (
          ${entregaId}, ${item.itemVendaId}, ${item.quantidade}, false
        )
        RETURNING *
      `;

      itensInseridos.push({
        id: Number(itemRow.id),
        entregaId: Number(itemRow.entrega_id),
        itemVendaId: Number(itemRow.item_venda_id),
        quantidade: Number(itemRow.quantidade_entregue),
        baixaEstoqueRealizada: Boolean(itemRow.baixa_estoque_realizada),
      });
    }

    // Registrar auditoria
    await logAudit(tx, {
      tabela: "entregas_venda",
      operacao: "INSERT",
      registro_id: entregaId,
      usuario_id: userId,
      dados_depois: {
        codigo_entrega: codigoEntrega,
        venda_id: params.vendaId,
        tipo: params.tipo,
        forma_entrega: params.formaEntrega,
        itens: params.itens.map((i) => ({
          item_venda_id: i.itemVendaId,
          quantidade: i.quantidade,
        })),
      },
    });

    // REGRA DE NEGÓCIO: saldo de frete grátis da gerente.
    // Se frete_cobrado > frete_motoboy: sobra vira crédito (abastece saldo).
    // Se frete_cobrado < frete_motoboy: diferença consome saldo (débito).
    // Se frete_cobrado == 0 (grátis total): valor integral do motoboy sai do saldo.
    // O que faz: busca o gerente_loja ativo e registra a movimentação.
    // IMPACTO SE REMOVIDO: saldo de frete grátis nunca atualiza.
    if (params.formaEntrega === "motoboy") {
      const diff = money(freteCobrado - freteMotoboyCalculado);
      if (diff !== 0 || freteCobrado === 0) {
        // Busca gerente_loja para vincular a movimentação
        const [gerente] = await tx`
          SELECT id FROM alissonerp.usuarios
          WHERE role = 'gerente_loja' AND ativo = true
          ORDER BY created_at LIMIT 1
        `;
        const gerenteId = gerente?.id ?? userId;

        const saldoAntes = await obterSaldoFreteGerenteNoTx(tx, gerenteId);

        if (diff > 0) {
          // Sobra: crédito
          await tx`
            INSERT INTO alissonerp.saldo_frete_gratis
              (gerente_id, tipo, valor, saldo_antes, saldo_depois, entrega_id, venda_id, descricao, created_by)
            VALUES
              (${gerenteId}::uuid, 'credito', ${diff}, ${saldoAntes}, ${money(saldoAntes + diff)},
               ${entregaId}, ${params.vendaId},
               ${`Frete cobrado ${fmBRL(freteCobrado)} > motoboy ${fmBRL(freteMotoboyCalculado)}`},
               ${userId}::uuid)
          `;
        } else {
          // Débito: frete grátis parcial ou total
          const debito = diff < 0 ? Math.abs(diff) : freteMotoboyCalculado;
          await tx`
            INSERT INTO alissonerp.saldo_frete_gratis
              (gerente_id, tipo, valor, saldo_antes, saldo_depois, entrega_id, venda_id, descricao, created_by)
            VALUES
              (${gerenteId}::uuid, 'debito', ${debito}, ${saldoAntes}, ${money(saldoAntes - debito)},
               ${entregaId}, ${params.vendaId},
               ${diff < 0
                  ? `Frete cobrado ${fmBRL(freteCobrado)} < motoboy ${fmBRL(freteMotoboyCalculado)}`
                  : `Frete grátis total — motoboy ${fmBRL(freteMotoboyCalculado)}`},
               ${userId}::uuid)
          `;
        }
      }
    }

    // Retornar entrega completa
    return {
      id: entregaId,
      vendaId: Number(entregaRow.venda_id),
      codigoEntrega,
      codigoCliente,
      codigoMotoboy,
      tipo: String(entregaRow.tipo),
      formaEntrega: String(entregaRow.forma_entrega),
      situacao: String(entregaRow.situacao),
      regiao: entregaRow.regiao ? String(entregaRow.regiao) : null,
      motoboyId: entregaRow.motoboy_id ? String(entregaRow.motoboy_id) : null,
      freteCobrado: money(entregaRow.frete_cobrado),
      freteMotoboy: money(entregaRow.frete_motoboy),
      aprovacaoFreteNecessaria: Boolean(entregaRow.aprovacao_frete_necessaria),
      dataSaida: entregaRow.data_saida ? String(entregaRow.data_saida) : null,
      dataRetirada: entregaRow.data_retirada ? String(entregaRow.data_retirada) : null,
      dataEntregaRealizada: entregaRow.data_entrega_realizada
        ? String(entregaRow.data_entrega_realizada)
        : null,
      dataEntregaPrevista: entregaRow.data_entrega_prevista
        ? String(entregaRow.data_entrega_prevista)
        : null,
      correiosRastreio: entregaRow.correios_rastreio
        ? String(entregaRow.correios_rastreio)
        : null,
      correiosDataPostagem: entregaRow.correios_data_postagem
        ? String(entregaRow.correios_data_postagem)
        : null,
      observacoes: entregaRow.observacoes
        ? String(entregaRow.observacoes)
        : null,
      itens: itensInseridos,
      createdAt: String(entregaRow.created_at),
      whatsappEnviado: false,
      whatsappErro: null,
      clienteNome: null,
      clienteTelefone: null,
      whatsappMotoboyEnviado: false,
      whatsappMotoboyErro: null,
      motoboyNome: null,
      motoboyTelefone: null,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any as Entrega;

  // ── WhatsApp (fora da transação, best-effort) ───────────────────────────
  // REGRA DE NEGÓCIO: Código A só é enviado quando o motoboy confirmar
  // a retirada (Código B). Na criação, apenas o Código B vai para o motoboy.
  // Se formaEntrega for retirada, o Código A é enviado imediatamente.
  let whatsAppResult: {
    whatsappEnviado: boolean;
    whatsappErro: string | null;
    clienteNome: string | null;
    clienteTelefone: string | null;
  } = { whatsappEnviado: false, whatsappErro: null, clienteNome: null, clienteTelefone: null };

  if (params.formaEntrega === "retirada") {
    whatsAppResult = await tentarEnviarWhatsApp(params.vendaId, entregaBase.codigoCliente);
  } else {
    // REGRA DE NEGÓCIO: mesmo sem enviar, verifica se o cliente tem WhatsApp.
    // Se não tiver, o modal avisa o operador antes que seja tarde demais
    // (o Código A será enviado após a confirmação do Código B).
    const [cliente] = await sql`
      SELECT c.nome, c.celular, c.telefone
      FROM alissonerp.vendas_erp ve
      JOIN public.contatos c ON c.id_contato = ve.cliente_id
      WHERE ve.id = ${params.vendaId}
      LIMIT 1
    `;
    const nome = (cliente as { nome?: string } | null)?.nome ?? null;
    const numero = (((cliente as { celular?: string; telefone?: string } | null)?.celular ||
      (cliente as { celular?: string; telefone?: string } | null)?.telefone || "").trim());
    whatsAppResult = {
      whatsappEnviado: false,
      whatsappErro: numero ? null : "Cliente sem WhatsApp cadastrado",
      clienteNome: nome,
      clienteTelefone: numero || null,
    };
  }

  // REGRA DE NEGÓCIO: se a entrega é via motoboy, o Código B também é enviado
  // por WhatsApp para o entregador. Mesmo princípio best-effort — falha no
  // envio não desfaz a entrega, e o operador pode reenviar depois.
  const whatsAppMotoboyResult = params.motoboyId
    ? await tentarEnviarWhatsAppMotoboy(
        params.motoboyId,
        entregaBase.codigoMotoboy ?? "",
      )
    : {
        whatsappMotoboyEnviado: false,
        whatsappMotoboyErro: null,
        motoboyNome: null,
        motoboyTelefone: null,
      };

  return { ...entregaBase, ...whatsAppResult, ...whatsAppMotoboyResult };
}

/**
 * Tenta enviar o código de verificação via WhatsApp para o cliente da venda.
 *
 * REGRA DE NEGÓCIO: best-effort — se o cliente não tiver WhatsApp cadastrado
 * ou o envio falhar, a entrega continua válida. O frontend mostra o status
 * e permite reenviar ou cadastrar o número depois.
 *
 * O QUE: busca celular/nome do cliente via vendas_erp → contatos e chama
 * enviarCodigoWhatsApp(). Retorna status do envio.
 *
 * POR QUE: separado da transação principal para não bloquear a criação
 * da entrega por falha no WhatsApp (serviço externo).
 */
async function tentarEnviarWhatsApp(
  vendaId: number,
  codigo: string,
): Promise<{
  whatsappEnviado: boolean;
  whatsappErro: string | null;
  clienteNome: string | null;
  clienteTelefone: string | null;
}> {
  try {
    const [row] = await sql`
      SELECT c.nome, c.celular, c.telefone
      FROM alissonerp.vendas_erp ve
      JOIN public.contatos c ON c.id_contato = ve.cliente_id
      WHERE ve.id = ${vendaId}
      LIMIT 1
    `;

    const nome: string = row?.nome ?? "";
    const numero: string = (row?.celular || row?.telefone || "").trim();

    if (!numero) {
      return {
        whatsappEnviado: false,
        whatsappErro: "Cliente sem WhatsApp cadastrado",
        clienteNome: nome || null,
        clienteTelefone: null,
      };
    }

    const envio = await enviarCodigoWhatsAppDetalhado(numero, codigo, nome);

    return {
      whatsappEnviado: envio.enviado,
      whatsappErro: envio.erro,
      clienteNome: nome || null,
      clienteTelefone: envio.numeroFormatado ?? numero,
    };
  } catch (err) {
    console.error("[entrega-venda] Erro ao enviar WhatsApp:", err);
    return {
      whatsappEnviado: false,
      whatsappErro: "Erro no serviço de WhatsApp",
      clienteNome: null,
      clienteTelefone: null,
    };
  }
}

/**
 * Tenta enviar o código de verificação B via WhatsApp para o motoboy.
 *
 * REGRA DE NEGÓCIO: quando a entrega é via motoboy, o Código B é enviado
 * automaticamente para o WhatsApp do entregador. Assim como o Código A do
 * cliente, o operador não precisa repassar manualmente — o motoboy recebe
 * direto no celular dele. Se falhar, a entrega não é desfeita.
 *
 * O QUE: busca telefone/nome do motoboy e chama enviarCodigoWhatsAppDetalhado().
 * POR QUE: automatiza a comunicação com o entregador, reduzindo erro humano
 * e garantindo que o código chegue ao destinatário certo.
 * IMPACTO SE REMOVIDO: o operador precisa copiar/colar o código e enviar
 * manualmente por outro canal, aumentando risco de erro e atraso.
 */
async function tentarEnviarWhatsAppMotoboy(
  motoboyId: string,
  codigo: string,
): Promise<{
  whatsappMotoboyEnviado: boolean;
  whatsappMotoboyErro: string | null;
  motoboyNome: string | null;
  motoboyTelefone: string | null;
}> {
  try {
    const [row] = await sql`
      SELECT nome, telefone
      FROM alissonerp.motoboys
      WHERE user_id = ${motoboyId}::uuid
        AND ativo = true
      LIMIT 1
    `;

    const nome: string = row?.nome ?? "";
    const numero: string = (row?.telefone ?? "").trim();

    if (!numero) {
      return {
        whatsappMotoboyEnviado: false,
        whatsappMotoboyErro: "Motoboy sem WhatsApp cadastrado",
        motoboyNome: nome || null,
        motoboyTelefone: null,
      };
    }

    const envio = await enviarCodigoWhatsAppDetalhado(
      numero,
      codigo,
      nome,
    );

    return {
      whatsappMotoboyEnviado: envio.enviado,
      whatsappMotoboyErro: envio.erro,
      motoboyNome: nome || null,
      motoboyTelefone: envio.numeroFormatado ?? numero,
    };
  } catch (err) {
    console.error("[entrega-venda] Erro ao enviar WhatsApp para motoboy:", err);
    return {
      whatsappMotoboyEnviado: false,
      whatsappMotoboyErro: "Erro no serviço de WhatsApp",
      motoboyNome: null,
      motoboyTelefone: null,
    };
  }
}

/**
 * Envia Código A para o cliente quando o motoboy retira a mercadoria.
 *
 * REGRA DE NEGÓCIO: o Código A só é enviado ao cliente DEPOIS que o
 * motoboy confirma a retirada (Código B). Antes disso o cliente não
 * recebe nada. A mensagem informa que o pedido está a caminho.
 */
async function tentarEnviarWhatsAppAoCliente(
  vendaId: number,
  codigo: string,
): Promise<void> {
  try {
    const [row] = await sql`
      SELECT c.nome, c.celular, c.telefone
      FROM alissonerp.vendas_erp ve
      JOIN public.contatos c ON c.id_contato = ve.cliente_id
      WHERE ve.id = ${vendaId}
      LIMIT 1
    `;
    const nome = (row as { nome?: string } | null)?.nome ?? "Cliente";
    const numero = ((row as { celular?: string; telefone?: string } | null)?.celular ||
      (row as { celular?: string; telefone?: string } | null)?.telefone || "").trim();
    if (!numero) return;
    await enviarCodigoClienteEmRota(numero, codigo, nome);
  } catch (err) {
    console.error("[entrega-venda] Erro ao enviar Código A ao cliente:", err);
  }
}

/**
 * Envia mensagem de conclusão quando a entrega é finalizada.
 *
 * REGRA DE NEGÓCIO: ao confirmar Código A, o cliente recebe uma
 * mensagem confirmando que a entrega foi concluída com sucesso.
 */
async function tentarEnviarWhatsAppConclusao(vendaId: number): Promise<void> {
  try {
    const [row] = await sql`
      SELECT c.nome, c.celular, c.telefone
      FROM alissonerp.vendas_erp ve
      JOIN public.contatos c ON c.id_contato = ve.cliente_id
      WHERE ve.id = ${vendaId}
      LIMIT 1
    `;
    const nome = (row as { nome?: string } | null)?.nome ?? "Cliente";
    const numero = ((row as { celular?: string; telefone?: string } | null)?.celular ||
      (row as { celular?: string; telefone?: string } | null)?.telefone || "").trim();
    if (!numero) return;
    await enviarConfirmacaoEntregaConcluida(numero, nome);
  } catch (err) {
    console.error("[entrega-venda] Erro ao enviar msg de conclusão:", err);
  }
}

// ─── 5. Confirmação de Entrega ────────────────────────────────────────────────

/**
 * Confirma uma entrega usando o código de verificação.
 *
 * REGRA DE NEGÓCIO: a confirmação pode ocorrer em duas etapas:
 *
 *   CÓDIGO B (codigo_motoboy) — MOTOBOY RETIRA NA LOJA:
 *     - Registra data_saida (momento em que o motoboy pegou a mercadoria)
 *     - Marca baixa_estoque_realizada = true em todos os itens
 *     - Etapa: 'retirada_loja'
 *
 *   CÓDIGO A (codigo_cliente) — CLIENTE RECEBE:
 *     - Se forma='retirada': cliente retirou na loja → data_retirada,
 *       situacao='confirmada', etapa='retirada_loja'
 *     - Se forma='motoboy': cliente recebeu em casa → data_entrega_realizada,
 *       situacao='confirmada', etapa='entrega_cliente'
 *     - Marca baixa_estoque_realizada = true em todos os itens
 *
 * O QUE: valida o código informado contra os códigos da entrega,
 * atualiza os campos de confirmação e marca a baixa de estoque nos itens.
 *
 * POR QUE: o sistema de dois códigos garante que apenas o cliente legítimo
 * (código A) ou o motoboy autorizado (código B) possam confirmar a entrega,
 * prevenindo fraudes e retiradas indevidas.
 *
 * IMPACTO SE ALTERADO: a baixa de estoque (baixa_estoque_realizada = true)
 * é o gatilho para dedução do estoque físico. Alterar este fluxo pode
 * causar estoque inconsistente ou dupla baixa.
 */
export async function confirmarEntrega(
  entregaId: number,
  codigo: string,
  usuarioId: string,
  fotoBase64?: string,
): Promise<ConfirmacaoResult> {
  // Carregar entrega
  const [entrega] = await sql`
    SELECT *
    FROM alissonerp.entregas_venda
    WHERE id = ${entregaId}
  `;

  if (!entrega) {
    throw new Error(`Entrega ${entregaId} não encontrada.`);
  }

  if (entrega.situacao === "cancelada") {
    throw new Error(
      `Entrega ${entrega.codigo_entrega} está cancelada e não pode ser confirmada.`,
    );
  }

  if (entrega.situacao === "confirmada") {
    throw new Error(
      `Entrega ${entrega.codigo_entrega} já foi confirmada.`,
    );
  }

  // Verificar se o código corresponde a algum dos códigos de verificação
  // REGRA: códigos são comparados como strings, sem trim ou formatação
  const matchMotoboy =
    entrega.codigo_motoboy !== null &&
    entrega.codigo_motoboy === codigo;

  const matchCliente = entrega.codigo_cliente === codigo;

  if (!matchMotoboy && !matchCliente) {
    throw new Error("Código inválido");
  }

  // ── Pré-validação: ordens de reposição pendentes ──────────────────────────
  // REGRA DE NEGÓCIO: impede confirmar entrega se há reposição pendente,
  // replicando a validação da trigger fn_estoque_comercial_entrega_venda
  // mas com mensagem de erro clara antes de iniciar a transação pesada.
  // POR QUE: a trigger do banco só dispara no UPDATE de vendas_erp setando
  // situacao='entregue', que é o último passo. Se falhar lá, toda a transação
  // (baixa estoque, atualização de entregas, etc) já rodou — desperdício e erro confuso.
  // IMPACTO SE REMOVIDO: o erro volta a ser capturado apenas na trigger.
  const [reposPendentes] = await sql`
    SELECT COUNT(*)::integer AS total
    FROM alissonerp.ordens o
    WHERE o.venda_id = ${Number(entrega.venda_id)}
      AND o.tipo_ordem = 'reposicao_venda'
      AND o.situacao IN ('criado', 'rascunho')
      AND o.status  != 'concluido'
  `;

  if (Number(reposPendentes.total) > 0) {
    throw new Error(
      `Entrega ${entrega.codigo_entrega} bloqueada: venda possui ${reposPendentes.total} ordem(ns) de reposição pendente(s). Conclua ou cancele antes de confirmar a entrega.`,
    );
  }

  // ─── Transação atômica ──────────────────────────────────────────────────

  const resultado = await sql.begin(async (tx: DbSql) => {
    let etapa: "retirada_loja" | "entrega_cliente";
    let novaSituacao: string;

    // CÓDIGO B — Motoboy retirou na loja
    if (matchMotoboy) {
      // Evitar dupla confirmação: se já houve retirada pelo motoboy, não repetir
      if (entrega.data_saida) {
        throw new Error(
          `Entrega ${entrega.codigo_entrega} já foi retirada pelo motoboy ` +
            `em ${String(entrega.data_saida)}.`,
        );
      }

      await tx`
        UPDATE alissonerp.entregas_venda
        SET
          data_saida = now(),
          confirmado_por_motoboy_retirada = ${usuarioId}::uuid,
          updated_at = now()
        WHERE id = ${entregaId}
      `;

      etapa = "retirada_loja";
      novaSituacao = "em_rota"; // Motoboy retirou mercadoria, está em rota de entrega

      // REGRA DE NEGÓCIO: venda também muda para "em_rota" quando o motoboy
      // retira, para refletir na dashboard comercial que a mercadoria saiu
      // da loja mas ainda não foi entregue ao cliente.
      await tx`
        UPDATE alissonerp.vendas_erp
        SET situacao = 'em_rota', updated_at = now()
        WHERE id = ${Number(entrega.venda_id)}
          AND situacao = 'aprovado'
      `;
    }
    // CÓDIGO A — Cliente (retirada na loja ou recebimento via motoboy)
    else {
      const formaEntrega: string = String(entrega.forma_entrega);

      if (formaEntrega === "retirada") {
        // Cliente retirou na loja
        if (entrega.data_retirada) {
          throw new Error(
            `Entrega ${entrega.codigo_entrega} já foi retirada pelo cliente ` +
              `em ${String(entrega.data_retirada)}.`,
          );
        }

        await tx`
          UPDATE alissonerp.entregas_venda
          SET
            data_retirada = now(),
            situacao = 'confirmada',
            confirmado_por_retirada = ${usuarioId}::uuid,
            updated_at = now()
          WHERE id = ${entregaId}
        `;

        etapa = "retirada_loja";
        novaSituacao = "confirmada";
      } else {
        // Motoboy entregou ao cliente
        if (entrega.data_entrega_realizada) {
          throw new Error(
            `Entrega ${entrega.codigo_entrega} já foi entregue ao cliente ` +
              `em ${String(entrega.data_entrega_realizada)}.`,
          );
        }

        await tx`
          UPDATE alissonerp.entregas_venda
          SET
            data_entrega_realizada = now(),
            situacao = 'confirmada',
            confirmado_por_motoboy_entrega = ${usuarioId}::uuid,
            updated_at = now()
          WHERE id = ${entregaId}
        `;

        etapa = "entrega_cliente";
        novaSituacao = "confirmada";
      }
    }

    await baixarEstoqueDaEntrega(
      tx,
      entregaId,
      Number(entrega.venda_id),
      usuarioId,
    );

    // Marcar baixa de estoque apenas nos itens desta entrega.
    // REGRA DE NEGÓCIO: este flag indica que a reserva correspondente já foi
    // efetivada no estoque comercial. A venda só muda para "entregue" depois
    // que todos os itens vendidos tiverem baixa confirmada.
    await tx`
      UPDATE alissonerp.entregas_venda_itens
      SET baixa_estoque_realizada = true
      WHERE entrega_id = ${entregaId}
        AND baixa_estoque_realizada = false
    `;

    // REGRA DE NEGÓCIO: Código B do motoboy registra saída da loja, mas a
    // venda só pode ficar "entregue" quando o Código A do cliente confirmar
    // retirada/recebimento. Se mudar isso, entrega por motoboy pode fechar a
    // venda antes do cliente receber.
    const vendaFoiEntregue = matchCliente
      ? await marcarVendaEntregueSeCompleta(tx, Number(entrega.venda_id))
      : false;

    // REGRA DE NEGÓCIO: foto de comprovação da entrega/retirada.
    // O QUE: recebe base64 do frontend, faz upload para Supabase Storage
    // (bucket pagamento-fotos) e salva o path na entrega. Best-effort:
    // se falhar, a confirmação continua válida sem foto.
    // POR QUE: auditoria visual de quem retirou/recebeu a mercadoria.
    // IMPACTO SE REMOVIDO: perde-se comprovação fotográfica da entrega.
    if (fotoBase64) {
      try {
        const timestamp = Date.now();
        const fotoPath = `entregas/${entregaId}/${timestamp}.jpg`;
        const upload = await uploadFile("pagamento-fotos", fotoPath, fotoBase64, "image/jpeg");
        if ("url" in upload) {
          await tx`
            UPDATE alissonerp.entregas_venda
            SET foto_entrega_path = ${upload.path}
            WHERE id = ${entregaId}
          `;
        }
      } catch (fotoErr) {
        console.error("[entrega-venda] Erro ao salvar foto da entrega:", fotoErr);
      }
    }

    // Registrar auditoria
    await logAudit(tx, {
      tabela: "entregas_venda",
      operacao: "UPDATE",
      registro_id: entregaId,
      usuario_id: usuarioId,
      dados_antes: {
        situacao: entrega.situacao,
        data_saida: entrega.data_saida,
        data_retirada: entrega.data_retirada,
        data_entrega_realizada: entrega.data_entrega_realizada,
      },
      dados_depois: {
        situacao: novaSituacao,
        etapa,
        codigo_usado: matchMotoboy ? "codigo_motoboy" : "codigo_cliente",
        venda_situacao: vendaFoiEntregue ? "entregue" : "permanece_aprovado",
      },
    });

    return { etapa, situacao: novaSituacao, vendaId: Number(entrega.venda_id), codigoCliente: String(entrega.codigo_cliente) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;

  // ── WhatsApp pós-confirmação (fora da transação, best-effort) ──────────
  // REGRA DE NEGÓCIO: ao confirmar Código B (motoboy retirou), envia
  // Código A para o cliente avisando que o pedido está a caminho.
  // Ao confirmar Código A (retirada ou entrega finalizada), envia msg conclusão.
  if (!matchMotoboy && resultado.situacao === "confirmada") {
    // Código A foi usado → entrega concluída → msg de conclusão
    tentarEnviarWhatsAppConclusao(resultado.vendaId).catch(() => {});
  } else if (matchMotoboy) {
    // Código B foi usado → motoboy retirou → enviar Código A ao cliente
    tentarEnviarWhatsAppAoCliente(resultado.vendaId, resultado.codigoCliente).catch(() => {});
  }

  return { etapa: resultado.etapa, situacao: resultado.situacao } as ConfirmacaoResult;
}

// ─── 6. Cancelamento de Entrega ───────────────────────────────────────────────

/**
 * Cancela uma entrega que ainda está pendente.
 *
 * REGRA DE NEGÓCIO: apenas entregas com situacao='pendente' podem ser canceladas.
 * Entregas já confirmadas ou já canceladas não podem ser alteradas.
 * O cancelamento libera o saldo pendente dos itens para novas entregas.
 *
 * O QUE: atualiza situacao para 'cancelada', registra auditoria.
 *
 * POR QUE: permite corrigir erros operacionais (ex: entrega criada com
 * itens errados) sem perder rastreabilidade — o registro permanece
 * como cancelado, não é deletado.
 *
 * IMPACTO SE REMOVIDO: sem cancelamento, entregas erradas ficariam
 * "presas" no sistema, impedindo a criação de entregas corretas
 * para os mesmos itens (pois o saldo estaria comprometido).
 */
export async function cancelarEntrega(
  entregaId: number,
  usuarioId: string,
): Promise<void> {
  const [entrega] = await sql`
    SELECT id, situacao, codigo_entrega
    FROM alissonerp.entregas_venda
    WHERE id = ${entregaId}
  `;

  if (!entrega) {
    throw new Error(`Entrega ${entregaId} não encontrada.`);
  }

  if (entrega.situacao !== "pendente") {
    throw new Error(
      `Apenas entregas pendentes podem ser canceladas. ` +
        `Entrega ${entrega.codigo_entrega} está com situação "${entrega.situacao}".`,
    );
  }

  await sql.begin(async (tx: DbSql) => {
    await tx`
      UPDATE alissonerp.entregas_venda
      SET situacao = 'cancelada', updated_at = now()
      WHERE id = ${entregaId}
    `;

    await logAudit(tx, {
      tabela: "entregas_venda",
      operacao: "UPDATE",
      registro_id: entregaId,
      usuario_id: usuarioId,
      dados_antes: { situacao: "pendente" },
      dados_depois: { situacao: "cancelada" },
    });
  });
}

// ─── 7. Atualização de Correios ───────────────────────────────────────────────

/**
 * Atualiza os dados de rastreio dos Correios para uma entrega.
 *
 * REGRA DE NEGÓCIO: quando uma entrega é despachada via Correios,
 * o código de rastreio e a data de postagem são registrados para
 * que o cliente possa acompanhar o envio.
 *
 * O QUE: atualiza correios_rastreio e correios_data_postagem.
 * POR QUE: centraliza o rastreio na entrega, permitindo que o
 * frontend exiba o link de rastreamento dos Correios.
 * IMPACTO SE ALTERADO: se os campos forem renomeados, o frontend
 * de acompanhamento de entrega para de funcionar.
 */
export async function atualizarCorreios(
  entregaId: number,
  rastreio: string,
  usuarioId: string,
): Promise<Record<string, unknown>> {
  if (!rastreio || !rastreio.trim()) {
    throw new Error("Código de rastreio é obrigatório.");
  }

  const [entrega] = await sql`
    SELECT id, situacao, codigo_entrega
    FROM alissonerp.entregas_venda
    WHERE id = ${entregaId}
  `;

  if (!entrega) {
    throw new Error(`Entrega ${entregaId} não encontrada.`);
  }

  if (entrega.situacao === "cancelada") {
    throw new Error(
      `Não é possível atualizar rastreio de entrega cancelada ` +
        `(${entrega.codigo_entrega}).`,
    );
  }

  return sql.begin(async (tx: DbSql) => {
    const [updated] = await tx`
      UPDATE alissonerp.entregas_venda
      SET
        correios_rastreio = ${rastreio.trim()},
        correios_data_postagem = now(),
        updated_at = now()
      WHERE id = ${entregaId}
      RETURNING *
    `;

    await logAudit(tx, {
      tabela: "entregas_venda",
      operacao: "UPDATE",
      registro_id: entregaId,
      usuario_id: usuarioId,
      dados_depois: {
        correios_rastreio: rastreio.trim(),
        correios_data_postagem: "now()",
      },
    });

    return {
      id: Number(updated.id),
      correiosRastreio: String(updated.correios_rastreio ?? ""),
      correiosDataPostagem: updated.correios_data_postagem
        ? String(updated.correios_data_postagem)
        : null,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any as Promise<Record<string, unknown>>;
}

// ─── 8. Atualização de Transporte ─────────────────────────────────────────────

/**
 * Atualiza os dados de transporte (região, motoboy, frete, data prevista).
 *
 * REGRA DE NEGÓCIO: permite ajustar a logística da entrega após a criação,
 * como trocar o motoboy, alterar a região de entrega ou ajustar a previsão.
 * Se o frete_motoboy for alterado, recalcula aprovacao_frete_necessaria
 * comparando com frete_cobrado.
 *
 * O QUE: atualiza regiao, motoboy_id, frete_motoboy e data_entrega_prevista.
 * POR QUE: flexibilidade operacional — mudanças de rota ou disponibilidade
 * de motoboy não devem exigir cancelar e recriar toda a entrega.
 * IMPACTO SE ALTERADO: se a lógica de aprovacao_frete_necessaria for
 * removida, fretes com desconto indevido podem passar sem aprovação.
 */
export async function atualizarTransporte(
  entregaId: number,
  dados: AtualizarTransporteParams,
  usuarioId: string,
): Promise<Record<string, unknown>> {
  const [entrega] = await sql`
    SELECT id, situacao, codigo_entrega, frete_cobrado, regiao
    FROM alissonerp.entregas_venda
    WHERE id = ${entregaId}
  `;

  if (!entrega) {
    throw new Error(`Entrega ${entregaId} não encontrada.`);
  }

  if (entrega.situacao === "cancelada") {
    throw new Error(
      `Não é possível atualizar transporte de entrega cancelada ` +
        `(${entrega.codigo_entrega}).`,
    );
  }

  return sql.begin(async (tx: DbSql) => {
    // Construir SET dinâmico baseado nos campos informados
    const sets: string[] = ["updated_at = now()"];
    const vals: unknown[] = [];

    if (dados.regiao !== undefined) {
      sets.push(`regiao = $${vals.length + 1}`);
      vals.push(dados.regiao);
    }

    if (dados.motoboyId !== undefined) {
      sets.push(`motoboy_id = $${vals.length + 1}::uuid`);
      vals.push(dados.motoboyId || null);
    }

    if (dados.dataEntregaPrevista !== undefined) {
      sets.push(`data_entrega_prevista = $${vals.length + 1}`);
      vals.push(dados.dataEntregaPrevista || null);
    }

    // Se frete_motoboy foi alterado explicitamente, recalcular aprovação
    if (dados.freteMotoboy !== undefined) {
      sets.push(`frete_motoboy = $${vals.length + 1}`);
      vals.push(money(dados.freteMotoboy));

      // Recalcular aprovacao_frete_necessaria:
      // Se frete_cobrado < novo frete_motoboy → requer aprovação
      const freteCobrado = money(entrega.frete_cobrado);
      const novoFreteMotoboy = money(dados.freteMotoboy);
      const precisaAprovacao = freteCobrado < novoFreteMotoboy;

      sets.push(`aprovacao_frete_necessaria = $${vals.length + 1}`);
      vals.push(precisaAprovacao);
    } else if (dados.regiao !== undefined) {
      // Se apenas a região mudou, recalcular frete_motoboy automaticamente
      // REGRA: mudar de "fortaleza" para "fora_fortaleza" altera o custo do frete
      const novoFreteMotoboy = calcularValorMotoboy(dados.regiao);
      sets.push(`frete_motoboy = $${vals.length + 1}`);
      vals.push(novoFreteMotoboy);

      const freteCobrado = money(entrega.frete_cobrado);
      const precisaAprovacao = freteCobrado < novoFreteMotoboy;
      sets.push(`aprovacao_frete_necessaria = $${vals.length + 1}`);
      vals.push(precisaAprovacao);
    }

    if (sets.length === 1) {
      throw new Error("Nenhum dado informado para atualização de transporte.");
    }

    // REGRA DE NEGÓCIO: usa sql.unsafe para construir UPDATE dinâmico
    // dos campos de transporte. Apenas os campos informados são alterados,
    // evitando sobrescrever dados não relacionados com null.
    // POR QUE: flexibilidade — permite atualizar apenas o motoboy, ou apenas
    // a data prevista, sem afetar outros campos.
    // IMPACTO SE ALTERADO: se migrar para ORM, manter a mesma semântica
    // de partial update (PATCH, não PUT).
    const [updated] = await tx.unsafe(
      `UPDATE alissonerp.entregas_venda SET ${sets.join(", ")} WHERE id = $${vals.length + 1} RETURNING *`,
      [...vals, entregaId] as any[],
    );

    await logAudit(tx, {
      tabela: "entregas_venda",
      operacao: "UPDATE",
      registro_id: entregaId,
      usuario_id: usuarioId,
      dados_antes: {
        regiao: entrega.regiao,
        frete_motoboy: money(entrega.frete_motoboy ?? 0),
      },
      dados_depois: {
        regiao: dados.regiao ?? entrega.regiao,
        motoboy_id: dados.motoboyId ?? entrega.motoboy_id,
        frete_motoboy: dados.freteMotoboy ?? money(entrega.frete_motoboy ?? 0),
        data_entrega_prevista: dados.dataEntregaPrevista ?? entrega.data_entrega_prevista,
      },
    });

    return {
      id: Number(updated.id),
      regiao: updated.regiao ? String(updated.regiao) : null,
      motoboyId: updated.motoboy_id ? String(updated.motoboy_id) : null,
      freteMotoboy: money(updated.frete_motoboy),
      dataEntregaPrevista: updated.data_entrega_prevista
        ? String(updated.data_entrega_prevista)
        : null,
      aprovacaoFreteNecessaria: Boolean(updated.aprovacao_frete_necessaria),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any as Promise<Record<string, unknown>>;
}

// ─── 9. Saldo de Frete Grátis ─────────────────────────────────────────────────

export interface MovimentacaoFrete {
  id: number;
  gerenteId: string;
  tipo: "credito" | "debito";
  valor: number;
  saldoAntes: number;
  saldoDepois: number;
  entregaId: number | null;
  vendaId: number | null;
  descricao: string | null;
  createdAt: string;
}

async function obterSaldoFreteGerenteNoTx(tx: DbSql, gerenteId: string): Promise<number> {
  const [row] = await tx`
    SELECT
      COALESCE(SUM(CASE WHEN tipo = 'credito' THEN valor ELSE 0 END), 0)
      - COALESCE(SUM(CASE WHEN tipo = 'debito' THEN valor ELSE 0 END), 0)
      AS saldo
    FROM alissonerp.saldo_frete_gratis
    WHERE gerente_id = ${gerenteId}::uuid
  `;
  return money(row?.saldo ?? 0);
}

export async function obterSaldoFreteGerente(gerenteId: string): Promise<number> {
  return obterSaldoFreteGerenteNoTx(sql, gerenteId);
}

export async function creditarSaldoFrete(
  gerenteId: string, valor: number, entregaId: number, vendaId: number,
): Promise<MovimentacaoFrete> {
  const v = money(valor);
  return sql.begin(async (tx: DbSql) => {
    const antes = await obterSaldoFreteGerenteNoTx(tx, gerenteId);
    const depois = money(antes + v);
    const [row] = await tx`
      INSERT INTO alissonerp.saldo_frete_gratis
        (gerente_id, tipo, valor, saldo_antes, saldo_depois, entrega_id, venda_id, descricao, created_by)
      VALUES (${gerenteId}::uuid, 'credito', ${v}, ${antes}, ${depois}, ${entregaId}, ${vendaId},
              ${`Sobra frete entrega #${entregaId}`}, ${gerenteId}::uuid)
      RETURNING *
    `;
    return montarMovimentacao(row);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any as Promise<MovimentacaoFrete>;
}

export async function debitarSaldoFrete(
  gerenteId: string, valor: number, entregaId: number, vendaId: number,
): Promise<MovimentacaoFrete> {
  const v = money(valor);
  return sql.begin(async (tx: DbSql) => {
    const antes = await obterSaldoFreteGerenteNoTx(tx, gerenteId);
    const depois = money(antes - v);
    const [row] = await tx`
      INSERT INTO alissonerp.saldo_frete_gratis
        (gerente_id, tipo, valor, saldo_antes, saldo_depois, entrega_id, venda_id, descricao, created_by)
      VALUES (${gerenteId}::uuid, 'debito', ${v}, ${antes}, ${depois}, ${entregaId}, ${vendaId},
              ${`Débito frete entrega #${entregaId}`}, ${gerenteId}::uuid)
      RETURNING *
    `;
    return montarMovimentacao(row);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any as Promise<MovimentacaoFrete>;
}

export async function listarMovimentacoesFrete(
  gerenteId: string, limite = 50,
): Promise<MovimentacaoFrete[]> {
  const rows = await sql`
    SELECT id, gerente_id, tipo, valor, saldo_antes, saldo_depois,
           entrega_id, venda_id, descricao, created_at
    FROM alissonerp.saldo_frete_gratis
    WHERE gerente_id = ${gerenteId}::uuid
    ORDER BY created_at DESC, id DESC
    LIMIT ${limite}
  `;
  return rows.map(montarMovimentacao);
}

function montarMovimentacao(r: any): MovimentacaoFrete {
  return {
    id: Number(r.id), gerenteId: String(r.gerente_id),
    tipo: r.tipo as "credito" | "debito", valor: Number(r.valor),
    saldoAntes: Number(r.saldo_antes), saldoDepois: Number(r.saldo_depois),
    entregaId: r.entrega_id ? Number(r.entrega_id) : null,
    vendaId: r.venda_id ? Number(r.venda_id) : null,
    descricao: r.descricao ? String(r.descricao) : null,
    createdAt: String(r.created_at),
  };
}

// ─── 10. Frete Avulso ─────────────────────────────────────────────────────────

/**
 * Parâmetros para criação de frete avulso (corrida sem venda vinculada).
 * REGRA DE NEGÓCIO: avulso não tem venda, itens ou código de verificação.
 * Motoboy e frete_cobrado são obrigatórios. Cliente e descrição são opcionais.
 * IMPACTO SE ALTERADO: avulso sem motoboy não pode ser confirmado depois.
 */
export interface CriarFreteAvulsoParams {
  motoboyId: string; // UUID — obrigatório
  regiao: "fortaleza" | "fora_fortaleza" | "longe" | "correios";
  freteCobrado: number;
  freteMotoboyOverride?: number; // usado em longe/correios onde frete=0 e valor é negociado
  descricaoAvulso?: string;
  contatoId?: number;
  observacoes?: string;
}

/** Resultado da criação de frete avulso */
export interface FreteAvulso {
  id: number;
  codigoEntrega: string;
  situacao: string;
  regiao: string;
  motoboyId: string;
  freteCobrado: number;
  freteMotoboy: number;
  descricaoAvulso: string | null;
  contatoId: number | null;
  clienteNome: string | null;
  observacoes: string | null;
  createdAt: string;
  motoboyNome: string | null;
  motoboyTelefone: string | null;
}

/**
 * Cria um frete avulso — corrida de motoboy sem venda vinculada.
 *
 * REGRA DE NEGÓCIO: frete avulso não tem itens, não tem código de verificação
 * e não dispara WhatsApp. O motoboy confirma com botão simples no app.
 * O valor do frete_motoboy é calculado pela região (igual às entregas normais)
 * e entra no acerto financeiro do motoboy normalmente.
 *
 * O QUE: insere linha em entregas_venda com is_avulso=true, venda_id=NULL,
 * codigo_cliente=NULL, codigo_motoboy=NULL e registra auditoria.
 *
 * POR QUE: reutiliza a infraestrutura de motoboys, saldo de frete e pagamento
 * sem duplicar tabelas. A constraint chk_entrega_origem garante consistência.
 *
 * IMPACTO SE ALTERADO: avulsas confirmadas vão para pagamento de motoboys —
 * não alterar frete_motoboy sem ajustar o acerto.
 */
export async function criarFreteAvulso(
  params: CriarFreteAvulsoParams,
  userId: string,
): Promise<FreteAvulso> {
  if (!params.motoboyId) {
    throw new Error("Motoboy é obrigatório para frete avulso.");
  }
  if (params.freteCobrado < 0) {
    throw new Error("Valor do frete não pode ser negativo.");
  }

  const freteBase = calcularValorMotoboy(params.regiao);
  const freteMotoboy = freteBase > 0 ? freteBase : money(params.freteMotoboyOverride ?? 0);
  const freteCobrado = money(params.freteCobrado);

  const resultado = await sql.begin(async (tx: DbSql) => {
    const codigoEntrega = await gerarCodigoEntrega(tx);

    const [row] = await tx`
      INSERT INTO alissonerp.entregas_venda (
        is_avulso, venda_id,
        contato_id, descricao_avulso,
        codigo_entrega, codigo_cliente, codigo_motoboy,
        tipo, forma_entrega, situacao, regiao,
        motoboy_id, frete_cobrado, frete_motoboy,
        aprovacao_frete_necessaria, observacoes,
        created_by
      ) VALUES (
        true, NULL,
        ${params.contatoId ?? null}, ${params.descricaoAvulso ?? null},
        ${codigoEntrega}, NULL, NULL,
        'total', 'motoboy', 'pendente', ${params.regiao},
        ${params.motoboyId}::uuid, ${freteCobrado}, ${freteMotoboy},
        false, ${params.observacoes ?? null},
        ${userId}::uuid
      )
      RETURNING *
    `;

    const entregaId = Number(row.id);

    // REGRA DE NEGÓCIO: saldo de frete da gerente também se aplica a avulsas.
    // Avulso sempre consome saldo (o frete_motoboy é custo da loja).
    // Se frete_cobrado > frete_motoboy: crédito (sobra).
    // Se frete_cobrado < frete_motoboy: débito (déficit).
    if (freteMotoboy > 0 || freteCobrado > 0) {
      const diff = money(freteCobrado - freteMotoboy);
      if (diff !== 0) {
        const [gerente] = await tx`
          SELECT id FROM alissonerp.usuarios
          WHERE role = 'gerente_loja' AND ativo = true
          ORDER BY created_at LIMIT 1
        `;
        const gerenteId = (gerente?.id as string) ?? userId;
        const saldoAntes = await obterSaldoFreteGerenteNoTx(tx, gerenteId);

        if (diff > 0) {
          await tx`
            INSERT INTO alissonerp.saldo_frete_gratis
              (gerente_id, tipo, valor, saldo_antes, saldo_depois, entrega_id, venda_id, descricao, created_by)
            VALUES
              (${gerenteId}::uuid, 'credito', ${diff}, ${saldoAntes}, ${money(saldoAntes + diff)},
               ${entregaId}, NULL,
               ${`Frete avulso cobrado ${fmBRL(freteCobrado)} > motoboy ${fmBRL(freteMotoboy)}`},
               ${userId}::uuid)
          `;
        } else {
          const debito = Math.abs(diff);
          await tx`
            INSERT INTO alissonerp.saldo_frete_gratis
              (gerente_id, tipo, valor, saldo_antes, saldo_depois, entrega_id, venda_id, descricao, created_by)
            VALUES
              (${gerenteId}::uuid, 'debito', ${debito}, ${saldoAntes}, ${money(saldoAntes - debito)},
               ${entregaId}, NULL,
               ${`Frete avulso cobrado ${fmBRL(freteCobrado)} < motoboy ${fmBRL(freteMotoboy)}`},
               ${userId}::uuid)
          `;
        }
      }
    }

    await logAudit(tx, {
      tabela: "entregas_venda",
      operacao: "INSERT",
      registro_id: entregaId,
      usuario_id: userId,
      dados_depois: {
        is_avulso: true,
        codigo_entrega: codigoEntrega,
        motoboy_id: params.motoboyId,
        regiao: params.regiao,
        frete_cobrado: freteCobrado,
        frete_motoboy: freteMotoboy,
        descricao_avulso: params.descricaoAvulso ?? null,
      },
    });

    return row;
  }) as Record<string, unknown>;

  // Buscar nome/telefone do motoboy para retornar na resposta
  const [motoboy] = await sql`
    SELECT nome, telefone FROM alissonerp.motoboys
    WHERE user_id = ${params.motoboyId}::uuid AND ativo = true LIMIT 1
  `;

  // Buscar nome do contato se informado
  let clienteNome: string | null = null;
  if (params.contatoId) {
    const [contato] = await sql`
      SELECT nome FROM public.contatos WHERE id_contato = ${params.contatoId} LIMIT 1
    `;
    clienteNome = contato?.nome ? String(contato.nome) : null;
  }

  return {
    id: Number(resultado.id),
    codigoEntrega: String(resultado.codigo_entrega),
    situacao: String(resultado.situacao),
    regiao: String(resultado.regiao),
    motoboyId: String(resultado.motoboy_id),
    freteCobrado: money(resultado.frete_cobrado),
    freteMotoboy: money(resultado.frete_motoboy),
    descricaoAvulso: resultado.descricao_avulso ? String(resultado.descricao_avulso) : null,
    contatoId: resultado.contato_id ? Number(resultado.contato_id) : null,
    clienteNome,
    observacoes: resultado.observacoes ? String(resultado.observacoes) : null,
    createdAt: String(resultado.created_at),
    motoboyNome: motoboy?.nome ? String(motoboy.nome) : null,
    motoboyTelefone: motoboy?.telefone ? String(motoboy.telefone) : null,
  };
}

/**
 * Confirma um frete avulso (sem código de verificação).
 *
 * REGRA DE NEGÓCIO: avulso não usa código A/B. O motoboy clica "Confirmar"
 * no app e isso encerra a corrida. Apenas o motoboy dono da entrega ou
 * admin/gerente podem confirmar.
 *
 * O QUE: valida que a entrega é avulsa e está pendente, depois atualiza
 * situacao='confirmada' e data_entrega_realizada=now().
 *
 * IMPACTO SE ALTERADO: entrega confirmada entra no acerto do motoboy.
 * Não duplicar confirmação (guard situacao='pendente').
 */
export async function confirmarFreteAvulso(
  entregaId: number,
  usuarioId: string,
): Promise<void> {
  const [entrega] = await sql`
    SELECT id, situacao, codigo_entrega, is_avulso, motoboy_id
    FROM alissonerp.entregas_venda
    WHERE id = ${entregaId}
  `;

  if (!entrega) {
    throw new Error(`Entrega ${entregaId} não encontrada.`);
  }

  if (!entrega.is_avulso) {
    throw new Error("Esta rota é exclusiva para fretes avulsos.");
  }

  if (entrega.situacao === "confirmada") {
    throw new Error(`Entrega ${entrega.codigo_entrega} já foi confirmada.`);
  }

  if (entrega.situacao === "cancelada") {
    throw new Error(`Entrega ${entrega.codigo_entrega} está cancelada.`);
  }

  await sql.begin(async (tx: DbSql) => {
    await tx`
      UPDATE alissonerp.entregas_venda
      SET
        situacao = 'confirmada',
        data_entrega_realizada = now(),
        confirmado_por_motoboy_entrega = ${usuarioId}::uuid,
        updated_at = now()
      WHERE id = ${entregaId}
    `;

    await logAudit(tx, {
      tabela: "entregas_venda",
      operacao: "UPDATE",
      registro_id: entregaId,
      usuario_id: usuarioId,
      dados_antes: { situacao: entrega.situacao },
      dados_depois: { situacao: "confirmada", is_avulso: true },
    });
  });
}
