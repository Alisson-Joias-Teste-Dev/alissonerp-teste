import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/auth-server";
import { isFullAccess } from "@/lib/roles";
import { VISIBILIDADE_DEFAULT, type ProdutoVisibilidadeConfig } from "@/lib/produto-visibilidade";

const CHAVE = "produto_visibilidade";

export async function GET() {
  try {
    const rows = await sql<{ valor: string }[]>`
      SELECT valor FROM alissonerp.configuracoes_sistema WHERE chave = ${CHAVE}
    `;
    if (rows.length === 0) return NextResponse.json({ config: VISIBILIDADE_DEFAULT });
    const config = JSON.parse(rows[0].valor) as ProdutoVisibilidadeConfig;
    return NextResponse.json({ config: { ...VISIBILIDADE_DEFAULT, ...config } });
  } catch {
    return NextResponse.json({ config: VISIBILIDADE_DEFAULT });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireAuth();
    if (!isFullAccess(user.role)) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }
    const body = await req.json() as { config: ProdutoVisibilidadeConfig };
    const valor = JSON.stringify(body.config);
    await sql`
      INSERT INTO alissonerp.configuracoes_sistema (chave, valor)
      VALUES (${CHAVE}, ${valor})
      ON CONFLICT (chave) DO UPDATE SET valor = ${valor}
    `;
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
