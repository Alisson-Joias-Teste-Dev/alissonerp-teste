import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { ForbiddenError } from "@/lib/auth-server";
import { requireVendaOwnership, NotFoundError } from "@/lib/auth-vendas";
import { internalError } from "@/lib/api-error";
import { zodError } from "@/lib/schemas/common";
import { getDescontoThreshold, buscarLimiteDescontoCartao } from "@/lib/aprovacao-regras";
import { confirmarCodigoVale } from "@/lib/vale-troca-codigo";
import { logAudit } from "@/lib/audit";
import { hasRole, ROLES_DEVOLUCAO } from "@/lib/roles";
import { isPagamentoExcedeError, PAGAMENTO_EXCEDE_MSG } from "@/lib/pagamento-excede";

const PagamentoPostSchema = z.object({
  forma: z.string().min(1, "forma obrigatória").max(100),
  gateway: z.string().max(100).nullable().optional(),
  // 'Ouro' calcula valor server-side; outros validam > 0 no handler.
  valor: z.number().nonnegative().optional(),
  parcelas: z.number().int().min(1).max(99).optional(),
  status: z.string().max(50).optional(),
  vale_numero: z.string().max(100).optional(),
  vale_codigo: z.string().max(20).optional(),      // 2a confirmacao (WhatsApp) — brecha #1
  vale_excecao: z.boolean().optional(),            // override por aprovador quando WhatsApp falha
  ouro_peso: z.number().positive().optional(),
  ouro_valor_grama: z.number().positive().optional(),
  ouro_foto_path: z.string().max(500).optional(),
  // Plano do crediário (forma "A Receber") — migrations 317/318. O gatilho
  // fn_venda_gerar_conta_receber lê estes campos pra gerar as parcelas/sinal na
  // aprovação. 'meses' usa credi_param=dia do vencimento; 'dias' usa credi_param=
  // nº de dias; 'sinal' ignora credi_param (vencimento = 7 dias úteis no gatilho).
  credi_tipo: z.enum(["meses", "dias", "sinal"]).nullable().optional(),
  // 'meses' = dia do vencimento (1-31); 'dias' = nº de dias até o vencimento (até 180).
  // Por isso o teto é 180 (não 31): cobre os dois usos. 'sinal' manda null.
  credi_param: z.number().int().min(0).max(180).nullable().optional(),
}).passthrough();

async function checkOwnership(userId: string, vendaId: number) {
  const [u] = await sql<{ role: string }[]>`
    SELECT role FROM alissonerp.usuarios WHERE id = ${userId}::uuid LIMIT 1
  `;
  if (!u) throw new ForbiddenError("Usuario nao encontrado");
  await requireVendaOwnership({ id: userId, role: u.role, email: "" }, vendaId);
}

