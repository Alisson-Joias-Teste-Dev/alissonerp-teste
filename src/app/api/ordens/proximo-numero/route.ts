import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";

// GET /api/ordens/proximo-numero
// Retorna o próximo numero_ordem (C-XXXX) sem criar a ordem.
// Usado para exibir preview antes de confirmar criação.
export async function GET(req: NextRequest) {
  const [, errRes] = await authOr401(req);
  if (errRes) return errRes;

  const [{ max_id_ali: maxAlisson }] = await sql`
    SELECT COALESCE(MAX(id), 0) AS max_id_ali FROM alissonerp.ordens
  `;
  const [{ max_id_dir: maxDirectus }] = await sql`
    SELECT COALESCE(MAX(id), 0) AS max_id_dir FROM directus.ordens
  `;
  const nextNum = Math.max(Number(maxAlisson), Number(maxDirectus)) + 1;
  const numero  = `C-${String(nextNum).padStart(4, "0")}`;
  return NextResponse.json({ numero });
}
