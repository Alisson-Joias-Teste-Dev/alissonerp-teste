import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

// GET /api/protocolo?user_id=UUID — lista protocolos do motoboy (ou todos se todos=true)
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("user_id");
  const todos = req.nextUrl.searchParams.get("todos") === "true";

  const rows = todos
    ? await sql`
        SELECT p.id, p.direcao::text, p.etapas::text, p.created_at, p.tipo_protocolo,
          (SELECT count(*)::int FROM alissonerp.protocolo_ordens po WHERE po.protocolo_id = p.id) AS total_ordens
        FROM alissonerp.protocolos p
        ORDER BY p.created_at DESC LIMIT 50
      `
    : await sql`
        SELECT p.id, p.direcao::text, p.etapas::text, p.created_at, p.tipo_protocolo,
          (SELECT count(*)::int FROM alissonerp.protocolo_ordens po WHERE po.protocolo_id = p.id) AS total_ordens
        FROM alissonerp.protocolos p
        WHERE p.created_by = ${userId}::uuid OR p.motoboy_id = ${userId}::uuid
        ORDER BY p.created_at DESC LIMIT 50
      `;

  return NextResponse.json(rows);
}

// POST /api/protocolo — cria protocolo + vincula ordens
export async function POST(req: NextRequest) {
  const { direcao, ordem_ids, motoboy_id, foto_criacao, user_id, tipo_protocolo } = await req.json() as {
    direcao: "ida" | "volta";
    ordem_ids: number[];
    motoboy_id?: string;
    foto_criacao?: string;
    user_id?: string;
    tipo_protocolo?: string;
  };

  if (!direcao || !Array.isArray(ordem_ids) || ordem_ids.length === 0) {
    return NextResponse.json({ error: "Parâmetros inválidos" }, { status: 400 });
  }

  const tipoFinal = tipo_protocolo ?? "fabrica";

  // Validar permissão do usuário (admin/dev ignoram)
  if (user_id) {
    const [usuario] = await sql`
      SELECT role::text AS role, tipos_protocolo_permitidos
      FROM alissonerp.usuarios
      WHERE id = ${user_id}::uuid
    `;

    if (usuario) {
      const role = usuario.role as string;
      const tiposPermitidos: string[] = usuario.tipos_protocolo_permitidos ?? [];

      if (!["admin", "desenvolvedor"].includes(role)) {
        if (!tiposPermitidos.includes(tipoFinal)) {
          return NextResponse.json(
            { error: `Sem permissão para criar protocolo ${tipoFinal}` },
            { status: 403 }
          );
        }
      }
    }
  }

  const [prot] = await sql`
    INSERT INTO alissonerp.protocolos (direcao, etapas, motoboy_id, foto_criacao, created_by, tipo_protocolo)
    VALUES (
      ${direcao}, 'pendente',
      ${motoboy_id ?? null}::uuid,
      ${foto_criacao ?? null},
      ${user_id ?? null}::uuid,
      ${tipoFinal}
    )
    RETURNING id
  `;

  const rows = ordem_ids.map((ordem_id) => ({ protocolo_id: prot.id, ordem_id }));
  await sql`INSERT INTO alissonerp.protocolo_ordens ${sql(rows)}`;

  return NextResponse.json({ id: prot.id });
}
