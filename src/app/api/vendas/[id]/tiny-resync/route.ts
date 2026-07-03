import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import sql from "@/lib/db";
import { sendToTiny } from "@/lib/vendas-aprovar";

const ROLES_PERMITIDOS = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja"];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario || !ROLES_PERMITIDOS.includes(usuario.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const vendaId = Number(id);
  if (isNaN(vendaId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  // Limpa tiny_pedido_id (caso tenha ficado inconsistente) e reseta status
  await sql`
    UPDATE alissonerp.vendas_erp
    SET tiny_sync_status = 'pendente', tiny_sync_erro = NULL, tiny_pedido_id = NULL
    WHERE id = ${vendaId} AND tiny_pedido_id IS NULL
  `;

  // Timeout total de 15s para não exceder o gateway e levar 502 HTML
  try {
    await Promise.race([
      sendToTiny(vendaId),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Tempo limite excedido ao reenviar para o Tiny. Tente novamente.")), 15_000)
      ),
    ]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao reenviar para o Tiny";
    return NextResponse.json({ error: msg }, { status: 422 });
  }
}
