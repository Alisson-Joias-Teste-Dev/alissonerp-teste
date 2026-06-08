// ═══════════════════════════════════════════════════════════════════════════
// TASK-012: POST /api/metal/compras/[id]/verificar
//
// REGRA DE NEGÓCIO: Confirma pagamento com comprovante obrigatório.
// A empresa (Alisson Joias) já pagou o fornecedor via Mercado Pago.
// NÃO consulta a API do MP. Só exige comprovante (foto/PDF).
// O pagamento é registrado como definitivo (confirmado_manual)
// e a compra é confirmada automaticamente.
// ═══════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authOr401 } from "@/lib/auth-server";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { internalError } from "@/lib/api-error";
import { verificarPagamentoCompra } from "@/lib/metal/compras";
import { uploadFile } from "@/lib/storage";
import { ROLES_METAL } from "@/lib/roles";

const VerificarBodySchema = z.object({
  comprovante_base64: z.string().min(1, "Comprovante é obrigatório"),
  comprovante_media_type: z.string().default("image/jpeg"),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!ROLES_METAL.includes(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  try {
    rateLimit(`metal-compra-verificar:${user.id}`, 5, 60_000);
  } catch (e) {
    const r = rateLimitResponse(e);
    if (r) return r;
    throw e;
  }

  try {
    const { id } = await params;
    const compraId = Number(id);

    const raw = await req.json().catch(() => ({}));
    const parsed = VerificarBodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map((i) => i.message).join("; ") },
        { status: 400 },
      );
    }

    const { comprovante_base64, comprovante_media_type } = parsed.data;

    // Upload do comprovante no bucket pagamento-fotos
    const ext = comprovante_media_type.split("/")[1] || "jpg";
    const ts = Date.now();
    const uploadResult = await uploadFile(
      "pagamento-fotos",
      `metal/comprovantes/${compraId}/${ts}.${ext}`,
      comprovante_base64,
      comprovante_media_type,
    );

    if (typeof uploadResult === "object" && "error" in uploadResult) {
      return NextResponse.json(
        { error: `Erro ao enviar comprovante: ${uploadResult.error}` },
        { status: 500 },
      );
    }

    const comprovantePath = (uploadResult as { url: string }).url;

    const result = await verificarPagamentoCompra(compraId, comprovantePath);
    return NextResponse.json({ compra_id: compraId, ...result });
  } catch (err) {
    return internalError("[POST /api/metal/compras/[id]/verificar]", err, (err as Error).message, 400);
  }
}
