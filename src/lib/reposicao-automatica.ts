import "server-only";
import sqlDefault from "@/lib/db";

/**
 * Reposição automática de estoque.
 *
 * Quando uma venda baixa o estoque do produto e (saldo + OFs_em_aberto) fica
 * abaixo do estoque mínimo configurado, cria N OFs de fabricação de 1 unidade
 * cada, até cobrir a diferença. Cada OF cai em alissonerp.pcp na etapa
 * 'novas_ordens'. O setor da OF é derivado da produto_rota[rota_etapa_atual]
 * (não há coluna setor_id em pcp). deposito_id = NULL (sem operador atribuído).
 *
 * Regra: enquanto (saldo_disponivel + qtd_em_OFs_abertas) < estoque_minimo,
 * criar +1 OF.
 *
 * SERVER-ONLY: usado por src/lib/vendas-aprovar.ts dentro do approveVenda.
 * Falha não-bloqueante — se algo der errado aqui, a venda já está aprovada.
 */

interface VerificarOpts {
  /** ID do usuário que disparou (vai no created_by da ordem). */
  userId: string;
  /** Lista de produto_ids a verificar. Tipicamente os produtos da venda. */
  produtoIds: number[];
}

interface ReposicaoResultado {
  produto_id: number;
  ofs_criadas: number;
  numeros_ordem: string[];
  motivo?: "sem_config" | "inativo" | "saldo_ok" | "sem_rota";
}

