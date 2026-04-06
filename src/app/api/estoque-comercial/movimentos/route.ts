import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import sql from "@/lib/db";

// POST /api/estoque-comercial/movimentos
// Registra uma movimentação (entrada ou saída) manual
export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  const ROLES_PERMITIDOS = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja", "estoquista_fabrica", "estoquista_loja"];
  if (!usuario || !ROLES_PERMITIDOS.includes(usuario.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const body = await req.json() as {
    produto_id: number;
    tipo: "entrada" | "saida";
    quantidade: number;
    motivo: string;
    observacao?: string;
  };

  const { produto_id, tipo, quantidade, motivo, observacao } = body;

  if (!produto_id || !tipo || !quantidade || !motivo) {
    return NextResponse.json({ error: "Campos obrigatórios: produto_id, tipo, quantidade, motivo" }, { status: 400 });
  }
  if (!["entrada", "saida"].includes(tipo)) {
    return NextResponse.json({ error: "tipo inválido" }, { status: 400 });
  }
  if (quantidade <= 0) {
    return NextResponse.json({ error: "quantidade deve ser > 0" }, { status: 400 });
  }

  // Verificar saldo ao sair
  if (tipo === "saida") {
    const [saldo] = await sql`
      SELECT COALESCE(saldo, 0) AS saldo
      FROM alissonerp.vw_saldo_estoque_comercial
      WHERE produto_id = ${produto_id}
    `;
    if (!saldo || Number(saldo.saldo) < quantidade) {
      return NextResponse.json(
        { error: `Saldo insuficiente. Disponível: ${saldo?.saldo ?? 0}` },
        { status: 409 }
      );
    }
  }

  const [mov] = await sql`
    INSERT INTO alissonerp.movimentacoes_estoque_comercial
      (produto_id, tipo, quantidade, motivo, observacao, created_by)
    VALUES
      (${produto_id}, ${tipo}, ${quantidade}, ${motivo}, ${observacao ?? null}, ${user.id})
    RETURNING id, created_at
  `;

  return NextResponse.json({ id: mov.id, created_at: mov.created_at }, { status: 201 });
}
