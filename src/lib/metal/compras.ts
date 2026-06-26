// ═══════════════════════════════════════════════════════════════════════════
// TASK-004: Funções de negócio — Compra de Metal
//
// REGRA DE NEGÓCIO (Não alterar):
//   - A EMPRESA compra metal de fornecedores/pessoas (não de clientes)
//   - Pagamento via Mercado Pago — o ID do pagamento fica amarrado à compra
//   - A cotação do ouro é CONGELADA no momento da compra
//   - Compra nasce com status 'pendente_pagamento'
//   - Só entra no cofre_ouro após confirmação do pagamento MP
//   - Comissão do funcionário é calculada sobre a economia (spread)
//
// IMPACTO SE REMOVIDO: Empresa não consegue registrar compras de metal
// com rastreabilidade, perderia o vínculo com pagamento MP e o histórico
// de entrada de metal no cofre_ouro.
// ═══════════════════════════════════════════════════════════════════════════

import sql from "@/lib/db";
import { validarPesoBalanca } from "@/lib/ia-validar-peso";
import { uploadFile } from "@/lib/storage";
import { getModuloConfig, getCotacaoOuro } from "./config";
import type { CompraInput, CompraRecord, CompraAprovacaoRecord } from "./types";

/**
 * Registra uma nova compra de metal.
 *
 * Fluxo:
 * 1. Lê cotação do ouro (congelada)
 * 2. Lê configurações (min/max/comm %)
 * 3. Valida valor_pago_grama dentro dos limites
 * 4. Calcula: spread, valorTotal, economia, comissao
 * 5. Se foto: valida peso com IA
 * 6. Gera número CM-AAAA-NNNN
 * 7. Upload da foto
 * 8. INSERT no banco com status pendente_pagamento
 */
