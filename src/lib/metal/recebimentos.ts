// ═══════════════════════════════════════════════════════════════════════════
// TASK-005: Funções de negócio — Recebimento de Metal
//
// REGRA DE NEGÓCIO (Não alterar):
//   - Recebimento é quando o CLIENTE entrega metal como parte do pagamento
//   - SEMPRE vinculado a uma venda (venda_id obrigatório)
//   - Se crédito > valor da venda, o excedente vira saldo do cliente em
//     creditos_cliente para uso futuro
//   - Metal de recebimento entra IMEDIATAMENTE no cofre_ouro
//     (não tem pendência de pagamento)
//
// IMPACTO SE REMOVIDO: Cliente não consegue entregar metal como parte de
// pagamento. Perde o vínculo entre recebimento de metal e venda, e o
// controle de crédito excedente do cliente.
// ═══════════════════════════════════════════════════════════════════════════

import sql from "@/lib/db";
import { validarPesoBalanca } from "@/lib/ia-validar-peso";
import { uploadFile } from "@/lib/storage";
import { getModuloConfig, getCotacaoOuro } from "./config";
import type { RecebimentoInput, RecebimentoRecord, CreditoClienteRecord } from "./types";

/**
 * Registra um novo recebimento de metal.
 *
 * Fluxo:
 * 1. Lê cotação do ouro (congelada)
 * 2. Lê configurações (min/max %)
 * 3. Consulta a venda para obter o valor total
 * 4. Se acima do teto: status = pendente_aprovacao, não aplica crédito, não entra cofre
 * 5. Se normal: calcula crédito vs venda, aplica, entra no cofre
 * 6. Se foto: valida peso com IA
 * 7. Gera número RM-AAAA-NNNN
 * 8. Transação: INSERT recebimento, (se normal) credita excedente, abate venda
 */
