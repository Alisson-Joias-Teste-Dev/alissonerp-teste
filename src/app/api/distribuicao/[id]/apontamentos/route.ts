import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";
import { temAcessoModulo } from "@/lib/permissoes";

// GET /api/distribuicao/[id]/apontamentos — histórico de apontamentos da distribuição
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!(await temAcessoModulo(user.role, "distribuicao", "ler"))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const rows = await sql`
    SELECT
      a.id,
      a.qtd,
      a.created_at,
      a.foto_balanca,
      a.tipo_apontamento_id,
      d.nome        AS deposito_nome,
      s.nome        AS setor_nome,
      i.nome        AS insumo_nome,
      i.unidade,
      i.categoria_id,
      i.peso_pedra,
      ta.descricao  AS tipo_nome,
      up.name       AS criado_por_nome,
      up.avatar_url AS criado_por_foto
    FROM alissonerp.apontamentos_distribuicao a
    LEFT JOIN alissonerp.depositos d             ON d.id    = a.deposito_id
    LEFT JOIN alissonerp.setores s               ON s.id    = a.setor_id
    LEFT JOIN alissonerp.insumos i               ON i.id    = a.insumo_id
    LEFT JOIN alissonerp.tipos_apontamento ta    ON ta.id   = a.tipo_apontamento_id
    LEFT JOIN public.user_profiles up            ON up.id_user = a.created_by
    WHERE a.distribuicao_id = ${parseInt(id)}
    ORDER BY a.created_at DESC
  `;
  return NextResponse.json(rows);
}
