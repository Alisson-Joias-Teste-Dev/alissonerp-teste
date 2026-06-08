// ═══════════════════════════════════════════════════════════════════════════
// TASK-006+007: GET/PUT /api/metal/configuracoes
//
// REGRA DE NEGÓCIO: Configurações do módulo metal armazenadas em
// alissonerp.configuracoes_sistema. PUT restrito a admin/desenvolvedor.
// ═══════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authOr401 } from "@/lib/auth-server";
import { internalError } from "@/lib/api-error";
import { getModuloConfig, updateModuloConfig } from "@/lib/metal/config";

const ROLES_FULL_ACCESS = ["desenvolvedor", "admin"];

// REGRA DE NEGÓCIO: configurações do Metal precisam refletir o banco sempre.
// O QUE: força esta API a não ser cacheada/estática pelo Next.js.
// POR QUE: `metal_home_roles` controla redirecionamento na abertura do sistema;
//   se o GET vier cacheado, a tela mostra roles desmarcadas após salvar.
// IMPACTO SE REMOVIDO: usuário salva configuração, mas recarrega a tela e vê
//   estado antigo, quebrando a confiança na configuração.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const ConfigUpdateSchema = z.object({
  compra_metal_min_pct: z.number().min(0).max(100).optional(),
  compra_metal_max_pct: z.number().min(0).max(100).optional(),
  compra_metal_comm_pct: z.number().min(0).max(100).optional(),
  receb_metal_min_pct: z.number().min(0).max(100).optional(),
  receb_metal_max_pct: z.number().min(0).max(100).optional(),
  metal_aprovador_id: z.string().optional(),
  // REGRA DE NEGÓCIO: Admin define quais roles abrem o sistema direto no /metal.
  // Array vazio = ninguém é redirecionado.
  metal_home_roles: z.array(z.string()).optional(),
});

export async function GET() {
  try {
    const config = await getModuloConfig();
    return NextResponse.json(config);
  } catch (err) {
    return internalError("[GET /api/metal/configuracoes]", err);
  }
}

export async function PUT(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!ROLES_FULL_ACCESS.includes(user.role)) {
    return NextResponse.json({ error: "Sem permissão. Apenas admin ou desenvolvedor." }, { status: 403 });
  }

  try {
    const raw = await req.json().catch(() => ({}));
    const parsed = ConfigUpdateSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });
    }
    const config = await updateModuloConfig(parsed.data);
    return NextResponse.json(config);
  } catch (err) {
    return internalError("[PUT /api/metal/configuracoes]", err);
  }
}