export async function verificarReposicaoAutomatica(
  opts: VerificarOpts,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  txArg?: any,
): Promise<ReposicaoResultado[]> {
  const db = txArg ?? sqlDefault;
  const { userId, produtoIds } = opts;
  const unicos = Array.from(new Set(produtoIds.filter((p) => Number.isInteger(p) && p > 0)));
  if (unicos.length === 0) return [];

  const out: ReposicaoResultado[] = [];

  for (const produtoId of unicos) {
    out.push(await processarProduto(db, produtoId, userId));
  }
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processarProduto(db: any, produtoId: number, userId: string): Promise<ReposicaoResultado> {
  /**
   * REGRA DE NEGOCIO (Produto Upgrade): upgrade usa ouro do cliente e cobra
   * mao de obra por grama; nao e reposicao de estoque comercial.
   * O QUE: ignora produtos configurados em produto_upgrade_config.
   * POR QUE: esses produtos podem estar marcados como sob encomenda para
   * aparecer na venda, mas nao devem gerar OF/reposicao automatica.
   * IMPACTO SE REMOVIDO: aprovar venda com item upgrade pode abrir ordem
   * indevida no PCP.
   */
  const [upgradeCfg] = await db`
    SELECT produto_id
    FROM alissonerp.produto_upgrade_config
    WHERE produto_id = ${produtoId}
      AND ativo = true
    LIMIT 1
  `;
  if (upgradeCfg) return { produto_id: produtoId, ofs_criadas: 0, numeros_ordem: [], motivo: "sem_config" };

  // 1. Config de reposição
  const [cfg] = await db`
    SELECT estoque_minimo, ativo, tempo_fabricacao_dias
    FROM alissonerp.produto_reposicao_config
    WHERE produto_id = ${produtoId}
  `;
  if (!cfg) return { produto_id: produtoId, ofs_criadas: 0, numeros_ordem: [], motivo: "sem_config" };
  if (!cfg.ativo) return { produto_id: produtoId, ofs_criadas: 0, numeros_ordem: [], motivo: "inativo" };
  const estoqueMinimo = Number(cfg.estoque_minimo);
  if (estoqueMinimo <= 0) return { produto_id: produtoId, ofs_criadas: 0, numeros_ordem: [], motivo: "saldo_ok" };
  const tempoFab: number | null = cfg.tempo_fabricacao_dias != null ? Number(cfg.tempo_fabricacao_dias) : null;

  // 2. Saldo disponível agregado por todos os locais (vw_saldo_estoque_comercial_v2)
  const saldoRows = await db`
    SELECT COALESCE(SUM(disponivel), 0) AS disponivel
    FROM alissonerp.vw_saldo_estoque_comercial_v2
    WHERE produto_id = ${produtoId}
  `;
  const saldoDisponivel = Number(saldoRows[0]?.disponivel ?? 0);

  // 3. Qtd em OFs abertas (auto-geradas) ainda não concluídas/canceladas
  const ofsRows = await db`
    SELECT COUNT(*)::int AS total
    FROM alissonerp.ordens
    WHERE produto_reposicao_id = ${produtoId}
      AND COALESCE(status::text, '') NOT IN ('concluido', 'cancelado')
      AND COALESCE(situacao::text, '') NOT IN ('cancelado')
  `;
  const ofsAbertas = Number(ofsRows[0]?.total ?? 0);

  const cobertura = saldoDisponivel + ofsAbertas;
  const faltam = estoqueMinimo - cobertura;
  if (faltam <= 0) return { produto_id: produtoId, ofs_criadas: 0, numeros_ordem: [], motivo: "saldo_ok" };

  // 4. Primeira etapa da rota
  const [etapaRota] = await db`
    SELECT setor_id
    FROM alissonerp.produto_rota
    WHERE produto_id = ${produtoId}
    ORDER BY ordem ASC
    LIMIT 1
  `;
  const setorInicial: number | null = etapaRota?.setor_id != null ? Number(etapaRota.setor_id) : null;
  if (setorInicial == null) {
    // Sem rota cadastrada: cria a OF mesmo assim (sem setor) — gerente atribui depois.
    // Não bloquear reposição por falta de rota.
  }

  // 5. Dados do produto pra peso e nome
  const [prod] = await db`
    SELECT id_produto, nome, sku, peso_precificado
    FROM public.produtos WHERE id_produto = ${produtoId}
  `;
  if (!prod) return { produto_id: produtoId, ofs_criadas: 0, numeros_ordem: [] };
  const pesoUnit = Number(prod.peso_precificado ?? 0);

  // 6. Cria `faltam` OFs de 1 unidade cada
  const numerosOrdem: string[] = [];
  for (let i = 0; i < faltam; i++) {
    const numeroOrdem = await proximoNumeroOrdem(db);
    // data_entrega = hoje + tempo_fabricacao_dias (se configurado).
    // Sem config → NULL (campo é nullable em ordens). Calculado em JS pra
    // evitar fragment SQL condicional no postgres.js.
    let dataEntregaIso: string | null = null;
    if (tempoFab != null) {
      const d = new Date();
      d.setUTCHours(0, 0, 0, 0);
      d.setUTCDate(d.getUTCDate() + tempoFab);
      dataEntregaIso = d.toISOString().slice(0, 10);
    }
    const [ordem] = await db`
      INSERT INTO alissonerp.ordens (
        numero_ordem, tipo_ordem, situacao, status, rota,
        peso_metal_negociado, local_atual,
        produto_reposicao_id, observacao_erp,
        data_entrega,
        created_by, created_at
      ) VALUES (
        ${numeroOrdem},
        'fabricacao'::alissonerp.enum_tipo_ordem,
        'criado', 'aguardando',
        'pcp'::alissonerp.enum_rota_ordem,
        ${pesoUnit},
        1,
        ${produtoId},
        ${'Reposição automática (estoque mínimo) — produto ' + (prod.sku ?? '#' + produtoId)},
        ${dataEntregaIso},
        ${userId}::uuid, NOW()
      ) RETURNING id, numero_ordem
    `;

    await db`
      INSERT INTO alissonerp.itens_ordem (ordem_id, produto_id, nome_produto, sku, quantidade, peso_estimado)
      VALUES (
        ${ordem.id}, ${produtoId},
        ${prod.nome ?? '(sem nome)'},
        ${prod.sku ?? null},
        1, ${pesoUnit}
      )
    `;

    // pcp não tem setor_id — o setor da OF é derivado de produto_rota[rota_etapa_atual]
    // via JOIN nas queries de leitura (api/rota-fabricacao). setorInicial fica
    // implícito: se a rota tem etapa 1 cadastrada, é o 1º setor.
    void setorInicial;
    await db`
      INSERT INTO alissonerp.pcp
        (ordem_id, etapas, deposito_id, rota_etapa_atual, created_by)
      VALUES
        (${ordem.id},
         'novas_ordens'::alissonerp.enum_etapas_pcp,
         NULL,
         1,
         ${userId}::uuid)
    `;

    numerosOrdem.push(String(ordem.numero_ordem));
  }

  return {
    produto_id: produtoId,
    ofs_criadas: faltam,
    numeros_ordem: numerosOrdem,
    ...(setorInicial == null ? { motivo: "sem_rota" as const } : {}),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function proximoNumeroOrdem(db: any): Promise<string> {
  // Mesmo padrão do vendas-aprovar.criarOrdemDoOrcamento: max(alissonerp, directus) + 1
  const [{ max_id_ali }] = await db`SELECT COALESCE(MAX(id), 0) AS max_id_ali FROM alissonerp.ordens`;
  const [{ max_id_dir }] = await db`SELECT COALESCE(MAX(id), 0) AS max_id_dir FROM directus.ordens`;
  const next = Math.max(Number(max_id_ali), Number(max_id_dir)) + 1;
  return "C-" + String(next).padStart(4, "0");
}
