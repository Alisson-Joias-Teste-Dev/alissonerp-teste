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
 *   4. Credita a VERBA NOVA (0,1% do faturamento LÍQUIDO da COMPETÊNCIA — o
 *      mês que está sendo fechado; calcularVerbaFreteGratis) — entra SEMPRE,
 *      independente do resultado do fechamento. ⚠️ Base revisada em
 *      03/08/2026: era o BRUTO, e o fechamento se chamava pelo mês em que a
 *      rotina rodava; virou LÍQUIDO e COMPETÊNCIA (§10.8).
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
/**
 * IDs de `public.contatos` marcados como TESTE (config `contatos_teste`,
 * migration 364) — lançamentos de frete vinculados a eles somem do relatório
 * de fechamento.
 *
 * REGRA DE NEGÓCIO (03/08/2026, pedido do Jonathan): *"cancela esses fretes no
 * meu nome que eles são de teste, todos que estiverem no nome devem sair desse
 * relatório"*. É config, não lista no código, porque a regra é "todos no meu
 * nome" — um teste novo some sozinho, sem deploy.
 *
 * ⚠️ EXIBIÇÃO APENAS: não estorna, não mexe em saldo. Os valores continuam
 * dentro dos totais GRAVADOS no cabeçalho do fechamento (a tela mostra quanto
 * foi ocultado, justamente para o cabeçalho continuar explicável).
 *
 * Mesmo padrão de leitura de `listarAprovadoresFechamentoFrete` (CSV na
 * `configuracoes_sistema`, sem cache). Ignora pedaços não numéricos — a chave é
 * editada à mão pelo Jonathan e um espaço/vírgula sobrando não pode virar erro
 * de SQL.
 */
export async function listarContatosTeste(db: DbSql): Promise<number[]> {
  return lerConfigListaDeIds(db, "contatos_teste");
}

/**
 * IDs de `entregas_venda` marcadas como TESTE (config `entregas_teste`,
 * migration 365).
 *
 * POR QUE EXISTE, se já há `contatos_teste` (03/08/2026): **frete avulso não
 * tem cliente**. A corrida "teste de frete avulso" (entrega 47,
 * ENT-20260610-00009) nasceu sem venda e sem `contato_id`, então nenhuma lista
 * de contatos jamais a alcançaria — e o Jonathan pediu que ela não aparecesse.
 * A chave por entrega é a única forma de marcar uma corrida solta.
 *
 * ⚠️ EXIBIÇÃO APENAS, igual `contatos_teste`: não estorna, não mexe em saldo.
 * Usar com parcimônia — é uma lista manual de exceções, e cada id aqui é uma
 * linha que some do relatório sem sair do razão. Marcar corrida REAL aqui
 * esconde movimento verdadeiro.
 */
export async function listarEntregasTeste(db: DbSql): Promise<number[]> {
  return lerConfigListaDeIds(db, "entregas_teste");
}

/**
 * Lê uma config que guarda lista de ids em CSV ("224,394408") e devolve os
 * números válidos. Pedaço não numérico é descartado — estas chaves são
 * editadas à mão pelo Jonathan e um espaço/vírgula sobrando não pode virar
 * erro de SQL. Mesmo padrão de leitura de `listarAprovadoresFechamentoFrete`
 * (sem cache).
 */
async function lerConfigListaDeIds(db: DbSql, chave: string): Promise<number[]> {
  const [cfg] = await db`
    SELECT valor FROM alissonerp.configuracoes_sistema
    WHERE chave = ${chave}
  `;
  return String(cfg?.valor ?? "")
    .split(",")
    .map((s: string) => Number(s.trim()))
    .filter((n: number) => Number.isInteger(n) && n > 0);
}

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
  // 🔴 COMPETÊNCIA (mudança de 03/08/2026, decisão do Jonathan: *"eu preciso
  // que seja o mês da competência"*): `mes_referencia` é o mês que está sendo
  // FECHADO — o ANTERIOR ao de `hoje` —, não o mês em que a rotina rodou.
  // Rodando em 03/08, o fechamento é de JULHO (`2026-07-01`), e a verba sai do
  // faturamento líquido de julho (calcularVerbaFreteGratis recebe a própria
  // competência, ver src/lib/frete-verba.ts).
  //
  // IMPACTO DA VIRADA (só valeu uma vez, no deploy): o fechamento #1 já estava
  // gravado com `2026-08-01` pela regra antiga. Trocar isto no código SEM
  // corrigir aquela linha faria a rotina do dia seguinte não achar conflito no
  // `UNIQUE (gerente_id, mes_referencia)`, inserir uma linha nova de julho e
  // CREDITAR A VERBA DE NOVO. Por isso a correção da linha #1 (2026-08-01 →
  // 2026-07-01) subiu junto com este código, não depois.
  const mesReferenciaDate = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
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
          ${`Verba de frete grátis — competência ${mesLabel} (${percentual}% do faturamento líquido)`},
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

