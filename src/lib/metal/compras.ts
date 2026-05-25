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
import type { CompraInput, CompraRecord } from "./types";

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
  if (input.valor_pago_grama < minLimit) {
    throw new Error(
      `Valor abaixo do mínimo permitido. Mínimo: R$ ${minLimit.toFixed(2)}/g ` +
      `(${config.compra_metal_min_pct}% da cotação).`,
    );
  }
  if (input.valor_pago_grama > maxLimit) {
    throw new Error(
      `Valor acima do máximo permitido. Máximo: R$ ${maxLimit.toFixed(2)}/g ` +
      `(${config.compra_metal_max_pct}% da cotação).`,
    );
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
        'pendente_pagamento', ${input.observacao ?? null}, ${userId}::uuid
      )
      RETURNING *
    `;

    return row as CompraRecord;
  }) as Promise<CompraRecord>;
}

/**
 * Gera pagamento no Mercado Pago para a compra.
 *
 * REGRA DE NEGÓCIO: A EMPRESA paga o fornecedor via MP.
 * O ID do pagamento fica amarrado à compra (mp_preference_id ou mp_payment_id).
 * Só pode gerar pagamento se status = 'pendente_pagamento'.
 */
export async function gerarPagamentoCompra(
  compraId: number,
  metodo: "pix" | "cartao" | "pix_pdv",
  userId: string,
  extra?: { payer_email?: string; payer_nome?: string },
) {
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

  let mpId: string;

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
    mpId = pix.payment_id;
  } else if (metodo === "cartao") {
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
    mpId = pref.id;
  } else {
    // pix_pdv — InStore QR
    const { createInStorePixQr } = await import("@/lib/mercado-pago");
    const qr = await createInStorePixQr({
      vendaId: compraId,
      pagamentoId: 0,
      numeroVenda: compra.numero,
      valor: parseFloat(compra.valor_total),
      notificationUrl,
    });
    mpId = qr.in_store_order_id;
  }

  // Atualiza compra com o ID do MP
  if (metodo === "cartao") {
    await sql`
      UPDATE alissonerp.compras_metal
      SET mp_preference_id = ${mpId}, mp_payment_status = 'pending'
      WHERE id = ${compraId}
    `;
  } else {
    await sql`
      UPDATE alissonerp.compras_metal
      SET mp_payment_id = ${mpId}, mp_payment_status = 'pending'
      WHERE id = ${compraId}
    `;
  }

  return { mpId };
}

/**
 * Verifica pagamento no Mercado Pago.
 *
 * REGRA DE NEGÓCIO: Compara valor pago vs valor esperado.
 * Se diferente, mantém pendente. Se OK, confirma e metal entra no cofre.
 */
export async function verificarPagamentoCompra(compraId: number) {
  const [compra] = await sql`
    SELECT * FROM alissonerp.compras_metal WHERE id = ${compraId}
  `;
  if (!compra) throw new Error("Compra não encontrada");

  // Busca pagamento pelo ID
  const mpPaymentId = compra.mp_payment_id;
  if (!mpPaymentId) {
    throw new Error("Nenhum pagamento MP vinculado a esta compra");
  }

  const { fetchPayment } = await import("@/lib/mercado-pago");
  const payment = await fetchPayment(mpPaymentId);

  const status = payment?.status as string;
  const valorPago = parseFloat(String(payment?.transaction_amount ?? "0"));
  const valorEsperado = parseFloat(compra.valor_total);
  const dataPagamento = payment?.date_approved as string | undefined;

  await sql`
    UPDATE alissonerp.compras_metal
    SET
      mp_payment_status = ${status},
      mp_valor_pago = ${valorPago},
      mp_data_pagamento = ${dataPagamento ?? null}::timestamptz,
      mp_diferenca_valor = ${parseFloat(Math.abs(valorPago - valorEsperado).toFixed(2))}
    WHERE id = ${compraId}
  `;

  // REGRA DE NEGÓCIO: Só confirma se approved E valor bate
  if (status === "approved") {
    if (Math.abs(valorPago - valorEsperado) < 0.01) {
      await sql`
        UPDATE alissonerp.compras_metal
        SET status = 'confirmado', cofre_registrado = true
        WHERE id = ${compraId}
      `;
      return { status: "confirmado" as const };
    } else {
      return { status: "pendente" as const, motivo: "Valor pago difere do esperado" };
    }
  }

  if (status === "rejected") {
    return { status: "rejeitado" as const };
  }

  return { status: "pendente" as const };
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
  if (filtros.data_fim) {
    conditions.push(`cm.created_at <= $${idx++}::timestamptz`);
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
    data: data as CompraRecord[],
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
