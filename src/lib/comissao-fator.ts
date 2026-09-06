/**
 * Fator da comissão pela meta — PONTO ÚNICO DE VERDADE (migration 376)
 *
 * O QUÊ
 *   Diz quanto da comissão a consultora recebe num determinado mês, em função de
 *   quanto ela fez da meta. Todo cálculo de comissão do sistema — extrato,
 *   elegíveis, fechamento, resumo e débito de devolução — passa por aqui.
 *
 * O PORQUÊ (decisão do Jonathan + chefe, 05/09/2026)
 *   A comissão deixou de ser um percentual solto sobre a venda e passou a
 *   depender do resultado do mês:
 *     • até julho/2026      → fator 1 (integral). A regra NÃO é retroativa.
 *     • agosto/2026         → 50% para quem não bateu a meta prata; 100% para
 *                             quem bateu. Mês já pago, congelado.
 *     • setembro/2026 em diante → o PRÓPRIO percentual atingido, teto de 100%,
 *                             SEM piso. Fez 70% da meta, recebe 70% da comissão;
 *                             fez 101,3%, recebe 100%.
 *
 *   O fator segue a VENDA, não o pagamento. Uma parcela de crediário de uma venda
 *   de setembro que só cair em março chega com o fator de setembro — o dinheiro
 *   pode demorar, mas o mérito é do mês em que a venda foi feita.
 *
 * O IMPACTO SE ALTERADO
 *   Se algum lugar do sistema calcular comissão SEM passar por aqui, aquele lugar
 *   volta a pagar o valor cheio em silêncio. Foi exatamente o que aconteceu em
 *   julho/2026 com a regra do "A Receber": aplicada na prévia e esquecida em
 *   quatro outros arquivos. A fórmula não pode ser copiada — tem que ser chamada.
 */

import sql from "@/lib/db";
import { getParametroNumberArray, PARAM } from "@/lib/parametros";

/** Primeiro mês em que a meta afeta a comissão. Antes disso, fator 1 sempre. */
export const COMPETENCIA_INICIO_CORTE = "2026-08";
/** A partir daqui o fator é proporcional; agosto/2026 usa os 50% fixos. */
export const COMPETENCIA_INICIO_PROPORCIONAL = "2026-09";
/** Fator fixo de agosto/2026 para quem não bateu a meta (regra antiga). */
const FATOR_AGOSTO_SEM_META = 0.5;

export interface ResultadoMeta {
  consultora_id: number;
  /** AAAA-MM do mês da VENDA. */
  competencia: string;
  meta_valor: number;
  realizado: number;
  /** Percentual EXATO, sem arredondar (88.9418, não 88.9). */
  pct_atingido: number;
  /** 1 = comissão integral. */
  fator: number;
  /** Texto que vai na linha do extrato. Vazio quando o fator é 1. */
  motivo: string;
  /** Mês fechado: o fator não muda mais, mesmo que uma venda seja cancelada. */
  congelado: boolean;
  /** Não tem meta cadastrada no mês — ver comentário em fatorDoResultado(). */
  sem_meta: boolean;
}

/** Chave do mapa devolvido por resultadosMeta(): "consultoraId|AAAA-MM". */
export function chaveResultado(consultoraId: number, competencia: string): string {
  return `${consultoraId}|${competencia}`;
}

/** AAAA-MM de uma data (a competência da venda). */
export function competenciaDaData(data: string | Date | null | undefined): string | null {
  if (!data) return null;
  const s = typeof data === "string" ? data : data.toISOString();
  return s.slice(0, 7);
}

/**
 * Quem NÃO gera comissão nenhuma.
 *
 * O PORQUÊ: "Loja Alisson" (134) é o vendedor genérico de balcão/institucional,
 * não é consultora, não tem meta e não tem quem receba — mas acumulou R$ 1.795,20
 * em ago/2026 parados no extrato. Lista separada da dashboard de propósito: uma
 * diz quem sai dos GRÁFICOS, esta diz quem não RECEBE.
 */