// ─── BLOCO 5 (21/07) — relatório mensal (aba "Fechamentos de frete") ──────────

/**
 * PAGE_SIZE_FECHAMENTOS_FRETE — paginação da aba "Fechamentos de frete"
 * (mockup aprovado pelo Jonathan): 10 por página, MESMO padrão de
 * PAGE_SIZE_RELATORIOS_PAGAMENTO_MOTOBOY (src/lib/pagamento-motoboy.ts).
 */
export const PAGE_SIZE_FECHAMENTOS_FRETE = 10;

export interface FechamentoFreteListItem {
  id: number;
  gerenteId: string;
  /** Nome da gerente (LEFT JOIN alissonerp.usuarios) — "—" se o usuário não existir mais. */
  gerenteNome: string;
  /** YYYY-MM-DD — primeiro dia do mês de referência do fechamento. */
  mesReferencia: string;
  saldoAnterior: number;
  totalCreditos: number;
  totalDebitos: number;
  saldoFinal: number;
  verbaCreditada: number;
  faturamentoBase: number;
  percentualVerba: number;
  status: "fechado" | "aguardando_aprovacao" | "pago" | "recusado";
  /** Tarefa de aprovação vinculada (saldo negativo) — null se o fechamento fechou positivo/zero. */
  tarefaAprovacaoId: number | null;
  /** Conta a pagar gerada quando a tarefa acima foi APROVADA — null enquanto aguarda decisão, ou se recusada. */
  contaPagarId: number | null;
  /** ISO 8601 completo (timestamp) — hora da gravação do fechamento. */
  createdAt: string;
}

/**
 * Lista PAGINADA (10/página) dos fechamentos mensais já gravados por
 * `fecharMesFreteGratisAutomatico` — mês mais recente primeiro. Usada tanto
 * pelo SSR (`page.tsx`, primeira carga + navegação de página via
 * Paginacao/Link) quanto pela rota `GET /api/entregas-venda/fechamentos` —
 * MESMA função nos dois lugares (padrão de `listarRelatoriosPagamentoMotoboy`,
 * src/lib/pagamento-motoboy.ts), evita duas cópias da mesma consulta.
 *
 * SEM N+1: nome da gerente vem de um LEFT JOIN na própria consulta paginada
 * (1 SELECT), não uma query por fechamento. `status`/`tarefa_aprovacao_id`/
 * `conta_pagar_id` já vêm prontos da tabela (migration 356) — não precisa
 * recalcular nada aqui, só ler e formatar.
 *
 * ⚠️ `mes_referencia`/`created_at` são colunas DATE/TIMESTAMP — o driver
 * (postgres.js) devolve isso como objeto `Date`, não string (parser default
 * do driver, ver `node_modules/postgres/cjs/src/types.js`). Formatar com
 * `String(...)` direto (sem reembrulhar em `new Date()`) quebra o formato
 * esperado (`YYYY-MM-DD`) — MESMO padrão seguro já usado em
 * `src/app/(dashboard)/entregas-venda/page.tsx` para `data_saida`/
 * `created_at` (`new Date(String(valor)).toISOString()`), aplicado aqui.
 */
export async function listarFechamentosFrete(
  db: DbSql,
  { page, limit }: { page: number; limit: number },
): Promise<{ items: FechamentoFreteListItem[]; total: number }> {
  const offset = (page - 1) * limit;

  const [rows, countRows]: [Record<string, unknown>[], Record<string, unknown>[]] = await Promise.all([
    db`
      SELECT
        f.id, f.gerente_id, f.mes_referencia, f.saldo_anterior, f.total_creditos,
        f.total_debitos, f.saldo_final, f.verba_creditada, f.faturamento_base,
        f.percentual_verba, f.status, f.tarefa_aprovacao_id, f.conta_pagar_id,
        f.created_at,
        u.nome AS gerente_nome
      FROM alissonerp.fechamentos_frete f
      LEFT JOIN alissonerp.usuarios u ON u.id = f.gerente_id
      ORDER BY f.mes_referencia DESC, f.id DESC
      LIMIT ${limit} OFFSET ${offset}
    `,
    db`SELECT COUNT(*)::integer AS total FROM alissonerp.fechamentos_frete`,
  ]);

  const items: FechamentoFreteListItem[] = rows.map(mapFechamentoRow);

  return { items, total: Number(countRows[0]?.total ?? 0) };
}

