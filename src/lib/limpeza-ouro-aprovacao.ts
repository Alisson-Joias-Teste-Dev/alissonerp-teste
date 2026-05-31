import sql from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { STATUS_BAIXA_OURO } from "@/lib/cofre-ouro-status";

type Decisao = "aprovar" | "reprovar";

interface Params {
  baixaId: number;
  decisao: Decisao;
  userId: string;
  motivo?: string;
  tarefaId?: number;
}

interface Resultado {
  ok: boolean;
  status: number;
  error?: string;
  baixa?: { id: number; status: string };
}

/**
 * REGRA DE NEGÓCIO: aprovação da quebra de limpeza é fonte única de verdade.
 *
 * O QUE: centraliza transição da baixa, rastreios, entrada em estoque 18k e
 * fechamento da tarefa/aprovação vinculada.
 * POR QUE: evita duplicar regra entre API de limpeza e API de tarefas.
 * IMPACTO SE REMOVIDO: fluxos podem divergir, gerando baixa aprovada sem
 * estoque ou tarefa encerrada sem refletir no kanban.
 */
export async function processarAprovacaoQuebraLimpeza(params: Params): Promise<Resultado> {
  const { baixaId, decisao, userId, motivo, tarefaId } = params;

  const [config] = await sql`
    SELECT valor FROM alissonerp.configuracoes_sistema WHERE chave = 'aprovador_limpeza'
  `;
  const aprovadorId = String(config?.valor ?? "").trim();
  if (!aprovadorId) return { ok: false, status: 409, error: "Aprovador de limpeza não configurado" };
  if (userId !== aprovadorId) return { ok: false, status: 403, error: "Apenas o aprovador configurado pode aprovar/reprovar limpeza" };

  const [baixa] = await sql`
    SELECT id, status, gramas, destino, obs FROM alissonerp.cofre_ouro_baixas WHERE id = ${baixaId}
  `;
  if (!baixa) return { ok: false, status: 404, error: "Baixa não encontrada" };

  const [usuario] = await sql`
    SELECT nome FROM alissonerp.usuarios WHERE id = ${userId}::uuid
  `;
  const nome = usuario?.nome ?? "Sistema";

  const [tarefa] = tarefaId
    ? await sql`SELECT id FROM alissonerp.tarefas WHERE id = ${tarefaId}`
    : await sql`
      SELECT id
      FROM alissonerp.tarefas
      WHERE tipo IN ('aprovacao_quebra_metal', 'protocolo_metal')
        AND tags @> ${sql.array([`limpeza_ouro:${Number(baixaId)}`])}::text[]
      ORDER BY id DESC
      LIMIT 1
    `;

  if (decisao === "reprovar") {
    if (!motivo?.trim()) return { ok: false, status: 400, error: "Motivo obrigatório ao reprovar" };
    if (baixa.status !== STATUS_BAIXA_OURO.AGUARDANDO_APROVACAO && baixa.status !== STATUS_BAIXA_OURO.EM_LIMPEZA) {
      return { ok: false, status: 400, error: "Baixa não está aguardando aprovação" };
    }

    const [atualizada] = await sql`
      UPDATE alissonerp.cofre_ouro_baixas
      SET status = ${STATUS_BAIXA_OURO.EM_LIMPEZA},
          obs = COALESCE(obs, '') || ' | REPROVADO por ' || ${nome} || ': ' || ${motivo ?? 'sem motivo'} || ' em ' || ${new Date().toISOString()},
          updated_at = now()
      WHERE id = ${baixaId}
      RETURNING id, status
    `;

    await sql`
      INSERT INTO alissonerp.cofre_ouro_rastreios
        (baixa_id, evento, gramas, origem_nome, destino_nome, observacao)
      VALUES
        (${baixaId}, 'limpeza_reprovada', ${Number(baixa.gramas)}, ${nome}, ${String(baixa.destino)}, ${motivo ?? 'Reprovado'})
    `;

    if (tarefa?.id) {
      await sql`
        UPDATE alissonerp.tarefas
        SET status = 'rejeitada', updated_at = now()
        WHERE id = ${Number(tarefa.id)}
      `;
      await sql`
        UPDATE alissonerp.aprovacoes_tarefa
        SET status = 'rejeitado', motivo = ${motivo ?? null}, respondido_em = now()
        WHERE tarefa_id = ${Number(tarefa.id)}
          AND status = 'pendente'
      `;
    }

    await logAudit(sql, {
      tabela: "cofre_ouro_baixas",
      operacao: "UPDATE",
      registro_id: baixaId,
      usuario_id: userId,
      dados_depois: { acao: "reprovar_limpeza", motivo, status_anterior: STATUS_BAIXA_OURO.AGUARDANDO_APROVACAO },
    });

    return { ok: true, status: 200, baixa: { id: Number((atualizada as any).id), status: String((atualizada as any).status) } };
  }

  // aprovar
  if (baixa.status === STATUS_BAIXA_OURO.CONCLUIDO) {
    return { ok: true, status: 200, baixa: { id: baixaId, status: STATUS_BAIXA_OURO.CONCLUIDO } };
  }
  if (baixa.status !== STATUS_BAIXA_OURO.AGUARDANDO_APROVACAO) {
    return { ok: false, status: 400, error: "Baixa não está aguardando aprovação" };
  }

  const [atualizada] = await sql`
    UPDATE alissonerp.cofre_ouro_baixas
    SET status = ${STATUS_BAIXA_OURO.CONCLUIDO},
        obs = COALESCE(obs, '') || ' | APROVADO por ' || ${nome} || ' em ' || ${new Date().toISOString()},
        updated_at = now()
    WHERE id = ${baixaId}
    RETURNING id, status
  `;

  const [insumo18k] = await sql`
    SELECT i.id
    FROM alissonerp.insumos i
    WHERE i.nome ILIKE '%ouro%18k%amarelo%'
    ORDER BY i.id
    LIMIT 1
  `;
  if (!insumo18k) return { ok: false, status: 500, error: "Insumo Ouro 18k Amarelo não encontrado" };

  const obsTxt = String((baixa as any).obs ?? "");
  const matchPesoLimpo = obsTxt.match(/Peso limpo:\s*([0-9]+(?:\.[0-9]+)?)g/i);
  const pesoLimpo = matchPesoLimpo ? Number(matchPesoLimpo[1]) : Number(baixa.gramas);
  const localDestino = String(baixa.destino) === "service" ? 3 : 1;

  await sql`
    INSERT INTO alissonerp.movimentacoes_estoque
      (insumo_id, deposito_id, entrada, marcador, obs, created_by, created_at, local_estoque_id)
    VALUES
      (
        ${Number((insumo18k as any).id)},
        1,
        ${pesoLimpo}::real,
        'PURIF_ENTRADA'::alissonerp.enum_marcador_estoque,
        ${'Aprovação limpeza baixa ouro #' + baixaId + ' — entrada 18k no destino ' + String(baixa.destino)},
        ${userId}::uuid,
        NOW(),
        ${localDestino}
      )
  `;

  await sql`
    INSERT INTO alissonerp.cofre_ouro_rastreios
      (baixa_id, evento, gramas, origem_nome, destino_nome, observacao)
    VALUES
      (${baixaId}, 'limpeza_aprovada', ${pesoLimpo}, ${nome}, ${String(baixa.destino)}, ${'Entrada no 18k do local ' + localDestino})
  `;

  if (tarefa?.id) {
    await sql`
      UPDATE alissonerp.tarefas
      SET status = 'aprovada', concluida_em = now(), updated_at = now()
      WHERE id = ${Number(tarefa.id)}
    `;
    await sql`
      UPDATE alissonerp.aprovacoes_tarefa
      SET status = 'aprovado', respondido_em = now()
      WHERE tarefa_id = ${Number(tarefa.id)}
        AND status = 'pendente'
    `;
  }

  await logAudit(sql, {
    tabela: "cofre_ouro_baixas",
    operacao: "UPDATE",
    registro_id: baixaId,
    usuario_id: userId,
    dados_depois: { acao: "aprovar_limpeza", destino: baixa.destino, gramas: Number(baixa.gramas) },
  });

  return { ok: true, status: 200, baixa: { id: Number((atualizada as any).id), status: String((atualizada as any).status) } };
}