export async function getVendedoresSemComissao(): Promise<number[]> {
  return await getParametroNumberArray(PARAM.COMISSAO_VENDEDORES_EXCLUIDOS);
}

/**
 * Fator a partir do resultado do mês, aplicando a régua de vigência.
 *
 * ⚠️ Consultora SEM meta cadastrada recebe fator 1 (integral), não zero. O PORQUÊ:
 * esquecer de cadastrar a meta é falha administrativa e não pode virar desconto
 * na consultora — o erro seguro é pagar como antes e sinalizar na tela. Quem não
 * deve receber nada está em COMISSAO_VENDEDORES_EXCLUIDOS, que é decisão explícita.
 */
function fatorDoResultado(competencia: string, pct: number, temMeta: boolean): { fator: number; motivo: string } {
  if (competencia < COMPETENCIA_INICIO_CORTE) return { fator: 1, motivo: "" };
  if (!temMeta) return { fator: 1, motivo: "sem meta cadastrada neste mês — comissão integral" };

  const rotulo = rotuloMes(competencia);
  const pctTexto = formatarPct(pct);

  if (pct >= 100) return { fator: 1, motivo: "" };

  if (competencia < COMPETENCIA_INICIO_PROPORCIONAL) {
    // agosto/2026: regra antiga, 50% fixo. Mês já pago — não se recalcula.
    return {
      fator: FATOR_AGOSTO_SEM_META,
      motivo: `venda de ${rotulo} — meta atingida em ${pctTexto} — comissão reduzida em 50%`,
    };
  }

  // setembro/2026 em diante: proporcional, teto 100%, sem piso.
  return {
    fator: Number((pct / 100).toFixed(4)),
    motivo: `venda de ${rotulo} — meta atingida em ${pctTexto} — comissão proporcional (${pctTexto})`,
  };
}

function formatarPct(pct: number): string {
  return `${pct.toFixed(2).replace(".", ",")}%`;
}

