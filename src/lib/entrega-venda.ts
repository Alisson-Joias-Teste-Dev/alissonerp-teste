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
import { vendaEntregaDevendo, vendaTemExcecaoEntregaAprovada } from "@/lib/entrega-sem-pagamento";
import { enviarCodigoWhatsAppDetalhado, enviarCodigoClienteEmRota, enviarConfirmacaoEntregaConcluida, enviarAvisoDesenvolvedor } from "@/lib/whatsapp";
import { uploadFile } from "@/lib/storage";
import { criarNotificacao } from "@/lib/notificacoes";

// O client transacional do pacote postgres não expõe call signature adequada
// para o TypeScript neste projeto; as rotas existentes usam o mesmo padrão.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbSql = any;

// ─── Tipos ────────────────────────────────────────────────────────────────────

/** Item de saldo pendente para entrega, vindo da view vw_entregas_pendentes */
export interface SaldoPendenteItem {
  itemVendaId: number;
  produtoId: number | null;
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
    LEFT JOIN alissonerp.estoque_comercial_config ecc ON ecc.produto_id = ive.produto_id
    WHERE evi.entrega_id = ${entregaId}
      AND evi.baixa_estoque_realizada = false
      AND ive.produto_id IS NOT NULL
      -- REGRA DE NEGÓCIO: só dá baixa em produtos que controlam estoque.
      -- Produtos com controla_estoque=false (ex.: componentes feitos sob
      -- encomenda) não têm reserva e não devem ser baixados — apenas pulados.
      -- COALESCE(...,true): produto sem config controla estoque por padrão.
      AND COALESCE(ecc.controla_estoque, true) = true
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

    // REGRA DE NEGÓCIO (corrigido 12/06 — Jonathan): a baixa segue a EXISTÊNCIA
    // da reserva, não a flag controla_estoque. A reserva é criada quando o produto
    // tem estoque_comercial_config.ativo = true; se há reserva ativa, ela DEVE ser
    // baixada (saída do entregue) e dividida (reserva do que falta). Antes a baixa
    // pulava produtos com controla_estoque=false e a reserva ficava presa (qtd
    // cheia, sem saída). Item sem nenhuma reserva ativa = produto que não controla
    // estoque comercial → pula sem erro.
    // IMPACTO SE REMOVIDO: volta a deixar reserva presa em produto ativo sem
    // controla_estoque (saldo disponível errado, dupla reserva).
    if (reservas.length === 0) {
      continue;
    }

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

  // ETAPA 4 (Pagamento na Entrega — decisão Jonathan 11/06): NÃO marca entregue
  // enquanto houver saldo 'Na Entrega' pendente. O atendente/motoboy precisa
  // registrar o pagamento real antes (rota POST /api/vendas/[id]/cobrar-entrega).
  // IMPACTO SE REMOVIDO: joia sairia entregue sem o cliente ter pago o que ficou
  // combinado para pagar na entrega.
  const [naEntrega] = await tx`
    SELECT COALESCE(SUM(valor), 0)::numeric AS total
    FROM alissonerp.pagamentos_venda
    WHERE venda_id = ${vendaId} AND forma = 'Na Entrega' AND status = 'pendente'
  `;
  if (Number(naEntrega.total) > 0) {
    throw new Error(
      `NA_ENTREGA_PENDENTE: registre o pagamento na entrega (R$${Number(naEntrega.total).toFixed(2)}) antes de concluir a entrega.`,
    );
  }

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
      produto_id,
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
    produtoId: r.produto_id != null ? Number(r.produto_id) : null,
    nomeProduto: String(r.nome_produto ?? ""),
    sku: r.sku ? String(r.sku) : "",
    qtdVendida: Number(r.qtd_vendida),
    qtdEntregue: Number(r.qtd_entregue),
    saldoPendente: Number(r.saldo_pendente),
  }));
}

export interface BloqueioReposicao {
  produtosBloqueados: number[];   // produtos com reposição aberta → não entregar ainda
  bloqueioVendaInteira: boolean;  // reposição aberta SEM produto identificável → trava tudo
  ordensAbertas: string[];        // números das ordens abertas (para a mensagem)
}

/**
 * Bloqueio de entrega POR ITEM por causa de reposição (sob encomenda).
 *
 * REGRA DE NEGÓCIO (12/06 — Jonathan): a reposição (item vendido como pronta
 * entrega mas que faltou no estoque) trava só A ENTREGA DAQUELE ITEM, não a venda
 * inteira — assim o cliente leva os itens prontos e espera só o da reposição.
 * O vínculo item↔reposição é pelo PRODUTO do item da própria ordem
 * (alissonerp.itens_ordem.produto_id), que cobre ~81% das reposições. Quando a
 * ordem aberta não tem produto identificável, cai no seguro: bloqueia a venda
 * inteira (bloqueioVendaInteira=true).
 *
 * IMPACTO SE REMOVIDO: volta a travar a venda toda por causa de um item em
 * reposição, prendendo os itens prontos.
 */