/**
 * Converte uma linha crua de `fechamentos_frete` (+ `u.nome AS gerente_nome`)
 * no item serializável do front. EXTRAÍDO de `listarFechamentosFrete` para ser
 * reusado por `obterFechamentoFreteDetalhe` (03/08/2026) — a lista e o detalhe
 * mostram o MESMO cabeçalho, então mapear em dois lugares abriria espaço pra
 * divergirem (ex.: um formata `mes_referencia` e o outro não).
 */
function mapFechamentoRow(r: Record<string, unknown>): FechamentoFreteListItem {
  return {
    id: Number(r.id),
    gerenteId: String(r.gerente_id),
    gerenteNome: (r.gerente_nome as string | null) ?? "—",
    mesReferencia: r.mes_referencia ? new Date(String(r.mes_referencia)).toISOString().slice(0, 10) : "",
    saldoAnterior: Number(r.saldo_anterior ?? 0),
    totalCreditos: Number(r.total_creditos ?? 0),
    totalDebitos: Number(r.total_debitos ?? 0),
    saldoFinal: Number(r.saldo_final ?? 0),
    verbaCreditada: Number(r.verba_creditada ?? 0),
    faturamentoBase: Number(r.faturamento_base ?? 0),
    percentualVerba: Number(r.percentual_verba ?? 0),
    status: r.status as FechamentoFreteListItem["status"],
    tarefaAprovacaoId: r.tarefa_aprovacao_id != null ? Number(r.tarefa_aprovacao_id) : null,
    contaPagarId: r.conta_pagar_id != null ? Number(r.conta_pagar_id) : null,
    createdAt: r.created_at ? new Date(String(r.created_at)).toISOString() : "",
  };
}

// ─── Detalhe de UM fechamento (03/08/2026) ────────────────────────────────────

/**
 * Um lançamento de `saldo_frete_gratis` carimbado com o `fechamento_id`, já
 * com o contexto da entrega/venda que o originou (quando existe).
 */
export interface LancamentoFechamentoFrete {
  id: number;
  tipo: "credito" | "debito";
  valor: number;
  descricao: string;
  /** ISO 8601 — `now()` da transação que gravou o lançamento. */
  createdAt: string;
  /**
   * true = lançamento gerado pela PRÓPRIA rotina de fechamento (contra-lançamento
   * de zeragem e crédito da verba). Ver `doFechamento` em
   * `obterFechamentoFreteDetalhe` para o critério — e por que ele NÃO pode
   * entrar nos totais do mês.
   */
  doFechamento: boolean;
  entregaId: number | null;
  codigoEntrega: string | null;
  situacaoEntrega: string | null;
  freteCobrado: number | null;
  freteMotoboy: number | null;
  vendaId: number | null;
  numeroVenda: string | null;
  clienteNome: string | null;
  /**
   * Frete AVULSO (corrida sem venda). CONFERIDO em prod: 6 dos 68 lançamentos
   * do fechamento #1 são assim — não têm venda nem contato, então `clienteNome`
   * é null POR NATUREZA, não por dado faltando. A tela mostra
   * `descricaoAvulso` ("ir buscar peça que deu problema") no lugar do cliente.
   */
  isAvulso: boolean;
  descricaoAvulso: string | null;
  /**
   * Lançamento de TESTE — o cliente (ou o contato da corrida avulsa) está na
   * config `contatos_teste`. Some do relatório; ver `listarContatosTeste`.
   */
  isTeste: boolean;
}

/** Rastro da decisão do saldo negativo — só existe quando `tarefa_aprovacao_id` está preenchido. */
export interface AprovacaoFechamentoFrete {
  tarefaId: number;
  tituloTarefa: string;
  /** Status da TAREFA (`aguardando_aprovacao`, `concluida`, ...). */
  statusTarefa: string;
  /** Status da linha de `aprovacoes_tarefa` (`pendente` | `aprovado` | `recusado`). */
  statusAprovacao: string | null;
  solicitanteNome: string | null;
  aprovadorNome: string | null;
  /** Motivo obrigatório da recusa (null quando aprovado ou ainda pendente). */
  motivo: string | null;
  /** ISO 8601 — quando o aprovador decidiu; null enquanto pendente. */
  respondidoEm: string | null;
  criadoEm: string;
}

