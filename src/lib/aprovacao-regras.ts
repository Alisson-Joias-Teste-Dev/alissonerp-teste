import sql from "@/lib/db";
import { criarNotificacao } from "@/lib/notificacoes";
import { resolverAprovadores } from "@/lib/aprovacoes";
import { HttpError } from "@/lib/devolucoes";
import {
  calcularTetoDesconto,
  FULL_ACCESS_ROLES_DESCONTO,
  FALLBACK_TETO_DESCONTO_PCT,
  LIMITE_DESCONTO_CARTAO_PADRAO,
} from "@/lib/desconto/precificar-item";

export interface RegraAprovacao {
  id: number;
  nome: string;
  descricao: string | null;
  tipo_evento: string;
  condicao_json: Record<string, unknown>;
  aprovador_role: string | null;
  aprovador_id: string | null;
  template_id: number | null;
  template_nome?: string;
  prioridade_regra: number;
}

export interface ContextoAprovacao {
  tipo: string;
  venda_id?: number;
  percentual_desconto?: number;
  valor_venda?: number;
  valor_credito?: number;
  orcamento_id?: number;
  orcamento_total?: number;
  [key: string]: unknown;
}

async function avaliarRegras(contexto: ContextoAprovacao): Promise<RegraAprovacao[]> {
  const regras = await sql<RegraAprovacao[]>`
    SELECT
      r.id, r.nome, r.descricao, r.tipo_evento, r.condicao_json,
      r.aprovador_role, r.aprovador_id, r.template_id, r.prioridade_regra
    FROM alissonerp.tarefas_regras_aprovacao r
    WHERE r.ativo = true AND r.tipo_evento = ${contexto.tipo}
    ORDER BY r.prioridade_regra DESC, r.id ASC
  `;

  return regras.filter((regra) => {
    const cond = regra.condicao_json as Record<string, number>;

    switch (regra.tipo_evento) {
      // FASE 5 (15/07, decisao Jonathan): o gate de "precisa aprovacao" para
      // desconto/cartao deixa de ser o condicao_json.percentual desta tabela
      // (havia 2 copias divergentes e 1 corrompida no banco) — passa a ser
      // 100% o threshold pessoal do vendedor (getDescontoThreshold), checado
      // EXPLICITAMENTE pelo caller ANTES de chamar avaliarRegras/criarTarefaAprovacao.
      // Aqui so respondemos "existe regra ativa pra esse evento", igual devolucao.
      case "desconto_acima":
        return true;
      case "valor_venda_acima":
        return (contexto.valor_venda ?? 0) > (cond.valor ?? 1000);
      case "credito_loja":
        return (contexto.valor_credito ?? 0) > 0;
      case "devolucao":
        return true;
      case "orcamento_acima":
        return (contexto.orcamento_total ?? 0) > (cond.valor ?? 1000);
      case "cartao_desconto":
        return true;
      default:
        return true;
    }
  });
}

async function criarTarefaAprovacao(
  regra: RegraAprovacao,
  contexto: ContextoAprovacao,
  solicitanteId: string,
): Promise<number> {
  // REGRA DE NEGÓCIO (Fase 3g.3 — política config-first estrita): quem aprova
  // desconto/cartão passa a ser 100% a config (aprovador_desconto_padrao /
  // aprovador_cartao_desconto_padrao) — sem cargo, sem master, sem fallback.
  // Sem aprovador configurado, a tarefa NÃO nasce (409 pro solicitante).
  const eventoAprovacao = regra.tipo_evento === "cartao_desconto" ? "cartao_desconto" : "desconto";
  const resol = await resolverAprovadores(eventoAprovacao);
  if (resol.status === "nao_configurado") {
    throw new HttpError(409, "Aprovador de desconto não configurado. Defina em Configurações › Aprovadores.");
  }
  const aprovadorId = resol.aprovadores[0];

  let titulo = "Aprovação — " + regra.nome;
  let descricao = regra.descricao ?? "";
  let tags: string[] = [];
  let prioridade = "alta";

  if (regra.template_id) {
    const [template] = await sql`
      SELECT * FROM alissonerp.tarefas_templates WHERE id = ${regra.template_id}
    `;
    if (template) {
      titulo = template.titulo_padrao;
      descricao = template.descricao_padrao ?? descricao;
      prioridade = template.prioridade ?? prioridade;
      tags = template.tags ?? [];
    }
  }

  const variaveis: Record<string, string> = {};
  for (const [k, v] of Object.entries(contexto)) {
    if (v !== undefined && v !== null) {
      variaveis[`${k}`] = String(v);
    }
  }

  for (const [chave, valor] of Object.entries(variaveis)) {
    titulo = titulo.replaceAll(`{${chave}}`, valor);
    descricao = descricao.replaceAll(`{${chave}}`, valor);
  }

  tags.push(`aprov_${regra.tipo_evento}`);

  const vendaId = contexto.venda_id ?? null;

  const [tarefa] = await sql`
    INSERT INTO alissonerp.tarefas
      (titulo, descricao, responsavel_id, criado_por, prioridade, status, venda_id, tags, tipo)
    VALUES (
      ${titulo}, ${descricao},
      ${aprovadorId}::uuid, ${solicitanteId}::uuid,
      ${prioridade}, 'aguardando_aprovacao',
      ${vendaId}, ${sql.array(tags)},
      ${regra.tipo_evento}
    )
    RETURNING id
  `;

  await sql`
    INSERT INTO alissonerp.aprovacoes_tarefa (tarefa_id, solicitante_id, aprovador_id, status)
    VALUES (${tarefa.id}, ${solicitanteId}::uuid, ${aprovadorId}::uuid, 'pendente')
  `;

  await criarNotificacao({
    usuarioId: aprovadorId,
    tipo: "aprovacao",
    titulo,
    mensagem: descricao,
    remetenteId: solicitanteId,
    link: `/tarefas?abrir=${tarefa.id}`,
  }).catch((e) => console.error("[aprovacao-regras] notificação de tarefa falhou:", e));

  return tarefa.id;
}

