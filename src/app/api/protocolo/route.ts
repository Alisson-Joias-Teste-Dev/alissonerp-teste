import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

// GET /api/protocolo?user_id=UUID — lista protocolos do motoboy (ou todos se todos=true)
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("user_id");
  const todos = req.nextUrl.searchParams.get("todos") === "true";

  const rows = todos
    ? await sql`
        SELECT p.id, p.direcao::text, p.etapas::text, p.created_at,
          (SELECT count(*)::int FROM alissonerp.protocolo_ordens po WHERE po.protocolo_id = p.id) AS total_ordens
        FROM alissonerp.protocolos p
        ORDER BY p.created_at DESC LIMIT 50
      `
    : await sql`
        SELECT p.id, p.direcao::text, p.etapas::text, p.created_at,
          (SELECT count(*)::int FROM alissonerp.protocolo_ordens po WHERE po.protocolo_id = p.id) AS total_ordens
        FROM alissonerp.protocolos p
        WHERE p.created_by = ${userId}::uuid OR p.motoboy_id = ${userId}::uuid
        ORDER BY p.created_at DESC LIMIT 50
      `;

  return NextResponse.json(rows);
}

// POST /api/protocolo — cria protocolo + vincula ordens
export async function POST(req: NextRequest) {
  const { direcao, ordem_ids, motoboy_id, foto_criacao, user_id } = await req.json() as {
    direcao: "ida" | "volta";
    ordem_ids: number[];
    motoboy_id?: string;
    foto_criacao?: string;
    user_id?: string;
  };

  if (!direcao || !Array.isArray(ordem_ids) || ordem_ids.length === 0) {
    return NextResponse.json({ error: "Parâmetros inválidos" }, { status: 400 });
  }

  const [prot] = await sql`
    INSERT INTO alissonerp.protocolos (direcao, etapas, motoboy_id, foto_criacao, created_by)
    VALUES (
      ${direcao}, 'pendente',
      ${motoboy_id ?? null}::uuid,
      ${foto_criacao ?? null},
      ${user_id ?? null}::uuid
    )
    RETURNING id
  `;

  const rows = ordem_ids.map((ordem_id) => ({ protocolo_id: prot.id, ordem_id }));
  await sql`INSERT INTO alissonerp.protocolo_ordens ${sql(rows)}`;

  return NextResponse.json({ id: prot.id });
}
