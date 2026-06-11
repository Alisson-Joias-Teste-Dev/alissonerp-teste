import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";
import { logAudit } from "@/lib/audit";

/**
 * POST /api/vendas/[id]/cobrar-entrega
 *
 * ETAPA 4 (Pagamento na Entrega — decisão Jonathan 11/06/2026).
 *
 * O QUE: registra o pagamento do saldo 'Na Entrega' no momento da entrega. O
 *   atendente/motoboy informa a forma REAL usada pelo cliente (Dinheiro, Pix,
 *   Cartão...) e o sistema confirma os pagamentos 'Na Entrega' pendentes com
 *   essa forma. Ao confirmar, o gatilho da migration 297 cria a conta a receber
 *   JÁ paga (baixa na hora).
 *
 * POR QUE: a forma 'Na Entrega' é um combinado de "paga quando chegar". A venda
 *   é aprovada com esse saldo pendente, mas a ENTREGA fica bloqueada até o
 *   cliente pagar de fato (regra "não entrega sem pagar"). Esta rota é a
 *   cobrança que destrava a entrega.
 *
 * IMPACTO SE REMOVIDO: não há como registrar o dinheiro cobrado na entrega — a
 *   venda fica travada (não entrega) e o recebido não aparece no financeiro.
 *
 * Body: { forma: string }  // forma real, ex.: "Dinheiro" | "Pix" | "Cartão de Crédito"
 */

// Formas que NÃO podem ser usadas para cobrar na entrega (não representam dinheiro
// recebido na hora): a própria 'Na Entrega', o crédito 'A Receber' e o agregador.
const FORMAS_INVALIDAS = new Set(["Na Entrega", "A Receber", "Múltiplas"]);

const PODE_COBRAR = ["desenvolvedor", "admin", "diretor", "gerente_fabrica", "gerente_loja", "consultora", "motoboy", "entregador"];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const vendaId = Number(id);
  if (isNaN(vendaId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const raw = await req.json().catch(() => ({}));
  const forma = typeof raw.forma === "string" ? raw.forma.trim() : "";
  if (!forma) return NextResponse.json({ error: "Informe a forma de pagamento usada na entrega." }, { status: 400 });
  if (FORMAS_INVALIDAS.has(forma)) {
    return NextResponse.json({ error: `Forma "${forma}" não pode ser usada para cobrar na entrega. Escolha uma forma à vista (Dinheiro, Pix, Cartão...).` }, { status: 400 });
  }

  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  if (!usuario) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 403 });
  if (!PODE_COBRAR.includes(usuario.role) && !isFullAccess(usuario.role)) {
    return NextResponse.json({ error: "Sem permissão para cobrar na entrega" }, { status: 403 });
  }

  // Confirma os pagamentos 'Na Entrega' pendentes com a forma real (transação +
  // lock na venda para evitar dupla cobrança). O gatilho 297 baixa a conta a
  // receber automaticamente ao confirmar.
  let valorCobrado = 0;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    valorCobrado = await (sql as any).begin(async (tx: typeof sql): Promise<number> => {
      await tx`SELECT id FROM alissonerp.vendas_erp WHERE id = ${vendaId} FOR UPDATE`;

      const pendentes = await tx`
        SELECT id, valor FROM alissonerp.pagamentos_venda
        WHERE venda_id = ${vendaId} AND forma = 'Na Entrega' AND status = 'pendente'
        FOR UPDATE
      `;
      if (pendentes.length === 0) {
        throw new Error("SEM_NA_ENTREGA");
      }

      const total = pendentes.reduce((s: number, p: Record<string, unknown>) => s + Number(p.valor ?? 0), 0);

      await tx`
        UPDATE alissonerp.pagamentos_venda
        SET forma = ${forma}, status = 'confirmado', data_confirmacao = NOW()
        WHERE venda_id = ${vendaId} AND forma = 'Na Entrega' AND status = 'pendente'
      `;

      await logAudit(tx, {
        tabela: "pagamentos_venda",
        operacao: "UPDATE",
        registro_id: vendaId,
        usuario_id: user.id,
        dados_antes: { forma: "Na Entrega", status: "pendente" },
        dados_depois: { forma, status: "confirmado", valor_cobrado: total, contexto: "cobranca_na_entrega" },
      });

      return total;
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao cobrar na entrega";
    if (msg === "SEM_NA_ENTREGA") {
      return NextResponse.json({ error: "Esta venda não tem saldo 'Na Entrega' pendente." }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ ok: true, valor_cobrado: valorCobrado, forma });
}