export async function criarRecebimentoMetal(
  input: RecebimentoInput,
  userId: string,
): Promise<RecebimentoRecord & { credito_cliente?: CreditoClienteRecord | null }> {
  const cotacao = await getCotacaoOuro();
  if (cotacao <= 0) throw new Error("Cotação do ouro não configurada");

  const config = await getModuloConfig();

  // REGRA DE NEGÓCIO: Limites de crédito baseados nos percentuais configurados
  const minLimit = parseFloat((cotacao * (config.receb_metal_min_pct / 100)).toFixed(2));
  const maxLimit = parseFloat((cotacao * (config.receb_metal_max_pct / 100)).toFixed(2));

  // REGRA DE NEGÓCIO: Se ultrapassar o teto, marca excedeu_teto = true (alerta)
  const excedeuTeto = input.acima_teto && input.valor_credito_grama > maxLimit;
  const valorTotal = parseFloat((input.peso_gramas * input.valor_credito_grama).toFixed(2));

  // REGRA DE NEGÓCIO: Se valor acima do teto, recebimento nasce com
  // status 'pendente_aprovacao' e precisa de aprovação antes de entrar no cofre.
  const aprovadorMetalId = (config.metal_aprovador_id ?? "").trim();
  if (excedeuTeto && !aprovadorMetalId) {
    throw new Error("Aprovador de metal acima do teto não configurado.");
  }

  // Busca a venda vinculada
  const [venda] = await sql`
    SELECT id, total_venda, numero_venda, status
    FROM alissonerp.vendas_erp
    WHERE id = ${input.venda_id}
  `;
  if (!venda) throw new Error(`Venda #${input.venda_id} não encontrada`);

  // REGRA DE NEGÓCIO: Calcula crédito aplicado na venda e excedente
  // Quando acima do teto, crédito NÃO é aplicado (aguarda aprovação)
  const valorVenda = parseFloat(venda.total_venda);
  const creditoAplicado = excedeuTeto ? 0 : Math.min(valorTotal, valorVenda);
  const creditoExcedente = excedeuTeto ? 0 : parseFloat((valorTotal - creditoAplicado).toFixed(2));

  // Validação IA da foto
  let pesoIa: number | null = null;
  let iaConfianca: string | null = null;
  let iaMatch: boolean | null = null;
  let fotoPath: string | null = null;

  if (input.foto_base64) {
    const iaResult = await validarPesoBalanca(
      input.foto_base64,
      input.foto_media_type ?? "image/jpeg",
      input.peso_gramas,
      "metal",
    );
    pesoIa = iaResult.peso_balanca;
    iaConfianca = iaResult.confianca;
    iaMatch = iaResult.match;
  }

  // Define status e cofre conforme acima do teto ou não
  const statusInicial = excedeuTeto ? "pendente_aprovacao" : "ativo";
  const cofreRegistrado = !excedeuTeto;

  // Transação atômica
  return sql.begin(async (tx: any) => {
    // Gera número: RM-AAAA-NNNN
    const [seqRow] = await tx`SELECT nextval('alissonerp.recebimentos_metal_seq') AS seq`;
    const seq = Number(seqRow.seq);
    const ano = new Date().getFullYear();
    const numero = `RM-${ano}-${String(seq).padStart(4, "0")}`;

    // Upload da foto
    if (input.foto_base64) {
      const ext = (input.foto_media_type ?? "image/jpeg").split("/")[1] || "jpg";
      const upload = await uploadFile(
        "pagamento-fotos",
        `metal/recebimentos/${numero}.${ext}`,
        input.foto_base64,
        input.foto_media_type ?? "image/jpeg",
      );
      if (typeof upload === "object" && "url" in upload) {
        fotoPath = upload.url as string;
      }
    }

    // REGRA DE NEGÓCIO: Crédito excedente só é criado se NÃO estiver
    // acima do teto. Se pendente_aprovacao, aguarda decisão.
    let creditoExcedenteId: number | null = null;

    if (creditoExcedente > 0 && !excedeuTeto) {
      const [cred] = await tx`
        INSERT INTO alissonerp.creditos_cliente
          (cliente_id, saldo_disponivel, venda_origem_id, status)
        VALUES
          (${input.cliente_id}, ${creditoExcedente}, ${input.venda_id}, 'ativo')
        RETURNING id
      `;
      creditoExcedenteId = cred.id;
    }

    // INSERT recebimento
    const [row] = await tx`
      INSERT INTO alissonerp.recebimentos_metal (
        numero, cliente_id, peso_gramas, cotacao_ouro,
        valor_credito_grama, min_limit, max_limit, excedeu_teto,
        valor_total, venda_id, credito_excedente, credito_excedente_id,
        foto_path, foto_peso_ia, ia_confianca, ia_match,
        status, cofre_registrado, observacao, created_by
      ) VALUES (
        ${numero}, ${input.cliente_id}, ${input.peso_gramas}, ${cotacao},
        ${input.valor_credito_grama}, ${minLimit}, ${maxLimit}, ${excedeuTeto},
        ${valorTotal}, ${input.venda_id}, ${creditoExcedente}, ${creditoExcedenteId},
        ${fotoPath}, ${pesoIa}, ${iaConfianca}, ${iaMatch},
        ${statusInicial}, ${cofreRegistrado}, ${input.observacao ?? null}, ${userId}::uuid
      )
      RETURNING *
    `;

    // REGRA DE NEGÓCIO: Só aplica crédito na venda se NÃO estiver acima do teto.
    // Se pendente_aprovacao, a aplicação ocorre após aprovação.
    if (!excedeuTeto) {
      const novoTotal = parseFloat((valorVenda - creditoAplicado).toFixed(2));
      await tx`
        UPDATE alissonerp.vendas_erp
        SET total_venda = ${novoTotal < 0 ? 0 : novoTotal}
        WHERE id = ${input.venda_id}
      `;
    }

    const result = row as RecebimentoRecord;

    // Retorna também o crédito criado (se houver)
    let creditoCliente: CreditoClienteRecord | null = null;
    if (creditoExcedenteId) {
      const [cred] = await tx`
        SELECT * FROM alissonerp.creditos_cliente WHERE id = ${creditoExcedenteId}
      `;
      creditoCliente = cred as CreditoClienteRecord;
    }

    return { ...result, credito_cliente: creditoCliente };
  }) as Promise<RecebimentoRecord & { credito_cliente?: CreditoClienteRecord | null }>;
}