export async function criarCompraMetal(
  input: CompraInput,
  userId: string,
): Promise<CompraRecord> {
  // REGRA DE NEGÓCIO: Cotação congelada no momento da compra
  const cotacao = await getCotacaoOuro();
  if (cotacao <= 0) throw new Error("Cotação do ouro não configurada");

  const config = await getModuloConfig();

  // REGRA DE NEGÓCIO: Limites baseados nos percentuais configurados
  const minLimit = parseFloat((cotacao * (config.compra_metal_min_pct / 100)).toFixed(2));
  const maxLimit = parseFloat((cotacao * (config.compra_metal_max_pct / 100)).toFixed(2));

  // REGRA DE NEGÓCIO: Valor pago deve estar dentro da faixa permitida
  // Se acima_teto = true, permite ultrapassar maxLimit (vai para aprovação)
  if (input.valor_pago_grama < minLimit) {
    throw new Error(
      `Valor abaixo do mínimo permitido. Mínimo: R$ ${minLimit.toFixed(2)}/g ` +
      `(${config.compra_metal_min_pct}% da cotação).`,
    );
  }
  if (input.valor_pago_grama > maxLimit && !input.acima_teto) {
    throw new Error(
      `Valor acima do máximo permitido. Máximo: R$ ${maxLimit.toFixed(2)}/g ` +
      `(${config.compra_metal_max_pct}% da cotação).`,
    );
  }

  // REGRA DE NEGÓCIO: Se valor acima do teto, compra nasce com
  // status 'pendente_aprovacao' e aguarda aprovação do aprovador configurado
  const acimaTeto = input.acima_teto && input.valor_pago_grama > maxLimit;
  const statusInicial = acimaTeto ? "pendente_aprovacao" : "pendente_pagamento";
  const aprovadorMetalId = (config.metal_aprovador_id ?? "").trim();

  // REGRA DE NEGÓCIO: compra acima do teto só pode existir se houver
  // aprovador configurado, para não deixar solicitação sem responsável.
  if (acimaTeto && !aprovadorMetalId) {
    throw new Error("Aprovador de compra de metal acima do teto não configurado.");
  }

  // REGRA DE NEGÓCIO: Spread = diferença entre teto e valor pago.
  // Se valor pago = teto, spread = 0 e comissão = 0.
  const spread = parseFloat((maxLimit - input.valor_pago_grama).toFixed(2));
  const valorTotal = parseFloat((input.peso_gramas * input.valor_pago_grama).toFixed(2));
  const economiaTotal = parseFloat((spread * input.peso_gramas).toFixed(2));
  const comissaoValor = parseFloat((economiaTotal * config.compra_metal_comm_pct / 100).toFixed(2));

  // Validação IA da foto
  let pesoIa: number | null = null;
  let iaConfianca: string | null = null;
  let iaMatch: boolean | null = null;
  let fotoPath: string | null = null;

  if (input.foto_base64) {
    // REGRA DE NEGÓCIO: Tolerância de 0.005g para metal.
    // Se ia_match = false, o sistema AVISA mas NÃO bloqueia.
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
    // Gera número: CM-AAAA-NNNN
    const [seqRow] = await tx`SELECT nextval('alissonerp.compras_metal_seq') AS seq`;
    const seq = Number(seqRow.seq);
    const ano = new Date().getFullYear();
    const numero = `CM-${ano}-${String(seq).padStart(4, "0")}`;

    // Upload da foto no bucket pagamento-fotos
    if (input.foto_base64) {
      const ext = (input.foto_media_type ?? "image/jpeg").split("/")[1] || "jpg";
      const upload = await uploadFile(
        "pagamento-fotos",
        `metal/compras/${numero}.${ext}`,
        input.foto_base64,
        input.foto_media_type ?? "image/jpeg",
      );
      if (typeof upload === "object" && "url" in upload) {
        fotoPath = upload.url as string;
      }
    }

    const [row] = await tx`
      INSERT INTO alissonerp.compras_metal (
        numero, fornecedor_id, peso_gramas, cotacao_ouro,
        valor_pago_grama, min_limit, max_limit, spread_grama,
        valor_total, economia_total, comissao_pct, comissao_valor,
        foto_path, foto_peso_ia, ia_confianca, ia_match,
        status, observacao, created_by
      ) VALUES (
        ${numero}, ${input.fornecedor_id}, ${input.peso_gramas}, ${cotacao},
        ${input.valor_pago_grama}, ${minLimit}, ${maxLimit}, ${spread},
        ${valorTotal}, ${economiaTotal}, ${config.compra_metal_comm_pct}, ${comissaoValor},
        ${fotoPath}, ${pesoIa}, ${iaConfianca}, ${iaMatch},
        ${statusInicial}, ${input.observacao ?? null}, ${userId}::uuid
      )
      RETURNING *
    `;

    // Se acima do teto, cria registro de aprovação pendente
    if (acimaTeto) {
      await tx`
        INSERT INTO alissonerp.compras_metal_aprovacoes (
          compra_id, solicitante_id, aprovador_id, valor_pago_grama,
          max_limit, cotacao_ouro, status
        ) VALUES (
          ${(row as any).id}, ${userId}::uuid, ${aprovadorMetalId}::uuid, ${input.valor_pago_grama},
          ${maxLimit}, ${cotacao}, 'pendente'
        )
      `;
    }

    return row as CompraRecord;
  }) as Promise<CompraRecord>;
}

/**
 * Gera pagamento no Mercado Pago para a compra.
 *
 * REGRA DE NEGÓCIO: A EMPRESA paga o fornecedor via MP.
 * O ID do pagamento fica amarrado à compra (mp_preference_id ou mp_payment_id).
 * Só pode gerar pagamento se status = 'pendente_pagamento'.
 * O retorno inclui dados para exibição no frontend (QR code, link, etc).
 */
