import { NextRequest, NextResponse } from "next/server";
import { authOr401 } from "@/lib/auth-server";
import { temAcessoModulo } from "@/lib/permissoes";
import sql from "@/lib/db";
import { syncProdutoToTiny } from "@/lib/produto-tiny-sync";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [user, errRes] = await authOr401(req);
    if (errRes) return errRes;
    if (!(await temAcessoModulo(user.role, "produtos", "escrever"))) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    const { id } = await params;
    const produtoId = Number(id);
    if (!produtoId) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

    const [prod] = await sql`
      SELECT id_produto, id_api_produto FROM alissonerp.produtos_compat WHERE id_produto = ${produtoId} LIMIT 1
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
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro interno ao sincronizar produto";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
