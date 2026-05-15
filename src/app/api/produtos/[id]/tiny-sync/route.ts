import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { temAcessoModulo } from "@/lib/permissoes";
import sql from "@/lib/db";
import { syncProdutoToTiny } from "@/lib/produto-tiny-sync";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const role = user.user_metadata?.role as string | undefined;
  if (!(await temAcessoModulo(role ?? "", "produtos", "escrever"))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const produtoId = Number(id);
  if (!produtoId) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const [prod] = await sql`
    SELECT id_produto, id_api_produto FROM public.produtos WHERE id_produto = ${produtoId} LIMIT 1
  `;
  if (!prod) return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 });

  // Reseta o status da fila para forçar nova tentativa
  await sql`
    INSERT INTO alissonerp.tiny_sync_produtos (produto_id, operacao, status)
    VALUES (${produtoId}, CASE WHEN ${prod.id_api_produto != null} THEN 'update' ELSE 'create' END, 'pendente')
    ON CONFLICT (produto_id) DO UPDATE SET
      status = 'pendente', tentativas = 0, erro = NULL, updated_at = NOW()
  `;

  const result = await syncProdutoToTiny(produtoId, prod.id_api_produto != null ? "update" : "create");

  if (result.ok) {
    return NextResponse.json({ ok: true, tinyId: result.tinyId });
  }
  return NextResponse.json({ error: result.erro ?? "Erro ao sincronizar com Tiny" }, { status: 422 });
}
