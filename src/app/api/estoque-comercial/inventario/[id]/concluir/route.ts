import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

interface Params { params: Promise<{ id: string }> }

const ROLES_GERENTES = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja"];

// POST /api/estoque-comercial/inventario/[id]/concluir
// Finaliza inventário e gera ajustes automáticos para divergências
export async function POST(
  _req: NextRequest,
  { params }: Params
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  if (!usuario || !ROLES_GERENTES.includes(usuario.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const invId = Number(id);

  const [inv] = await sql`
    SELECT id, status, local_estoque_id
    FROM alissonerp.inventarios_comercial WHERE id = ${invId}
  `;
  if (!inv) return NextResponse.json({ error: "Inventário não encontrado" }, { status: 404 });
  if (inv.status === 'concluido') {
    return NextResponse.json({ error: "Inventário já concluído" }, { status: 409 });
  }
  if (inv.status === 'cancelado') {
    return NextResponse.json({ error: "Inventário cancelado" }, { status: 409 });
  }

  // Verificar se todos os itens foram contados
  const [naoContados] = await sql`
    SELECT COUNT(*) AS total
    FROM alissonerp.itens_inventario_comercial
    WHERE inventario_id = ${invId} AND quantidade_contada IS NULL
  `;
  if (Number(naoContados.total) > 0) {
    return NextResponse.json(
      { error: `Ainda existem ${naoContados.total} itens não contados` },
      { status: 409 }
    );
  }

  // Gerar ajustes para divergências
  const divergentes = await sql`
    SELECT id, produto_id, diferenca
    FROM alissonerp.itens_inventario_comercial
    WHERE inventario_id = ${invId} AND diferenca != 0
  `;

  let ajustes = 0;
  for (const item of divergentes) {
    const diff = Number(item.diferenca);
    const tipo = diff > 0 ? 'entrada' : 'saida';
    const quantidade = Math.abs(diff);

    const [mov] = await sql`
      INSERT INTO alissonerp.movimentacoes_estoque_comercial
        (produto_id, tipo, quantidade, motivo, local_estoque_id, status,
         referencia_id, referencia_tipo, observacao, created_by)
      VALUES
        (${item.produto_id}, ${tipo}, ${quantidade}, 'inventario',
         ${inv.local_estoque_id}, 'efetivado',
         ${invId}, 'inventarios_comercial',
         ${'Ajuste inventário #' + invId + ' — diferença: ' + (diff > 0 ? '+' : '') + diff},
         ${user.id})
      RETURNING id
    `;

    // Vincular ajuste ao item
    await sql`
      UPDATE alissonerp.itens_inventario_comercial
      SET movimento_ajuste_id = ${mov.id}
      WHERE id = ${item.id}
    `;

    ajustes++;
  }

  // Concluir inventário
  await sql`
    UPDATE alissonerp.inventarios_comercial
    SET status = 'concluido', data_conclusao = now(), concluido_por = ${user.id}
    WHERE id = ${invId}
  `;

  return NextResponse.json({
    id: invId,
    ajustes_gerados: ajustes,
    total_divergentes: divergentes.length,
  });
}
