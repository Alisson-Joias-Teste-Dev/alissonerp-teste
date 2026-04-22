import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [u] = await sql`
    SELECT nome FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;

  const body = await req.json() as {
    venda_id?: number | null;
    item_id?: number | null;
    produto_nome: string;
    preco_lista: number;
    pct_desconto: number;
    preco_solicitado: number;
  };

  if (!body.produto_nome || !body.pct_desconto || !body.preco_lista) {
    return NextResponse.json({ error: "Dados obrigatórios ausentes" }, { status: 400 });
  }

  const nomeSolicitante = (u?.nome as string) || user.email || "";

  const [row] = await sql`
    INSERT INTO alissonerp.solicitacoes_desconto
      (venda_id, item_id, produto_nome, preco_lista, pct_desconto_solicitado,
       preco_solicitado, solicitado_por_id, solicitado_por_nome)
    VALUES
      (${body.venda_id ?? null}, ${body.item_id ?? null}, ${body.produto_nome},
       ${body.preco_lista}, ${body.pct_desconto}, ${body.preco_solicitado},
       ${user.id}::uuid, ${nomeSolicitante})
    RETURNING id, status, created_at
  `;

  return NextResponse.json(row, { status: 201 });
}
