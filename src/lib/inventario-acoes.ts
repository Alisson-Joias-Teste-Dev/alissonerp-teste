import sql from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { condPecaPronta } from "@/lib/inventario-peca-pronta";

/**
 * REGRA DE NEGÓCIO — AÇÕES EXECUTÁVEIS DO INVENTÁRIO (v2.83.0):
 * - O que faz: centraliza a EXECUÇÃO real de abrir/concluir/cancelar
 *   inventário comercial, num único lugar.
 * - Por quê: essas ações agora acontecem por DOIS caminhos — direto
 *   (gerência/admin nas rotas) e via APROVAÇÃO (pedido da role
 *   operador_inventario que o administrador aprova na tela de tarefas).
 *   Os dois caminhos DEVEM executar exatamente o mesmo código.
 * - Impacto se alterado/removido: os caminhos divergem — aprovação
 *   executando diferente da rota direta é bug grave de consistência.
 *
 * Erros de regra de negócio são lançados como InventarioAcaoError com
 * status HTTP sugerido — a rota converte em resposta; a aprovação grava
 * em erro_execucao.
 */
export class InventarioAcaoError extends Error {
  constructor(message: string, public status: number = 409) {
    super(message);
    this.name = "InventarioAcaoError";
  }
}

/** Abre inventário: valida duplicidade, cria cabeçalho + snapshot de peça pronta. */
export async function executarAbrirInventario(params: {
  local_estoque_id: number;
  obs?: string | null;
  categoria?: string | null;
  userId: string;
}): Promise<{ id: number; created_at: string }> {
  const { local_estoque_id, obs, categoria, userId } = params;
  const cat = categoria?.trim() || null;

  // Verificar se já existe inventário aberto para esse local
  const [existente] = await sql`
    SELECT id FROM alissonerp.inventarios_comercial
    WHERE local_estoque_id = ${local_estoque_id} AND status IN ('aberto', 'em_contagem')
  `;
  if (existente) {
    throw new InventarioAcaoError(
      `Já existe inventário aberto para esse local (ID: ${existente.id})`, 409,
    );
  }

  // Criar inventário + snapshot numa transação única (ou tudo, ou nada)
  const inv = await sql.begin(async (tx: any) => {
    const [novo] = await tx`
      INSERT INTO alissonerp.inventarios_comercial
        (local_estoque_id, observacao, categoria, created_by)
      VALUES
        (${local_estoque_id}, ${obs ?? null}, ${cat}, ${userId})
      RETURNING id, created_at
    `;

    /**
     * Snapshot: produtos com saldo > 0 no local (filtrado pela categoria se
     * informada). INVENTÁRIO É DE PEÇA PRONTA — mesmo filtro de leitura
     * (condPecaPronta) usado nas telas; o alias ii expõe o produto.
     */
    await tx`
      INSERT INTO alissonerp.itens_inventario_comercial (inventario_id, produto_id, quantidade_sistema)
      SELECT
        ${novo.id},
        ii.produto_id,
        ii.saldo_fisico::INTEGER
      FROM (
        SELECT v.produto_id, v.saldo_fisico, p.categoria
        FROM alissonerp.vw_saldo_estoque_comercial_v2 v
        JOIN alissonerp.produtos_compat p ON p.id_produto = v.produto_id
        WHERE v.local_estoque_id = ${local_estoque_id}
          AND v.saldo_fisico > 0
      ) ii
      WHERE ${condPecaPronta(tx)}
        ${cat ? tx`AND (ii.categoria = ${cat} OR ii.categoria LIKE ${cat + " -> %"})` : tx``}
    `;

    await logAudit(tx, {
      tabela: "inventarios_comercial",
      operacao: "INSERT",
      registro_id: novo.id,
      usuario_id: userId,
      dados_depois: { local_estoque_id, categoria: cat, obs: obs ?? null },
    });

    return novo;
  });

  return { id: inv.id, created_at: inv.created_at };
}