function rotuloMes(competencia: string): string {
  const [ano, mes] = competencia.split("-").map(Number);
  return new Date(ano, mes - 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

/**
 * Resultado da meta de cada consultora nas competências pedidas.
 *
 * Mês CONGELADO vem da tabela como está — é isso que garante que comissão já paga
 * não muda quando uma venda antiga é cancelada. Mês aberto é recalculado na hora,
 * para o extrato acompanhar a meta ao vivo (a consultora vê hoje quanto recebe se
 * o mês fechasse agora).
 *
 * ⚠️ O realizado usa a MESMA conta da tela Análise de Resultado: soma das vendas
 * do mês (fora rascunho/cancelado) MENOS o vale-troca usado. Se as duas contas
 * divergirem, a consultora vê um percentual na tela de meta e outro no extrato —
 * e nenhuma das duas telas ganha a discussão.
 */
export async function resultadosMeta(
  competencias: string[],
  consultoraIds?: number[],
): Promise<Map<string, ResultadoMeta>> {
  const mapa = new Map<string, ResultadoMeta>();
  const comps = [...new Set(competencias.filter(Boolean))];
  if (comps.length === 0) return mapa;

  const congelados = await sql<Array<{
    consultora_id: number; competencia: string; meta_valor: string;
    realizado: string; pct_atingido: string; fator: string; motivo: string | null;
  }>>`
    SELECT consultora_id, competencia, meta_valor::text, realizado::text,
           pct_atingido::text, fator::text, motivo
    FROM alissonerp.comissao_resultado_mensal
    WHERE congelado = true
      AND competencia = ANY(${comps})
      ${consultoraIds?.length ? sql`AND consultora_id = ANY(${consultoraIds})` : sql``}
  `;

  for (const c of congelados) {
    mapa.set(chaveResultado(Number(c.consultora_id), c.competencia), {
      consultora_id: Number(c.consultora_id),
      competencia: c.competencia,
      meta_valor: Number(c.meta_valor),
      realizado: Number(c.realizado),
      pct_atingido: Number(c.pct_atingido),
      fator: Number(c.fator),
      motivo: c.motivo ?? "",
      congelado: true,
      sem_meta: Number(c.meta_valor) <= 0,
    });
  }

  // ⚠️ NÃO filtrar competência por "já tem alguém congelado nela": congelamento é
  // por CONSULTORA + mês, não por mês. Tirar o mês inteiro do recálculo porque UMA
  // consultora fechou faria todas as outras caírem no fator 1 (o default) e o
  // sistema pagaria a comissão CHEIA delas em silêncio. Quem protege o congelado é
  // o `mapa.has(chave)` do laço abaixo, que é por consultora.
  const abertas = comps;

  if (abertas.length > 0) {
    const vivos = await sql<Array<{
      consultora_id: number; competencia: string; meta_valor: string | null; realizado: string;
    }>>`
      -- vale-troca NÃO conta para a meta: não é dinheiro novo entrando na loja.
      WITH vale AS (
        SELECT venda_id, SUM(valor)::numeric AS total
        FROM alissonerp.pagamentos_venda
        WHERE forma = 'Vale-Troca' AND status = 'confirmado'
        GROUP BY venda_id
      ),
      periodo AS (
        SELECT c AS competencia,
               to_date(c || '-01', 'YYYY-MM-DD') AS inicio,
               (to_date(c || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day')::date AS fim
        FROM unnest(${abertas}::text[]) AS c
      )
      SELECT vend.id_vendedor::int AS consultora_id, p.competencia,
             -- FONTE DE VERDADE DA META = public.metas_mensais (a tela que a
             -- equipe usa de fato). alissonerp.metas_vendedoras é a tabela do ERP
             -- e fica para trás: em 01/09/2026 as metas de setembro foram
             -- cadastradas nela por engano e DELETADAS (log_mudancas_banco 474→476,
             -- "a tela real usa public.metas_mensais"). Ler só o ERP fazia setembro
             -- aparecer SEM META — e, sem meta, o fator vira 1 e a regra da comissão
             -- proporcional simplesmente não valeria.
             -- COALESCE nesta ordem: legado primeiro, ERP como rede (jul e ago/2026
             -- estão nas duas com os mesmos valores).
             COALESCE(mm.valor_prata, m.meta_valor)::text AS meta_valor,
             COALESCE(SUM(v.total_venda - COALESCE(va.total, 0)), 0)::text AS realizado
      FROM public.vendedores vend
      CROSS JOIN periodo p
      LEFT JOIN alissonerp.metas_vendedoras m
        ON m.vendedor_id = vend.id_vendedor
       AND m.ano = EXTRACT(YEAR FROM p.inicio)::int
       AND m.mes = EXTRACT(MONTH FROM p.inicio)::int
      -- public.metas_mensais: schema READONLY, só leitura. A coluna mes_ano é o
      -- dia 1 do mês e consultora é o id_vendedor.
      LEFT JOIN public.metas_mensais mm
        ON mm.consultora = vend.id_vendedor
       AND mm.mes_ano = p.inicio
      LEFT JOIN alissonerp.vendas_erp v
        ON v.vendedor_id = vend.id_vendedor
       AND v.data_venda BETWEEN p.inicio AND p.fim
       AND v.situacao NOT IN ('rascunho', 'cancelado')
      LEFT JOIN vale va ON va.venda_id = v.id
      WHERE (${consultoraIds?.length ? sql`vend.id_vendedor = ANY(${consultoraIds ?? []})` : sql`true`})
      GROUP BY vend.id_vendedor, p.competencia, mm.valor_prata, m.meta_valor
    `;

    for (const r of vivos) {
      const chave = chaveResultado(Number(r.consultora_id), r.competencia);
      if (mapa.has(chave)) continue; // congelado ganha do recalculado
      const meta = Number(r.meta_valor ?? 0);
      const realizado = Number(r.realizado);
      const temMeta = meta > 0;
      const pct = temMeta ? (realizado / meta) * 100 : 0;
      const { fator, motivo } = fatorDoResultado(r.competencia, pct, temMeta);
      mapa.set(chave, {
        consultora_id: Number(r.consultora_id),
        competencia: r.competencia,
        meta_valor: meta,
        realizado,
        pct_atingido: Number(pct.toFixed(4)),
        fator,
        motivo,
        congelado: false,
        sem_meta: !temMeta,
      });
    }
  }

  return mapa;
}

/**
 * Aplica o fator num valor de comissão, arredondando no fim.
 *
 * ⚠️ O arredondamento é por LINHA aqui, mas o valor que a consultora recebe é o
 * do fechamento, que soma as linhas já ajustadas. Decisão do Jonathan (05/09/2026):
 * o fator vale sobre o total do mês — a diferença entre os dois critérios foi de
 * R$ 0,06 em agosto/2026, e o fechamento é quem manda.
 */
export function aplicarFator(comissao: number, fator: number): number {
  return Math.round(comissao * fator * 100) / 100;
}

/**
 * Congela o resultado da meta de um mês — chamado quando o fechamento é fechado.
 *
 * O QUÊ: grava meta, realizado, percentual e fator daquele mês e marca como
 * congelado. A partir daí `resultadosMeta()` lê esta linha em vez de recalcular.
 *
 * O PORQUÊ: comissão paga não pode mudar. Sem o congelamento, uma venda cancelada
 * meses depois alteraria o realizado de um mês fechado e, com ele, o fator das
 * parcelas de crediário daquele mês que ainda estão por vir.
 *
 * O IMPACTO: congelar cedo demais (mês ainda aberto) trava o fator antes de a
 * consultora terminar o mês — por isso quem chama é o FECHAR, nunca a leitura.
 */
export async function congelarResultadoMeta(consultoraId: number, competencia: string): Promise<void> {
  const atual = (await resultadosMeta([competencia], [consultoraId]))
    .get(chaveResultado(consultoraId, competencia));
  if (!atual) return;
  if (atual.congelado) return; // já congelado: não se recongela por cima

  await sql`
    INSERT INTO alissonerp.comissao_resultado_mensal
      (consultora_id, competencia, meta_valor, realizado, pct_atingido, fator, motivo, congelado, congelado_em)
    VALUES (
      ${consultoraId}, ${competencia}, ${atual.meta_valor}, ${atual.realizado},
      ${atual.pct_atingido}, ${atual.fator}, ${atual.motivo || null}, true, now()
    )
    ON CONFLICT (consultora_id, competencia) DO UPDATE SET
      meta_valor = EXCLUDED.meta_valor, realizado = EXCLUDED.realizado,
      pct_atingido = EXCLUDED.pct_atingido, fator = EXCLUDED.fator,
      motivo = EXCLUDED.motivo, congelado = true,
      congelado_em = COALESCE(alissonerp.comissao_resultado_mensal.congelado_em, now()),
      updated_at = now()
    -- WHERE: um mês já congelado NUNCA é sobrescrito, nem por reprocessamento.
    WHERE alissonerp.comissao_resultado_mensal.congelado = false
  `;
}

export interface RitmoMeta {
  consultora_id: number;
  /** Quanto o mês JÁ pedia até este instante (soma das horas já passadas). */
  meta_ate_agora: number;
  /** Quanto ainda falta pedir até o fim do mês (soma das horas que restam). */
  meta_restante: number;
  /** Horas de trabalho que ainda restam no mês, já sem folga e sem domingo. */
  horas_restantes: number;
  /** Dias de trabalho que ainda restam no mês. */
  dias_restantes: number;
}

/**
 * RITMO da meta — quanto o mês já pedia até agora e quanto ainda falta.
 *
 * O QUÊ: soma `public.metas_por_hora` (tipo Prata) separando as horas que já
 * passaram das que ainda vêm, para o extrato dizer se a consultora está atrás ou
 * à frente do ritmo — e quanto precisa fazer por dia/hora para virar o jogo.
 *
 * O PORQUÊ (Jonathan, 05/09/2026): "faltam R$ 188.213 para a meta" é um número
 * grande e sem prazo — não diz o que fazer hoje. "Você está R$ 12.136 atrás do
 * ritmo, faltam R$ 7.529 por dia" é acionável, e é o que faz a meta mexer no
 * comportamento DENTRO do mês, enquanto ainda dá para reagir.
 *
 * ⚠️ O ritmo SEGUE O CÁLCULO DO BANCO, não uma média nossa: `metas_por_hora` é
 * gerada pelo trigger `trigger_gerar_metas_por_hora` no cadastro da meta, já
 * respeitando jornada (`horas_dia`), horário de início e os dias não trabalhados.
 * Dividir a meta por 30 aqui daria um número diferente do que a empresa combinou —
 * e duas verdades de meta na mesma tela.
 *
 * ⚠️ É A MESMA CONTA DA TELA "Análise de Resultado" (dashboard comercial, modo
 * "Horário (acumulado)"): mesma view, mesmo `valor_meta > 0`, mesmo corte por
 * `data_hora <= now()`. Se as duas divergirem, a consultora vê um ritmo no
 * dashboard e outro no extrato — e nenhuma das telas ganha a discussão.
 *
 * O IMPACTO SE ALTERADO: a consultora passa a perseguir um ritmo que não é o da
 * meta cadastrada. Mês sem `metas_por_hora` gerada simplesmente não tem ritmo
 * (devolve vazio) — a tela esconde o bloco em vez de inventar número.
 */
export async function ritmoMeta(
  competencia: string,
  consultoraIds?: number[],
): Promise<Map<number, RitmoMeta>> {
  const mapa = new Map<number, RitmoMeta>();
  if (!/^\d{4}-\d{2}$/.test(competencia)) return mapa;

  const rows = await sql<Array<{
    consultora_id: number; meta_ate_agora: string; meta_restante: string;
    horas_restantes: string; dias_restantes: string;
  }>>`
    SELECT mp.consultora::int AS consultora_id,
           COALESCE(SUM(mp.valor_meta) FILTER (WHERE mp.data_hora <= now()), 0)::text AS meta_ate_agora,
           COALESCE(SUM(mp.valor_meta) FILTER (WHERE mp.data_hora >  now()), 0)::text AS meta_restante,
           COUNT(*) FILTER (WHERE mp.data_hora > now())::text AS horas_restantes,
           COUNT(DISTINCT mp.data_hora::date) FILTER (WHERE mp.data_hora > now())::text AS dias_restantes
    -- MESMA FONTE E MESMO FILTRO da dashboard comercial (analise-performance,
    -- ranking, vendas-dashboard): a view alissonerp.vw_dash_metas_por_hora com
    -- valor_meta > 0. O filtro NÃO é detalhe: as horas com meta 0 são os DIAS DE
    -- FOLGA (48 horas em set/2026, 4 dias × 12h). Sem ele, "faltam X dias" conta
    -- folga como dia de trabalho e o ritmo pedido sai menor do que o real.
    FROM alissonerp.vw_dash_metas_por_hora mp
    WHERE mp.tipo_meta = 'Prata'
      AND mp.valor_meta > 0
      AND mp.data_hora >= to_date(${competencia} || '-01', 'YYYY-MM-DD')
      AND mp.data_hora <  to_date(${competencia} || '-01', 'YYYY-MM-DD') + interval '1 month'
      ${consultoraIds?.length ? sql`AND mp.consultora = ANY(${consultoraIds})` : sql``}
    GROUP BY 1
  `;

  for (const r of rows) {
    mapa.set(Number(r.consultora_id), {
      consultora_id: Number(r.consultora_id),
      meta_ate_agora: Number(r.meta_ate_agora),
      meta_restante: Number(r.meta_restante),
      horas_restantes: Number(r.horas_restantes),
      dias_restantes: Number(r.dias_restantes),
    });
  }
  return mapa;
}
