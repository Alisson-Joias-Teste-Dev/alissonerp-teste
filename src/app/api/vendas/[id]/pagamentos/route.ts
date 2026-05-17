import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { ForbiddenError } from "@/lib/auth-server";
import { requireVendaOwnership, NotFoundError } from "@/lib/auth-vendas";

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

  const [venda] = await sql`
    SELECT v.id, v.bloqueado, v.situacao,
    v.desconto_aprovado_por,
    v.desconto_cartao_aprovado_por,
    EXISTS(
      SELECT 1 FROM alissonerp.itens_venda_erp
      WHERE venda_id = ${vendaId} AND pct_desconto > 30
    ) AS tem_desconto_alto
    FROM alissonerp.vendas_erp v WHERE v.id = ${vendaId}
  `;
  if (!venda) return NextResponse.json({ error: "Venda não encontrada" }, { status: 404 });
  if (venda.bloqueado) return NextResponse.json({ error: "Venda bloqueada" }, { status: 409 });

  // Onda 1D: bloqueia consultora de criar pagamento em venda alheia
  try { await checkOwnership(user.id, vendaId); }
  catch (e) {
    if (e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  // ── Travar venda: sem pagamento enquanto desconto >30% não aprovado ──────
  if (venda.tem_desconto_alto && !venda.desconto_aprovado_por) {
    return NextResponse.json(
      { error: "Venda travada — desconto acima de 30% aguarda aprovação do diretor. Pagamento só pode ser gerado após aprovação do desconto." },
      { status: 409 }
    );
  }

  const body = await req.json() as {
    forma:            string;
    gateway?:         string | null;
    valor:            number;
    parcelas?:        number;
    status?:          string;
    vale_numero?:     string;
    ouro_peso?:       number;
    ouro_valor_grama?: number;
    ouro_foto_path?:  string;
  };

  if (!body.forma) return NextResponse.json({ error: "forma obrigatória" }, { status: 400 });
  // Bloqueia "Múltiplas" como forma única — deve ser decomposto em pagamentos individuais
  if (body.forma === "Múltiplas") return NextResponse.json(
    { error: "Use pagamentos individuais (Dinheiro, Cartão, Pix, etc.) em vez de 'Múltiplas'. A opção Múltiplas existe para o formulário de checkout, mas cada pagamento deve ser registrado separadamente." },
    { status: 400 }
  );
  // Ouro calcula o valor server-side — não valida o campo valor aqui
  if (body.forma !== "Ouro" && (!body.valor || body.valor <= 0))
    return NextResponse.json({ error: "valor inválido" }, { status: 400 });

  // ── Guard: Cartão de Crédito com desconto >20% sem aprovação ────────────
  if (body.forma === "Cartão de Crédito") {
    const [temDescontoCartao] = await sql`
      SELECT EXISTS(
        SELECT 1 FROM alissonerp.itens_venda_erp
        WHERE venda_id = ${vendaId} AND pct_desconto > 20
      ) AS tem
    `;
    if (temDescontoCartao?.tem && !venda.desconto_cartao_aprovado_por) {
      return NextResponse.json(
        { error: "Esta venda tem itens com desconto acima de 20%. Para pagar no cartão de crédito, solicite aprovação." },
        { status: 409 }
      );
    }
  }

  // ── Hook: Vale-Troca ─────────────────────────────────────────────────────
  if (body.forma === "Vale-Troca") {
    if (!body.vale_numero) {
      return NextResponse.json({ error: "vale_numero obrigatório para Vale-Troca" }, { status: 400 });
    }
    try {
      const { aplicarValeTroca } = await import("@/lib/vale-troca");
      const aplic = await aplicarValeTroca(body.vale_numero.trim(), vendaId, body.valor, user.id);

      const [novoPg] = await sql`
        INSERT INTO alissonerp.pagamentos_venda (
          venda_id, forma, gateway, valor, parcelas, status, vale_troca_id, data_confirmacao
        ) VALUES (
          ${vendaId}, 'Vale-Troca', NULL, ${aplic.valor_aplicado}, 1,
          'confirmado', ${aplic.vale_aplicado_id}, now()
        )
        RETURNING id
      `;

      return NextResponse.json({
        id: novoPg.id,
        valor_aplicado: aplic.valor_aplicado,
        precisa_complemento: aplic.precisa_complemento,
        novo_vale: aplic.novo_vale,
      }, { status: 201 });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: msg }, { status: 400 });
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
      const msg = err instanceof Error ? err.message : "Erro ao registrar pagamento em ouro";
      return NextResponse.json({ error: msg }, { status: 409 });
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

  const [novo] = await sql`
    INSERT INTO alissonerp.pagamentos_venda (
      venda_id, forma, gateway, valor, parcelas, status, data_confirmacao
    ) VALUES (
      ${vendaId},
      ${body.forma},
      ${body.gateway ?? null},
      ${body.valor},
      ${body.parcelas ?? 1},
      ${isDinheiro ? 'confirmado' : 'pendente'},
      ${isDinheiro ? sql`now()` : null}
    )
    RETURNING id
  `;

  return NextResponse.json({ id: novo.id }, { status: 201 });
}
