import sql from "@/lib/db";

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
      case "desconto_acima":
        return (contexto.percentual_desconto ?? 0) > (cond.percentual ?? 30);
      case "valor_venda_acima":
        return (contexto.valor_venda ?? 0) > (cond.valor ?? 1000);
      case "credito_loja":
        return (contexto.valor_credito ?? 0) > 0;
      case "devolucao":
        return true;
      case "orcamento_acima":
        return (contexto.orcamento_total ?? 0) > (cond.valor ?? 1000);
      default:
        return true;
    }
  });
}

async function encontrarAprovador(regra: RegraAprovacao): Promise<string> {
  if (regra.aprovador_id) {
    const [u] = await sql`
      SELECT id FROM alissonerp.usuarios WHERE id = ${regra.aprovador_id}::uuid AND ativo = true LIMIT 1
    `;
    if (u) return u.id;
  }

  if (regra.aprovador_role) {
    const orderMap: Record<string, string> = {
      admin: "CASE WHEN role = 'admin' THEN 1 WHEN role = 'desenvolvedor' THEN 2 ELSE 3 END",
      gerente_loja: "CASE WHEN role = 'gerente_loja' THEN 1 ELSE 2 END",
      gerente_fabrica: "CASE WHEN role = 'gerente_fabrica' THEN 1 ELSE 2 END",
      desenvolvedor: "CASE WHEN role = 'desenvolvedor' THEN 1 WHEN role = 'admin' THEN 2 ELSE 3 END",
    };

    const orderExpr = orderMap[regra.aprovador_role] ??
      `CASE WHEN role = ${`'${regra.aprovador_role}'`} THEN 1 ELSE 2 END`;

    const roles = [regra.aprovador_role];
    if (regra.aprovador_role === "admin") roles.push("desenvolvedor");
    if (regra.aprovador_role === "desenvolvedor") roles.push("admin");

    const [aprovador] = await sql`
      SELECT id FROM alissonerp.usuarios
      WHERE role = ANY(${roles}) AND ativo = true
      ORDER BY ${orderExpr}
      LIMIT 1
    `;

    if (aprovador) return aprovador.id;
  }

  const [admin] = await sql`
    SELECT id FROM alissonerp.usuarios
    WHERE role IN ('admin', 'desenvolvedor') AND ativo = true
    ORDER BY CASE WHEN role = 'admin' THEN 1 ELSE 2 END
    LIMIT 1
  `;
  if (!admin) throw new Error("Nenhum aprovador ativo encontrado");
  return admin.id;
}

async function criarTarefaAprovacao(
  regra: RegraAprovacao,
  contexto: ContextoAprovacao,
  solicitanteId: string,
): Promise<number> {
  const aprovadorId = await encontrarAprovador(regra);

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

  await sql`
    INSERT INTO alissonerp.notificacoes
      (usuario_id, tipo, titulo, mensagem, remetente_id, link)
    VALUES (
      ${aprovadorId}::uuid, 'aprovacao', ${titulo},
      ${descricao}, ${solicitanteId}::uuid,
      ${`/tarefas?abrir=${tarefa.id}`}
    )
  `.catch(() => {});

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

export { avaliarRegras, encontrarAprovador, criarTarefaAprovacao, processarDecisao };
