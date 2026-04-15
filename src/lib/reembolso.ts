// ═══════════════════════════════════════════════════════════════════════════
// Reembolso — MP Automatico ou Contas a Pagar Manual
//
// - estornarMP(paymentId, valor, userId, devolucaoId):
//     chama https://api.mercadopago.com/v1/payments/{id}/refunds
//     Body opcional { amount } (omitido = total). Em sucesso marca concluido.
//     Em falha retorna erro para o caller decidir fallback.
//
// - criarContaPagarReembolso: INSERT em alissonerp.contas_pagar com
//     categoria='reembolso' e linka reembolsos.conta_pagar_id
// ═══════════════════════════════════════════════════════════════════════════

import sql from "@/lib/db";
import { getAccessToken } from "@/lib/mercado-pago";

export interface ReembolsoResult {
  reembolso_id: number;
  status: "pendente" | "processando" | "concluido" | "falhou";
  mp_refund_id?: string;
  erro?: string;
}

export interface CriarContaPagarResult {
  conta_pagar_id: number;
  reembolso_id: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// estornarMP — chama MP Refund API (best-effort)
// ═══════════════════════════════════════════════════════════════════════════
export async function estornarMP(
  paymentId: string,
  valor: number,
  userId: string,
  devolucaoId: number,
): Promise<ReembolsoResult> {
  // Registro inicial
  const [reembolso] = await sql`
    INSERT INTO alissonerp.reembolsos (
      devolucao_id, metodo, valor, mp_payment_id, status, criado_por
    ) VALUES (
      ${devolucaoId}, 'mp_automatico', ${valor}, ${paymentId}, 'processando', ${userId}::uuid
    )
    RETURNING id
  `;
  const reembolsoId: number = reembolso.id;

  try {
    const token = await getAccessToken();

    const body: { amount?: number } = {};
    // Se valor > 0 enviamos explicitamente; se omitido seria reembolso total
    if (valor && valor > 0) body.amount = Number(valor.toFixed(2));

    const res = await fetch(
      `https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}/refunds`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-Idempotency-Key": `dev-${devolucaoId}-${Date.now()}`,
        },
        body: JSON.stringify(body),
      },
    );

    const raw = await res.text();
    let data: any = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }

    if (!res.ok) {
      const erro = data?.message ?? data?.error ?? `HTTP ${res.status}`;
      await sql`
        UPDATE alissonerp.reembolsos
        SET status = 'falhou',
            mp_erro = ${String(erro)},
            mp_status = ${String(data?.status ?? res.status)},
            processado_em = now()
        WHERE id = ${reembolsoId}
      `;
      return { reembolso_id: reembolsoId, status: "falhou", erro: String(erro) };
    }

    const mpRefundId = data?.id ? String(data.id) : null;
    const mpStatus = data?.status ? String(data.status) : "approved";

    await sql`
      UPDATE alissonerp.reembolsos
      SET status = 'concluido',
          mp_refund_id = ${mpRefundId},
          mp_status = ${mpStatus},
          processado_em = now()
      WHERE id = ${reembolsoId}
    `;

    return {
      reembolso_id: reembolsoId,
      status: "concluido",
      mp_refund_id: mpRefundId ?? undefined,
    };
  } catch (err) {
    const erro = err instanceof Error ? err.message : String(err);
    await sql`
      UPDATE alissonerp.reembolsos
      SET status = 'falhou', mp_erro = ${erro}, processado_em = now()
      WHERE id = ${reembolsoId}
    `;
    return { reembolso_id: reembolsoId, status: "falhou", erro };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// criarContaPagarReembolso — fallback manual / escolha do usuario
// ═══════════════════════════════════════════════════════════════════════════
export async function criarContaPagarReembolso(
  devolucaoId: number,
  clienteId: number | null,
  valor: number,
  descricao: string,
  userId: string,
): Promise<CriarContaPagarResult> {
  return sql.begin(async (tx: any) => {
    const [conta] = await tx`
      INSERT INTO alissonerp.contas_pagar (
        descricao, fornecedor_id, valor, data_vencimento,
        situacao, categoria, obs, created_by
      ) VALUES (
        ${descricao},
        ${clienteId},
        ${valor},
        CURRENT_DATE,
        'pendente',
        'reembolso',
        ${"Reembolso referente a devolucao #" + devolucaoId},
        ${userId}::uuid
      )
      RETURNING id
    `;

    const [reembolso] = await tx`
      INSERT INTO alissonerp.reembolsos (
        devolucao_id, metodo, valor, conta_pagar_id, status, criado_por, processado_em
      ) VALUES (
        ${devolucaoId}, 'contas_pagar_manual', ${valor}, ${conta.id},
        'pendente', ${userId}::uuid, now()
      )
      RETURNING id
    `;

    return {
      conta_pagar_id: conta.id as number,
      reembolso_id: reembolso.id as number,
    };
  }) as Promise<CriarContaPagarResult>;
}
