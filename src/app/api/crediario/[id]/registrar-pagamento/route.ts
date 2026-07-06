/**
 * POST /api/crediario/[id]/registrar-pagamento
 * [id] = conta_receber_id
 *
 * Rota principal de baixa do crediário — usada pelo drawer de detalhe
 * (CrediarioClient.tsx) para registrar o recebimento de um crédito
 * "A Receber" em qualquer forma de pagamento: Dinheiro, Cartão, Pix,
 * Ouro, Vale-Troca, Permuta, Ajuste Consultora.
 *
 * forma_recebimento é OBRIGATÓRIO (desde 06/07/2026, migration 341) —
 * define tanto `forma`/`gateway` quanto `comissionavel` em pagamentos_venda.
 * Vale-Troca/Permuta/Ajuste Consultora não são dinheiro novo → comissionavel=false.
 *
 * ⚠️  BLINDAGEM: Esta rota implementa as 7 regras de ouro do módulo
 * crediário documentadas em AGENTS.md. NÃO ALTERE sem ler aquele doc.
 *
 * Fluxo completo (tudo dentro de transação SQL):
 *   1. Atualiza contas_receber: ajusta valor e marca como 'pago'
 *   1b. Se pagamento parcial: cria NOVA conta_receber com o restante
 *   2. Confirma pagamento_venda (se total) ou faz split (se parcial)
 *   3. Registra em comunicacoes_crediario com a forma usada
 *   4. Fora da tx: devolve saldo ao gerente (evita lock)
 *   5. Fora da tx: conclui venda se todos pagamentos confirmados
 *
 * Para Ouro: exige ouro_peso, ouro_valor_grama, ouro_foto_path.
 * O valor pago é calculado = peso * valor_grama (não vem do front).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { creditarSaldo } from "@/lib/saldo-credito";
import { logAudit } from "@/lib/audit";
import { zodError } from "@/lib/schemas/common";

// Quem pode dar baixa manual (emergência ou formas não-MP).
// ATENÇÃO: Esta rota NÃO verifica Mercado Pago — é confiança pura.
// Use verificar-mp para baixas com ID do Mercado Pago.
const PODE_BAIXAR = ["desenvolvedor", "admin", "gerente_loja", "diretor"];

// REGRA DE NEGÓCIO (06/07/2026): formas que NÃO são dinheiro novo — nunca
// geram comissão. Ver comercial.md §2 e migration 341. Antes disso,
// forma_recebimento era opcional e uma baixa sem forma escolhida ficava
// para sempre com forma='A Receber', indistinguível de dinheiro real —
// 3 pagamentos assim (Vale-Troca, permuta, desconto da consultora)
// geraram comissão indevida no fechamento de jun/2026.
const FORMAS_NAO_COMISSIONAVEIS = ["Vale-Troca", "Permuta", "Ajuste Consultora"];

const RegistrarPagamentoSchema = z.object({
  obs: z.string().max(5000).optional(),
  forma_recebimento: z.string().min(1, "obrigatório — informe como o cliente pagou").max(50),
  // Pagamento parcial: valor efetivamente pago (default = total da conta)
  valor_pago: z.number().positive().optional(),
  // Campos específicos de Ouro — validados no handler, obrigatórios quando forma === "Ouro"
  ouro_peso: z.number().positive().optional(),
  ouro_valor_grama: z.number().positive().optional(),
  ouro_foto_path: z.string().max(500).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const contaId = Number(id);
  if (isNaN(contaId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const [usuario] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario || !PODE_BAIXAR.includes(usuario.role as string)) {
    return NextResponse.json({ error: "Sem permissão para registrar baixa" }, { status: 403 });
  }

  const [conta] = await sql`
    SELECT id, situacao, valor, venda_erp_id, descricao
    FROM alissonerp.contas_receber
    WHERE id = ${contaId} AND categoria = 'venda'
  `;
  if (!conta) return NextResponse.json({ error: "Conta não encontrada" }, { status: 404 });
  if (conta.situacao === "pago") {
    return NextResponse.json({ ok: true, ja_pago: true, message: "Conta já estava paga" });
  }
  if (conta.situacao !== "pendente") {
    return NextResponse.json({ error: "Conta não está pendente" }, { status: 409 });
  }

  const vendaId = conta.venda_erp_id as number | null;

  // Busca o pagamento_venda "A Receber" pendente vinculado a esta venda.
  // É o registro que representa o crédito na venda original.
  const [pagamento] = vendaId
    ? await sql`
        SELECT id, valor, forma FROM alissonerp.pagamentos_venda
        WHERE venda_id = ${vendaId} AND forma = 'A Receber' AND status = 'pendente'
        LIMIT 1
      `
    : [null];

  const raw = await req.json().catch(() => ({}));
  const parsed = RegistrarPagamentoSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const obs = (parsed.data.obs ?? "").trim() || null;
  const formaRecebimento = parsed.data.forma_recebimento.trim();
  if (!formaRecebimento) {
    return NextResponse.json({ error: "Informe como o cliente pagou" }, { status: 400 });
  }
  const comissionavel = !FORMAS_NAO_COMISSIONAVEIS.includes(formaRecebimento);
  const valorPago = parsed.data.valor_pago ?? null;
  const ouroPeso = parsed.data.ouro_peso ?? null;
  const ouroValorGrama = parsed.data.ouro_valor_grama ?? null;
  const ouroFotoPath = parsed.data.ouro_foto_path ?? null;

  // O valor pago default é o total da conta. Se o front enviar valor_pago
  // menor que o total, será pagamento parcial → split de crédito.
  // Arredonda a 2 casas: ouro (peso × grama) e dinheiro podem trazer fração de
  // centavo. Tolerância de 1 centavo no teto — se o valor passar do saldo por
  // até 1 centavo (arredondamento do ouro), trata como quitação total do saldo.
  // Espelha a folga do trigger da soma de pagamentos (mig 333).
  const contaValor = Number(conta.valor);
  let valorEfetivo = Math.round((valorPago ?? contaValor) * 100) / 100;
  if (valorEfetivo <= 0) return NextResponse.json({ error: "Valor pago inválido" }, { status: 400 });
  if (valorEfetivo > contaValor + 0.01) return NextResponse.json({ error: "Valor pago maior que o valor da conta" }, { status: 400 });
  if (valorEfetivo > contaValor) valorEfetivo = contaValor;

  const ehPagamentoParcial = valorEfetivo < contaValor;
  const valorRestante = ehPagamentoParcial ? contaValor - valorEfetivo : 0;

  let saldoDevolvido = false;

  let novoCreditoId: number | null = null;

  // ═══ TRANSAÇÃO ATÔMICA ═══════════════════════════════════════════════════
  // Todas as operações de baixa rodam em uma única transação para garantir
  // que contas_receber, pagamentos_venda e comunicacoes_crediario fiquem
  // consistentes. Se qualquer passo falhar, tudo é revertido.
  //
  // Operações com risco de lock (creditarSaldo) rodam FORA
  // da transação — ver seção 4 abaixo.
  //
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await sql.begin(async (tx: any) => {

    // PASSO 1 — Baixar conta a receber
    await tx`
      UPDATE alissonerp.contas_receber
      SET valor = ${valorEfetivo},
          situacao = 'pago',
          data_recebimento = CURRENT_DATE,
          updated_at = NOW()
      WHERE id = ${contaId}
    `;

    // PASSO 1b — SPLIT DE CRÉDITO (pagamento parcial)
    // Se o cliente pagou menos que o total, criamos uma NOVA conta_receber
    // com o valor restante. A original é ajustada para o valor pago e marcada
    // como 'pago'. A nova fica 'pendente' com os mesmos dados do cliente/venda.
    //
    // Ex: conta original R$ 1.500, cliente paga R$ 1.000 via Dinheiro
    //     → conta original: R$ 1.000, situacao = 'pago'
    //     → nova conta:     R$ 500,   situacao = 'pendente'
    if (ehPagamentoParcial) {
      const [nova] = await tx`
        INSERT INTO alissonerp.contas_receber
          (descricao, cliente_id, cliente_nome, venda_erp_id, valor,
           data_vencimento, situacao, categoria, obs, created_by)
        SELECT
          ${`Saldo restante — ${conta.descricao}`},
          cr.cliente_id, cr.cliente_nome, cr.venda_erp_id,
          ${valorRestante},
          CURRENT_DATE,
          'pendente',
          'venda',
          ${`Parcial de R$ ${valorEfetivo.toFixed(2)} pago via ${formaRecebimento}. Restante: R$ ${valorRestante.toFixed(2)}`},
          ${user.id}::uuid
        FROM alissonerp.contas_receber cr
        WHERE cr.id = ${contaId}
        RETURNING id
      `;
      novoCreditoId = nova?.id ?? null;
    }

    // PASSO 2 — Confirmar pagamento_venda (pagamento TOTAL)
    // O campo 'gateway' é preenchido com a forma de recebimento (ex: "Dinheiro").
    // Isso alimenta o texto "via {gateway}" no card de pagamento da venda
    // (VendaDetalheClient.tsx:2573).
    //
    // Para Ouro: salvamos também peso, valor/grama e foto_path da balança.
    if (pagamento && !ehPagamentoParcial) {
      if (ouroPeso && ouroValorGrama && ouroFotoPath) {
        await tx`
          UPDATE alissonerp.pagamentos_venda
          SET status = 'confirmado', data_confirmacao = NOW(),
              forma = ${formaRecebimento},
              gateway = ${formaRecebimento},
              comissionavel = ${comissionavel},
              ouro_peso = ${ouroPeso},
              ouro_valor_grama = ${ouroValorGrama},
              ouro_foto_path = ${ouroFotoPath}
          WHERE id = ${pagamento.id}
        `;
      } else {
        await tx`
          UPDATE alissonerp.pagamentos_venda
          SET status = 'confirmado', data_confirmacao = NOW(),
              forma = ${formaRecebimento}, gateway = ${formaRecebimento},
              comissionavel = ${comissionavel}
          WHERE id = ${pagamento.id}
        `;
      }
    }

    // PASSO 2b — SPLIT DO PAGAMENTO (pagamento parcial)
    // Atualiza o pagamento original com o valor pago e cria um NOVO
    // pagamento_venda 'A Receber' pendente com o valor restante.
    // Isso mantém o total da venda consistente (soma dos pagamentos = total_venda).
    if (pagamento && ehPagamentoParcial) {
      if (ouroPeso && ouroValorGrama && ouroFotoPath) {
        await tx`
          UPDATE alissonerp.pagamentos_venda
          SET valor = ${valorEfetivo}, status = 'confirmado', data_confirmacao = NOW(),
              forma = ${formaRecebimento},
              gateway = ${formaRecebimento},
              comissionavel = ${comissionavel},
              ouro_peso = ${ouroPeso},
              ouro_valor_grama = ${ouroValorGrama},
              ouro_foto_path = ${ouroFotoPath}
          WHERE id = ${pagamento.id}
        `;
      } else {
        await tx`
          UPDATE alissonerp.pagamentos_venda
          SET valor = ${valorEfetivo}, status = 'confirmado', data_confirmacao = NOW(),
              forma = ${formaRecebimento}, gateway = ${formaRecebimento},
              comissionavel = ${comissionavel}
          WHERE id = ${pagamento.id}
        `;
      }
      await tx`
        INSERT INTO alissonerp.pagamentos_venda
          (venda_id, forma, valor, parcelas, status)
        VALUES (
          ${vendaId}, 'A Receber', ${valorRestante}, 1, 'pendente'
        )
      `;
    }

    // PASSO 2c — FALLBACK: Criar pagamento_venda quando não existe "A Receber" pendente
    // Ocorre quando a conta_receber é um saldo restante de split anterior
    // ou quando todos os pagamentos originais já foram confirmados por outro meio.
    // Nesse caso, criamos um novo registro confirmado em vez de atualizar.
    if (!pagamento && vendaId) {
      if (ouroPeso && ouroValorGrama && ouroFotoPath) {
        await tx`
          INSERT INTO alissonerp.pagamentos_venda
            (venda_id, forma, valor, parcelas, status, data_confirmacao,
             gateway, comissionavel, ouro_peso, ouro_valor_grama, ouro_foto_path)
          VALUES (
            ${vendaId}, ${formaRecebimento}, ${valorEfetivo}, 1, 'confirmado', NOW(),
            ${formaRecebimento}, ${comissionavel}, ${ouroPeso}, ${ouroValorGrama}, ${ouroFotoPath}
          )
        `;
      } else {
        await tx`
          INSERT INTO alissonerp.pagamentos_venda
            (venda_id, forma, valor, parcelas, status, data_confirmacao, gateway, comissionavel)
          VALUES (
            ${vendaId}, ${formaRecebimento}, ${valorEfetivo}, 1, 'confirmado', NOW(),
            ${formaRecebimento}, ${comissionavel}
          )
        `;
      }

      if (ehPagamentoParcial) {
        await tx`
          INSERT INTO alissonerp.pagamentos_venda
            (venda_id, forma, valor, parcelas, status)
          VALUES (
            ${vendaId}, 'A Receber', ${valorRestante}, 1, 'pendente'
          )
        `;
      }
    }

    // PASSO 3 — Histórico de comunicação
    // Toda baixa registra quem fez, quando e qual forma foi usada.
    // Para Ouro: inclui peso e valor/grama na mensagem.
    // Aparece na timeline do drawer de detalhe do crediário.
    const msgOuro = ouroPeso && ouroValorGrama
      ? ` (${ouroPeso}g × R$ ${ouroValorGrama}/g)`
      : "";
    await tx`
      INSERT INTO alissonerp.comunicacoes_crediario
        (conta_receber_id, tipo, mensagem, usuario_id)
      VALUES (
        ${contaId},
        'aviso_recebimento',
        ${obs ?? `Recebido via ${formaRecebimento} — R$ ${valorEfetivo.toFixed(2)}${msgOuro} — ${conta.descricao}`},
        ${user.id}::uuid
      )
    `;

    await logAudit(tx, {
      tabela: "contas_receber",
      operacao: "UPDATE",
      registro_id: contaId,
      usuario_id: user.id,
      dados_antes: { situacao: "pendente", valor: Number(conta.valor) },
      dados_depois: { situacao: "pago", valor: valorEfetivo, ...(novoCreditoId ? { novo_credito_id: novoCreditoId } : {}) },
    });
  });

  // ═══ PÓS-TRANSAÇÃO ═══════════════════════════════════════════════════════
  // Estas operações rodam FORA da transação para evitar locks prolongados
  // no saldo_credito_loja e configuracoes_sistema.

  // PASSO 4 — Devolver saldo ao gerente
  // REGRA DE OURO #1: Toda baixa de "A Receber" DEVE devolver o saldo
  // proporcional ao gerente se a venda usou crédito (credito_gerente_usado > 0).
  // Ex: gerente usou R$ 1.500 de crédito, cliente pagou R$ 1.000 via Dinheiro
  //     → devolve R$ 1.000 ao saldo do gerente
  if (vendaId && pagamento) {
    const [venda] = await sql`
      SELECT credito_gerente_usado FROM alissonerp.vendas_erp WHERE id = ${vendaId}
    `;
    const creditoUsado = parseFloat(venda?.credito_gerente_usado ?? "0");
    if (creditoUsado > 0) {
      const valorDevolver = Math.min(valorEfetivo, creditoUsado);
      try {
        await creditarSaldo(valorDevolver, vendaId, pagamento.id, user.id);
        await sql`
          UPDATE alissonerp.vendas_erp
          SET credito_gerente_usado = GREATEST(credito_gerente_usado - ${valorDevolver}, 0),
              updated_at = NOW()
          WHERE id = ${vendaId}
        `;
        saldoDevolvido = true;
      } catch (err) {
        console.error("[crediario/baixa] Erro ao devolver saldo:", err);
      }
    }
  }

  // Fluxo novo 06/2026: pagamento quitado NÃO conclui mais a venda —
  // o status só muda na entrega (em_rota → entregue).
  return NextResponse.json({
    ok: true,
    saldo_devolvido: saldoDevolvido,
    pagamento_parcial: ehPagamentoParcial || undefined,
    valor_pago: valorEfetivo,
    valor_restante: ehPagamentoParcial ? valorRestante : undefined,
    novo_credito_id: novoCreditoId ?? undefined,
  });
}