export interface FechamentoFreteDetalhe {
  cabecalho: FechamentoFreteListItem;
  /** TODOS os lançamentos carimbados, mês + fechamento, do mais recente pro mais antigo. */
  lancamentos: LancamentoFechamentoFrete[];
  aprovacao: AprovacaoFechamentoFrete | null;
}

/**
 * Detalhe completo de UM fechamento: cabeçalho + os lançamentos que ele
 * carimbou + o rastro da aprovação do saldo negativo. Alimenta a página
 * `/entregas-venda/fechamentos/[id]` (03/08/2026 — decisão do Jonathan:
 * página própria, não drawer, pra o link poder ser compartilhado).
 *
 * ⚠️ REGRA DE NEGÓCIO — `doFechamento` (o detalhe que faz as contas fecharem):
 * a rotina do dia 01 carimba `fechamento_id` nos lançamentos do mês E DEPOIS
 * grava os seus DOIS lançamentos próprios (zeragem do saldo + verba nova) já
 * com o mesmo `fechamento_id`. Logo, somar tudo que tem `fechamento_id = N`
 * NÃO reproduz `total_creditos`/`total_debitos` do cabeçalho — no fechamento
 * #1 daria R$ 1.457,37 / R$ 706,36 em vez de R$ 706,36 / R$ 697,00.
 *
 * O critério de separação é `s.created_at >= f.created_at`, e ele é EXATO (não
 * é heurística de tolerância): `created_at` das duas tabelas tem default
 * `now()`, que no PostgreSQL é o horário de INÍCIO DA TRANSAÇÃO — como o
 * fechamento e os seus dois lançamentos nascem na MESMA transação
 * (`sql.begin` em `fecharMesFreteGratisAutomatico`), os três carimbam o
 * timestamp idêntico, enquanto todo lançamento do mês veio de transação
 * anterior e é estritamente menor. CONFERIDO em prod no fechamento #1
 * (2026-08-03 17:13:10.878269+00 nos três).
 *
 * IMPACTO SE ALTERADO PARA `clock_timestamp()`: os dois lançamentos passariam
 * a ter timestamp alguns microssegundos MAIOR que o do fechamento — o `>=`
 * continua funcionando. O que quebraria seria mover a gravação deles para
 * FORA da transação do fechamento.
 *
 * Retorna null se o id não existir (a página responde 404).
 */