async function processarDecisao(
  tarefaId: number,
  decisao: "aprovado" | "rejeitado",
  aprovadorId: string,
  motivo?: string,
): Promise<void> {
  await sql`
    INSERT INTO alissonerp.tarefas_historico
      (tarefa_id, usuario_id, acao, comentario, created_at)
    VALUES (${tarefaId}, ${aprovadorId}::uuid, ${decisao}, ${motivo ?? null}, now())
  `;
}

/**
 * Lê uma chave NUMÉRICA de alissonerp.configuracoes_sistema, com fallback
 * seguro se a chave não existir/não for número válido.
 *
 * FASE 5 (15/07): as chaves `desconto_fallback_sem_cadastro_pct` e
 * `limite_desconto_cartao_pct` ainda NÃO existem no banco — serão criadas
 * via skill /dba (homolog primeiro). Até lá, todo caller cai no fallback do
 * código (FALLBACK_TETO_DESCONTO_PCT / LIMITE_DESCONTO_CARTAO_PADRAO) — nunca
 * quebra (isto é só um número com default seguro, não é autoridade/Fase 1b).
 */
async function buscarConfigNumerica(chave: string, fallback: number): Promise<number> {
  const [row] = await sql`
    SELECT valor FROM alissonerp.configuracoes_sistema WHERE chave = ${chave} LIMIT 1
  `;
  const n = Number(row?.valor);
  return row && Number.isFinite(n) ? n : fallback;
}

/** Fallback de desconto sem cadastro (config `desconto_fallback_sem_cadastro_pct`,
 *  seed 0 — decisão Jonathan 23/06/15/07). Ver buscarConfigNumerica. */
async function buscarFallbackDescontoSemCadastro(): Promise<number> {
  return buscarConfigNumerica("desconto_fallback_sem_cadastro_pct", FALLBACK_TETO_DESCONTO_PCT);
}

/** Limite de desconto no CARTÃO (config `limite_desconto_cartao_pct`, seed 20 —
 *  decisão Jonathan 23/06/15/07). Reusar nos 4 gates (não duplicar a leitura). */
async function buscarLimiteDescontoCartao(): Promise<number> {
  return buscarConfigNumerica("limite_desconto_cartao_pct", LIMITE_DESCONTO_CARTAO_PADRAO);
}

/**
 * Retorna o threshold de desconto (SEM aprovação) do vendedor que criou a
 * venda — FONTE ÚNICA via calcularTetoDesconto (src/lib/desconto/precificar-item.ts).
 *
 * REGRA DE NEGÓCIO (Fase 5, 15/07 — decisão Jonathan): acaba a CASE hardcoded
 * de fallback por cargo (30/50/15), que também deixava admin/desenvolvedor de
 * fora (bug: caiam no "resto=15"). Ordem agora:
 *   1. full-access (admin/desenvolvedor) → 100
 *   2. mx_desconto_permitido do cadastro > 0 → esse valor
 *   3. sem cadastro → fallback configurável (configuracoes_sistema.
 *      desconto_fallback_sem_cadastro_pct, seed 0)
 * Usa LEFT JOIN (1 query só) em vez de query separada, para não mudar o
 * shape de chamada aos callers/mocks existentes.
 * IMPACTO SE ALTERADO: volta a divergência entre o gate real (aqui) e o
 * que os 4 fronts mostram na tela (calcularTetoDesconto).
 */
async function getDescontoThreshold(vendaId: number): Promise<number> {
  const [row] = await sql`
    SELECT u.mx_desconto_permitido, u.role,
           (SELECT valor FROM alissonerp.configuracoes_sistema
            WHERE chave = 'desconto_fallback_sem_cadastro_pct' LIMIT 1) AS fallback_config
    FROM alissonerp.vendas_erp ve
    JOIN alissonerp.usuarios u ON u.vendedor_id = ve.vendedor_id
    WHERE ve.id = ${vendaId}
  `;
  const fallbackConfigNum = Number(row?.fallback_config);
  const fallback = row && Number.isFinite(fallbackConfigNum) ? fallbackConfigNum : FALLBACK_TETO_DESCONTO_PCT;
  return calcularTetoDesconto(
    row?.mx_desconto_permitido != null ? Number(row.mx_desconto_permitido) : null,
    row?.role ?? null,
    FULL_ACCESS_ROLES_DESCONTO,
    fallback,
  );
}

export {
  avaliarRegras,
  criarTarefaAprovacao,
  processarDecisao,
  getDescontoThreshold,
  buscarFallbackDescontoSemCadastro,
  buscarLimiteDescontoCartao,
};
