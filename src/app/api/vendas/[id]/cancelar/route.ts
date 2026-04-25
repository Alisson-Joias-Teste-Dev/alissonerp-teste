import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";

// ─── POST /api/vendas/[id]/cancelar ───────────────────────────────────────────
// Cancela venda (apenas gerente+ ou admin/dev).
// Vendas com pagamento confirmado não podem ser canceladas diretamente.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 403 });

  const PODE_CANCELAR = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja"];
  if (!PODE_CANCELAR.includes(usuario.role) && !isFullAccess(usuario.role)) {
    return NextResponse.json({ error: "Sem permissão para cancelar vendas" }, { status: 403 });
  }

  const { id } = await params;
  const vendaId = Number(id);
  if (isNaN(vendaId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const [venda] = await sql`
    SELECT id, situacao, bloqueado FROM alissonerp.vendas_erp WHERE id = ${vendaId}
  `;
  if (!venda) return NextResponse.json({ error: "Venda não encontrada" }, { status: 404 });
  if (venda.situacao === "cancelado") {
    return NextResponse.json({ error: "Venda já cancelada" }, { status: 409 });
  }
  if (venda.situacao === "concluido") {
    return NextResponse.json({ error: "Venda concluída não pode ser cancelada" }, { status: 409 });
  }

  // Verificar se há pagamentos confirmados
  const [{ count }] = await sql`
    SELECT COUNT(*) AS count
    FROM alissonerp.pagamentos_venda
    WHERE venda_id = ${vendaId} AND status = 'confirmado'
  `;
  if (Number(count) > 0) {
    return NextResponse.json(
      { error: "Venda possui pagamentos confirmados. Estorne os pagamentos antes de cancelar." },
      { status: 409 }
    );
  }

  // Se havia crédito do gerente usado, devolver ao saldo
  const [vendaCredito] = await sql`
    SELECT credito_gerente_usado FROM alissonerp.vendas_erp WHERE id = ${vendaId}
  `;
  const creditoUsado = parseFloat(vendaCredito?.credito_gerente_usado ?? "0");

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sql as any).begin(async (tx: typeof sql) => {
      await tx`
        UPDATE alissonerp.vendas_erp
        SET situacao = 'cancelado', bloqueado = true
        WHERE id = ${vendaId}
      `;

      if (creditoUsado > 0) {
        const { creditarSaldo } = await import("@/lib/saldo-credito");
        await creditarSaldo(creditoUsado, vendaId, null, user.id);
      }
    });
  } catch (err) {
    console.error("[cancelar] Falha ao cancelar venda:", err);
    const msg = err instanceof Error ? err.message : "Falha ao cancelar. Tente novamente.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