export async function obterFechamentoFreteDetalhe(
  db: DbSql,
  id: number,
): Promise<FechamentoFreteDetalhe | null> {
  const [cabecalhoRow] = await db`
    SELECT
      f.id, f.gerente_id, f.mes_referencia, f.saldo_anterior, f.total_creditos,
      f.total_debitos, f.saldo_final, f.verba_creditada, f.faturamento_base,
      f.percentual_verba, f.status, f.tarefa_aprovacao_id, f.conta_pagar_id,
      f.created_at,
      u.nome AS gerente_nome
    FROM alissonerp.fechamentos_frete f
    LEFT JOIN alissonerp.usuarios u ON u.id = f.gerente_id
    WHERE f.id = ${id}
  `;
  if (!cabecalhoRow) return null;
  const cabecalho = mapFechamentoRow(cabecalhoRow);

  // SEM N+1: entrega, venda e cliente vêm por LEFT JOIN na mesma consulta —
  // MESMOS joins da listagem de entregas (`page.tsx`: `public.contatos` por
  // `id_contato`, com fallback no contato da entrega avulsa, que não tem venda).
  // Contatos de teste (config) — a flag é resolvida no BANCO, junto do resto,
  // para não puxar a lista de contatos pro JS só para comparar id.
  // `= ANY(...)` com array vazio devolve false para todos (nenhum lançamento
  // marcado), que é o comportamento correto quando a config não existe.
  const [contatosTeste, entregasTeste] = await Promise.all([
    listarContatosTeste(db),
    listarEntregasTeste(db),
  ]);

  const lancamentoRows: Record<string, unknown>[] = await db`
    SELECT
      s.id, s.tipo::text AS tipo, s.valor, s.descricao, s.created_at,
      (s.created_at >= f.created_at) AS do_fechamento,
      s.entrega_id, e.codigo_entrega, e.situacao::text AS situacao_entrega,
      e.frete_cobrado, e.frete_motoboy, e.is_avulso, e.descricao_avulso,
      s.venda_id, v.numero_venda,
      COALESCE(c.nome, ca.nome) AS cliente_nome,
      (COALESCE(v.cliente_id, e.contato_id) = ANY (${db.array(contatosTeste)}::bigint[])
       OR s.entrega_id = ANY (${db.array(entregasTeste)}::int[])) AS is_teste
    FROM alissonerp.saldo_frete_gratis s
    JOIN alissonerp.fechamentos_frete f ON f.id = s.fechamento_id
    LEFT JOIN alissonerp.entregas_venda e ON e.id = s.entrega_id
    LEFT JOIN alissonerp.vendas_erp v ON v.id = s.venda_id
    LEFT JOIN public.contatos c ON c.id_contato = v.cliente_id
    LEFT JOIN public.contatos ca ON ca.id_contato = e.contato_id
    WHERE s.fechamento_id = ${id}
    ORDER BY s.created_at DESC, s.id DESC
  `;

  const lancamentos: LancamentoFechamentoFrete[] = lancamentoRows.map((r) => ({
    id: Number(r.id),
    tipo: r.tipo as "credito" | "debito",
    valor: Number(r.valor ?? 0),
    descricao: String(r.descricao ?? ""),
    createdAt: r.created_at ? new Date(String(r.created_at)).toISOString() : "",
    doFechamento: Boolean(r.do_fechamento),
    entregaId: r.entrega_id != null ? Number(r.entrega_id) : null,
    codigoEntrega: r.codigo_entrega ? String(r.codigo_entrega) : null,
    situacaoEntrega: r.situacao_entrega ? String(r.situacao_entrega) : null,
    freteCobrado: r.frete_cobrado != null ? Number(r.frete_cobrado) : null,
    freteMotoboy: r.frete_motoboy != null ? Number(r.frete_motoboy) : null,
    vendaId: r.venda_id != null ? Number(r.venda_id) : null,
    numeroVenda: r.numero_venda ? String(r.numero_venda) : null,
    clienteNome: r.cliente_nome ? String(r.cliente_nome) : null,
    isAvulso: Boolean(r.is_avulso),
    descricaoAvulso: r.descricao_avulso ? String(r.descricao_avulso) : null,
    isTeste: Boolean(r.is_teste),
  }));

  // Rastro da decisão — só quando o mês fechou negativo e abriu tarefa.
  // `aprovacoes_tarefa` pode ter mais de uma linha para a mesma tarefa (o
  // dispatcher de aprovações reusa a tabela em outros fluxos); pega a última.
  let aprovacao: AprovacaoFechamentoFrete | null = null;
  if (cabecalho.tarefaAprovacaoId != null) {
    const [ap] = await db`
      SELECT
        t.id AS tarefa_id, t.titulo, t.status AS status_tarefa, t.created_at AS criado_em,
        a.status AS status_aprovacao, a.motivo, a.respondido_em,
        us.nome AS solicitante_nome, ua.nome AS aprovador_nome
      FROM alissonerp.tarefas t
      LEFT JOIN alissonerp.aprovacoes_tarefa a ON a.tarefa_id = t.id
      LEFT JOIN alissonerp.usuarios us ON us.id = a.solicitante_id
      LEFT JOIN alissonerp.usuarios ua ON ua.id = a.aprovador_id
      WHERE t.id = ${cabecalho.tarefaAprovacaoId}
      ORDER BY a.id DESC NULLS LAST
      LIMIT 1
    `;
    if (ap) {
      aprovacao = {
        tarefaId: Number(ap.tarefa_id),
        tituloTarefa: String(ap.titulo ?? ""),
        statusTarefa: String(ap.status_tarefa ?? ""),
        statusAprovacao: ap.status_aprovacao ? String(ap.status_aprovacao) : null,
        solicitanteNome: ap.solicitante_nome ? String(ap.solicitante_nome) : null,
        aprovadorNome: ap.aprovador_nome ? String(ap.aprovador_nome) : null,
        motivo: ap.motivo ? String(ap.motivo) : null,
        respondidoEm: ap.respondido_em ? new Date(String(ap.respondido_em)).toISOString() : null,
        criadoEm: ap.criado_em ? new Date(String(ap.criado_em)).toISOString() : "",
      };
    }
  }

  return { cabecalho, lancamentos, aprovacao };
}
