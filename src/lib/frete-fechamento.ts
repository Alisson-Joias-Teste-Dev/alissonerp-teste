/**
 * frete-fechamento.ts — BLOCO 4 (verba de frete grátis, 21/07): rotina
 * automática do dia 01 — o "coração" do módulo (fecha o mês anterior + credita
 * a verba nova +, se necessário, abre a tarefa de aprovação do saldo
 * negativo).
 *
 * REGRA DE NEGÓCIO (decisões do Jonathan, definitivas — ver migration 356 e
 * docs/regras-negocio/entregas.md §10): no dia 01, para a gerente configurada
 * (`gerente_frete_gratis`, resolverGerenteFreteGratisId):
 *   1. Fecha o mês anterior — grava 1 linha em fechamentos_frete.
 *   2. Apura o saldo do mês (créditos − débitos dos lançamentos ainda sem
 *      fechamento_id) e CARIMBA fechamento_id neles (impede recontagem).
 *   3. ZERA o saldo com um CONTRA-LANÇAMENTO (técnica contábil — a soma é a de
 *      SEMPRE, não filtrada por mês): positivo → débito de mesmo valor;
 *      negativo → crédito de mesmo valor.
 *   4. Credita a VERBA NOVA (0,1% do faturamento do mês anterior,
 *      calcularVerbaFreteGratis) — entra SEMPRE, independente do resultado
 *      do fechamento.
 *   5. Se o saldo fechou NEGATIVO: cria tarefa de aprovação (evento
 *      'fechamento_frete_negativo', src/lib/aprovacoes/catalogo.ts) — a
 *      tarefa NÃO trava o ciclo, os passos 1-4 já aconteceram.
 *   6. Aprovar a tarefa (PATCH /api/tarefas/[id]/aprovacao) cria a conta a
 *      pagar (vencimento dia 10) — ver aprovarFechamentoFreteNoTx abaixo;
 *      recusar marca status='recusado' (motivo obrigatório, nenhuma conta).
 *
 * ⚠️ IDEMPOTÊNCIA (a rotina pode rodar 2x no mesmo mês, de propósito — cron
 * reenviado, ou disparo manual em cima do automático): o INSERT em
 * fechamentos_frete usa `ON CONFLICT (gerente_id, mes_referencia) DO NOTHING
 * RETURNING id` como PRIMEIRA escrita da transação — 0 linhas devolvidas =
 * já fechou este mês para esta gerente, e a função retorna cedo (`jaFechado:
 * true`) SEM tocar em saldo/tarefa/verba de novo. Tudo (fechamento + carimbo +
 * contra-lançamento + verba + tarefa) roda na MESMA transação (sql.begin) —
 * se qualquer passo falhar, nada fica gravado pela metade.
 *
 * IMPACTO SE ALTERADO: esta função é a ÚNICA que fecha o mês — duplicá-la (ou
 * reescrever a lógica de saldo/zeragem em outro lugar) arrisca 2 fontes de
 * verdade sobre "quanto a gerente tem de saldo de frete grátis".
 */
import sql from "@/lib/db";
import {
  resolverGerenteFreteGratisId,
  obterSaldoFreteGerenteNoTx,
} from "@/lib/entrega-venda";
import { calcularVerbaFreteGratis } from "@/lib/frete-verba";

// O client transacional do pacote postgres não expõe call signature adequada
// para o TypeScript neste projeto — mesmo padrão de src/lib/entrega-venda.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbSql = any;

/**
 * Arredonda valor monetário para 2 casas decimais — mesmo helper replicado em
 * src/lib/entrega-venda.ts e src/lib/frete-verba.ts (de propósito, ver
 * comentário de arredondarMoeda em frete-verba.ts: evita acoplar este arquivo
 * financeiro a outro módulo só por um helper de 1 linha).
 */
function money(v: unknown): number {
  return Math.round(Number(v ?? 0) * 100) / 100;
}

function fmtBRL(v: number): string {
  return `R$ ${v.toFixed(2)}`;
}

