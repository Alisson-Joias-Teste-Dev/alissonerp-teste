import sql from "@/lib/db";

// ─── Tipos ───────────────────────────────────────────────────────────────────
export interface MovimentoSaldo {
  id: number;
  tipo: "debito" | "credito" | "ajuste";
  valor: number;
  saldo_antes: number;
  saldo_depois: number;
  venda_id: number | null;
  pagamento_id: number | null;
  descricao: string | null;
  usuario_id: string;
  created_at: string;
}

interface SaldoResult {
  saldo_antes: number;
  saldo_depois: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Lê o saldo atual do crédito da gerente de loja. */
export async function getSaldoAtual(): Promise<number> {
  const [row] = await sql`
    SELECT valor FROM alissonerp.configuracoes_sistema
    WHERE chave = 'saldo_gerente_atual'
  `;
  return row ? parseFloat(row.valor) : 0;
}

/** Lê o limite configurado. */
export async function getSaldoLimite(): Promise<number> {
  const [row] = await sql`
    SELECT valor FROM alissonerp.configuracoes_sistema
    WHERE chave = 'saldo_gerente_limite'
  `;
  return row ? parseFloat(row.valor) : 50000;
}

/**
 * Debita valor do saldo de crédito da loja (usado ao aprovar venda com A Receber).
 * Usa SELECT FOR UPDATE dentro de transação para evitar race condition.
 * @throws se saldo insuficiente
 */
export async function debitarSaldo(
  valor: number,
  vendaId: number,
  userId: string,
): Promise<SaldoResult> {
  return sql.begin(async (tx: any) => {
    // Lock pessimista na linha de config
    const [row] = await tx`
      SELECT valor FROM alissonerp.configuracoes_sistema
      WHERE chave = 'saldo_gerente_atual'
      FOR UPDATE
    `;
    const saldoAntes = row ? parseFloat(row.valor) : 0;

    if (valor > saldoAntes) {
      throw new Error(
        `Saldo insuficiente: R$ ${saldoAntes.toFixed(2)} disponível, R$ ${valor.toFixed(2)} necessário`,
      );
    }

    const saldoDepois = Math.round((saldoAntes - valor) * 100) / 100;

    await tx`
      UPDATE alissonerp.configuracoes_sistema
      SET valor = ${String(saldoDepois)}, updated_at = now()
      WHERE chave = 'saldo_gerente_atual'
    `;

    await tx`
      INSERT INTO alissonerp.saldo_credito_loja
        (tipo, valor, saldo_antes, saldo_depois, venda_id, descricao, usuario_id)
      VALUES
        ('debito', ${valor}, ${saldoAntes}, ${saldoDepois}, ${vendaId},
         ${"Aprovação de crédito - venda"}, ${userId}::uuid)
    `;

    return { saldo_antes: saldoAntes, saldo_depois: saldoDepois };
  }) as Promise<SaldoResult>;
}

/**
 * Credita valor de volta ao saldo (quando cliente paga o A Receber).
 */
export async function creditarSaldo(
  valor: number,
  vendaId: number,
  pagamentoId: number | null,
  userId: string,
): Promise<SaldoResult> {
  return sql.begin(async (tx: any) => {
    const [row] = await tx`
      SELECT valor FROM alissonerp.configuracoes_sistema
      WHERE chave = 'saldo_gerente_atual'
      FOR UPDATE
    `;
    const saldoAntes = row ? parseFloat(row.valor) : 0;
    const saldoDepois = Math.round((saldoAntes + valor) * 100) / 100;

    await tx`
      UPDATE alissonerp.configuracoes_sistema
      SET valor = ${String(saldoDepois)}, updated_at = now()
      WHERE chave = 'saldo_gerente_atual'
    `;

    await tx`
      INSERT INTO alissonerp.saldo_credito_loja
        (tipo, valor, saldo_antes, saldo_depois, venda_id, pagamento_id, descricao, usuario_id)
      VALUES
        ('credito', ${valor}, ${saldoAntes}, ${saldoDepois}, ${vendaId}, ${pagamentoId},
         ${"Retorno de crédito - pagamento recebido"}, ${userId}::uuid)
    `;

    return { saldo_antes: saldoAntes, saldo_depois: saldoDepois };
  }) as Promise<SaldoResult>;
}

/**
 * Ajuste manual do saldo (admin/diretor apenas).
 */
export async function ajustarSaldo(
  valor: number,
  descricao: string,
  userId: string,
): Promise<SaldoResult> {
  return sql.begin(async (tx: any) => {
    const [row] = await tx`
      SELECT valor FROM alissonerp.configuracoes_sistema
      WHERE chave = 'saldo_gerente_atual'
      FOR UPDATE
    `;
    const saldoAntes = row ? parseFloat(row.valor) : 0;
    const saldoDepois = Math.round((saldoAntes + valor) * 100) / 100;

    if (saldoDepois < 0) {
      throw new Error(`Ajuste resultaria em saldo negativo: R$ ${saldoDepois.toFixed(2)}`);
    }

    await tx`
      UPDATE alissonerp.configuracoes_sistema
      SET valor = ${String(saldoDepois)}, updated_at = now()
      WHERE chave = 'saldo_gerente_atual'
    `;

    await tx`
      INSERT INTO alissonerp.saldo_credito_loja
        (tipo, valor, saldo_antes, saldo_depois, descricao, usuario_id)
      VALUES
        ('ajuste', ${Math.abs(valor)}, ${saldoAntes}, ${saldoDepois},
         ${descricao}, ${userId}::uuid)
    `;

    return { saldo_antes: saldoAntes, saldo_depois: saldoDepois };
  }) as Promise<SaldoResult>;
}