export async function gerarPagamentoCompra(
  compraId: number,
  metodo: "pix" | "cartao" | "pix_pdv",
  userId: string,
  extra?: { payer_email?: string; payer_nome?: string },
): Promise<{
  tipo: "pix" | "cartao" | "pix_pdv";
  mpId: string;
  qr_code?: string;
  qr_code_base64?: string;
  qr_data?: string;
  init_point?: string;
}> {
  const [compra] = await sql`
    SELECT * FROM alissonerp.compras_metal WHERE id = ${compraId}
  `;
  if (!compra) throw new Error("Compra não encontrada");
  if (compra.status !== "pendente_pagamento") {
    throw new Error("Compra já foi paga ou cancelada");
  }

  // Busca cliente/fornecedor para os dados do MP
  const [contato] = await sql`
    SELECT nome, cpf_cnpj, email FROM public.contatos WHERE id_contato = ${compra.fornecedor_id}
  `;

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://erp.alissonjoias.com.br";
  const notificationUrl = `${baseUrl}/api/metal/compras/${compraId}/verificar`;

  if (metodo === "pix") {
    const { createPixPayment } = await import("@/lib/mercado-pago");
    const pix = await createPixPayment({
      vendaId: compraId,
      pagamentoId: 0,
      numeroVenda: compra.numero,
      valor: parseFloat(compra.valor_total),
      descricao: `Compra de metal ${compra.numero}`,
      payer: {
        email: extra?.payer_email || contato?.email || "compra@alissonjoias.com.br",
        first_name: extra?.payer_nome || contato?.nome || "Fornecedor",
        cpf: contato?.cpf_cnpj || undefined,
      },
      notificationUrl,
    });

    // REGRA DE NEGÓCIO: Atualiza compra com o payment_id
    await sql`
      UPDATE alissonerp.compras_metal
      SET mp_payment_id = ${pix.payment_id}, mp_payment_status = 'pending'
      WHERE id = ${compraId}
    `;

    return {
      tipo: "pix",
      mpId: pix.payment_id,
      qr_code: pix.qr_code,
      qr_code_base64: pix.qr_code_base64,
    };
  }

  if (metodo === "cartao") {
    const { createPreference } = await import("@/lib/mercado-pago");
    const pref = await createPreference({
      vendaId: compraId,
      pagamentoId: 0,
      numeroVenda: compra.numero,
      items: [{ title: `Compra de Metal ${compra.numero}`, quantity: 1, unit_price: parseFloat(compra.valor_total) }],
      payer: extra?.payer_nome ? { name: extra.payer_nome, email: extra?.payer_email } : undefined,
      notificationUrl,
      backUrls: { success: `${baseUrl}/metal/historico`, pending: `${baseUrl}/metal`, failure: `${baseUrl}/metal` },
    });

    // REGRA DE NEGÓCIO: Atualiza compra com a preference_id
    await sql.unsafe(
      `UPDATE alissonerp.compras_metal SET mp_preference_id = $1, mp_payment_status = 'pending' WHERE id = $2`,
      [pref.id ?? "", compraId],
    );

    return {
      tipo: "cartao",
      mpId: pref.id ?? "",
      init_point: pref.init_point,
    };
  }

  // pix_pdv — InStore QR
  const { createInStorePixQr } = await import("@/lib/mercado-pago");
  const qr = await createInStorePixQr({
    vendaId: compraId,
    pagamentoId: 0,
    numeroVenda: compra.numero,
    valor: parseFloat(compra.valor_total),
    notificationUrl,
  });

  // REGRA DE NEGÓCIO: Atualiza compra com o in_store_order_id
  await sql`
    UPDATE alissonerp.compras_metal
    SET mp_payment_id = ${qr.in_store_order_id}, mp_payment_status = 'pending'
    WHERE id = ${compraId}
  `;

  return {
    tipo: "pix_pdv",
    mpId: qr.in_store_order_id,
    qr_data: qr.qr_data,
  };
}

/**
 * Confirma pagamento com comprovante e registra na tabela de pagamentos.
 *
 * REGRA DE NEGÓCIO: A empresa (Alisson Joias) pagou o fornecedor.
 * O usuário só precisa anexar o comprovante. O valor usado é o valor_total
 * da compra. O pagamento é registrado como definitivo (confirmado_manual)
 * e a compra é confirmada automaticamente.
 *
 * IMPACTO SE ALTERADO: Quebra o fluxo de confirmação de pagamento de compra
 * de metal. A empresa não consegue vincular comprovantes aos pagamentos.
 */
