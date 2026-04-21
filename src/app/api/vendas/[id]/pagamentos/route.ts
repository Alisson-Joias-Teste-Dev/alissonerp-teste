import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

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
    SELECT id, bloqueado, situacao FROM alissonerp.vendas_erp WHERE id = ${vendaId}
  `;
  if (!venda) return NextResponse.json({ error: "Venda não encontrada" }, { status: 404 });
  if (venda.bloqueado) return NextResponse.json({ error: "Venda bloqueada" }, { status: 409 });

  const body = await req.json() as {
    forma:       string;
    gateway?:    string | null;
    valor:       number;
    parcelas?:   number;
    status?:     string;
    vale_numero?: string;
  };

  if (!body.forma) return NextResponse.json({ error: "forma obrigatória" }, { status: 400 });
  if (!body.valor || body.valor <= 0) return NextResponse.json({ error: "valor inválido" }, { status: 400 });

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

  const isDinheiro = body.forma === 'Dinheiro';

  // Guard: não permitir adicionar pagamento se a venda já está totalmente paga
  const [totais] = await sql`
    SELECT
      v.total_venda::numeric                                                               AS total_venda,
      COALESCE(SUM(p.valor) FILTER (WHERE p.status = 'confirmado'), 0)::numeric           AS soma_confirmados
    FROM alissonerp.vendas_erp v
    LEFT JOIN alissonerp.pagamentos_venda p ON p.venda_id = v.id
    WHERE v.id = ${vendaId}
    GROUP BY v.total_venda
  `;
  if (totais && isDinheiro) {
    const jaConfirmado = Number(totais.soma_confirmados);
    const totalVenda   = Number(totais.total_venda);
    if (jaConfirmado + 0.01 >= totalVenda) {
      return NextResponse.json(
        { error: "Venda já está totalmente paga por outro meio de pagamento" },
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
