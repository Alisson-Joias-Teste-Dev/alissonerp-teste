import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { SITUACOES_VENDA_ATIVAS } from "@/lib/vendas-situacoes";
import { authOr401 } from "@/lib/auth-server";
import type {
  AnaliseComissoesResponse,
  DashComissaoFaixa,
  ItemComissaoDetalhado,
  ResumoComissaoConsultora,
} from "@/lib/types/dashboard-comercial";
import { calcularComissaoPorTabela, safeDiv } from "@/lib/dashboard-comercial/utils";
import { internalError } from "@/lib/api-error";

// GET /api/dashboard-comercial/analise-comissoes?from=...&to=...
//
// Retorna:
//   resumo_consultoras  → agregado por consultora (totais, médias, meta prata)
//   itens_detalhados    → itens individuais com cálculo de comissão ganha/perdida
//   ranking             → maior comissão %, R$, desconto médio, comissão perdida

export async function GET(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;

  const [perm] = await sql`
    SELECT pode_ler FROM alissonerp.role_permissoes
    WHERE role = ${user.role} AND modulo = 'dashboard_comercial'
  `;
  if (!perm?.pode_ler) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const params = req.nextUrl.searchParams;
  const hoje = new Date();
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);

  const from = params.get("from") ?? inicioMes.toISOString().slice(0, 10);
  const to = params.get("to") ?? hoje.toISOString().slice(0, 10);

  try {
    // 1. Itens de venda com join para vendas (período + status 2) e vendedor
    const itens = await sql<
      Array<{
        id: number;
        venda_id: number | string;
        data_venda: string;
        numero_pedido: string | null;
        sku: string | null;
        quantidade: string;
        preco_tabela: string | null;
        preco_total: string;
        comissao_percentual: string | null;
        id_vendedor: number;
        consultora: string | null;
        foto: string | null;
        comissao_tabela_id: number | null;
      }>
    >`
      -- Itens legado
      SELECT
        i.id,
        i.venda_id,
        v.data_venda::text,
        v.numero_pedido::text AS numero_pedido,
        i.sku,
        COALESCE(i.quantidade, 0)::text AS quantidade,
        i.preco_tabela,
        COALESCE(i.preco_total, 0)::text AS preco_total,
        COALESCE(i.comissao_percentual, 0)::text AS comissao_percentual,
        v.vendedor_id AS id_vendedor,
        vd.nome AS consultora,
        vd.foto,
        vd.comissao AS comissao_tabela_id
      FROM alissonerp.vw_dash_itens_venda i
      JOIN alissonerp.vw_dash_vendas_todas v ON v.id = i.venda_id AND v.fonte = 'legado'
      LEFT JOIN alissonerp.vw_dash_vendedores vd ON vd.id_vendedor = v.vendedor_id
      WHERE v.data_venda BETWEEN ${from}::date AND ${to}::date
        AND v.status IS NOT NULL AND v.status != 4
        AND v.vendedor_id IS NOT NULL

      UNION ALL

      -- Itens ERP (a partir de 23/04/2026)
      SELECT
        ie.id,
        ie.venda_id,
        ve.data_venda::text,
        ve.numero_venda AS numero_pedido,
        ie.sku,
        ie.quantidade::text,
        ie.preco_lista AS preco_tabela,
        ie.total_item::text AS preco_total,
        ie.pct_comissao::text AS comissao_percentual,
        ve.vendedor_id AS id_vendedor,
        vd.nome AS consultora,
        vd.foto,
        vd.comissao AS comissao_tabela_id
      FROM alissonerp.itens_venda_erp ie
      JOIN alissonerp.vendas_erp ve ON ve.id = ie.venda_id
        AND ve.situacao = ANY(${SITUACOES_VENDA_ATIVAS})
        AND ve.data_venda >= '2026-04-23'
      LEFT JOIN alissonerp.vw_dash_vendedores vd ON vd.id_vendedor = ve.vendedor_id
      WHERE ve.data_venda BETWEEN ${from}::date AND ${to}::date
        AND ve.vendedor_id IS NOT NULL
    `;

    /**
     * 1a. Dados de pagamentos por venda
     * REGRA DE NEGÓCIO: comissão proporcional ao valor recebido.
     * O que: busca pagamentos confirmados por venda para ratear a comissão.
     * Vale-Troca não gera nova comissão. A Receber pendente fica como comissão pendente.
     * Por que: a consultora só recebe comissão sobre o que o cliente pagou efetivamente.
     * Impacto se alterado: pode pagar comissão antes do dinheiro entrar.
     *
     * Fonte: pagamentos_venda (ERP) + vw_dash_vendas_todas (legado)
     */
    const pagamentosVenda = await sql<
      Array<{
        venda_id: string;
        total_venda: string;
        valor_pago_valido: string;
        valor_vale_troca: string;
        valor_a_receber_pendente: string;
        valor_a_receber_pago: string;
      }>
    >`
      -- Pagamentos ERP: agrega por venda com detalhamento por forma/status
      SELECT
        pv.venda_id::text,
        ve.total_venda::text,
        COALESCE(SUM(CASE WHEN pv.status = 'confirmado' AND pv.forma NOT IN ('Vale-Troca', 'A Receber') THEN pv.valor ELSE 0 END), 0)::text AS valor_pago_valido,
        COALESCE(SUM(CASE WHEN pv.forma = 'Vale-Troca' AND pv.status = 'confirmado' THEN pv.valor ELSE 0 END), 0)::text AS valor_vale_troca,
        COALESCE(SUM(CASE WHEN pv.forma = 'A Receber' AND pv.status = 'pendente' THEN pv.valor ELSE 0 END), 0)::text AS valor_a_receber_pendente,
        COALESCE(SUM(CASE WHEN pv.forma = 'A Receber' AND pv.status = 'confirmado' THEN pv.valor ELSE 0 END), 0)::text AS valor_a_receber_pago
      FROM alissonerp.pagamentos_venda pv
      JOIN alissonerp.vendas_erp ve ON ve.id = pv.venda_id
        AND ve.situacao = ANY(${SITUACOES_VENDA_ATIVAS})
        AND ve.data_venda >= '2026-04-23'
      WHERE ve.data_venda BETWEEN ${from}::date AND ${to}::date
        AND ve.vendedor_id IS NOT NULL
      GROUP BY pv.venda_id, ve.total_venda
    `;

    /**
     * Mapa de pagamentos por venda.
     * Chave: venda_id (string) — UUID para ERP, número para legado.
     */
    const pagamentoMap = new Map<string, {
      total_venda: number;
      valor_pago_valido: number;
      valor_vale_troca: number;
      valor_a_receber_pendente: number;
      valor_a_receber_pago: number;
    }>();

    for (const p of pagamentosVenda) {
      pagamentoMap.set(String(p.venda_id).trim(), {
        total_venda: Number(p.total_venda),
        valor_pago_valido: Number(p.valor_pago_valido),
        valor_vale_troca: Number(p.valor_vale_troca),
        valor_a_receber_pendente: Number(p.valor_a_receber_pendente),
        valor_a_receber_pago: Number(p.valor_a_receber_pago),
      });
    }

    /**
     * Para vendas legado (que não estão em pagamentos_venda),
     * usa vw_dash_vendas_todas como fallback.
     * Simplificação: assume que tudo menos VT foi pago.
     * Impacto: legado não tem breakdown de A Receber.
     */
    const vendasLegado = await sql<Array<{ venda_id: string; total_venda: string; valor_vale_troca: string }>>`
      SELECT
        v.id::text AS venda_id,
        v.total_venda::text,
        v.valor_vale_troca::text
      FROM alissonerp.vw_dash_vendas_todas v
      WHERE v.data_venda BETWEEN ${from}::date AND ${to}::date
        AND v.status IS NOT NULL AND v.status != 4
        AND v.vendedor_id IS NOT NULL
        AND v.fonte = 'legado'
    `;

    for (const v of vendasLegado) {
      const vid = String(v.venda_id).trim();
      if (!pagamentoMap.has(vid)) {
        const tot = Number(v.total_venda);
        const vt = Number(v.valor_vale_troca ?? 0);
        pagamentoMap.set(vid, {
          total_venda: tot,
          valor_pago_valido: tot - vt,
          valor_vale_troca: vt,
          valor_a_receber_pendente: 0,
          valor_a_receber_pago: 0,
        });
      }
    }

    // 2. Tabelas de comissão disponíveis
    const comissoesRaw = await sql<Array<{ id: number; tabela: unknown }>>`
      SELECT id, tabela FROM alissonerp.vw_dash_comissoes
    `;
    const tabelaMap = new Map<number, DashComissaoFaixa[]>();
    for (const c of comissoesRaw) {
      const t = typeof c.tabela === "string" ? JSON.parse(c.tabela) : c.tabela;
      tabelaMap.set(c.id, Array.isArray(t) ? (t as DashComissaoFaixa[]) : []);
    }

    // 3. Total realizado por consultora no nível do pedido (igual à Performance)
    const totaisPedido = await sql<Array<{ vendedor_id: number; total_venda: string; vale_troca: string }>>`
      SELECT
        v.vendedor_id,
        SUM(v.total_venda)::text          AS total_venda,
        SUM(v.valor_vale_troca)::text     AS vale_troca
      FROM alissonerp.vw_dash_vendas_todas v
      WHERE v.data_venda BETWEEN ${from}::date AND ${to}::date
        AND v.status IS NOT NULL AND v.status != 4
        AND v.vendedor_id IS NOT NULL
      GROUP BY v.vendedor_id
    `;
    const totaisPedidoMap = new Map<number, { bruto: number; vale: number }>();
    totaisPedido.forEach((v) =>
      totaisPedidoMap.set(Number(v.vendedor_id), {
        bruto: Number(v.total_venda),
        vale: Number(v.vale_troca),
      }),
    );

    // vale-troca já vem dentro de totaisPedidoMap
    const valesMap = new Map<number, number>();
    totaisPedido.forEach((v) => valesMap.set(Number(v.vendedor_id), Number(v.vale_troca)));

    // 4. Meta Prata por consultora — valor total do mês usando a view padronizada (mesma do ranking/performance)
    // REGRA DE NEGÓCIO: usa vw_dash_metas_por_hora (calculada proporcionalmente) em vez de metas_vendedoras (fixa mensal).
    // Motivo: metas_vendedoras depende de cadastro manual por mês — se o mês não foi cadastrado, meta = 0.
    // Impacto se alterar: consistência com as outras telas da dashboard (geral, ranking, performance).
    const metasPrata = await sql<Array<{ consultora: string; total: string }>>`
      SELECT consultora::text,
             COALESCE(SUM(valor_meta), 0)::text AS total
      FROM alissonerp.vw_dash_metas_por_hora
      WHERE data_hora BETWEEN ${from}::timestamp AND (${to}::date + INTERVAL '1 day - 1 second')::timestamp
        AND valor_meta > 0
        AND tipo_meta = 'Prata'
      GROUP BY consultora
    `;
    const metaPrataMap = new Map<number, number>();
    metasPrata.forEach((m) => metaPrataMap.set(Number(m.consultora), Number(m.total)));

    // 5. Processar itens → itens detalhados + agregado por consultora
    const itensDetalhados: ItemComissaoDetalhado[] = [];
    const resumoMap = new Map<number, ResumoComissaoConsultora>();

    for (const i of itens) {
      const qtd = Number(i.quantidade);
      const precoTabela = Number(i.preco_tabela ?? 0);
      const precoTotal = Number(i.preco_total);
      const precoCheio = precoTabela * qtd;
      // Se preco_tabela está desatualizado (menor que o vendido), ignora o desconto
      const descontoPerc = precoCheio > 0 && precoCheio >= precoTotal ? ((precoCheio - precoTotal) / precoCheio) * 100 : 0;
      const comissaoPerc = Number(i.comissao_percentual);
      const comissaoGanha = (precoTotal * comissaoPerc) / 100;

      const tabelaVendedor = i.comissao_tabela_id ? tabelaMap.get(i.comissao_tabela_id) ?? [] : [];
      const maxComissao = calcularComissaoPorTabela(0, tabelaVendedor);
      const comissaoSeCheio = (precoCheio * maxComissao) / 100;
      const comissaoPerdida = Math.max(0, comissaoSeCheio - comissaoGanha);

      /**
       * Cálculo da comissão proporcional por venda.
       * REGRA DE NEGÓCIO: comissão liberada = comissão total × (valor pago válido / total venda)
       * O que: rateia a comissão do item proporcionalmente ao que foi recebido na venda.
       * Por que: consultora só ganha comissão sobre o que o cliente pagou.
       * Impacto se alterado: pagamento indevido ou trava de comissão correta.
       *
       * Pagamentos considerados "válidos": confirmados, exceto Vale-Troca e A Receber pendente.
       * Vale-Troca: não gera nova comissão (já foi comissionado na venda original).
       * A Receber pendente: fica como comissão pendente até o cliente pagar.
       */
      const pagData = pagamentoMap.get(String(i.venda_id));
      const totalVenda = pagData?.total_venda ?? precoTotal;
      const pagoValido = pagData?.valor_pago_valido ?? totalVenda;
      const vtValor = pagData?.valor_vale_troca ?? 0;
      const aReceberPendente = pagData?.valor_a_receber_pendente ?? 0;
      const aReceberPago = pagData?.valor_a_receber_pago ?? 0;

      // REGRA DE NEGÓCIO: tudo que não está pago, não é VT e não é A Receber
      // deve ser tratado como pendente.
      // O que: calcula o resto não contabilizado (total - pago - VT - A Receber)
      // e adiciona ao pendente.
      // Por que: cliente pode dever sem estar registrado como A Receber formal.
      // Impacto se alterado: comissão pendente fica zerada indevidamente.
      const totalContabilizado = pagoValido + vtValor + aReceberPendente + aReceberPago;
      const restoNaoContabilizado = Math.max(0, totalVenda - totalContabilizado);

      const ratioLiberada = totalVenda > 0 ? pagoValido / totalVenda : 0;
      const ratioVt = totalVenda > 0 ? vtValor / totalVenda : 0;
      const ratioPendente = totalVenda > 0 ? (aReceberPendente + restoNaoContabilizado) / totalVenda : 0;

      const comissaoLiberada = comissaoGanha * ratioLiberada;
      const comissaoExcluidaVt = comissaoGanha * ratioVt;
      const comissaoPendenteItem = comissaoGanha * ratioPendente;

      itensDetalhados.push({
        id: i.id,
        id_vendedor: Number(i.id_vendedor),
        consultora: i.consultora ?? "Não informada",
        foto: i.foto,
        data_venda: i.data_venda,
        numero_pedido: i.numero_pedido,
        sku: i.sku,
        quantidade: qtd,
        preco_cheio: precoCheio,
        preco_vendido: precoTotal,
        desconto_percentual: descontoPerc,
        comissao_percentual: comissaoPerc,
        comissao_ganha: comissaoGanha,
        comissao_perdida: comissaoPerdida,
        // Comissão proporcional
        comissao_liberada: comissaoLiberada,
        comissao_pendente: comissaoPendenteItem,
        comissao_excluida_vt: comissaoExcluidaVt,
        valor_pago_valido: pagoValido * (precoTotal / totalVenda),
        valor_vale_troca: vtValor * (precoTotal / totalVenda),
        valor_a_receber: (aReceberPendente + restoNaoContabilizado) * (precoTotal / totalVenda),
      });

      // Agregado por consultora — normaliza id_vendedor para number (postgres bigint → string)
      const idVendedor = Number(i.id_vendedor);

      if (!resumoMap.has(idVendedor)) {
        resumoMap.set(idVendedor, {
          id_vendedor: idVendedor,
          nome: i.consultora ?? "Não informada",
          foto: i.foto,
          total_desejado: 0,
          total_realizado: 0,
          valor_vale_troca: 0,
          media_desconto: 0,
          media_comissao: 0,
          comissao_ganha: 0,
          comissao_perdida: 0,
          comissao_liberada: 0,
          comissao_pendente: 0,
          comissao_excluida_vt: 0,
          valor_pago_valido: 0,
          comissao_na_meta: 0,
          comissao_fora_meta: 0,
          meta_prata: metaPrataMap.get(idVendedor) ?? 0,
          esta_dentro_meta: false,
          qtd_itens: 0,
        });
      }
      const r = resumoMap.get(idVendedor)!;
      r.total_desejado += precoCheio;
      r.comissao_ganha += comissaoGanha;
      r.comissao_perdida += comissaoPerdida;
      r.comissao_liberada += comissaoLiberada;
      r.comissao_pendente += comissaoPendenteItem;
      r.comissao_excluida_vt += comissaoExcluidaVt;
      r.valor_pago_valido += pagoValido * (precoTotal / totalVenda);
      r.media_desconto += descontoPerc;
      r.media_comissao += comissaoPerc;
      r.qtd_itens += 1;
    }

    // Usa total do pedido (igual à Performance) para total_realizado e vale_troca
    for (const r of resumoMap.values()) {
      const pedido = totaisPedidoMap.get(Number(r.id_vendedor));
      r.valor_vale_troca = pedido?.vale ?? 0;
      r.total_realizado = (pedido?.bruto ?? 0) - r.valor_vale_troca;
      r.media_desconto = safeDiv(r.media_desconto, r.qtd_itens);
      r.media_comissao = safeDiv(r.media_comissao, r.qtd_itens);
      r.esta_dentro_meta = r.meta_prata > 0 && r.total_realizado >= r.meta_prata;
      r.comissao_na_meta = r.esta_dentro_meta ? r.comissao_ganha : 0;
      // REGRA DE NEGÓCIO: fora da meta, paga 50% da comissão liberada.
      // O que: comissão_fora_meta = metade do valor liberado.
      // Por que: consultora só recebe metade se não bater a meta.
      // Impacto se alterado: valor de pagamento diferente do esperado.
      r.comissao_fora_meta = r.comissao_liberada * 0.5;
    }

    const resumo = Array.from(resumoMap.values()).sort((a, b) => b.total_realizado - a.total_realizado);

    const ranking = {
      maior_comissao_valor: Math.max(0, ...resumo.map((r) => r.comissao_ganha)),
      maior_comissao_media_perc: Math.max(0, ...resumo.map((r) => r.media_comissao)),
      maior_comissao_liberada: Math.max(0, ...resumo.map((r) => r.comissao_liberada)),
      maior_desconto_medio: Math.max(0, ...resumo.map((r) => r.media_desconto)),
      maior_comissao_perdida: Math.max(0, ...resumo.map((r) => r.comissao_perdida)),
    };

    const response: AnaliseComissoesResponse = {
      resumo_consultoras: resumo,
      itens_detalhados: itensDetalhados.sort(
        (a, b) => (a.data_venda < b.data_venda ? 1 : -1),
      ),
      ranking,
    };

    return NextResponse.json(response);
  } catch (err) {
    return internalError("[GET /api/dashboard-comercial/analise-comissoes]", err);
  }
}
