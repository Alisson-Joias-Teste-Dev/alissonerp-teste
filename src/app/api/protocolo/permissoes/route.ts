import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";

const FULL_ACCESS = ["admin", "desenvolvedor"] as const;

/**
 * REGRA DE NEGÓCIO: front exclusivo do motoboy deve usar as MESMAS regras de
 * tipos de protocolo permitidos do módulo principal.
 *
 * O QUE: retorna `tipos_permitidos` baseado em `usuarios.tipos_protocolo_permitidos`
 *   (com bypass para admin/desenvolvedor).
 * POR QUE: evita hardcode no front mobile e mantém consistência de permissão
 *   entre telas de protocolo.
 * IMPACTO SE REMOVIDO: motoboy pode oferecer tipo inválido e receber 403 no POST.
 */
export async function GET(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;

  const userId = req.nextUrl.searchParams.get("user_id") ?? user.id;

  const [usuario] = await sql`
    SELECT role::text AS role, tipos_protocolo_permitidos
    FROM alissonerp.usuarios
    WHERE id = ${userId}::uuid
    LIMIT 1
  `;

  if (!usuario) {
    return NextResponse.json({ tipos_permitidos: [] });
  }

  const tipos = FULL_ACCESS.includes(usuario.role as any)
    ? ["fabrica", "service"]
    : (Array.isArray(usuario.tipos_protocolo_permitidos)
      ? usuario.tipos_protocolo_permitidos
      : []);

  return NextResponse.json({ tipos_permitidos: tipos });
}