/**
 * Cancela um recebimento de metal.
 *
 * REGRA DE NEGÓCIO: Cancelar recebimento reverte:
 * 1. Remove o crédito aplicado da venda
 * 2. Cancela crédito excedente (creditos_cliente.status = 'cancelado')
 * 3. Marca recebimento como cancelado
 * 4. NÃO remove do cofre_ouro (rastreio permanece como histórico)
 */
export async function cancelarRecebimentoMetal(id: number) {
  const [receb] = await sql`
    SELECT * FROM alissonerp.recebimentos_metal WHERE id = ${id}
  `;
  if (!receb) throw new Error("Recebimento não encontrado");
  if (receb.status !== "ativo") {
    throw new Error("Recebimento já foi cancelado");
  }

  return sql.begin(async (tx: any) => {
    // Reverte crédito aplicado na venda
    if (receb.venda_id) {
      const [venda] = await tx`
        SELECT total_venda FROM alissonerp.vendas_erp WHERE id = ${receb.venda_id}
      `;
      if (venda) {
        const valorAtual = parseFloat(venda.total_venda);
        const valorCredito = parseFloat(receb.valor_total) - parseFloat(receb.credito_excedente || "0");
        await tx`
          UPDATE alissonerp.vendas_erp
          SET total_venda = ${parseFloat((valorAtual + valorCredito).toFixed(2))}
          WHERE id = ${receb.venda_id}
        `;
      }
    }

    // Cancela crédito excedente
    if (receb.credito_excedente_id) {
      await tx`
        UPDATE alissonerp.creditos_cliente
        SET status = 'cancelado', saldo_disponivel = 0
        WHERE id = ${receb.credito_excedente_id}
      `;
    }

    // Cancela o recebimento
    await tx`
      UPDATE alissonerp.recebimentos_metal
      SET status = 'cancelado'
      WHERE id = ${id}
    `;
  });
}

/**
 * Lista recebimentos com filtros.
 */
