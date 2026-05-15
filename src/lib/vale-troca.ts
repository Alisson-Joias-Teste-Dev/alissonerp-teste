// ═══════════════════════════════════════════════════════════════════════════
// Vale-Troca — geracao, validacao e aplicacao
//
// Regras de negocio:
//   - Numero VT-00001 sequencial via alissonerp.vale_troca_seq (uso unico)
//   - Ao aplicar em venda: vale original SEMPRE vira "utilizado" (100%)
//     - Se valor do vale > valor a pagar → gera NOVO vale com o troco,
//       linkado ao original via vale_origem_id
//     - Se valor do vale < valor a pagar → retorna precisa_complemento
//   - Cada vale pode ser aplicado uma unica vez
// ═══════════════════════════════════════════════════════════════════════════

import sql from "@/lib/db";

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface ValeTroca {
  id: number;
  numero: string;
  devolucao_id: number | null;
  cliente_id: number | null;
  valor_original: number;
  valor_disponivel: number;
  status: "ativo" | "utilizado" | "cancelado";
  venda_utilizado_id: number | null;
  utilizado_em: string | null;
  vale_origem_id: number | null;
  created_at: string;
  created_by: string | null;
}

export interface ValidacaoValeTroca {
  ok: boolean;
  id?: number;
  numero?: string;
  valor_disponivel?: number;
  status?: ValeTroca["status"];
  cliente_id?: number | null;
  erro?: string;
}

export interface AplicacaoValeTroca {
  vale_aplicado_id: number;
  valor_aplicado: number;
  precisa_complemento?: number;
  novo_vale?: { id: number; numero: string; valor_original: number };
}

// ═══════════════════════════════════════════════════════════════════════════
// gerarValeTroca — INSERT usando sequence dedicada
// ═══════════════════════════════════════════════════════════════════════════
export async function gerarValeTroca(
  devolucaoId: number | null,
  clienteId: number | null,
  valor: number,
  userId: string,
  valeOrigemId?: number | null,
  txClient?: any,
): Promise<ValeTroca> {
  const runner = txClient ?? sql;

  if (valor <= 0) {
    throw new Error("Valor do vale-troca deve ser maior que zero");
  }

  const [row] = await runner`
    INSERT INTO alissonerp.vale_troca (
      numero, devolucao_id, cliente_id, valor_original, valor_disponivel,
      status, vale_origem_id, created_by
    ) VALUES (
      'VT-' || LPAD(nextval('alissonerp.vale_troca_seq')::text, 5, '0'),
      ${devolucaoId},
      ${clienteId},
      ${valor},
      ${valor},
      'ativo',
      ${valeOrigemId ?? null},
      ${userId}::uuid
    )
    RETURNING id, numero, devolucao_id, cliente_id, valor_original, valor_disponivel,
              status, venda_utilizado_id, utilizado_em, vale_origem_id, created_at, created_by
  `;

  return {
    ...row,
    valor_original: parseFloat(row.valor_original),
    valor_disponivel: parseFloat(row.valor_disponivel),
  } as ValeTroca;
}

// ═══════════════════════════════════════════════════════════════════════════
// validarValeTroca — verifica se numero existe, status e saldo
// ═══════════════════════════════════════════════════════════════════════════
export async function validarValeTroca(numero: string): Promise<ValidacaoValeTroca> {
  const [row] = await sql`
    SELECT id, numero, cliente_id, valor_disponivel, status
    FROM alissonerp.vale_troca
    WHERE numero = ${numero}
  `;

  if (!row) {
    return { ok: false, erro: "Vale-troca nao encontrado" };
  }
  if (row.status !== "ativo") {
    return {
      ok: false,
      id: row.id,
      numero: row.numero,
      status: row.status,
      erro: `Vale-troca ${row.status}`,
    };
  }

  return {
    ok: true,
    id: row.id,
    numero: row.numero,
    cliente_id: row.cliente_id,
    valor_disponivel: parseFloat(row.valor_disponivel),
    status: row.status,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// aplicarValeTroca — uso unico com troco em novo vale
// ═══════════════════════════════════════════════════════════════════════════
export async function aplicarValeTroca(
  numero: string,
  vendaId: number,
  valorUsar: number,
  userId: string,
): Promise<AplicacaoValeTroca> {
  if (valorUsar <= 0) {
    throw new Error("valor_usar deve ser maior que zero");
  }

  return sql.begin(async (tx: any) => {
    // Lock pessimista no vale
    const [vale] = await tx`
      SELECT id, numero, cliente_id, valor_original, valor_disponivel, status
      FROM alissonerp.vale_troca
      WHERE numero = ${numero}
      FOR UPDATE
    `;

    if (!vale) throw new Error(`Vale-troca ${numero} nao encontrado`);
    if (vale.status !== "ativo") throw new Error(`Vale-troca ${vale.status}`);

    const disponivel = parseFloat(vale.valor_disponivel);
    if (disponivel <= 0) throw new Error("Vale-troca sem saldo disponivel");

    let valorAplicado: number;
    let precisaComplemento: number | undefined;
    let novoVale: AplicacaoValeTroca["novo_vale"];

    if (valorUsar >= disponivel) {
      // Usuario quer/precisa usar mais do que o vale tem → aplica tudo e falta pagar resto
      valorAplicado = disponivel;
      if (valorUsar > disponivel) {
        precisaComplemento = Math.round((valorUsar - disponivel) * 100) / 100;
      }
    } else {
      // Vale cobre o que precisa e ainda sobra → aplica valorUsar e gera novo vale com troco
      valorAplicado = valorUsar;
      const troco = Math.round((disponivel - valorUsar) * 100) / 100;
      if (troco > 0) {
        const novo = await gerarValeTroca(
          null,
          vale.cliente_id,
          troco,
          userId,
          vale.id,
          tx,
        );
        novoVale = {
          id: novo.id,
          numero: novo.numero,
          valor_original: novo.valor_original,
        };
      }
    }

    // Marca vale original como utilizado (uso unico — sempre 100%)
    await tx`
      UPDATE alissonerp.vale_troca
      SET valor_disponivel   = 0,
          status             = 'utilizado',
          venda_utilizado_id = ${vendaId},
          utilizado_em       = now()
      WHERE id = ${vale.id}
    `;

    return {
      vale_aplicado_id: vale.id,
      valor_aplicado: valorAplicado,
      precisa_complemento: precisaComplemento,
      novo_vale: novoVale,
    };
  }) as Promise<AplicacaoValeTroca>;
}

// ═══════════════════════════════════════════════════════════════════════════
// cancelarValeTroca — marca como cancelado (so quando devolucao eh cancelada)
// ═══════════════════════════════════════════════════════════════════════════
export async function cancelarValeTroca(id: number, txClient?: any): Promise<void> {
  const runner = txClient ?? sql;
  await runner`
    UPDATE alissonerp.vale_troca
    SET status = 'cancelado', valor_disponivel = 0
    WHERE id = ${id} AND status = 'ativo'
  `;
}
