/**
 * POST /api/crediario/[id]/registrar-pagamento
 * [id] = conta_receber_id
 *
 * Rota principal de baixa do crediário — usada pelo drawer de detalhe
 * (CrediarioClient.tsx) para registrar o recebimento de um crédito
 * "A Receber" em qualquer forma de pagamento: Dinheiro, Cartão, Pix,
 * Ouro, Vale-Troca.
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
import { validarValeTroca, aplicarValeTroca } from "@/lib/vale-troca";
import { confirmarCodigoVale } from "@/lib/vale-troca-codigo";
import { hasRole, ROLES_DEVOLUCAO } from "@/lib/roles";

// Quem pode dar baixa manual (emergência ou formas não-MP).
// ATENÇÃO: Esta rota NÃO verifica Mercado Pago — é confiança pura.
// Use verificar-mp para baixas com ID do Mercado Pago.
const PODE_BAIXAR = ["desenvolvedor", "admin", "gerente_loja", "diretor"];

const RegistrarPagamentoSchema = z.object({
  obs: z.string().max(5000).optional(),
  forma_recebimento: z.string().max(50).optional(),
  // Pagamento parcial: valor efetivamente pago (default = total da conta)
  valor_pago: z.number().positive().optional(),
  // Campos específicos de Ouro — validados no handler, obrigatórios quando forma === "Ouro"
  ouro_peso: z.number().positive().optional(),
  ouro_valor_grama: z.number().positive().optional(),
  ouro_foto_path: z.string().max(500).optional(),
  // Vale-Troca — mesma regra da venda: número do vale + token do dono (WhatsApp).
  // O valor NÃO vem daqui: é lido do vale e aplicado até o total da conta (sobra vira troco).
  vale_numero: z.string().max(100).optional(),
  vale_codigo: z.string().max(20).optional(),     // 2ª confirmação (código WhatsApp do dono)
  vale_excecao: z.boolean().optional(),           // liberação por aprovador quando o WhatsApp falha
}).partial();

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
  const formaRecebimento = parsed.data.forma_recebimento?.trim() || null;
  const valorPago = parsed.data.valor_pago ?? null;
  const ouroPeso = parsed.data.ouro_peso ?? null;
  const ouroValorGrama = parsed.data.ouro_valor_grama ?? null;
  const ouroFotoPath = parsed.data.ouro_foto_path ?? null;

  // ═══ VALE-TROCA ══════════════════════════════════════════════════════════
  // Baixar "A Receber" com vale segue a MESMA regra da venda (não é só marcar
  // pago): valida o número, exige o código do dono (WhatsApp) e CONSOME o vale
  // de verdade. O valor vem do vale (aplica até o total da conta; sobra = troco
  // em vale novo; vale menor que a conta = pagamento parcial). Isso fecha a
  // brecha do "recebimento fantasma de vale" (valor digitado, vale não baixado).
  if (formaRecebimento === "Vale-Troca") {
    if (!vendaId) {
      return NextResponse.json({ error: "Conta sem venda vinculada — não é possível aplicar vale-troca" }, { status: 400 });
    }
    const valeNumero = parsed.data.vale_numero?.trim();
    const valeCodigo = parsed.data.vale_codigo;
    const valeExcecao = parsed.data.vale_excecao === true;
    if (!valeNumero) {
      return NextResponse.json({ error: "Informe o número do vale" }, { status: 400 });
    }

    const valid = await validarValeTroca(valeNumero);
    if (!valid.ok || !valid.id) {
      return NextResponse.json({ error: valid.erro ?? "Vale-troca inválido" }, { status: 400 });
    }

    // 2ª confirmação do dono (igual à venda): vale COM dono exige código (ou
    // liberação por aprovador via vale_excecao). Vale SEM dono (promo) aplica direto.
    if (valid.cliente_id != null) {
      if (valeExcecao) {
        const [cfg] = await sql<{ valor: string }[]>`
          SELECT valor FROM alissonerp.configuracoes_sistema WHERE chave = 'aprovador_vale_troca_excecao'
        `;
        const autorizado = hasRole(usuario.role as string, ROLES_DEVOLUCAO) || (!!cfg?.valor && cfg.valor === user.id);
        if (!autorizado) {
          return NextResponse.json(
            { error: "Exceção do vale exige um responsável autorizado (gerente ou aprovador configurado)." },
            { status: 403 },
          );
        }
        await logAudit(sql, {
          tabela: "vale_troca",
          operacao: "UPDATE",
          registro_id: valid.id,
          usuario_id: user.id,
          dados_depois: { excecao_aplicacao: true, conta_receber_id: contaId, venda_id: vendaId, motivo: "confirmacao_whatsapp_indisponivel" },
        });
      } else {
        if (!valeCodigo) {
          return NextResponse.json(
            { error: "Informe o código de confirmação enviado ao WhatsApp do cliente (ou solicite aprovação de um responsável).", precisa_codigo: true },
            { status: 400 },
          );
        }
        const conf = await confirmarCodigoVale(valid.id, String(valeCodigo));
        if (!conf.ok) {
          return NextResponse.json({ error: conf.erro, bloqueado: conf.bloqueado ?? false }, { status: 409 });
        }
      }
    }

    let novoCreditoIdVale: number | null = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const out = await sql.begin(async (tx: any) => {
        // Consome o vale: aplica até o valor da conta; sobra vira vale novo (troco),
        // vale menor que a conta → valor_aplicado < total e o restante fica pendente.
        const aplic = await aplicarValeTroca(valeNumero, vendaId, Number(conta.valor), user.id, tx);
        const valorEfetivo = aplic.valor_aplicado;
        const ehParcial = valorEfetivo < Number(conta.valor);
        const valorRestante = ehParcial ? Math.round((Number(conta.valor) - valorEfetivo) * 100) / 100 : 0;

        // Baixa a conta pelo valor aplicado
        await tx`
          UPDATE alissonerp.contas_receber
          SET valor = ${valorEfetivo}, situacao = 'pago', data_recebimento = CURRENT_DATE, updated_at = NOW()
          WHERE id = ${contaId}
        `;

        // Split de crédito (vale cobriu só parte da conta)
        if (ehParcial) {
          const [nova] = await tx`
            INSERT INTO alissonerp.contas_receber
              (descricao, cliente_id, cliente_nome, venda_erp_id, valor,
               data_vencimento, situacao, categoria, obs, created_by)
            SELECT
              ${`Saldo restante — ${conta.descricao}`},
              cr.cliente_id, cr.cliente_nome, cr.venda_erp_id,
              ${valorRestante}, CURRENT_DATE, 'pendente', 'venda',
              ${`Parcial de R$ ${valorEfetivo.toFixed(2)} via Vale-Troca ${valeNumero}. Restante: R$ ${valorRestante.toFixed(2)}`},
              ${user.id}::uuid
            FROM alissonerp.contas_receber cr WHERE cr.id = ${contaId}
            RETURNING id
          `;
          novoCreditoIdVale = nova?.id ?? null;
        }

        // Confirma o pagamento "A Receber" da venda amarrando o vale consumido
        if (pagamento) {
          if (!ehParcial) {
            await tx`
              UPDATE alissonerp.pagamentos_venda
              SET status = 'confirmado', data_confirmacao = NOW(),
                  gateway = 'Vale-Troca', vale_troca_id = ${aplic.vale_aplicado_id}
              WHERE id = ${pagamento.id}
            `;
          } else {
            await tx`
              UPDATE alissonerp.pagamentos_venda
              SET valor = ${valorEfetivo}, status = 'confirmado', data_confirmacao = NOW(),
                  gateway = 'Vale-Troca', vale_troca_id = ${aplic.vale_aplicado_id}
              WHERE id = ${pagamento.id}
            `;
            await tx`
              INSERT INTO alissonerp.pagamentos_venda (venda_id, forma, valor, parcelas, status)
              VALUES (${vendaId}, 'A Receber', ${valorRestante}, 1, 'pendente')
            `;
          }
        }

        // Histórico
        const trocoMsg = aplic.novo_vale
          ? ` Troco gerou o vale ${aplic.novo_vale.numero} (R$ ${aplic.novo_vale.valor_original.toFixed(2)}).`
          : "";
        await tx`
          INSERT INTO alissonerp.comunicacoes_crediario
            (conta_receber_id, tipo, mensagem, usuario_id)
          VALUES (
            ${contaId},
            'aviso_recebimento',
            ${obs ?? `Recebido via Vale-Troca ${valeNumero} — R$ ${valorEfetivo.toFixed(2)}.${trocoMsg} — ${conta.descricao}`},
            ${user.id}::uuid
          )
        `;

        await logAudit(tx, {
          tabela: "contas_receber",
          operacao: "UPDATE",
          registro_id: contaId,
          usuario_id: user.id,
          dados_antes: { situacao: "pendente", valor: Number(conta.valor) },
          dados_depois: {
            situacao: "pago", valor: valorEfetivo, forma: "Vale-Troca",
            vale_troca_id: aplic.vale_aplicado_id,
            ...(novoCreditoIdVale ? { novo_credito_id: novoCreditoIdVale } : {}),
          },
        });

        return { valorEfetivo, ehParcial, valorRestante, novo_vale: aplic.novo_vale };
      });

      // REGRA DE OURO #1 (igual às outras formas): devolve saldo ao gerente se a
      // venda usou crédito — independe da forma de pagamento.
      let saldoDevolvidoVale = false;
      if (pagamento) {
        const [venda] = await sql`
          SELECT credito_gerente_usado FROM alissonerp.vendas_erp WHERE id = ${vendaId}
        `;
        const creditoUsado = parseFloat(venda?.credito_gerente_usado ?? "0");
        if (creditoUsado > 0) {
          const valorDevolver = Math.min(out.valorEfetivo, creditoUsado);
          try {
            await creditarSaldo(valorDevolver, vendaId, pagamento.id, user.id);
            await sql`
              UPDATE alissonerp.vendas_erp
              SET credito_gerente_usado = GREATEST(credito_gerente_usado - ${valorDevolver}, 0), updated_at = NOW()
              WHERE id = ${vendaId}
            `;
            saldoDevolvidoVale = true;
          } catch (err) {
            console.error("[crediario/baixa] vale: erro ao devolver saldo:", err);
          }
        }
      }

      return NextResponse.json({
        ok: true,
        forma: "Vale-Troca",
        saldo_devolvido: saldoDevolvidoVale,
        valor_pago: out.valorEfetivo,
        pagamento_parcial: out.ehParcial || undefined,
        valor_restante: out.ehParcial ? out.valorRestante : undefined,
        novo_credito_id: novoCreditoIdVale ?? undefined,
        novo_vale: out.novo_vale,
      });
    } catch (err) {
      if (err instanceof Error && /[Vv]ale-troca/.test(err.message)) {
        return NextResponse.json({ error: err.message }, { status: 409 });
      }
      console.error("[crediario/baixa] vale-troca:", err);
      return NextResponse.json({ error: "Erro ao aplicar vale-troca" }, { status: 400 });
    }
  }

  // O valor pago default é o total da conta. Se o front enviar valor_pago
  // menor que o total, será pagamento parcial → split de crédito.
  const valorEfetivo = valorPago ?? Number(conta.valor);
  if (valorEfetivo <= 0) return NextResponse.json({ error: "Valor pago inválido" }, { status: 400 });
  if (valorEfetivo > Number(conta.valor)) return NextResponse.json({ error: "Valor pago maior que o valor da conta" }, { status: 400 });

  const ehPagamentoParcial = valorEfetivo < Number(conta.valor);
  const valorRestante = ehPagamentoParcial ? Number(conta.valor) - valorEfetivo : 0;

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
          ${`Parcial de R$ ${valorEfetivo.toFixed(2)} pago via ${formaRecebimento ?? "não informado"}. Restante: R$ ${valorRestante.toFixed(2)}`},
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
              gateway = ${formaRecebimento ?? null},
              ouro_peso = ${ouroPeso},
              ouro_valor_grama = ${ouroValorGrama},
              ouro_foto_path = ${ouroFotoPath}
          WHERE id = ${pagamento.id}
        `;
      } else if (formaRecebimento) {
        await tx`
          UPDATE alissonerp.pagamentos_venda
          SET status = 'confirmado', data_confirmacao = NOW(), gateway = ${formaRecebimento}
          WHERE id = ${pagamento.id}
        `;
      } else {
        await tx`
          UPDATE alissonerp.pagamentos_venda
          SET status = 'confirmado', data_confirmacao = NOW()
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
              gateway = ${formaRecebimento ?? null},
              ouro_peso = ${ouroPeso},
              ouro_valor_grama = ${ouroValorGrama},
              ouro_foto_path = ${ouroFotoPath}
          WHERE id = ${pagamento.id}
        `;
      } else if (formaRecebimento) {
        await tx`
          UPDATE alissonerp.pagamentos_venda
          SET valor = ${valorEfetivo}, status = 'confirmado', data_confirmacao = NOW(),
              gateway = ${formaRecebimento}
          WHERE id = ${pagamento.id}
        `;
      } else {
        await tx`
          UPDATE alissonerp.pagamentos_venda
          SET valor = ${valorEfetivo}, status = 'confirmado', data_confirmacao = NOW()
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
        ${obs ?? `Recebido via ${formaRecebimento ?? "não informado"} — R$ ${valorEfetivo.toFixed(2)}${msgOuro} — ${conta.descricao}`},
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
