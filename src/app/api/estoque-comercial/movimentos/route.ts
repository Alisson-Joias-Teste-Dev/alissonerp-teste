import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

const ROLES_PERMITIDOS = [
  "desenvolvedor", "admin", "gerente_fabrica", "gerente_loja",
  "estoquista_fabrica", "estoquista_loja"
];

// POST /api/estoque-comercial/movimentos
// Registra uma movimentação (entrada ou saída) manual
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  if (!usuario || !ROLES_PERMITIDOS.includes(usuario.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const body = await req.json() as {
    produto_id: number;
    tipo: "entrada" | "saida";
    quantidade: number;
    motivo: string;
    local_estoque_id?: number;
    observacao?: string;
    data_hora?: string;
  };

  const { produto_id, tipo, quantidade, motivo, observacao, data_hora } = body;

  if (!produto_id || !tipo || !quantidade || !motivo) {
    return NextResponse.json({ error: "Campos obrigatórios: produto_id, tipo, quantidade, motivo" }, { status: 400 });
  }
  if (!["entrada", "saida"].includes(tipo)) {
    return NextResponse.json({ error: "tipo inválido" }, { status: 400 });
  }
  if (quantidade <= 0) {
    return NextResponse.json({ error: "quantidade deve ser > 0" }, { status: 400 });
  }

  // Detectar se coluna local_estoque_id existe na tabela
  const [hasLocalCol] = await sql`
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'alissonerp'
      AND table_name = 'movimentacoes_estoque_comercial'
      AND column_name = 'local_estoque_id'
    LIMIT 1
  `;

  // Verificar saldo ao sair
  if (tipo === "saida") {
    if (hasLocalCol) {
      const local_estoque_id = body.local_estoque_id ?? 2;
      const [saldo] = await sql`
        SELECT COALESCE(SUM(
          CASE WHEN tipo = 'entrada' THEN quantidade ELSE -quantidade END
        ), 0) AS disponivel
        FROM alissonerp.movimentacoes_estoque_comercial
        WHERE produto_id = ${produto_id}
          AND local_estoque_id = ${local_estoque_id}
          AND status = 'efetivado'
      `;
      if (Number(saldo?.disponivel ?? 0) < quantidade) {
        return NextResponse.json(
          { error: `Saldo disponível insuficiente. Disponível: ${saldo?.disponivel ?? 0}` },
          { status: 409 }
        );
      }
    } else {
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
  }

  const tsCustom = data_hora ? new Date(data_hora) : null;

  // INSERT com ou sem colunas v2
  if (hasLocalCol) {
    const local_estoque_id = body.local_estoque_id ?? 2;
    const [mov] = await sql`
      INSERT INTO alissonerp.movimentacoes_estoque_comercial
        (produto_id, tipo, quantidade, motivo, local_estoque_id, status, observacao, created_by, created_at)
      VALUES
        (${produto_id}, ${tipo}, ${quantidade}, ${motivo}, ${local_estoque_id}, 'efetivado',
         ${observacao ?? null}, ${user.id},
         ${tsCustom ? tsCustom.toISOString() : sql`now()`})
      RETURNING id, created_at
    `;
    return NextResponse.json({ id: mov.id, created_at: mov.created_at }, { status: 201 });
  } else {
    const [mov] = await sql`
      INSERT INTO alissonerp.movimentacoes_estoque_comercial
        (produto_id, tipo, quantidade, motivo, observacao, created_by, created_at)
      VALUES
        (${produto_id}, ${tipo}, ${quantidade}, ${motivo}, ${observacao ?? null}, ${user.id},
         ${tsCustom ? tsCustom.toISOString() : sql`now()`})
      RETURNING id, created_at
    `;
    return NextResponse.json({ id: mov.id, created_at: mov.created_at }, { status: 201 });
  }
}
