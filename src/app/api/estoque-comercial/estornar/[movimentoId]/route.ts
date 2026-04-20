import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

interface Params { params: Promise<{ movimentoId: string }> }

const ROLES_PERMITIDOS = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja"];

// POST /api/estoque-comercial/estornar/[movimentoId]
// Estorna um movimento manual (cria movimento reverso rastreável)
export async function POST(
  req: NextRequest,
  { params }: Params
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  if (!usuario || !ROLES_PERMITIDOS.includes(usuario.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { movimentoId } = await params;
  const movId = Number(movimentoId);
  const body = await req.json().catch(() => ({})) as { observacao?: string };

  // Buscar movimento original
  const [original] = await sql`
    SELECT id, produto_id, tipo, quantidade, motivo, local_estoque_id, status, estornado_por_id
    FROM alissonerp.movimentacoes_estoque_comercial
    WHERE id = ${movId}
  `;
  if (!original) return NextResponse.json({ error: "Movimento não encontrado" }, { status: 404 });
  if (original.status === 'estornado') {
    return NextResponse.json({ error: "Movimento já foi estornado" }, { status: 409 });
  }
  if (original.estornado_por_id) {
    return NextResponse.json({ error: "Movimento já possui estorno" }, { status: 409 });
  }

  // Tipo reverso: entrada vira saida, saida vira entrada
  const tipoReverso = original.tipo === 'entrada' ? 'saida' : 'entrada';

  // Se for estorno de saída (devolver), verificar... não precisa, sempre pode devolver
  // Se for estorno de entrada (retirar), verificar saldo
  if (tipoReverso === 'saida') {
    const [saldo] = await sql`
      SELECT COALESCE(SUM(disponivel), 0) AS disponivel
      FROM alissonerp.vw_saldo_estoque_comercial_v2
      WHERE produto_id = ${original.produto_id} AND local_estoque_id = ${original.local_estoque_id}
    `;
    if (Number(saldo?.disponivel ?? 0) < Number(original.quantidade)) {
      return NextResponse.json(
        { error: `Saldo insuficiente para estornar. Disponível: ${saldo?.disponivel ?? 0}` },
        { status: 409 }
      );
    }
  }

  // Criar movimento reverso
  const [reverso] = await sql`
    INSERT INTO alissonerp.movimentacoes_estoque_comercial
      (produto_id, tipo, quantidade, motivo, local_estoque_id, status,
       estorno_de_id, observacao, created_by)
    VALUES
      (${original.produto_id}, ${tipoReverso}, ${original.quantidade}, 'estorno',
       ${original.local_estoque_id}, 'efetivado', ${movId},
       ${body.observacao ?? 'Estorno manual do movimento #' + movId}, ${user.id})
    RETURNING id, created_at
  `;

  // Marcar original como estornado
  await sql`
    UPDATE alissonerp.movimentacoes_estoque_comercial
    SET estornado_por_id = ${reverso.id}, status = 'estornado'
    WHERE id = ${movId}
  `;

  return NextResponse.json({
    id: reverso.id,
    estorno_de_id: movId,
    created_at: reverso.created_at
  }, { status: 201 });
}
