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
 * 4. Calcula crédito vs venda → aplicado + excedente
 * 5. Se foto: valida peso com IA
 * 6. Gera número RM-AAAA-NNNN
 * 7. Transação: INSERT recebimento, credita excedente, abate venda
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
  const excedeuTeto = input.valor_credito_grama > maxLimit;
  const valorTotal = parseFloat((input.peso_gramas * input.valor_credito_grama).toFixed(2));

  // Busca a venda vinculada
  const [venda] = await sql`
    SELECT id, total_venda, numero_venda, status
    FROM alissonerp.vendas_erp
    WHERE id = ${input.venda_id}
  `;
  if (!venda) throw new Error(`Venda #${input.venda_id} não encontrada`);

  // REGRA DE NEGÓCIO: Calcula crédito aplicado na venda e excedente
  const valorVenda = parseFloat(venda.total_venda);
  const creditoAplicado = Math.min(valorTotal, valorVenda);
  const creditoExcedente = parseFloat((valorTotal - creditoAplicado).toFixed(2));

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

    // REGRA DE NEGÓCIO: Se houver excedente, cria registro em creditos_cliente
    let creditoExcedenteId: number | null = null;

    if (creditoExcedente > 0) {
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
        'ativo', true, ${input.observacao ?? null}, ${userId}::uuid
      )
      RETURNING *
    `;

    // Atualiza venda com o crédito aplicado
    // REGRA DE NEGÓCIO: Abate o crédito do valor da venda.
    // Se venda for de ouro no crediário, não mexe no fluxo financeiro.
    const novoTotal = parseFloat((valorVenda - creditoAplicado).toFixed(2));
    await tx`
      UPDATE alissonerp.vendas_erp
      SET total_venda = ${novoTotal < 0 ? 0 : novoTotal}
      WHERE id = ${input.venda_id}
    `;

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
  if (filtros.data_fim) {
    conditions.push(`rm.created_at <= $${idx++}::timestamptz`);
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
    data: data as RecebimentoRecord[],
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
