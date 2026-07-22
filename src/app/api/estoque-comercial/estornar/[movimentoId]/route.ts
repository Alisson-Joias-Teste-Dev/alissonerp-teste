import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isMasterAdmin } from "@/lib/master-admin";
import { MOTIVO_PERDA } from "@/lib/perda-extravio";
import { zodError } from "@/lib/schemas/common";

interface Params { params: Promise<{ movimentoId: string }> }

// BLINDAGEM (v2.81.2): estorno cria movimento reverso (mexe no saldo) —
// baixa/ajuste manual é exclusivo do administrador (casos excepcionais).
const ROLES_PERMITIDOS = ["desenvolvedor", "admin"];

const EstornarPostSchema = z.object({
  observacao: z.string().optional(),
}).passthrough();

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
  const raw = await req.json().catch(() => ({}));
  const parsed = EstornarPostSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;

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

  // BLINDAGEM: estorno de PERDA/EXTRAVIO devolve a peça ao estoque — é a mesma
  // decisão da baixa, ao contrário. Se ficasse liberado para admin/desenvolvedor
  // (como os demais estornos), qualquer um dos 7 admins desfaria a baixa do dono
  // e a trava de "só o master registra perda" vazaria pelo outro lado.
  // IMPACTO SE REMOVIDO: perda vira reversível por quem não pode registrá-la.
  if (original.motivo === MOTIVO_PERDA && !(await isMasterAdmin(user.id))) {
    return NextResponse.json(
      { error: "Somente o administrador master pode estornar uma perda/extravio" },
      { status: 403 },
    );
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
