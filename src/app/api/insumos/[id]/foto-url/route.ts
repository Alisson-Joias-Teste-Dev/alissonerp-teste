import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { getPublicUrl } from "@/lib/storage";
import { authOr401 } from "@/lib/auth-server";

// GET /api/insumos/[id]/foto-url
// Retorna URL pública para a foto do insumo (bucket público insumo-fotos)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [, errRes] = await authOr401(req);
  if (errRes) return errRes;

  const { id: rawId } = await params;
  const id = parseInt(rawId);
  if (isNaN(id)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const [row] = await sql`SELECT foto FROM alissonerp.insumos WHERE id = ${id}`;
  if (!row?.foto) return NextResponse.json({ url: null });

  // Se foto já é URL completa (migração nova), retornar direto
  const url = (row.foto as string).startsWith("http")
    ? row.foto as string
    : getPublicUrl("insumo-fotos", row.foto as string);

  return NextResponse.json({ url });
}