export async function calcularBloqueioReposicao(
  db: DbSql,
  vendaId: number,
): Promise<BloqueioReposicao> {
  const rows = await db`
    SELECT o.numero_ordem,
           array_remove(array_agg(DISTINCT io.produto_id), NULL) AS produtos
    FROM alissonerp.ordens o
    LEFT JOIN alissonerp.itens_ordem io ON io.ordem_id = o.id
    WHERE o.venda_id = ${vendaId}
      AND o.tipo_ordem IN ('reposicao_venda', 'reposicao_loja')
      AND o.status NOT IN ('concluido', 'cancelado')
    GROUP BY o.id, o.numero_ordem
  `;
  const produtos = new Set<number>();
  const ordens = new Set<string>();
  let vendaInteira = false;
  for (const r of rows as Array<{ numero_ordem: string; produtos: number[] | null }>) {
    ordens.add(String(r.numero_ordem));
    const ps = (r.produtos ?? []).map(Number).filter((n) => !Number.isNaN(n));
    if (ps.length === 0) {
      vendaInteira = true; // ordem aberta sem produto → não dá pra saber o item → trava tudo
    } else {
      ps.forEach((p) => produtos.add(p));
    }
  }
  return {
    produtosBloqueados: Array.from(produtos),
    bloqueioVendaInteira: vendaInteira,
    ordensAbertas: Array.from(ordens),
  };
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

  // Venda precisa estar APROVADA (ou já em rota) para montar a entrega.
  // REGRA DE NEGÓCIO (ajuste 12/06 — Jonathan): não se monta entrega de venda
  // em rascunho/não aprovada — barra ANTES de gerar o código. 'em_rota' é
  // permitido para continuar entregas parciais já iniciadas.
  // IMPACTO SE REMOVIDO: dá pra gerar código de entrega de venda que ainda nem
  // foi aprovada (sem pagamento/ordem definidos).
  if (venda.situacao !== "aprovado" && venda.situacao !== "em_rota") {
    throw new Error(
      `Venda ${venda.numero_venda ?? params.vendaId} precisa estar aprovada para montar a entrega ` +
        `(situação atual: ${venda.situacao}).`,
    );
  }

  // RETIRADA + "Na Entrega" pendente: cobrar ANTES de montar a entrega.
  //
  // REGRA DE NEGÓCIO (13/06 — Jonathan): na retirada na loja o cliente está
  // presente e o código do cliente é confirmado na hora; se há saldo "Na Entrega"
  // pendente, esse código seria barrado e a entrega recém-criada acabaria
  // CANCELADA ao fechar (a entrega só sobrevive com código confirmado). Para não
  // criar-e-cancelar à toa, barramos AQUI, antes de gerar o código: o atendente
  // cobra primeiro (botão "Cobrar na entrega") e depois marca a retirada.
  // Motoboy NÃO entra nessa regra: lá o cliente paga no endereço e a cobrança/
  // Código A acontecem na entrega (a trava de "não entrega sem pagar" continua no
  // Código A, em marcarVendaEntregueSeCompleta).
  // IMPACTO SE REMOVIDO: volta a gerar entrega de retirada que cancela sozinha
  // quando o operador vai cobrar o pagamento na entrega.
  if (params.formaEntrega === "retirada") {
    const [naEntrega] = await sql`
      SELECT COALESCE(SUM(valor), 0)::numeric AS total
      FROM alissonerp.pagamentos_venda
      WHERE venda_id = ${params.vendaId} AND forma = 'Na Entrega' AND status = 'pendente'
    `;
    if (Number(naEntrega.total) > 0) {
      throw new Error(
        `Cobre o pagamento na entrega (R$${Number(naEntrega.total).toFixed(2)}) antes de marcar a retirada — ` +
          `use o botão "Cobrar na entrega".`,
      );
    }
  }

  // GATE crediário ② (Jonathan 21/06): NÃO entrega "levou DEVENDO" (A Receber
  // pendente = crédito) sem APROVAÇÃO DO SEO. Aqui só BARRA — a SOLICITAÇÃO é feita
  // com antecedência na tela da venda ("Solicitar aprovação para entregar devendo"),
  // pra não travar a consultora no dia/hora da entrega. Depois que o SEO aprovar, a
  // exceção destrava e a entrega segue o fluxo normal (com código).
  // 'Na Entrega' (pago na porta pelo motoboy) NÃO entra aqui — só o crédito de verdade.
  if (await vendaEntregaDevendo(params.vendaId)) {
    const temExcecao = await vendaTemExcecaoEntregaAprovada(params.vendaId);
    if (!temExcecao) {
      throw new Error(
        `Esta venda tem valor "A Receber" pendente — entregar devendo precisa da APROVAÇÃO DO SEO. ` +
          `Abra a venda e use "Solicitar aprovação para entregar devendo" (peça com antecedência). ` +
          `A entrega libera quando o SEO aprovar.`,
      );
    }
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
  const produtoMap = new Map<number, number | null>();
  const nomeMap = new Map<number, string>();
  for (const s of saldoPendente) {
    saldoMap.set(s.itemVendaId, s.saldoPendente);
    produtoMap.set(s.itemVendaId, s.produtoId);
    nomeMap.set(s.itemVendaId, s.nomeProduto);
  }

  // Reposição POR ITEM (12/06 — Jonathan): produtos travados por reposição aberta.
  // Usado para (a) rejeitar quem tentar entregar o item da reposição e (b) NÃO
  // exigir esse item numa entrega 'total' (ele espera a reposição; os prontos saem).
  // Reposição aberta SEM produto identificável → bloqueia a venda inteira (seguro).
  const bloqueio = await calcularBloqueioReposicao(sql, params.vendaId);
  if (bloqueio.bloqueioVendaInteira) {
    throw new Error(
      `Venda possui reposição aberta (${bloqueio.ordensAbertas.join(", ")}) sem item ` +
        `identificado. Conclua ou cancele a reposição antes de entregar.`,
    );
  }
  const produtosBloqueados = new Set(bloqueio.produtosBloqueados);

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

    // Não deixa entregar item cujo produto está em reposição aberta
    const prodItem = produtoMap.get(item.itemVendaId);
    if (prodItem != null && produtosBloqueados.has(prodItem)) {
      throw new Error(
        `O item "${nomeMap.get(item.itemVendaId) ?? `#${item.itemVendaId}`}" depende de ` +
          `reposição ainda não concluída. Entregue os itens prontos e deixe este ` +
          `para quando a reposição chegar.`,
      );
    }
  }

  // 4. Se tipo='total': todos os itens com saldo pendente (EXCETO os travados por
  //    reposição) devem ser cobertos integralmente.
  if (params.tipo === "total") {
    for (const s of saldoPendente) {
      // Item da reposição não entra na exigência do 'total' — ele espera.
      if (s.produtoId != null && produtosBloqueados.has(s.produtoId)) continue;

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

  // (O bloqueio de reposição por item já foi aplicado acima, junto com a
  //  validação de saldo dos itens e da entrega 'total'.)

  // 7. Cálculo do frete
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
 * Lê o WhatsApp do desenvolvedor configurado em configuracoes_secrets.
 *
 * REGRA DE NEGÓCIO (Etapa 3): número para onde vai o aviso quando o código não
 * chega ao cliente. Configurado na aba Integrações (chave whatsapp_desenvolvedor).
 * Retorna "" se não configurado (aí o aviso é só pulado, sem erro).
 */
async function lerWhatsappDesenvolvedor(): Promise<string> {
  try {
    const [row] = await sql`
      SELECT valor_encrypted FROM alissonerp.configuracoes_secrets
      WHERE chave = 'whatsapp_desenvolvedor'
    `;
    if (!row?.valor_encrypted) return "";
    let v: string;
    try { v = JSON.parse(row.valor_encrypted as string); } catch { v = String(row.valor_encrypted); }
    return v.replace(/"/g, "").trim();
  } catch {
    return "";
  }
}

/**
 * Avisa o desenvolvedor (via WhatsApp) quando o envio do código ao CLIENTE falha.
 *
 * REGRA DE NEGÓCIO (Etapa 3 — decisão Jonathan 11/06): código que não chegou ao
 * cliente vai para o WhatsApp do desenvolvedor com o motivo do erro, pra ninguém
 * ficar sem o código. Best-effort: se o número não estiver configurado ou o envio
 * ao dev também falhar, apenas loga — nunca quebra a entrega.
 */
async function avisarDesenvolvedorFalhaCodigo(params: {
  vendaId: number;
  codigo: string;
  tipoCodigo: string; // "Cliente (A)" | "Motoboy (B)"
  clienteNome: string | null;
  erro: string | null;
}): Promise<void> {
  try {
    const numeroDev = await lerWhatsappDesenvolvedor();
    if (!numeroDev) return; // não configurado → silencioso

    const [v] = await sql`SELECT numero_venda FROM alissonerp.vendas_erp WHERE id = ${params.vendaId}`;
    const numeroVenda = (v as { numero_venda?: string } | null)?.numero_venda ?? `#${params.vendaId}`;

    const texto =
      `⚠️ *Falha no envio do código ao cliente*\n\n` +
      `Venda: ${numeroVenda}\n` +
      `Cliente: ${params.clienteNome ?? "(sem nome)"}\n` +
      `Código ${params.tipoCodigo}: *${params.codigo}*\n` +
      `Motivo: ${params.erro ?? "desconhecido"}\n\n` +
      `Repasse o código ao cliente manualmente ou corrija o WhatsApp do cadastro.`;

    await enviarAvisoDesenvolvedor(numeroDev, texto);
  } catch (err) {
    console.error("[entrega-venda] Falha ao avisar desenvolvedor sobre código:", err);
  }
}

/**
 * Tenta enviar o código de verificação via WhatsApp para o cliente da venda.
 *
 * REGRA DE NEGÓCIO: best-effort — se o cliente não tiver WhatsApp cadastrado
 * ou o envio falhar, a entrega continua válida. O frontend mostra o status
 * e permite reenviar ou cadastrar o número depois. Etapa 3: quando falha, o
 * código vai para o WhatsApp do desenvolvedor (avisarDesenvolvedorFalhaCodigo).
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
      // Cliente sem WhatsApp → avisa o desenvolvedor com o código
      await avisarDesenvolvedorFalhaCodigo({
        vendaId, codigo, tipoCodigo: "Cliente (A)",
        clienteNome: nome || null, erro: "Cliente sem WhatsApp cadastrado",
      });
      return {
        whatsappEnviado: false,
        whatsappErro: "Cliente sem WhatsApp cadastrado",
        clienteNome: nome || null,
        clienteTelefone: null,
      };
    }

    const envio = await enviarCodigoWhatsAppDetalhado(numero, codigo, nome);

    // Etapa 3: se o envio ao cliente falhou, o código vai para o desenvolvedor
    if (!envio.enviado) {
      await avisarDesenvolvedorFalhaCodigo({
        vendaId, codigo, tipoCodigo: "Cliente (A)",
        clienteNome: nome || null, erro: envio.erro,
      });
    }

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
    if (!numero) {
      // Cliente sem WhatsApp na hora de mandar o Código A → avisa o desenvolvedor
      await avisarDesenvolvedorFalhaCodigo({
        vendaId, codigo, tipoCodigo: "Cliente (A)",
        clienteNome: (row as { nome?: string } | null)?.nome ?? null,
        erro: "Cliente sem WhatsApp cadastrado",
      });
      return;
    }
    const envio = await enviarCodigoClienteEmRota(numero, codigo, nome);
    // Etapa 3: falhou o envio ao cliente → código vai para o desenvolvedor
    if (!envio.enviado) {
      await avisarDesenvolvedorFalhaCodigo({
        vendaId, codigo, tipoCodigo: "Cliente (A)", clienteNome: nome, erro: envio.erro,
      });
    }
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

  // REGRA DE NEGÓCIO (Blindagem 2026-06 — migration 295): limite de tentativas.
  // O QUE: 5 erros de código bloqueiam a entrega até gerente/admin desbloquear.
  // POR QUE: sem limite, dá para adivinhar o código de 6 dígitos por força
  // bruta e confirmar a entrega sem o cliente presente.
  // IMPACTO SE REMOVIDO: o sistema de dois códigos perde a proteção principal.
  const MAX_TENTATIVAS_CODIGO = 5;
  if (entrega.codigo_bloqueado_em) {
    throw new Error(
      `Entrega ${entrega.codigo_entrega} bloqueada por excesso de tentativas de código. ` +
        `Peça a um gerente para desbloquear.`,
    );
  }

  // Verificar se o código corresponde a algum dos códigos de verificação
  // REGRA: códigos são comparados como strings, sem trim ou formatação
  const matchMotoboy =
    entrega.codigo_motoboy !== null &&
    entrega.codigo_motoboy === codigo;

  const matchCliente = entrega.codigo_cliente === codigo;

  if (!matchMotoboy && !matchCliente) {
    // Tentativa errada: incrementa o contador de forma atômica e bloqueia
    // na 5ª falha. O UPDATE com RETURNING evita corrida entre tentativas
    // simultâneas (cada uma conta uma vez).
    const [tent] = await sql`
      UPDATE alissonerp.entregas_venda
      SET tentativas_codigo = tentativas_codigo + 1,
          codigo_bloqueado_em = CASE
            WHEN tentativas_codigo + 1 >= ${MAX_TENTATIVAS_CODIGO} THEN now()
            ELSE codigo_bloqueado_em
          END,
          updated_at = now()
      WHERE id = ${entregaId}
      RETURNING tentativas_codigo, codigo_bloqueado_em
    `;
    await logAudit(sql, {
      tabela: "entregas_venda",
      operacao: "UPDATE",
      registro_id: entregaId,
      usuario_id: usuarioId,
      dados_antes: null,
      dados_depois: {
        evento: "tentativa_codigo_invalida",
        tentativas: Number(tent?.tentativas_codigo ?? 0),
        bloqueada: !!tent?.codigo_bloqueado_em,
      },
    });
    if (tent?.codigo_bloqueado_em) {
      throw new Error(
        `Código inválido. Entrega bloqueada após ${MAX_TENTATIVAS_CODIGO} tentativas — peça a um gerente para desbloquear.`,
      );
    }
    const restantes = MAX_TENTATIVAS_CODIGO - Number(tent?.tentativas_codigo ?? 0);
    throw new Error(`Código inválido. ${restantes} tentativa(s) restante(s) antes do bloqueio.`);
  }

  // ── Pré-validação: reposição POR ITEM ─────────────────────────────────────
  // REGRA DE NEGÓCIO (12/06 — Jonathan): só barra a confirmação se ESTA entrega
  // inclui um item cujo produto está em reposição aberta. Os itens prontos podem
  // ser confirmados; o item da reposição espera. Reposição aberta sem produto
  // identificável → bloqueia (seguro). Mensagem clara antes da transação pesada.
  // IMPACTO SE REMOVIDO: o erro volta a ser capturado só na trigger do banco.
  const bloqueioConf = await calcularBloqueioReposicao(sql, Number(entrega.venda_id));
  if (bloqueioConf.bloqueioVendaInteira) {
    throw new Error(
      `Entrega ${entrega.codigo_entrega} bloqueada: reposição aberta (${bloqueioConf.ordensAbertas.join(", ")}) ` +
        `sem item identificado. Conclua ou cancele a reposição antes de confirmar.`,
    );
  }
  if (bloqueioConf.produtosBloqueados.length > 0) {
    const [itemBloqueado] = await sql`
      SELECT ive.nome_produto
      FROM alissonerp.entregas_venda_itens evi
      JOIN alissonerp.itens_venda_erp ive ON ive.id = evi.item_venda_id
      WHERE evi.entrega_id = ${entregaId}
        AND ive.produto_id = ANY(${bloqueioConf.produtosBloqueados})
      LIMIT 1
    `;
    if (itemBloqueado) {
      throw new Error(
        `Entrega ${entrega.codigo_entrega} bloqueada: o item "${itemBloqueado.nome_produto}" ` +
          `depende de reposição ainda não concluída.`,
      );
    }
  }

  // ─── Transação atômica ──────────────────────────────────────────────────

  const resultado = await sql.begin(async (tx: DbSql) => {
    let etapa: "retirada_loja" | "entrega_cliente";
    let novaSituacao: string;

    // Código correto: zera o contador de tentativas (migration 295) para que
    // erros antigos não somem com futuros (ex.: código B ok, depois código A).
    await tx`
      UPDATE alissonerp.entregas_venda
      SET tentativas_codigo = 0
      WHERE id = ${entregaId} AND tentativas_codigo > 0
    `;

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
 * Lê o pool de aprovadores de frete avulso (chave MULTI `aprovadores_frete_avulso`,
 * Config › Aprovadores, UUIDs separados por vírgula).
 *
 * REGRA DE NEGÓCIO (V3 — consolidação): FONTE ÚNICA da lista do pool. Antes
 * a mesma query (SELECT + split(",") + trim + filter(Boolean)) estava
 * duplicada em 4 lugares (criarFreteAvulso, o antigo podeGerenciarSolicitacoesAvulso,
 * GET /api/tarefas e PATCH /api/tarefas/[id]/aprovacao) — quem AUTORIZA (decide
 * a tarefa) e quem CRIA a tarefa (responsavel_id) têm que ver exatamente a
 * mesma lista, senão a tela mostra a solicitação para alguém que a API depois
 * nega (ou vice-versa).
 *
 * IMPACTO SE ALTERADO: divergência entre os consumidores volta a acontecer —
 * cada um lendo a config de um jeito ligeiramente diferente.
 */
export async function listarAprovadoresFreteAvulso(): Promise<string[]> {
  const [cfg] = await sql`
    SELECT valor FROM alissonerp.configuracoes_sistema
    WHERE chave = 'aprovadores_frete_avulso'
  `;
  return String(cfg?.valor ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

/**
 * Lê o pool de aprovadores do frete avulso pago pela LOJA (chave MULTI
 * `aprovadores_frete_avulso_loja`, Config › Aprovadores).
 *
 * REGRA DE NEGÓCIO (migration 354, 21/07 — "quem paga"): irmã de
 * listarAprovadoresFreteAvulso — mesma FONTE ÚNICA da lista, só que para o
 * pool que autoriza o CUSTO quando a solicitação é paga pela loja (pagante
 * ='loja'), não o que acompanha a corrida já paga pelo cliente.
 *
 * IMPACTO SE ALTERADO: divergência entre criação (responsavel_id/notificação)
 * e decisão (podeDecidir) para as solicitações pagas pela loja.
 */
export async function listarAprovadoresFreteAvulsoLoja(): Promise<string[]> {
  const [cfg] = await sql`
    SELECT valor FROM alissonerp.configuracoes_sistema
    WHERE chave = 'aprovadores_frete_avulso_loja'
  `;
  return String(cfg?.valor ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

/**
 * Monta uma string legível de endereço a partir dos campos estruturados de
 * entregas_venda (endereco_entrega = logradouro + colunas endereco_entrega_*
 * da migration 355 — número/complemento/bairro/cidade/CEP/UF).
 *
 * O QUE: concatena logradouro, nº, complemento, bairro, cidade, UF e CEP no
 * MESMO formato usado no resto do módulo de vendas (ex.: montarEndereco() em
 * FreteAvulsoModal.tsx, gerarPdf() em VendaDetalheClient.tsx).
 *
 * POR QUE: FONTE ÚNICA da concatenação para quem precisa exibir texto legível
 * a partir do endereço estruturado do frete avulso — hoje usado pela
 * descrição da tarefa de aprovação (criarFreteAvulso, logo abaixo), por
 * GET /api/entregas-venda/motoboy/minhas (card do motoboy) e por
 * GET /api/entregas-venda (listagem/aba Solicitações).
 *
 * IMPACTO SE DUPLICADO: cada tela formatando o endereço à sua maneira — uma
 * mudança de formato (ex.: trocar vírgula por quebra de linha) exigiria achar
 * e editar N lugares em vez de um só.
 */
export function formatarEnderecoEntregaAvulso(row: {
  endereco_entrega?: string | null;
  endereco_entrega_numero?: string | null;
  endereco_entrega_complemento?: string | null;
  endereco_entrega_bairro?: string | null;
  endereco_entrega_cidade?: string | null;
  endereco_entrega_cep?: string | null;
  endereco_entrega_uf?: string | null;
}): string | null {
  const partes = [
    row.endereco_entrega,
    row.endereco_entrega_numero ? `nº ${row.endereco_entrega_numero}` : null,
    row.endereco_entrega_complemento,
    row.endereco_entrega_bairro,
    row.endereco_entrega_cidade,
    row.endereco_entrega_uf,
    row.endereco_entrega_cep,
  ].filter((p): p is string => !!p && p.trim() !== "");
  return partes.length > 0 ? partes.join(", ") : null;
}

/**
 * Parâmetros para criação de frete avulso (corrida sem venda vinculada).
 * REGRA DE NEGÓCIO: avulso não tem venda, itens ou código de verificação.
 * Motoboy e frete_cobrado são obrigatórios. Cliente e descrição são opcionais.
 * IMPACTO SE ALTERADO: avulso sem motoboy não pode ser confirmado depois.
 */
export interface CriarFreteAvulsoParams {
  // REGRA DE NEGÓCIO (pool de motoboy — patch A2): motoboyId é OPCIONAL.
  // Solicitação da consultora e criação direta SEM motoboy caem no POOL (a
  // corrida nasce sem dono, motoboy_id NULL, e o 1º motoboy que aceitar
  // assume — ver aceitarFreteAvulso). Quando informado (criação direta com
  // motoboy escolhido, ou auto-registro do entregador do PR#75), a corrida já
  // nasce com dono.
  motoboyId?: string; // UUID
  regiao: "fortaleza" | "fora_fortaleza" | "longe" | "correios";
  freteCobrado: number;
  freteMotoboyOverride?: number; // usado em longe/correios onde frete=0 e valor é negociado
  descricaoAvulso?: string;
  contatoId?: number;
  observacoes?: string;
  // REGRA DE NEGÓCIO (solicitação da consultora — migration 353, modelo POOL;
  // fix 21/07 — venda deixa de ser obrigatória): quando modoSolicitacao=true,
  // o avulso nasce 'solicitada' (sem lançar saldo) até que QUALQUER aprovador
  // do pool (chave de config aprovadores_frete_avulso) ou admin/dev/diretor
  // libere ou recuse — não há mais responsável designado. vendaId é OPCIONAL
  // nesse modo: a corrida por natureza pode não partir de uma venda (ex.:
  // "levar material à loja", "buscar peça") — quando informado, herda
  // cliente/endereço e passa pelas checagens de ownership/janela/duplicata
  // (ver criarFreteAvulso); só o endereço estruturado continua obrigatório
  // (validado em criarFreteAvulso()).
  // IMPACTO SE VOLTAR A EXIGIR: reabre o erro original — bloqueia corridas
  // avulsas legítimas sem venda.
  vendaId?: number;
  // REGRA DE NEGÓCIO (migration 355 — endereço estruturado, 21/07): antes um
  // único campo de texto livre (`enderecoEntrega`, concatenado no client) —
  // agora campo a campo, espelhando os nomes de vendas_erp.endereco_entrega_*.
  // `enderecoEntregaLogradouro` grava na MESMA coluna `endereco_entrega` que
  // já existia (migration 353) — reaproveitada como "logradouro" (ver
  // migration 355 para a justificativa completa). Mínimo exigido no modo
  // solicitação: logradouro + número + cidade (validado abaixo e no front).
  // IMPACTO SE ALTERADO: motoboy/minhas e a listagem de solicitações
  // (GET /api/entregas-venda) dependem destes nomes para montar o endereço
  // legível via formatarEnderecoEntregaAvulso() acima.
  enderecoEntregaLogradouro?: string;
  enderecoEntregaNumero?: string;
  enderecoEntregaComplemento?: string;
  enderecoEntregaBairro?: string;
  enderecoEntregaCidade?: string;
  enderecoEntregaCep?: string;
  enderecoEntregaUf?: string;
  modoSolicitacao?: boolean;
  // REGRA DE NEGÓCIO (migration 354, 21/07 — "quem paga"): obrigatório quando
  // modoSolicitacao=true. Decide o comprovante e o aprovador:
  //   'cliente' -> exige comprovanteBase64; aprovador = aprovadores_frete_avulso
  //     (evento 'frete_avulso' — lista serve para ACOMPANHAR, dinheiro já com a loja).
  //   'loja'    -> comprovante NÃO exigido; aprovador = aprovadores_frete_avulso_loja
  //     (evento 'frete_avulso_loja' — autoriza o CUSTO assumido pela loja).
  // Sempre UMA etapa de aprovação — só muda quem decide (ver eventoDaTarefa).
  // IMPACTO SE REMOVIDO: sem saber quem paga não dá para escolher comprovante
  // obrigatório nem o pool certo de aprovadores.
  pagante?: "loja" | "cliente";
  // REGRA DE NEGÓCIO (migration 354): comprovante de pagamento do frete,
  // OBRIGATÓRIO quando pagante='cliente'. Base64 (data URL ou puro — uploadFile
  // remove o prefixo data:...;base64, se existir). Reusa o bucket
  // `pagamento-fotos` (mesmo de foto_entrega_path e compras de metal) — coluna
  // própria (comprovante_pagante_path) porque é um momento diferente do
  // ciclo de vida (solicitação, não confirmação de entrega).
  // IMPACTO SE REMOVIDO: solicitação paga pelo cliente ficaria sem
  // comprovante, quebrando a exigência de auditoria do pagamento.
  comprovanteBase64?: string;
}

/** Resultado da criação de frete avulso */
export interface FreteAvulso {
  id: number;
  codigoEntrega: string;
  situacao: string;
  regiao: string;
  // REGRA DE NEGÓCIO (pool — patch A2): null enquanto a corrida está no pool
  // sem dono (ver CriarFreteAvulsoParams.motoboyId).
  motoboyId: string | null;
  freteCobrado: number;
  freteMotoboy: number;
  descricaoAvulso: string | null;
  contatoId: number | null;
  clienteNome: string | null;
  observacoes: string | null;
  createdAt: string;
  motoboyNome: string | null;
  motoboyTelefone: string | null;
  vendaId: number | null;
  enderecoEntrega: string | null;
  // migration 354 — "quem paga" a solicitação (null nas criações diretas, que
  // continuam sem esse campo — ver criarFreteAvulso).
  pagante: "loja" | "cliente" | null;
}

/**
 * Lança a diferença entre frete cobrado e frete do motoboy no saldo_frete_gratis
 * (conta-corrente da gerente) para um frete avulso.
 *
 * O QUE: busca a gerente_loja ativa, calcula saldo antes/depois e insere
 * crédito (cobrado > motoboy) ou débito (cobrado < motoboy) vinculado à entrega.
 *
 * POR QUE: avulso é sempre custo da loja — o frete_motoboy sai do saldo da
 * gerente, e o que foi cobrado a mais do cliente volta como crédito.
 *
 * IMPACTO SE ALTERADO: é o ÚNICO ponto que grava saldo_frete_gratis para
 * avulso — chamado tanto na CRIAÇÃO direta (roles de loja/admin/motoboy)
 * quanto na LIBERAÇÃO de uma solicitação da consultora (liberarFreteAvulso).
 * Duplicar esta lógica em outro lugar gera lançamento dobrado no saldo da gerente.
 */
async function lancarSaldoFreteAvulsoNoTx(
  tx: DbSql,
  entregaId: number,
  freteCobrado: number,
  freteMotoboy: number,
  userId: string,
): Promise<void> {
  if (!(freteMotoboy > 0 || freteCobrado > 0)) return;
  const diff = money(freteCobrado - freteMotoboy);
  if (diff === 0) return;

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
  // REGRA DE NEGÓCIO (pool de motoboy — patch A2): motoboy é OPCIONAL aqui.
  // Solicitação da consultora e criação direta sem motoboy caem no POOL (a
  // corrida nasce sem dono); quando informado (criação direta com motoboy, ou
  // auto-registro do entregador PR#75), a corrida já nasce com dono.
  // IMPACTO SE REMOVIDO: volta a travar toda solicitação/criação sem motoboy
  // já escolhido, impedindo o modelo de pool.
  if (params.freteCobrado < 0) {
    throw new Error("Valor do frete não pode ser negativo.");
  }

  // REGRA DE NEGÓCIO (solicitação — migration 353, modelo TAREFA/POOL; fix
  // 21/07 — venda deixa de ser obrigatória): frete avulso É POR NATUREZA uma
  // corrida que pode não ter venda (ex.: "levar material à loja", "buscar
  // peça"). Quando o fluxo nascia dentro da tela da venda, vendaId sempre
  // existia; a entrada mudou para o módulo Tarefas (busca de venda OPCIONAL)
  // e a obrigatoriedade tinha ficado represada aqui. Agora só valida
  // venda/janela/duplicata QUANDO vendaId foi informado (herda cliente/
  // endereço da venda) — sem venda, a solicitação segue só com o endereço
  // informado no formulário. NÃO escolhe mais um responsável — a solicitação
  // vira uma tarefa de aprovação para o pool configurado (ver abaixo) e
  // qualquer um decide.
  // IMPACTO SE VOLTAR A EXIGIR: reabre o erro original — trava a solicitação
  // de corridas legítimas sem venda (a maioria dos casos reais).
  let numeroVendaSolicitacao: string | null = null;
  if (params.modoSolicitacao) {
    if (params.vendaId) {
      const [venda] = await sql`
        SELECT id, numero_venda, situacao FROM alissonerp.vendas_erp WHERE id = ${params.vendaId} LIMIT 1
      `;
      if (!venda) {
        throw new Error(`Venda ${params.vendaId} não encontrada.`);
      }
      numeroVendaSolicitacao = venda.numero_venda ? String(venda.numero_venda) : null;

      // REGRA DE NEGÓCIO (blindagem V4 — janela de entrega, decisão Jonathan no
      // commit 291b029a): o front só mostra o botão "Solicitar frete avulso"
      // com a venda em aprovado/em_rota/entregue, mas essa checagem existia SÓ
      // no client (VendaDetalheClient) — quem chamasse a API direto (curl, bug
      // de outro client) driblava a janela e solicitava frete de uma venda
      // rascunho/cancelada/virou_credito. Espelha a MESMA lista aqui, no server,
      // que é a autoridade real. Só se aplica quando há venda informada.
      // IMPACTO SE REMOVIDO: reabre o bypass — solicitação de frete avulso para
      // venda fora da janela de entrega (ex.: ainda rascunho, já cancelada).
      const JANELA_SOLICITACAO_FRETE_AVULSO = ["aprovado", "em_rota", "entregue"];
      if (!JANELA_SOLICITACAO_FRETE_AVULSO.includes(String(venda.situacao))) {
        throw new Error(
          `Venda ${numeroVendaSolicitacao ?? params.vendaId} não está numa situação que permite solicitar frete avulso (situação atual: ${venda.situacao}).`,
        );
      }

      // REGRA DE NEGÓCIO (guard de solicitação duplicada — V3): espelha o guard
      // de src/lib/inventario-solicitacoes.ts (criarSolicitacaoInventario) — não
      // deixa abrir uma 2ª solicitação de frete avulso para a MESMA venda
      // enquanto a 1ª ainda está 'solicitada' (aguardando decisão do pool). É
      // um guard POR VENDA — sem venda não há como duplicar por este critério
      // (cada solicitação sem venda é uma corrida independente).
      // IMPACTO SE REMOVIDO: a consultora clica de novo (ou dá duplo-clique) e
      // duas tarefas idênticas nascem para a mesma venda, confundindo o pool.
      const [jaSolicitada] = await sql`
        SELECT id FROM alissonerp.entregas_venda
        WHERE is_avulso = true AND venda_id = ${params.vendaId} AND situacao = 'solicitada'
        LIMIT 1
      `;
      if (jaSolicitada) {
        throw new Error(
          "Já existe uma solicitação de frete avulso aguardando decisão para esta venda.",
        );
      }
    }

    // REGRA DE NEGÓCIO (migration 354, 21/07 — "quem paga"): obrigatório no
    // modo solicitação, COM ou SEM venda. Decide comprovante (cliente) e pool
    // de aprovador (ver bloco de listaAprovadoresFrete logo abaixo). Validado
    // no SERVIDOR (não só no front) — mesma autoridade real de sempre.
    // IMPACTO SE REMOVIDO: reabre o caminho de solicitar sem informar quem
    // paga, e a exigência de comprovante para 'cliente' não teria como ser
    // aplicada.
    if (params.pagante !== "loja" && params.pagante !== "cliente") {
      throw new Error("Informe quem paga o frete avulso: loja ou cliente.");
    }
    if (params.pagante === "cliente" && !params.comprovanteBase64) {
      throw new Error("Comprovante de pagamento é obrigatório quando o frete é pago pelo cliente.");
    }

    // REGRA DE NEGÓCIO (migration 355 — endereço estruturado): mínimo para o
    // motoboy conseguir localizar o endereço: logradouro + número + cidade.
    // Complemento/bairro/UF/CEP ajudam mas não bloqueiam. Validado no
    // SERVIDOR (defesa em profundidade, mesmo padrão do campo `pagante`
    // acima) além do front (FreteAvulsoModal + EnderecoForm). CONTINUA
    // obrigatório COM ou SEM venda — é o endereço quem diz para onde ir
    // quando não há venda para herdar o endereço de entrega dela.
    // IMPACTO SE REMOVIDO: reabre o caminho de solicitar frete avulso sem
    // endereço utilizável — motoboy recebe a corrida sem saber pra onde ir.
    if (
      !params.enderecoEntregaLogradouro?.trim() ||
      !params.enderecoEntregaNumero?.trim() ||
      !params.enderecoEntregaCidade?.trim()
    ) {
      throw new Error("Informe ao menos logradouro, número e cidade do endereço de entrega.");
    }
  }

  // REGRA DE NEGÓCIO (migration 353, modelo TAREFA/POOL — migration 354
  // acrescenta o split por "quem paga"): a solicitação vira TAREFA DE
  // APROVAÇÃO para o pool configurado — mesma engrenagem de compra comercial e
  // solicitações de inventário (ver src/lib/inventario-solicitacoes.ts).
  // QUAL pool depende de pagante: 'cliente' -> aprovadores_frete_avulso
  // (acompanha a entrega, já paga); 'loja' -> aprovadores_frete_avulso_loja
  // (autoriza o custo). Lê a config (fonte única: listarAprovadoresFreteAvulso/
  // listarAprovadoresFreteAvulsoLoja) e falha cedo (ANTES de abrir a
  // transação) se ninguém estiver configurado — igual ao padrão de
  // criarSolicitacaoInventario.
  // IMPACTO SE REMOVIDO: a solicitação ficaria 'solicitada' para sempre, sem
  // tarefa e sem ninguém no pool para decidir.
  let listaAprovadoresFrete: string[] = [];
  if (params.modoSolicitacao) {
    const ehPagoPelaLoja = params.pagante === "loja";
    listaAprovadoresFrete = ehPagoPelaLoja
      ? await listarAprovadoresFreteAvulsoLoja()
      : await listarAprovadoresFreteAvulso();
    if (listaAprovadoresFrete.length === 0) {
      throw new Error(
        ehPagoPelaLoja
          ? "Nenhum aprovador de frete avulso (loja) configurado (Config › Aprovadores — chave aprovadores_frete_avulso_loja)."
          : "Nenhum aprovador de frete avulso configurado (Config › Aprovadores — chave aprovadores_frete_avulso).",
      );
    }
  }

  // REGRA DE NEGÓCIO (migration 354): upload do comprovante ANTES de abrir a
  // transação — se o Storage falhar, nada é gravado no banco (fail-fast, sem
  // linha órfã "solicitada" sem comprovante). Reusa o bucket `pagamento-fotos`
  // (mesmo de foto_entrega_path e compras de metal) via o helper server-side
  // padrão (src/lib/storage.ts) — NÃO é upload direto do client.
  // IMPACTO SE ALTERADO: fazer o upload depois do INSERT arrisca deixar uma
  // solicitação 'solicitada' sem comprovante se o Storage falhar no meio.
  let comprovantePath: string | null = null;
  if (params.modoSolicitacao && params.pagante === "cliente") {
    const caminho = `frete-avulso/comprovantes/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    const upload = await uploadFile("pagamento-fotos", caminho, params.comprovanteBase64!, "image/jpeg");
    if (!("url" in upload)) {
      throw new Error("Falha ao enviar o comprovante de pagamento. Tente novamente.");
    }
    comprovantePath = upload.path;
  }

  const freteBase = calcularValorMotoboy(params.regiao);
  const freteMotoboy = freteBase > 0 ? freteBase : money(params.freteMotoboyOverride ?? 0);
  const freteCobrado = money(params.freteCobrado);

  // Capturada dentro da transação (modoSolicitacao) para notificar o pool
  // depois que a tarefa/aprovação forem gravadas com sucesso.
  let tarefaCriadaId: number | null = null;

  const resultado = await sql.begin(async (tx: DbSql) => {
    const codigoEntrega = await gerarCodigoEntrega(tx);

    // REGRA DE NEGÓCIO: situacao nasce 'solicitada' (aguarda liberação) quando
    // modoSolicitacao=true; do contrário nasce 'pendente' como sempre foi
    // (estoquista/admin/gerente/entregador continuam criando já liberado).
    const situacaoInicial = params.modoSolicitacao ? "solicitada" : "pendente";

    const [row] = await tx`
      INSERT INTO alissonerp.entregas_venda (
        is_avulso, venda_id,
        contato_id, descricao_avulso,
        codigo_entrega, codigo_cliente, codigo_motoboy,
        tipo, forma_entrega, situacao, regiao,
        motoboy_id, frete_cobrado, frete_motoboy,
        aprovacao_frete_necessaria, observacoes,
        endereco_entrega, endereco_entrega_numero, endereco_entrega_complemento,
        endereco_entrega_bairro, endereco_entrega_cidade, endereco_entrega_cep,
        endereco_entrega_uf,
        pagante, comprovante_pagante_path,
        created_by
      ) VALUES (
        true, ${params.vendaId ?? null},
        ${params.contatoId ?? null}, ${params.descricaoAvulso ?? null},
        ${codigoEntrega}, NULL, NULL,
        'total', 'motoboy', ${situacaoInicial}, ${params.regiao},
        ${params.motoboyId ?? null}::uuid, ${freteCobrado}, ${freteMotoboy},
        false, ${params.observacoes ?? null},
        ${params.enderecoEntregaLogradouro ?? null}, ${params.enderecoEntregaNumero ?? null},
        ${params.enderecoEntregaComplemento ?? null}, ${params.enderecoEntregaBairro ?? null},
        ${params.enderecoEntregaCidade ?? null}, ${params.enderecoEntregaCep ?? null},
        ${params.enderecoEntregaUf ?? null},
        ${params.modoSolicitacao ? params.pagante! : null}, ${comprovantePath},
        ${userId}::uuid
      )
      RETURNING *
    `;

    const entregaId = Number(row.id);

    // REGRA DE NEGÓCIO (migration 353, modelo TAREFA/POOL): grava a solicitação
    // como tarefa de aprovação, na MESMA transação da entrega — espelha
    // criarSolicitacaoInventario (src/lib/inventario-solicitacoes.ts):
    // INSERT tarefas -> INSERT aprovacoes_tarefa -> UPDATE do domínio com o
    // tarefa_aprovacao_id. responsavel_id leva o PRIMEIRO da lista só para
    // preencher a coluna (não-nula por convenção do módulo Tarefas); QUALQUER
    // um da lista pode decidir — ver extensão de pool no dispatcher/listagem.
    // IMPACTO SE ALTERADO: sem isto a entrega nasceria 'solicitada' órfã, sem
    // tarefa e sem ninguém notificado para decidir.
    if (params.modoSolicitacao) {
      const responsavelPrincipal = listaAprovadoresFrete[0];
      const tituloTarefa = numeroVendaSolicitacao
        ? `Frete avulso solicitado — venda ${numeroVendaSolicitacao}`
        : `Frete avulso solicitado — entrega ${codigoEntrega}`;
      // REGRA DE NEGÓCIO (migration 355): a descrição da tarefa mostra o
      // endereço em texto legível — monta a partir dos campos estruturados
      // via formatarEnderecoEntregaAvulso() (fonte única, ver comentário
      // dela). É só uma STRING gravada na tarefa (snapshot no momento da
      // solicitação); não muda se o endereço da entrega for editado depois.
      const enderecoLegivel = formatarEnderecoEntregaAvulso({
        endereco_entrega: params.enderecoEntregaLogradouro ?? null,
        endereco_entrega_numero: params.enderecoEntregaNumero ?? null,
        endereco_entrega_complemento: params.enderecoEntregaComplemento ?? null,
        endereco_entrega_bairro: params.enderecoEntregaBairro ?? null,
        endereco_entrega_cidade: params.enderecoEntregaCidade ?? null,
        endereco_entrega_cep: params.enderecoEntregaCep ?? null,
        endereco_entrega_uf: params.enderecoEntregaUf ?? null,
      });
      const descricaoTarefa = [
        `Corrida ${codigoEntrega} (${params.regiao}).`,
        enderecoLegivel ? `Endereço: ${enderecoLegivel}.` : null,
        params.descricaoAvulso ? `Obs: ${params.descricaoAvulso}.` : null,
      ].filter(Boolean).join(" ");

      // REGRA DE NEGÓCIO (migration 354, 21/07 — "quem paga"): a tag
      // `frete_pagante:loja` é o que eventoDaTarefa (src/lib/aprovacoes/
      // evento-da-tarefa.ts) lê para escolher entre os eventos 'frete_avulso'
      // (cliente, sem tag) e 'frete_avulso_loja' (loja, com tag) — mesma tarefa
      // (tipo='frete_avulso'), aprovador diferente. Espelhado também em
      // multiAprovadorCond (src/app/api/tarefas/route.ts).
      // IMPACTO SE REMOVIDO: toda solicitação pagante='loja' cairia no evento
      // 'frete_avulso' (chave errada) — quem está só na lista nova não veria
      // nem poderia decidir a tarefa.
      const tagsTarefa = params.pagante === "loja"
        ? ["aprovacao_frete_avulso", `frete_avulso:${entregaId}`, "frete_pagante:loja"]
        : ["aprovacao_frete_avulso", `frete_avulso:${entregaId}`];

      const [tarefa] = await tx`
        INSERT INTO alissonerp.tarefas
          (titulo, descricao, responsavel_id, criado_por, prioridade, status, tipo, venda_id, tags)
        VALUES (
          ${tituloTarefa},
          ${descricaoTarefa},
          ${responsavelPrincipal}::uuid,
          ${userId}::uuid,
          'alta',
          'aguardando_aprovacao',
          'frete_avulso',
          ${params.vendaId ?? null},
          ${tx.array(tagsTarefa)}
        )
        RETURNING id
      `;
      const tarefaId = Number(tarefa.id);
      tarefaCriadaId = tarefaId;

      await tx`
        INSERT INTO alissonerp.aprovacoes_tarefa (tarefa_id, solicitante_id, aprovador_id, status)
        VALUES (${tarefaId}, ${userId}::uuid, ${responsavelPrincipal}::uuid, 'pendente')
      `;

      await tx`
        UPDATE alissonerp.entregas_venda
        SET tarefa_aprovacao_id = ${tarefaId}
        WHERE id = ${entregaId}
      `;
    }

    // REGRA DE NEGÓCIO: solicitação (consultora) NÃO lança saldo na criação —
    // o custo só é assumido quando o responsável LIBERA a corrida (ver
    // liberarFreteAvulso). Avulso direto (não-solicitação) continua lançando
    // na criação, como sempre foi.
    if (!params.modoSolicitacao) {
      await lancarSaldoFreteAvulsoNoTx(tx, entregaId, freteCobrado, freteMotoboy, userId);
    }

    await logAudit(tx, {
      tabela: "entregas_venda",
      operacao: "INSERT",
      registro_id: entregaId,
      usuario_id: userId,
      dados_depois: {
        is_avulso: true,
        codigo_entrega: codigoEntrega,
        motoboy_id: params.motoboyId ?? null,
        regiao: params.regiao,
        frete_cobrado: freteCobrado,
        frete_motoboy: freteMotoboy,
        descricao_avulso: params.descricaoAvulso ?? null,
        situacao: situacaoInicial,
        venda_id: params.vendaId ?? null,
        pagante: params.modoSolicitacao ? params.pagante : null,
      },
    });

    return row;
  }) as Record<string, unknown>;

  // REGRA DE NEGÓCIO (migration 353, modelo TAREFA/POOL): notifica TODOS os
  // aprovadores da lista (não só o responsavel_id da tarefa) — qualquer um
  // pode decidir, então todos precisam saber que há uma solicitação nova.
  // Espelha criarSolicitacaoInventario; roda FORA da transação (best-effort —
  // falha de notificação não desfaz a solicitação já gravada).
  if (params.modoSolicitacao && tarefaCriadaId) {
    const tarefaIdNotif = tarefaCriadaId;
    await Promise.all(listaAprovadoresFrete.map((aprovadorId) =>
      criarNotificacao({
        usuarioId: aprovadorId,
        tipo: "aprovacao",
        titulo: "Frete avulso solicitado",
        mensagem: numeroVendaSolicitacao
          ? `Solicitação de frete avulso da venda ${numeroVendaSolicitacao} aguardando decisão.`
          : "Solicitação de frete avulso aguardando decisão.",
        remetenteId: userId,
        link: `/tarefas?abrir=${tarefaIdNotif}`,
      }).catch(() => {})
    ));
  }

  // Buscar nome/telefone do motoboy para retornar na resposta.
  // REGRA DE NEGÓCIO (pool — patch A2): corrida de pool nasce SEM motoboy
  // (params.motoboyId undefined) — pula a consulta e retorna null; o driver
  // postgres.js lança "Undefined values are not allowed" se um parâmetro
  // undefined for interpolado na query (${undefined}::uuid), então NÃO dá
  // pra rodar esta SELECT sem o guard quando não há motoboy.
  const [motoboy] = params.motoboyId
    ? await sql`
        SELECT nome, telefone FROM alissonerp.motoboys
        WHERE user_id = ${params.motoboyId}::uuid AND ativo = true LIMIT 1
      `
    : [];

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
    motoboyId: resultado.motoboy_id ? String(resultado.motoboy_id) : null,
    freteCobrado: money(resultado.frete_cobrado),
    freteMotoboy: money(resultado.frete_motoboy),
    descricaoAvulso: resultado.descricao_avulso ? String(resultado.descricao_avulso) : null,
    contatoId: resultado.contato_id ? Number(resultado.contato_id) : null,
    clienteNome,
    observacoes: resultado.observacoes ? String(resultado.observacoes) : null,
    createdAt: String(resultado.created_at),
    motoboyNome: motoboy?.nome ? String(motoboy.nome) : null,
    motoboyTelefone: motoboy?.telefone ? String(motoboy.telefone) : null,
    vendaId: resultado.venda_id != null ? Number(resultado.venda_id) : null,
    // REGRA DE NEGÓCIO (migration 355): monta o texto legível a partir das
    // colunas estruturadas que acabaram de ser gravadas (RETURNING * já traz
    // todas) — mesmo helper usado pela descrição da tarefa acima e pelas APIs
    // de listagem/motoboy, para não formatar diferente em cada lugar.
    enderecoEntrega: formatarEnderecoEntregaAvulso({
      endereco_entrega: resultado.endereco_entrega as string | null,
      endereco_entrega_numero: resultado.endereco_entrega_numero as string | null,
      endereco_entrega_complemento: resultado.endereco_entrega_complemento as string | null,
      endereco_entrega_bairro: resultado.endereco_entrega_bairro as string | null,
      endereco_entrega_cidade: resultado.endereco_entrega_cidade as string | null,
      endereco_entrega_cep: resultado.endereco_entrega_cep as string | null,
      endereco_entrega_uf: resultado.endereco_entrega_uf as string | null,
    }),
    pagante: (resultado.pagante as "loja" | "cliente" | null) ?? null,
  };
}

/**
 * Libera um frete avulso SOLICITADO pela consultora ('solicitada' -> 'pendente').
 *
 * REGRA DE NEGÓCIO: a liberação é o momento em que o custo do frete avulso é
 * de fato assumido pela loja — por isso é AQUI (e não na solicitação) que o
 * saldo da gerente é lançado (lancarSaldoFreteAvulsoNoTx). A checagem de QUEM
 * pode liberar (modelo TAREFA/POOL: qualquer aprovador da chave de config
 * aprovadores_frete_avulso — ou admin/dev/diretor, ver
 * PATCH /api/tarefas/[id]/aprovacao) fica no dispatcher; esta função só valida o
 * ESTADO da entrega.
 *
 * O QUE: tranca a linha (FOR UPDATE) dentro da transação para evitar liberar
 * a mesma solicitação duas vezes em cliques concorrentes, atualiza
 * situacao/liberada_por/liberada_em e lança o saldo.
 *
 * IMPACTO SE ALTERADO: sem o FOR UPDATE, dois cliques quase simultâneos no
 * botão "Liberar" lançariam o saldo em dobro no conta-corrente da gerente.
 */
export async function liberarFreteAvulso(entregaId: number, usuarioId: string): Promise<void> {
  const [entrega] = await sql`
    SELECT id, situacao, codigo_entrega, is_avulso
    FROM alissonerp.entregas_venda
    WHERE id = ${entregaId}
  `;

  if (!entrega) {
    throw new Error(`Entrega ${entregaId} não encontrada.`);
  }
  if (!entrega.is_avulso) {
    throw new Error("Esta rota é exclusiva para fretes avulsos.");
  }
  if (entrega.situacao !== "solicitada") {
    throw new Error(
      `Entrega ${entrega.codigo_entrega} não está aguardando liberação (situação atual: ${entrega.situacao}).`,
    );
  }

  await sql.begin(async (tx: DbSql) => {
    // REGRA: FOR UPDATE trava a linha até o fim da transação — reconfirma o
    // estado 'solicitada' já com a trava, para não liberar (e lançar saldo)
    // duas vezes em corrida.
    const [locked] = await tx`
      SELECT id, situacao, frete_cobrado, frete_motoboy
      FROM alissonerp.entregas_venda
      WHERE id = ${entregaId}
      FOR UPDATE
    `;
    if (locked.situacao !== "solicitada") {
      throw new Error(
        `Entrega ${entrega.codigo_entrega} não está mais aguardando liberação (situação atual: ${locked.situacao}).`,
      );
    }

    await tx`
      UPDATE alissonerp.entregas_venda
      SET
        situacao = 'pendente',
        liberada_por = ${usuarioId}::uuid,
        liberada_em = now(),
        updated_at = now()
      WHERE id = ${entregaId}
    `;

    await lancarSaldoFreteAvulsoNoTx(
      tx,
      entregaId,
      money(locked.frete_cobrado),
      money(locked.frete_motoboy),
      usuarioId,
    );

    await logAudit(tx, {
      tabela: "entregas_venda",
      operacao: "UPDATE",
      registro_id: entregaId,
      usuario_id: usuarioId,
      dados_antes: { situacao: "solicitada" },
      dados_depois: { situacao: "pendente", liberada_por: usuarioId },
    });
  });
}

/**
 * Recusa um frete avulso SOLICITADO pela consultora ('solicitada' -> 'cancelada').
 *
 * REGRA DE NEGÓCIO: exige motivo (rastreabilidade — a consultora precisa saber
 * por que o responsável recusou para poder corrigir e refazer o pedido).
 * Recusa NUNCA lança saldo — a corrida nem chegou a acontecer, nenhum custo
 * foi assumido pela loja.
 *
 * IMPACTO SE ALTERADO: sem o motivo obrigatório, a recusa vira uma caixa preta
 * para a consultora.
 */
export async function recusarFreteAvulso(
  entregaId: number,
  usuarioId: string,
  motivo: string,
): Promise<void> {
  const motivoLimpo = motivo.trim();
  if (!motivoLimpo) {
    throw new Error("Motivo da recusa é obrigatório.");
  }

  const [entrega] = await sql`
    SELECT id, situacao, codigo_entrega, is_avulso
    FROM alissonerp.entregas_venda
    WHERE id = ${entregaId}
  `;
  if (!entrega) {
    throw new Error(`Entrega ${entregaId} não encontrada.`);
  }
  if (!entrega.is_avulso) {
    throw new Error("Esta rota é exclusiva para fretes avulsos.");
  }
  if (entrega.situacao !== "solicitada") {
    throw new Error(
      `Entrega ${entrega.codigo_entrega} não está aguardando liberação (situação atual: ${entrega.situacao}).`,
    );
  }

  await sql.begin(async (tx: DbSql) => {
    // SEM lançamento de saldo: recusa nunca toca saldo_frete_gratis (comentário
    // acima explica o porquê). WHERE situacao='solicitada' de novo aqui evita
    // recusar uma solicitação que já foi liberada/recusada em corrida.
    await tx`
      UPDATE alissonerp.entregas_venda
      SET
        situacao = 'cancelada',
        motivo_recusa = ${motivoLimpo},
        updated_at = now()
      WHERE id = ${entregaId} AND situacao = 'solicitada'
    `;

    await logAudit(tx, {
      tabela: "entregas_venda",
      operacao: "UPDATE",
      registro_id: entregaId,
      usuario_id: usuarioId,
      dados_antes: { situacao: "solicitada" },
      dados_depois: { situacao: "cancelada", motivo_recusa: motivoLimpo },
    });
  });
}

/**
 * Motoboy ACEITA uma corrida avulsa do POOL ('pendente' -> 'em_rota').
 *
 * REGRA DE NEGÓCIO (pool de motoboy — patch A2): a corrida liberada nasce SEM
 * dono (motoboy_id NULL) e aparece pra TODOS os entregadores ativos. O
 * PRIMEIRO que aceitar carimba motoboy_id nele — não existe mais "atribuição"
 * prévia a um motoboy específico. O aceite marca a saída física (data_saida)
 * e quem retirou (confirmado_por_motoboy_retirada), igual ao fluxo de
 * retirada das entregas normais. Corrida AUTO-REGISTRADA pelo próprio
 * motoboy (created_by == motoboy_id) NÃO passa por aqui — ela já aconteceu
 * fisicamente e vai direto para confirmarFreteAvulso.
 *
 * O QUE: valida o estado com um SELECT de guarda (mensagens de erro
 * amigáveis) e então faz o CLAIM em um único UPDATE atômico dentro da
 * transação — o WHERE reconfirma situacao='pendente' E (sem dono OU já é
 * deste motoboy) no mesmo comando. Se `res.count === 0`, é porque outro
 * motoboy venceu a corrida entre o SELECT de guarda e este UPDATE.
 *
 * POR QUE: em um pool, vários motoboys podem tocar "aceitar" quase ao mesmo
 * tempo para a MESMA corrida — um SELECT-depois-UPDATE ingênuo permitiria que
 * os dois lessem 'pendente' e os dois escrevessem, dando dois donos. O
 * UPDATE condicional resolve isso no próprio banco: apenas o primeiro comando
 * a chegar encontra a linha no estado esperado e a modifica; o segundo não
 * encontra mais nada para atualizar (0 linhas afetadas).
 *
 * IMPACTO SE ALTERADO: sem o claim atômico, duas corridas concorrentes podem
 * carimbar motoboy_id de motoboys diferentes na mesma entrega (a última
 * escrita vence silenciosamente) — dois entregadores acham que são donos da
 * mesma corrida, gerando confusão de rota e de acerto financeiro.
 */
export async function aceitarFreteAvulso(entregaId: number, usuarioId: string): Promise<void> {
  const [entrega] = await sql`
    SELECT id, situacao, codigo_entrega, is_avulso
    FROM alissonerp.entregas_venda
    WHERE id = ${entregaId}
  `;
  if (!entrega) {
    throw new Error(`Entrega ${entregaId} não encontrada.`);
  }
  if (!entrega.is_avulso) {
    throw new Error("Esta rota é exclusiva para fretes avulsos.");
  }
  if (entrega.situacao !== "pendente") {
    throw new Error(
      `Entrega ${entrega.codigo_entrega} não está pendente de aceite (situação atual: ${entrega.situacao}).`,
    );
  }

  await sql.begin(async (tx: DbSql) => {
    // CLAIM atômico do pool: só atualiza se ainda está 'pendente' E (sem dono
    // OU o dono já é este mesmo motoboy — reenvio idempotente). res.count é o
    // número de linhas afetadas pelo UPDATE (driver postgres.js — mesmo campo
    // usado em src/lib/importar-localizacao.ts:141, `r.count`).
    const res = await tx`
      UPDATE alissonerp.entregas_venda
      SET motoboy_id = ${usuarioId}::uuid,
          situacao = 'em_rota',
          data_saida = now(),
          confirmado_por_motoboy_retirada = ${usuarioId}::uuid,
          updated_at = now()
      WHERE id = ${entregaId}
        AND is_avulso = true
        AND situacao = 'pendente'
        AND (motoboy_id IS NULL OR motoboy_id = ${usuarioId}::uuid)
    `;

    if (res.count === 0) {
      throw new Error("Corrida já foi aceita por outro motoboy.");
    }

    await logAudit(tx, {
      tabela: "entregas_venda",
      operacao: "UPDATE",
      registro_id: entregaId,
      usuario_id: usuarioId,
      dados_antes: { situacao: "pendente" },
      dados_depois: { situacao: "em_rota", motoboy_id: usuarioId },
    });
  });
}

/**
 * Confirma um frete avulso (sem código de verificação).
 *
 * REGRA DE NEGÓCIO: avulso não usa código A/B. O motoboy clica "Confirmar"
 * no app e isso encerra a corrida. Apenas o motoboy dono da entrega ou
 * admin/gerente podem confirmar.
 *
 * O QUE: valida que a entrega é avulsa e está confirmável, depois atualiza
 * situacao='confirmada' e data_entrega_realizada=now().
 *
 * REGRA DE NEGÓCIO (solicitação/liberação — migration 353): corrida
 * AUTO-REGISTRADA pelo próprio motoboy (created_by === motoboy_id) já
 * aconteceu fisicamente — a loja confirma direto do estado 'pendente', sem
 * passar por aceite (isso preserva o comportamento do PR #75). Corrida
 * atribuída pela loja (ou liberada de uma solicitação da consultora) exige
 * que o motoboy ACEITE primeiro (aceitarFreteAvulso: 'pendente' -> 'em_rota')
 * antes de poder ser confirmada.
 *
 * IMPACTO SE ALTERADO: entrega confirmada entra no acerto do motoboy. Não
 * duplicar confirmação (guard situacao já tratada) e não permitir confirmar
 * uma corrida atribuída que o motoboy nunca aceitou/retirou fisicamente.
 */
export async function confirmarFreteAvulso(
  entregaId: number,
  usuarioId: string,
): Promise<void> {
  const [entrega] = await sql`
    SELECT id, situacao, codigo_entrega, is_avulso, motoboy_id, created_by
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

  const autoRegistrada = String(entrega.created_by) === String(entrega.motoboy_id);
  const podeConfirmar =
    entrega.situacao === "em_rota" || (entrega.situacao === "pendente" && autoRegistrada);

  if (!podeConfirmar) {
    throw new Error(
      `Entrega ${entrega.codigo_entrega} ainda não saiu para rota. O motoboy precisa aceitar a corrida antes de finalizar.`,
    );
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