export async function listarRecebimentos(filtros: {
  data_inicio?: string;
  data_fim?: string;
  status?: string;
  cliente_id?: number;
  page?: number;
  limit?: number;
}) {
  const page = filtros.page ?? 1;
  const limit = Math.min(filtros.limit ?? 20, 100);
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (filtros.data_inicio) {
    conditions.push(`rm.created_at >= $${idx++}::timestamptz`);
    params.push(filtros.data_inicio);
  }
  // REGRA DE NEGÓCIO: data_fim virá como "YYYY-MM-DD" (00:00 UTC). Ao fazer
  // `<= data_fim` perderia registros do mesmo dia após meia-noite.
  // Por isso usa-se `< data_fim + 1 day`, garantindo que tudo ATÉ 23:59:59 do
  // dia selecionado seja incluído.
  if (filtros.data_fim) {
    conditions.push(`rm.created_at < ($${idx++}::date + interval '1 day')`);
    params.push(filtros.data_fim);
  }
  if (filtros.status) {
    conditions.push(`rm.status = $${idx++}`);
    params.push(filtros.status);
  }
  if (filtros.cliente_id) {
    conditions.push(`rm.cliente_id = $${idx++}`);
    params.push(filtros.cliente_id);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const [countRow] = await sql.unsafe(`
    SELECT COUNT(*)::integer AS total FROM alissonerp.recebimentos_metal rm ${where}
  `, params);

  const data = await sql.unsafe(`
    SELECT
      rm.*,
      c.nome AS cliente_nome,
      cc.saldo_disponivel AS credito_saldo_restante
    FROM alissonerp.recebimentos_metal rm
    LEFT JOIN public.contatos c ON c.id_contato = rm.cliente_id
    LEFT JOIN alissonerp.creditos_cliente cc ON cc.id = rm.credito_excedente_id
    ${where}
    ORDER BY rm.created_at DESC
    LIMIT $${idx++} OFFSET $${idx++}
  `, [...params, limit, offset]);

  return {
    data: data as unknown as RecebimentoRecord[],
    page,
    limit,
    total: countRow?.total ?? 0,
  };
}

/**
 * Busca um recebimento pelo ID.
 */
export async function getRecebimentoPorId(id: number): Promise<RecebimentoRecord | null> {
  const [row] = await sql`
    SELECT
      rm.*,
      c.nome AS cliente_nome,
      cc.saldo_disponivel AS credito_saldo_restante
    FROM alissonerp.recebimentos_metal rm
    LEFT JOIN public.contatos c ON c.id_contato = rm.cliente_id
    LEFT JOIN alissonerp.creditos_cliente cc ON cc.id = rm.credito_excedente_id
    WHERE rm.id = ${id}
  `;
  return (row as RecebimentoRecord) ?? null;
}

/**
 * Aprova um recebimento de metal acima do teto.
 *
 * REGRA DE NEGÓCIO: Ao aprovar, o recebimento é ativado:
 * 1. Status → 'ativo'
 * 2. Cofre → registrado (entrada no estoque de metal)
 * 3. Crédito aplicado na venda
 * 4. Excedente vira saldo do cliente
 */
export async function aprovarRecebimentoMetal(recebimentoId: number, userId: string) {
  const [receb] = await sql`
    SELECT * FROM alissonerp.recebimentos_metal WHERE id = ${recebimentoId}
  `;
  if (!receb) throw new Error("Recebimento não encontrado");
  if (receb.status !== "pendente_aprovacao") {
    throw new Error("Recebimento não está aguardando aprovação");
  }

  return sql.begin(async (tx: any) => {
    const valorTotal = parseFloat(receb.valor_total);

    // Busca venda para aplicar crédito
    const [venda] = await tx`
      SELECT id, total_venda FROM alissonerp.vendas_erp
      WHERE id = ${receb.venda_id}
    `;
    const valorVenda = venda ? parseFloat(venda.total_venda) : 0;
    const creditoAplicado = Math.min(valorTotal, valorVenda);
    const creditoExcedente = parseFloat((valorTotal - creditoAplicado).toFixed(2));

    // Aplica crédito na venda
    if (venda && creditoAplicado > 0) {
      const novoTotal = parseFloat((valorVenda - creditoAplicado).toFixed(2));
      await tx`
        UPDATE alissonerp.vendas_erp
        SET total_venda = ${novoTotal < 0 ? 0 : novoTotal}
        WHERE id = ${receb.venda_id}
      `;
    }

    // Cria crédito excedente se houver
    let creditoExcedenteId: number | null = null;
    if (creditoExcedente > 0) {
      const [cred] = await tx`
        INSERT INTO alissonerp.creditos_cliente
          (cliente_id, saldo_disponivel, venda_origem_id, status)
        VALUES
          (${receb.cliente_id}, ${creditoExcedente}, ${receb.venda_id}, 'ativo')
        RETURNING id
      `;
      creditoExcedenteId = cred.id;
    }

    // Atualiza recebimento
    await tx`
      UPDATE alissonerp.recebimentos_metal
      SET
        status = 'ativo',
        cofre_registrado = true,
        credito_excedente = ${creditoExcedente},
        credito_excedente_id = ${creditoExcedenteId},
        updated_at = now()
      WHERE id = ${recebimentoId}
    `;

    return { ok: true, recebimento_id: recebimentoId };
  });
}

/**
 * Rejeita um recebimento de metal acima do teto.
 *
 * REGRA DE NEGÓCIO: Ao rejeitar, o recebimento é cancelado e não entra
 * no cofre. Não há impacto financeiro pois nenhum crédito foi aplicado.
 */
export async function rejeitarRecebimentoMetal(recebimentoId: number, userId: string, motivo?: string) {
  const [receb] = await sql`
    SELECT * FROM alissonerp.recebimentos_metal WHERE id = ${recebimentoId}
  `;
  if (!receb) throw new Error("Recebimento não encontrado");
  if (receb.status !== "pendente_aprovacao") {
    throw new Error("Recebimento não está aguardando aprovação");
  }

  await sql`
    UPDATE alissonerp.recebimentos_metal
    SET
      status = 'cancelado',
      cofre_registrado = false,
      observacao = CASE
        WHEN observacao IS NULL THEN ${motivo ?? "Rejeitado pelo aprovador"}
        ELSE observacao || E'\nRejeitado: ' || ${motivo ?? "Rejeitado pelo aprovador"}
      END,
      updated_at = now()
    WHERE id = ${recebimentoId}
  `;

  return { ok: true, recebimento_id: recebimentoId };
}