export async function verificarPagamentoCompra(
  compraId: number,
  comprovantePath: string,
) {
  const [compra] = await sql`
    SELECT * FROM alissonerp.compras_metal WHERE id = ${compraId}
  `;
  if (!compra) throw new Error("Compra não encontrada");

  // REGRA DE NEGÓCIO: Pagamento cobre o valor total da compra
  const valorTotal = parseFloat(compra.valor_total);
  const pagamentoId = `manual-${compraId}-${Date.now()}`;

  // Insere registro de pagamento com status confirmado_manual (definitivo)
  await sql`
    INSERT INTO alissonerp.compras_metal_pagamentos
      (compra_id, mp_payment_id, valor_pago, valor_esperado, diferenca, status, data_pagamento, comprovante_path)
    VALUES
      (${compraId}, ${pagamentoId}, ${valorTotal}, ${valorTotal}, 0, 'confirmado_manual', now(), ${comprovantePath})
  `;

  // Confirma a compra (pagamento cobre o valor total)
  await sql`
    UPDATE alissonerp.compras_metal
    SET
      mp_payment_id = ${pagamentoId},
      mp_payment_status = 'confirmado_manual',
      mp_valor_pago = ${valorTotal},
      mp_data_pagamento = now(),
      mp_diferenca_valor = 0,
      status = 'confirmado',
      cofre_registrado = true
    WHERE id = ${compraId}
  `;

  return {
    status: "confirmado" as const,
    total_pago: valorTotal,
    pagamentos: await listarPagamentosCompra(compraId),
  };
}

/** Lista todos os pagamentos registrados de uma compra */
async function listarPagamentosCompra(compraId: number) {
  return sql`
    SELECT * FROM alissonerp.compras_metal_pagamentos
    WHERE compra_id = ${compraId}
    ORDER BY created_at ASC
  `;
}

/**
 * Cancela uma compra de metal.
 *
 * REGRA DE NEGÓCIO: Só cancela compra pendente_pagamento.
 * Se já confirmada (metal já no cofre), não pode cancelar.
 */
export async function cancelarCompraMetal(compraId: number) {
  const [compra] = await sql`
    SELECT status FROM alissonerp.compras_metal WHERE id = ${compraId}
  `;
  if (!compra) throw new Error("Compra não encontrada");
  if (compra.status !== "pendente_pagamento") {
    throw new Error("Só é possível cancelar compras pendentes de pagamento");
  }

  await sql`
    UPDATE alissonerp.compras_metal
    SET status = 'cancelado', mp_payment_status = 'cancelled'
    WHERE id = ${compraId}
  `;
}

/**
 * Lista compras com filtros.
 */
