import sql from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { authOr401 } from "@/lib/auth-server";

interface UpdateBody {
  situacao: string;
  parecer?: string | null;
  motivo_reprovacao?: string | null;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ auditoriaId: string }> }
) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  void user;

  const { auditoriaId } = await params;
  const id = parseInt(auditoriaId);
  if (isNaN(id)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  let body: UpdateBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const { situacao, parecer, motivo_reprovacao } = body;

  if (!situacao) {
    return NextResponse.json({ error: "situacao é obrigatório" }, { status: 400 });
  }

  const rows = await sql`
    UPDATE alissonerp.auditorias
    SET
      situacao            = ${situacao},
      parecer             = ${parecer ?? null},
      motivo_reprovacao   = ${motivo_reprovacao ?? null},
      data_conclusao      = CASE WHEN ${situacao} IN ('aprovado','reprovado') THEN now() ELSE data_conclusao END
    WHERE id = ${id}
    RETURNING id, situacao
  `;

  if (rows.length === 0) {
    return NextResponse.json({ error: "Auditoria não encontrada" }, { status: 404 });
  }

  return NextResponse.json(rows[0]);
}