/** Estatísticas usadas pela trava de conclusão (itens fora de peça pronta não contam). */
export async function statsConclusaoInventario(invId: number) {
  const [stats] = await sql`
    SELECT
      COUNT(*) FILTER (WHERE diferenca != 0 AND quantidade_contada IS NOT NULL) AS divergentes,
      COUNT(*) FILTER (WHERE quantidade_contada IS NULL)                        AS nao_contados,
      COUNT(*) FILTER (WHERE pendencia_obs IS NOT NULL
                         AND pendencia_resolvida IS NULL)                       AS pendencias_abertas
    FROM alissonerp.itens_inventario_comercial ii
    WHERE ii.inventario_id = ${invId}
      AND ${condPecaPronta(sql)}
  `;
  return {
    divergentes: Number(stats.divergentes),
    nao_contados: Number(stats.nao_contados),
    pendencias_abertas: Number(stats.pendencias_abertas),
  };
}

/** Conclui inventário: congela a contagem (auditoria pura — ZERO ajuste de estoque). */
export async function executarConcluirInventario(params: {
  invId: number;
  forcar: boolean;
  userId: string;
}): Promise<{ id: number; divergentes: number; nao_contados: number; pendencias_abertas: number; ajustes_gerados: 0 }> {
  const { invId, forcar, userId } = params;

  const [inv] = await sql`
    SELECT id, status, local_estoque_id
    FROM alissonerp.inventarios_comercial WHERE id = ${invId}
  `;
  if (!inv) throw new InventarioAcaoError("Inventário não encontrado", 404);
  if (inv.status === "concluido") throw new InventarioAcaoError("Inventário já concluído", 409);
  if (inv.status === "cancelado") throw new InventarioAcaoError("Inventário cancelado não pode ser concluído", 409);

  const stats = await statsConclusaoInventario(invId);

  // Trava de segurança: só conclui "sujo" com confirmação explícita (forcar)
  if (!forcar && (stats.nao_contados > 0 || stats.pendencias_abertas > 0)) {
    const err = new InventarioAcaoError(
      "Inventário tem itens sem contagem ou pendências sem resposta", 409,
    ) as InventarioAcaoError & { requer_confirmacao?: boolean; stats?: typeof stats };
    err.requer_confirmacao = true;
    err.stats = stats;
    throw err;
  }

  await sql.begin(async (tx: any) => {
    await tx`
      UPDATE alissonerp.inventarios_comercial
      SET status = 'concluido', data_conclusao = now(), concluido_por = ${userId}::uuid
      WHERE id = ${invId}
    `;
    await logAudit(tx, {
      tabela: "inventarios_comercial",
      operacao: "UPDATE",
      registro_id: invId,
      usuario_id: userId,
      dados_antes: { status: inv.status },
      dados_depois: {
        status: "concluido",
        forcado: forcar,
        ...stats,
      },
    });
  });

  // Resposta honesta: inventário NÃO gera ajuste automático de estoque
  return { id: invId, ...stats, ajustes_gerados: 0 };
}

/** Cancela inventário: motivo obrigatório, autor gravado. */
export async function executarCancelarInventario(params: {
  invId: number;
  motivo: string;
  userId: string;
}): Promise<{ id: number; status: "cancelado" }> {
  const { invId, motivo, userId } = params;

  const [inv] = await sql`
    SELECT id, status FROM alissonerp.inventarios_comercial WHERE id = ${invId}
  `;
  if (!inv) throw new InventarioAcaoError("Inventário não encontrado", 404);
  if (inv.status === "concluido") {
    throw new InventarioAcaoError("Não é possível cancelar inventário já concluído", 409);
  }
  if (inv.status === "cancelado") {
    throw new InventarioAcaoError("Inventário já cancelado", 409);
  }

  await sql.begin(async (tx: any) => {
    await tx`
      UPDATE alissonerp.inventarios_comercial
      SET status = 'cancelado',
          data_conclusao = now(),
          cancelado_por = ${userId}::uuid,
          motivo_cancelamento = ${motivo}
      WHERE id = ${invId}
    `;
    await logAudit(tx, {
      tabela: "inventarios_comercial",
      operacao: "UPDATE",
      registro_id: invId,
      usuario_id: userId,
      dados_antes: { status: inv.status },
      dados_depois: { status: "cancelado", motivo_cancelamento: motivo },
    });
  });

  return { id: invId, status: "cancelado" };
}