// ─── GET /api/vendas/[id]/pagamentos ───────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const vendaId = Number(id);
  if (isNaN(vendaId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  // Onda 1D: bloqueia consultora de ler pagamentos de venda alheia
  try { await checkOwnership(user.id, vendaId); }
  catch (e) {
    if (e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const pagamentos = await sql`
    SELECT id, venda_id, forma, gateway, valor, parcelas,
           status, gateway_id, data_confirmacao, created_at
    FROM alissonerp.pagamentos_venda
    WHERE venda_id = ${vendaId}
    ORDER BY id
  `;

  return NextResponse.json(
    pagamentos.map((p) => ({ ...p, valor: Number(p.valor) }))
  );
}

// ─── POST /api/vendas/[id]/pagamentos ──────────────────────────────────────────
// Body: { forma, gateway?, valor, parcelas?, status? }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const vendaId = Number(id);
  if (isNaN(vendaId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const descontoThreshold = await getDescontoThreshold(vendaId);
  const [venda] = await sql`
    SELECT v.id, v.bloqueado, v.situacao,
    v.desconto_aprovado_por,
    v.desconto_cartao_aprovado_por,
    EXISTS(
      SELECT 1 FROM alissonerp.itens_venda_erp
      WHERE venda_id = ${vendaId} AND pct_desconto > ${descontoThreshold}
    ) AS tem_desconto_alto
    FROM alissonerp.vendas_erp v WHERE v.id = ${vendaId}
  `;
  if (!venda) return NextResponse.json({ error: "Venda não encontrada" }, { status: 404 });
  if (venda.bloqueado) return NextResponse.json({ error: "Venda bloqueada" }, { status: 409 });
  if (venda.situacao === "entregue" || venda.situacao === "concluido") {
    return NextResponse.json({ error: "Venda já finalizada. Não é possível adicionar pagamentos." }, { status: 409 });
  }

  // Onda 1D: bloqueia consultora de criar pagamento em venda alheia
  try { await checkOwnership(user.id, vendaId); }
  catch (e) {
    if (e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  // ── Porta única do Crediário ─────────────────────────────────────────────
  // Venda já aprovada com "A Receber" pendente: esse saldo virou uma conta no
  // Crediário. Quitá-lo criando outro pagamento pela venda gera recebimento
  // fantasma (a venda fica "paga", mas a conta a receber some sem baixa). O
  // recebimento desse saldo é registrado SÓ pela tela do Crediário.
  if (["aprovado", "confirmado"].includes(venda.situacao)) {
    const [aReceberPend] = await sql<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM alissonerp.pagamentos_venda
      WHERE venda_id = ${vendaId} AND forma = 'A Receber' AND status = 'pendente'
    `;
    if (aReceberPend && aReceberPend.n > 0) {
      return NextResponse.json(
        { error: "Esta venda tem saldo 'A Receber', que agora é uma conta no Crediário. Registre o recebimento pela tela do Crediário, não pela venda.", usar_crediario: true },
        { status: 409 },
      );
    }
  }

  // ── Travar venda: sem pagamento enquanto desconto > threshold não aprovado ─
  if (venda.tem_desconto_alto && !venda.desconto_aprovado_por) {
    return NextResponse.json(
      { error: `Venda travada — desconto acima de ${descontoThreshold}% aguarda aprovação do diretor. Pagamento só pode ser gerado após aprovação do desconto.` },
      { status: 409 }
    );
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = PagamentoPostSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data as {
    forma:            string;
    gateway?:         string | null;
    valor:            number;
    parcelas?:        number;
    status?:          string;
    vale_numero?:     string;
    vale_codigo?:     string;
    vale_excecao?:    boolean;
    ouro_peso?:       number;
    ouro_valor_grama?: number;
    ouro_foto_path?:  string;
    credi_tipo?:      "meses" | "dias" | "sinal" | null;
    credi_param?:     number | null;
  };

  // Bloqueia "Múltiplas" como forma única — deve ser decomposto em pagamentos individuais
  if (body.forma === "Múltiplas") return NextResponse.json(
    { error: "Use pagamentos individuais (Dinheiro, Cartão, Pix, etc.) em vez de 'Múltiplas'. A opção Múltiplas existe para o formulário de checkout, mas cada pagamento deve ser registrado separadamente." },
    { status: 400 }
  );
  // Ouro calcula o valor server-side — não valida o campo valor aqui
  if (body.forma !== "Ouro" && (!body.valor || body.valor <= 0))
    return NextResponse.json({ error: "valor inválido" }, { status: 400 });

  // ── Guard: Cartão de Crédito com desconto acima do limite sem aprovação ──
  // REGRA DE NEGÓCIO (Fase 5, 15/07): limite do cartão vem de
  // configuracoes_sistema.limite_desconto_cartao_pct (fallback 20% no código
  // se a chave ainda não existir) — antes era o literal 20 hardcoded aqui.
  if (body.forma === "Cartão de Crédito") {
    const limiteCartao = await buscarLimiteDescontoCartao();
    const [temDescontoCartao] = await sql`
      SELECT EXISTS(
        SELECT 1 FROM alissonerp.itens_venda_erp
        WHERE venda_id = ${vendaId} AND pct_desconto > ${limiteCartao}
      ) AS tem
    `;
    if (temDescontoCartao?.tem && !venda.desconto_cartao_aprovado_por) {
      return NextResponse.json(
        { error: `Esta venda tem itens com desconto acima de ${limiteCartao}%. Para pagar no cartão de crédito, solicite aprovação.` },
        { status: 409 }
      );
    }
  }

  // ── Hook: Vale-Troca ─────────────────────────────────────────────────────
  if (body.forma === "Vale-Troca") {
    if (!body.vale_numero) {
      return NextResponse.json({ error: "vale_numero obrigatório para Vale-Troca" }, { status: 400 });
    }
    // ── A1 (brecha #1): 2a confirmacao do dono (reads + confirmacao do codigo) ─
    // Vale COM dono so e aplicado apos o dono confirmar o codigo enviado por
    // WhatsApp. Vale SEM dono (promo) e aplicado direto. Quando o WhatsApp falha,
    // um responsavel autorizado (ROLES_DEVOLUCAO ou aprovador_vale_troca_excecao)
    // libera via vale_excecao=true — sempre auditado.
    const valeNum = body.vale_numero.trim();
    const [valeRow] = await sql<{ id: number; cliente_id: number | null; status: string }[]>`
      SELECT id, cliente_id, status FROM alissonerp.vale_troca WHERE numero = ${valeNum}
    `;
    if (!valeRow) return NextResponse.json({ error: "Vale-troca não encontrado" }, { status: 400 });
    if (valeRow.status !== "ativo") return NextResponse.json({ error: `Vale-troca ${valeRow.status}` }, { status: 400 });

    if (valeRow.cliente_id != null) {
      if (body.vale_excecao === true) {
        const [u] = await sql<{ role: string }[]>`
          SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
        `;
        const [cfg] = await sql<{ valor: string }[]>`
          SELECT valor FROM alissonerp.configuracoes_sistema WHERE chave = 'aprovador_vale_troca_excecao'
        `;
        const autorizado = hasRole(u?.role, ROLES_DEVOLUCAO) || (!!cfg?.valor && cfg.valor === user.id);
        if (!autorizado) {
          return NextResponse.json(
            { error: "Exceção do vale exige um responsável autorizado (gerente ou aprovador configurado)." },
            { status: 403 },
          );
        }
        await logAudit(sql, {
          tabela: "vale_troca",
          operacao: "UPDATE",
          registro_id: valeRow.id,
          usuario_id: user.id,
          dados_depois: { excecao_aplicacao: true, venda_id: vendaId, motivo: "confirmacao_whatsapp_indisponivel" },
        });
      } else {
        if (!body.vale_codigo) {
          return NextResponse.json(
            { error: "Informe o código de confirmação enviado ao WhatsApp do cliente (ou solicite aprovação de um responsável).", precisa_codigo: true },
            { status: 400 },
          );
        }
        const conf = await confirmarCodigoVale(valeRow.id, String(body.vale_codigo));
        if (!conf.ok) {
          return NextResponse.json({ error: conf.erro, bloqueado: conf.bloqueado ?? false }, { status: 409 });
        }
      }
    }

    // ── A3 (brecha #5) ATÔMICO: trava a venda (FOR UPDATE), recalcula o saldo,
    // aplica o vale e insere o pagamento na MESMA transacao — igual ao hook do
    // Ouro. Isso impede que pagamentos concorrentes ultrapassem o total da venda.
    // O vale nunca aplica mais que o saldo restante; o excedente vira troco.
    try {
      const { aplicarValeTroca } = await import("@/lib/vale-troca");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const out = await (sql as any).begin(async (tx: typeof sql) => {
        const [lock] = await tx`
          SELECT v.total_venda::numeric AS total,
                 COALESCE((
                   SELECT SUM(p.valor) FROM alissonerp.pagamentos_venda p
                   WHERE p.venda_id = ${vendaId} AND p.status = 'confirmado'
                 ), 0)::numeric AS pago
          FROM alissonerp.vendas_erp v WHERE v.id = ${vendaId}
          FOR UPDATE
        `;
        const restante = Number(lock.total) - Number(lock.pago);
        if (restante <= 0.01) throw new Error("VALE_VENDA_PAGA");
        const valorUsarVale = Math.min(body.valor, Math.round(restante * 100) / 100);
        const aplic = await aplicarValeTroca(valeNum, vendaId, valorUsarVale, user.id, tx);
        const [novoPg] = await tx`
          INSERT INTO alissonerp.pagamentos_venda (
            venda_id, forma, gateway, valor, parcelas, status, vale_troca_id, data_confirmacao, comissionavel
          ) VALUES (
            ${vendaId}, 'Vale-Troca', NULL, ${aplic.valor_aplicado}, 1,
            'confirmado', ${aplic.vale_aplicado_id}, now(), false
          )
          RETURNING id
        `;
        return { pagId: novoPg.id as number, aplic };
      });

      return NextResponse.json({
        id: out.pagId,
        valor_aplicado: out.aplic.valor_aplicado,
        precisa_complemento: out.aplic.precisa_complemento,
        novo_vale: out.aplic.novo_vale,
      }, { status: 201 });
    } catch (err) {
      if (err instanceof Error && err.message === "VALE_VENDA_PAGA") {
        return NextResponse.json({ error: "Venda já está totalmente paga" }, { status: 409 });
      }
      return internalError("[POST /api/vendas/[id]/pagamentos] vale-troca", err, "Erro ao aplicar vale-troca", 400);
    }
  }

  // ── Hook: Ouro ───────────────────────────────────────────────────────────────
  if (body.forma === "Ouro") {
    if (!body.ouro_peso || body.ouro_peso <= 0)
      return NextResponse.json({ error: "Peso do ouro obrigatório" }, { status: 400 });
    if (!body.ouro_valor_grama || body.ouro_valor_grama <= 0)
      return NextResponse.json({ error: "Valor da grama obrigatório" }, { status: 400 });
    if (!body.ouro_foto_path)
      return NextResponse.json({ error: "Foto da balança obrigatória para pagamento em ouro" }, { status: 400 });

    const ouroPeso      = body.ouro_peso!;
    const ouroValGrama  = body.ouro_valor_grama!;
    const ouroFotoPath  = body.ouro_foto_path!;
    const valorOuro = +(ouroPeso * ouroValGrama).toFixed(2);

    let novoOuroId!: number;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sql as any).begin(async (tx: typeof sql) => {
        const [vendaLock] = await tx`
          SELECT total_venda,
                 COALESCE((
                   SELECT SUM(p.valor) FROM alissonerp.pagamentos_venda p
                   WHERE p.venda_id = ${vendaId} AND p.status = 'confirmado'
                 ), 0)::numeric AS soma_confirmados
          FROM alissonerp.vendas_erp WHERE id = ${vendaId}
          FOR UPDATE
        `;
        if (Number(vendaLock.soma_confirmados) + valorOuro > Number(vendaLock.total_venda) + 0.01) {
          throw new Error("Pagamento em ouro ultrapassa o total da venda");
        }
        const [novoOuro] = await tx`
          INSERT INTO alissonerp.pagamentos_venda
            (venda_id, forma, valor, parcelas, status, data_confirmacao,
             ouro_peso, ouro_valor_grama, ouro_foto_path)
          VALUES
            (${vendaId}, 'Ouro', ${valorOuro}, 1, 'confirmado', now(),
             ${ouroPeso}, ${ouroValGrama}, ${ouroFotoPath})
          RETURNING id
        `;
        novoOuroId = novoOuro.id;
      });
    } catch (err) {
      return internalError("[POST /api/vendas/[id]/pagamentos] ouro", err, "Erro ao registrar pagamento em ouro", 409);
    }
    return NextResponse.json({ id: novoOuroId, valor: valorOuro }, { status: 201 });
  }

  const isDinheiro = body.forma === 'Dinheiro';

  // Guard: não permitir adicionar pagamento se a venda já está totalmente paga
  const [totais] = await sql`
    SELECT
      v.total_venda::numeric                                                               AS total_venda,
      COALESCE(SUM(p.valor) FILTER (WHERE p.status = 'confirmado' AND p.data_confirmacao IS NOT NULL), 0)::numeric AS soma_confirmados
    FROM alissonerp.vendas_erp v
    LEFT JOIN alissonerp.pagamentos_venda p ON p.venda_id = v.id
    WHERE v.id = ${vendaId}
    GROUP BY v.total_venda
  `;
  if (totais) {
    const jaConfirmado = Number(totais.soma_confirmados);
    const totalVenda   = Number(totais.total_venda);
    // A2: Bloqueia qualquer novo pagamento se a venda já está totalmente paga
    if (jaConfirmado + 0.01 >= totalVenda) {
      return NextResponse.json(
        { error: "Venda já está totalmente paga" },
        { status: 409 }
      );
    }
    // Para formas auto-confirmadas (Dinheiro), impede ultrapassar o saldo restante
    if (isDinheiro && jaConfirmado + body.valor > totalVenda + 0.01) {
      const restante = (totalVenda - jaConfirmado).toFixed(2);
      return NextResponse.json(
        { error: `Pagamento ultrapassa o saldo restante da venda (R$${restante})` },
        { status: 409 }
      );
    }
  }

  // Plano do crediário só faz sentido na forma "A Receber" — nas demais grava null
  // (evita poluir pagamentos de Dinheiro/Pix/etc. com plano de parcelamento).
  // O gatilho fn_venda_gerar_conta_receber (mig 317/318) lê estes campos na aprovação.
  const isAReceber = body.forma === "A Receber";
  const crediTipo  = isAReceber ? (body.credi_tipo ?? null) : null;
  const crediParam = isAReceber ? (body.credi_param ?? null) : null;

  let novo;
  try {
    [novo] = await sql`
      INSERT INTO alissonerp.pagamentos_venda (
        venda_id, forma, gateway, valor, parcelas, status, data_confirmacao,
        credi_tipo, credi_param
      ) VALUES (
        ${vendaId},
        ${body.forma},
        ${body.gateway ?? null},
        ${body.valor},
        ${body.parcelas ?? 1},
        ${isDinheiro ? 'confirmado' : 'pendente'},
        ${isDinheiro ? sql`now()` : null},
        ${crediTipo},
        ${crediParam}
      )
      RETURNING id
    `;
  } catch (err) {
    // Trava do banco (migration 333): a soma das linhas passaria do total.
    if (isPagamentoExcedeError(err)) {
      return NextResponse.json({ error: PAGAMENTO_EXCEDE_MSG }, { status: 409 });
    }
    throw err;
  }

  return NextResponse.json({ id: novo.id }, { status: 201 });
}