export async function listarCompras(filtros: {
  data_inicio?: string;
  data_fim?: string;
  status?: string;
  fornecedor_id?: number;
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
    conditions.push(`cm.created_at >= $${idx++}::timestamptz`);
    params.push(filtros.data_inicio);
  }
  // REGRA DE NEGÓCIO: data_fim virá como "YYYY-MM-DD" (00:00 UTC). Ao fazer
  // `<= data_fim` perderia registros do mesmo dia após meia-noite.
  // Por isso usa-se `< data_fim + 1 day`, garantindo que tudo ATÉ 23:59:59 do
  // dia selecionado seja incluído.
  if (filtros.data_fim) {
    conditions.push(`cm.created_at < ($${idx++}::date + interval '1 day')`);
    params.push(filtros.data_fim);
  }
  if (filtros.status) {
    conditions.push(`cm.status = $${idx++}`);
    params.push(filtros.status);
  }
  if (filtros.fornecedor_id) {
    conditions.push(`cm.fornecedor_id = $${idx++}`);
    params.push(filtros.fornecedor_id);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const [countRow] = await sql.unsafe(`
    SELECT COUNT(*)::integer AS total FROM alissonerp.compras_metal cm ${where}
  `, params);

  const data = await sql.unsafe(`
    SELECT
      cm.*,
      c.nome AS fornecedor_nome,
      c.cpf_cnpj AS fornecedor_cpf
    FROM alissonerp.compras_metal cm
    LEFT JOIN public.contatos c ON c.id_contato = cm.fornecedor_id
    ${where}
    ORDER BY cm.created_at DESC
    LIMIT $${idx++} OFFSET $${idx++}
  `, [...params, limit, offset]);

  return {
    data: data as unknown as CompraRecord[],
    page,
    limit,
    total: countRow?.total ?? 0,
  };
}

/**
 * Busca uma compra pelo ID.
 */
export async function getCompraPorId(id: number): Promise<CompraRecord | null> {
  const [row] = await sql`
    SELECT
      cm.*,
      c.nome AS fornecedor_nome,
      c.cpf_cnpj AS fornecedor_cpf
    FROM alissonerp.compras_metal cm
    LEFT JOIN public.contatos c ON c.id_contato = cm.fornecedor_id
    WHERE cm.id = ${id}
  `;
  return (row as CompraRecord) ?? null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Aprovação de compras acima do teto
//
// REGRA DE NEGÓCIO: Quando valor_pago_grama > max_limit, a compra fica
// travada em 'pendente_aprovacao'. O aprovador configurado pode aprovar
// (status vira 'pendente_pagamento' e compra segue fluxo normal) ou rejeitar
// (status vira 'cancelado').
// ═══════════════════════════════════════════════════════════════════════════

/** Lista aprovações pendentes de compras de metal */
export async function listarAprovacoes(filtros: {
  status?: string;
  page?: number;
  limit?: number;
}): Promise<{ data: (CompraAprovacaoRecord & { compra_numero?: string; fornecedor_nome?: string; solicitante_nome?: string })[], total: number }> {
  const page = filtros.page ?? 1;
  const limit = filtros.limit ?? 20;
  const offset = (page - 1) * limit;

  let where = "WHERE 1=1";
  const params: any[] = [];
  let idx = 1;

  if (filtros.status) {
    where += ` AND a.status = $${idx++}`;
    params.push(filtros.status);
  }

  const [countRow] = await sql`
    SELECT COUNT(*)::int as total
    FROM alissonerp.compras_metal_aprovacoes a
    ${sql.unsafe(where)}
  `;

  const data = await sql`
    SELECT
      a.*,
      cm.numero AS compra_numero,
      c.nome AS fornecedor_nome,
      COALESCE(uc.raw_user_meta_data->>'nome', u.email) AS solicitante_nome
    FROM alissonerp.compras_metal_aprovacoes a
    JOIN alissonerp.compras_metal cm ON cm.id = a.compra_id
    LEFT JOIN public.contatos c ON c.id_contato = cm.fornecedor_id
    LEFT JOIN auth.users u ON u.id = a.solicitante_id
    LEFT JOIN public.usuarios_complemento uc ON uc.id = a.solicitante_id::text
    ${sql.unsafe(where)}
    ORDER BY a.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  return {
    data: data as any[],
    total: (countRow as any)?.total ?? 0,
  };
}

/** Aprova uma compra de metal acima do teto */
export async function aprovarCompra(aprovacaoId: number, aprovadorId: string): Promise<void> {
  const [aprovacao] = await sql`
    SELECT * FROM alissonerp.compras_metal_aprovacoes WHERE id = ${aprovacaoId}
  `;
  if (!aprovacao) throw new Error("Aprovação não encontrada");
  if (aprovacao.status !== "pendente") throw new Error("Aprovação já foi processada");

  await sql.begin(async (tx: any) => {
    await tx`
      UPDATE alissonerp.compras_metal_aprovacoes
      SET status = 'aprovado', aprovador_id = ${aprovadorId}::uuid, updated_at = now()
      WHERE id = ${aprovacaoId}
    `;
    await tx`
      UPDATE alissonerp.compras_metal
      SET status = 'pendente_pagamento', updated_at = now()
      WHERE id = ${aprovacao.compra_id}
    `;
  });
}

/** Rejeita uma compra de metal acima do teto */
export async function rejeitarCompra(aprovacaoId: number, aprovadorId: string, motivo?: string): Promise<void> {
  const [aprovacao] = await sql`
    SELECT * FROM alissonerp.compras_metal_aprovacoes WHERE id = ${aprovacaoId}
  `;
  if (!aprovacao) throw new Error("Aprovação não encontrada");
  if (aprovacao.status !== "pendente") throw new Error("Aprovação já foi processada");

  await sql.begin(async (tx: any) => {
    await tx`
      UPDATE alissonerp.compras_metal_aprovacoes
      SET status = 'rejeitado', aprovador_id = ${aprovadorId}::uuid, motivo = ${motivo ?? null}, updated_at = now()
      WHERE id = ${aprovacaoId}
    `;
    await tx`
      UPDATE alissonerp.compras_metal
      SET status = 'cancelado', updated_at = now()
      WHERE id = ${aprovacao.compra_id}
    `;
  });
}
