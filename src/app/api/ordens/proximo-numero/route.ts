import { NextResponse } from "next/server";
import sql from "@/lib/db";

// GET /api/ordens/proximo-numero
// Retorna o próximo numero_ordem (C-XXXX) sem criar a ordem.
// Usado para exibir preview antes de confirmar criação.
export async function GET() {
  const [{ max_num: maxAlisson }] = await sql`
    SELECT COALESCE(MAX(CAST(SUBSTRING(numero_ordem FROM 3) AS INTEGER)), 0) AS max_num
    FROM alissonerp.ordens
    WHERE numero_ordem ~ '^C-[0-9]+$'
  `;
  const [{ max_num: maxDirectus }] = await sql`
    SELECT COALESCE(MAX(CAST(SUBSTRING(numero_ordem FROM 3) AS INTEGER)), 0) AS max_num
    FROM directus.ordens
    WHERE numero_ordem ~ '^C-[0-9]+$'
  `;
  const nextNum = Math.max(Number(maxAlisson), Number(maxDirectus)) + 1;
  const numero  = `C-${String(nextNum).padStart(4, "0")}`;
  return NextResponse.json({ numero });
}