/** "julho de 2026" — usado só em descrições legíveis (auditoria/tarefa). */
function formatarMesReferencia(d: Date): string {
  return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ─── Config: pool de aprovadores do fechamento ────────────────────────────────

/**
 * Lê o pool de aprovadores do fechamento mensal com saldo negativo (chave MULTI
 * `aprovadores_fechamento_frete`, Config › Aprovadores) — mesmo padrão de
 * listarAprovadoresFreteAvulso/listarAprovadoresFreteAvulsoLoja
 * (src/lib/entrega-venda.ts).
 */
export async function listarAprovadoresFechamentoFrete(): Promise<string[]> {
  const [cfg] = await sql`
    SELECT valor FROM alissonerp.configuracoes_sistema
    WHERE chave = 'aprovadores_fechamento_frete'
  `;
  return String(cfg?.valor ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

// ─── Rotina automática do dia 01 ───────────────────────────────────────────────

export interface ResultadoFechamentoFrete {
  /** true = já existia fechamento para este gerente/mês (ON CONFLICT) — nada foi escrito de novo. */
  jaFechado: boolean;
  fechamentoId?: number;
  gerenteId?: string;
  /** YYYY-MM-DD — primeiro dia do mês de referência do fechamento. */
  mesReferencia?: string;
  saldoAnterior?: number;
  totalCreditos?: number;
  totalDebitos?: number;
  saldoFinal?: number;
  verbaCreditada?: number;
  faturamentoBase?: number;
  percentualVerba?: number;
  status?: "fechado" | "aguardando_aprovacao";
  /** Tarefa de aprovação criada quando saldoFinal < 0; null quando fechou positivo/zero. */
  tarefaId?: number | null;
  /** Pool de aprovadores da tarefa (para notificação, fora da transação). */
  aprovadoresNotificar?: string[];
}

/**
 * Fecha o mês anterior ao de `hoje` (normalizado para o 1º dia do mês de
 * `hoje` — a rotina é pensada para rodar no dia 01) para a gerente configurada
 * e credita a verba nova. Ver regra de negócio completa no cabeçalho do
 * arquivo.
 *
 * `userId`: usuário/processo que está executando a rotina — usado como
 * `created_by`/`criado_por` nas linhas gravadas (fechamento, lançamentos de
 * saldo, tarefa). Quando disparada pelo cron sem usuário autenticado, o
 * CALLER (rota) resolve um ator do sistema antes de chamar esta função — ver
 * src/app/api/entregas-venda/fechamento-frete-cron/route.ts.
 */
export async function fecharMesFreteGratisAutomatico(
  hoje: Date,
  userId: string,
): Promise<ResultadoFechamentoFrete> {
  const mesReferenciaDate = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const mesReferenciaStr = fmtDate(mesReferenciaDate);
  const mesLabel = formatarMesReferencia(mesReferenciaDate);

  const gerenteId = await resolverGerenteFreteGratisId(sql, userId);
  const { verba, faturamentoBase, percentual } = await calcularVerbaFreteGratis(mesReferenciaDate);
  const verbaArredondada = money(verba);

  return sql.begin(async (tx: DbSql) => {
    // ─── Apura o saldo do mês ──────────────────────────────────────────────
    // Saldo ATUAL (antes de qualquer lançamento deste fechamento) — reusa
    // obterSaldoFreteGerenteNoTx (fonte única, src/lib/entrega-venda.ts) em
    // vez de duplicar a soma crédito−débito. Como o fechamento anterior
    // sempre zera via contra-lançamento (regra abaixo), este número já É o
    // saldo apurado do mês (créditos − débitos dos lançamentos ainda sem
    // fechamento_id) — mas é calculado aqui de forma robusta (não assume a
    // zeragem anterior), decompondo saldo_anterior = saldoFinal − (créditos
    // − débitos não fechados).
    const saldoFinal = money(await obterSaldoFreteGerenteNoTx(tx, gerenteId));

    const [somasNaoFechadas] = await tx`
      SELECT
        COALESCE(SUM(valor) FILTER (WHERE tipo = 'credito'), 0)::numeric AS creditos,
        COALESCE(SUM(valor) FILTER (WHERE tipo = 'debito'), 0)::numeric AS debitos
      FROM alissonerp.saldo_frete_gratis
      WHERE gerente_id = ${gerenteId}::uuid AND fechamento_id IS NULL
    `;
    const totalCreditos = money(somasNaoFechadas?.creditos ?? 0);
    const totalDebitos = money(somasNaoFechadas?.debitos ?? 0);
    const saldoAnterior = money(saldoFinal - totalCreditos + totalDebitos);

    const status: "fechado" | "aguardando_aprovacao" = saldoFinal < 0 ? "aguardando_aprovacao" : "fechado";

    // ─── 1. Fecha o mês (idempotência: ON CONFLICT DO NOTHING é a 1ª escrita) ─
    const [fechamentoRow] = await tx`
      INSERT INTO alissonerp.fechamentos_frete
        (gerente_id, mes_referencia, saldo_anterior, total_creditos, total_debitos, saldo_final,
         status, verba_creditada, faturamento_base, percentual_verba, created_by)
      VALUES (
        ${gerenteId}::uuid, ${mesReferenciaStr}::date,
        ${saldoAnterior}, ${totalCreditos}, ${totalDebitos}, ${saldoFinal},
        ${status}, ${verbaArredondada}, ${money(faturamentoBase)}, ${percentual},
        ${userId}::uuid
      )
      ON CONFLICT (gerente_id, mes_referencia) DO NOTHING
      RETURNING id
    `;

    if (!fechamentoRow) {
      // Já fechado (2ª execução do mesmo mês/gerente) — nenhuma escrita além
      // deste INSERT (que não afetou linha nenhuma) rodou. Nada a reverter.
      return { jaFechado: true };
    }
    const fechamentoId = Number(fechamentoRow.id);

    // ─── 2. Carimba fechamento_id — impede recontagem em fechamentos futuros ──
    await tx`
      UPDATE alissonerp.saldo_frete_gratis
      SET fechamento_id = ${fechamentoId}
      WHERE gerente_id = ${gerenteId}::uuid AND fechamento_id IS NULL
    `;

    // ─── 3. ZERA o saldo com contra-lançamento (técnica contábil) ────────────
    // REGRA DE NEGÓCIO: o saldo é a soma de SEMPRE (não filtrada por mês) —
    // por isso o contra-lançamento usa `saldoFinal` (a soma completa), não
    // `totalCreditos - totalDebitos` isolado. Positivo → débito; negativo →
    // crédito; exatamente zero → nada a fazer (já está zerado).
    if (saldoFinal > 0) {
      await tx`
        INSERT INTO alissonerp.saldo_frete_gratis
          (gerente_id, tipo, valor, saldo_antes, saldo_depois, descricao, fechamento_id, created_by)
        VALUES (
          ${gerenteId}::uuid, 'debito', ${saldoFinal}, ${saldoFinal}, 0,
          ${`Fechamento ${mesLabel}: zeragem do saldo positivo (contra-lançamento)`},
          ${fechamentoId}, ${userId}::uuid
        )
      `;
    } else if (saldoFinal < 0) {
      const valorAbs = money(Math.abs(saldoFinal));
      await tx`
        INSERT INTO alissonerp.saldo_frete_gratis
          (gerente_id, tipo, valor, saldo_antes, saldo_depois, descricao, fechamento_id, created_by)
        VALUES (
          ${gerenteId}::uuid, 'credito', ${valorAbs}, ${saldoFinal}, 0,
          ${`Fechamento ${mesLabel}: zeragem do saldo negativo (contra-lançamento)`},
          ${fechamentoId}, ${userId}::uuid
        )
      `;
    }

    // ─── 4. Verba nova — entra SEMPRE ─────────────────────────────────────────
    if (verbaArredondada > 0) {
      await tx`
        INSERT INTO alissonerp.saldo_frete_gratis
          (gerente_id, tipo, valor, saldo_antes, saldo_depois, descricao, fechamento_id, created_by)
        VALUES (
          ${gerenteId}::uuid, 'credito', ${verbaArredondada}, 0, ${verbaArredondada},
          ${`Verba de frete grátis — ${mesLabel} (${percentual}% do faturamento do mês anterior)`},
          ${fechamentoId}, ${userId}::uuid
        )
      `;
    }

    // ─── 5. Saldo negativo → tarefa de aprovação (NÃO trava o ciclo acima) ────
    let tarefaId: number | null = null;
    let aprovadoresNotificar: string[] = [];
    if (saldoFinal < 0) {
      aprovadoresNotificar = await listarAprovadoresFechamentoFrete();
      const responsavelPrincipal = aprovadoresNotificar[0] ?? null;

      const [tarefaRow] = await tx`
        INSERT INTO alissonerp.tarefas
          (titulo, descricao, responsavel_id, criado_por, prioridade, status, tipo, tags)
        VALUES (
          ${`Fechamento de frete grátis negativo — ${mesLabel}`},
          ${`Saldo final ${fmtBRL(saldoFinal)} no fechamento de ${mesLabel}. Aprovar gera conta a pagar (vencimento dia 10); recusar não lança conta (motivo obrigatório).`},
          ${responsavelPrincipal}::uuid,
          ${userId}::uuid,
          'alta',
          'aguardando_aprovacao',
          'fechamento_frete_negativo',
          ${tx.array(["fechamento_frete", `fechamento_frete:${fechamentoId}`])}
        )
        RETURNING id
      `;
      tarefaId = Number(tarefaRow.id);

      if (responsavelPrincipal) {
        await tx`
          INSERT INTO alissonerp.aprovacoes_tarefa (tarefa_id, solicitante_id, aprovador_id, status)
          VALUES (${tarefaId}, ${userId}::uuid, ${responsavelPrincipal}::uuid, 'pendente')
        `;
      }

      await tx`
        UPDATE alissonerp.fechamentos_frete
        SET tarefa_aprovacao_id = ${tarefaId}
        WHERE id = ${fechamentoId}
      `;
    }

    return {
      jaFechado: false,
      fechamentoId,
      gerenteId,
      mesReferencia: mesReferenciaStr,
      saldoAnterior,
      totalCreditos,
      totalDebitos,
      saldoFinal,
      verbaCreditada: verbaArredondada,
      faturamentoBase: money(faturamentoBase),
      percentualVerba: percentual,
      status,
      tarefaId,
      aprovadoresNotificar,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any as Promise<ResultadoFechamentoFrete>;
}

// ─── Decisão da tarefa (PATCH /api/tarefas/[id]/aprovacao) ─────────────────────

/**
 * Aprova o fechamento negativo: cria a conta a pagar da gerente (vencimento
 * dia 10 do mês em que a APROVAÇÃO ocorre — decisão de implementação: a regra
 * do Jonathan diz "vencimento dia 10 do mês", sem especificar se é o mês do
 * fechamento ou o da decisão; usar o mês da decisão evita gerar conta com
 * vencimento no passado quando a aprovação demora a acontecer) e marca
 * fechamentos_frete.status='pago' + conta_pagar_id. Roda DENTRO da MESMA
 * transação que decide a tarefa (chamado com o `tx` do dispatcher, nunca abre
 * `sql.begin` própria) — ver PATCH /api/tarefas/[id]/aprovacao/route.ts,
 * mesmo padrão de liberarFreteAvulsoNoTx (src/lib/entrega-venda.ts).
 *
 * REUSA as mesmas colunas de contas_pagar já usadas por
 * src/app/api/entregas-venda/motoboy/pagar/route.ts (~L122-133): descricao,
 * valor, data_vencimento, situacao, categoria, obs, created_by.
 */
export async function aprovarFechamentoFreteNoTx(
  tx: DbSql,
  tarefaId: number,
  aprovadorId: string,
): Promise<{ fechamentoId: number; contaPagarId: number; valor: number }> {
  const [fechamento] = await tx`
    SELECT id, saldo_final, mes_referencia
    FROM alissonerp.fechamentos_frete
    WHERE tarefa_aprovacao_id = ${tarefaId}
    LIMIT 1
  `;
  if (!fechamento) {
    throw new Error("Fechamento de frete grátis não encontrado para esta tarefa.");
  }

  const fechamentoId = Number(fechamento.id);
  const valor = money(Math.abs(Number(fechamento.saldo_final)));
  const mesLabel = formatarMesReferencia(new Date(fechamento.mes_referencia));

  const [conta] = await tx`
    INSERT INTO alissonerp.contas_pagar
      (descricao, valor, data_vencimento, situacao, categoria, obs, created_by)
    VALUES (
      ${`Frete grátis — saldo negativo (${mesLabel})`},
      ${valor},
      (date_trunc('month', now()) + interval '9 days')::date,
      'pendente',
      'frete_gratis',
      ${`Fechamento #${fechamentoId} — aprovado pelo pool aprovadores_fechamento_frete.`},
      ${aprovadorId}::uuid
    )
    RETURNING id
  `;
  const contaPagarId = Number(conta.id);

  await tx`
    UPDATE alissonerp.fechamentos_frete
    SET status = 'pago', conta_pagar_id = ${contaPagarId}
    WHERE id = ${fechamentoId}
  `;

  return { fechamentoId, contaPagarId, valor };
}

/**
 * Recusa o fechamento negativo: marca status='recusado' — NÃO cria conta a
 * pagar nenhuma. `motivo` já validado como não-vazio pelo caller (mesma
 * pré-checagem "motivo obrigatório" do frete_avulso, PATCH .../aprovacao).
 */
export async function recusarFechamentoFreteNoTx(
  tx: DbSql,
  tarefaId: number,
  motivo: string,
): Promise<{ fechamentoId: number }> {
  const [fechamento] = await tx`
    SELECT id FROM alissonerp.fechamentos_frete WHERE tarefa_aprovacao_id = ${tarefaId} LIMIT 1
  `;
  if (!fechamento) {
    throw new Error("Fechamento de frete grátis não encontrado para esta tarefa.");
  }
  const fechamentoId = Number(fechamento.id);

  await tx`
    UPDATE alissonerp.fechamentos_frete
    SET status = 'recusado', observacoes = ${`Recusado: ${motivo}`}
    WHERE id = ${fechamentoId}
  `;

  return { fechamentoId };
}
