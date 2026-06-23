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

/** Lê o limite configurado. */
export async function getSaldoLimite(): Promise<number> {
  const [row] = await sql`
    SELECT valor FROM alissonerp.configuracoes_sistema
    WHERE chave = 'saldo_gerente_limite'
  `;
  return row ? parseFloat(row.valor) : 50000;
}

/**
 * Saldo de crédito DISPONÍVEL (regra v2.78.0 — Jonathan 23/06):
 *   disponivel = limite − TODO o A Receber pendente (GERAL, não só o que a gerente
 *   aprovou).
 *
 * O QUE MUDA: antes o "saldo" era o contador `saldo_gerente_atual`, que só era
 *   debitado/creditado nas vendas aprovadas PELA GERENTE — ignorava o A Receber
 *   aprovado pelo CEO ou criado por outros caminhos, então mostrava saldo de sobra
 *   enquanto a loja já carregava muito mais a receber (drift). Agora é DERIVADO ao
 *   vivo do pendente real (mesma base `vw_crediario` do card "Pendente") — sem
 *   contador, sem drift. Pode ficar NEGATIVO quando o total a receber passa do
 *   limite: aí a gerente está "sem saldo" e a aprovação vai pro CEO (regra mantida).
 *
 * O limite (R$ 50.000) continua o mesmo — muda só a forma de medir o usado.
 */
export async function getSaldoDisponivel(): Promise<{
  limite: number;
  pendente: number;
  disponivel: number;
}> {
  const limite = await getSaldoLimite();
  const [row] = await sql`
    SELECT COALESCE(SUM(valor), 0) AS total
    FROM alissonerp.vw_crediario
    WHERE situacao = 'pendente'
  `;
  const pendente = row ? parseFloat(row.total) : 0;
  const disponivel = Math.round((limite - pendente) * 100) / 100;
  return { limite, pendente, disponivel };
}

/**
 * Credita valor de volta ao saldo (quando cliente paga o A Receber).
 *
 * REGRA DE NEGÓCIO (Blindagem 2026-06): aceita transação externa opcional
 * (`txClient`) para participar da MESMA transação do chamador — ex.: a
 * confirmação de pagamento credita o saldo e baixa contas_receber de forma
 * atômica (tudo ou nada). Sem txClient, abre transação própria (compatível
 * com os chamadores antigos).
 *
 * NOTA (v2.78.0): o saldo passou a ser DERIVADO ao vivo (ver getSaldoDisponivel),
 * então `saldo_gerente_atual` não é mais lido para decisão/exibição. Esta função
 * segue mantendo o histórico em `saldo_credito_loja` e o contador legado; é escrita
 * inofensiva (ninguém lê o contador) até a faxina final removê-la dos pontos de baixa.
 */
export async function creditarSaldo(
  valor: number,
  vendaId: number,
  pagamentoId: number | null,
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  txClient?: any,
): Promise<SaldoResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const executar = async (tx: any): Promise<SaldoResult> => {
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
  };

  if (txClient) return executar(txClient);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return sql.begin(async (tx: any) => executar(tx)) as Promise<SaldoResult>;
}
