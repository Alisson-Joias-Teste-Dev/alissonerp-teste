import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authOr401 } from "@/lib/auth-server";
import { uploadFile } from "@/lib/storage";
import { zodError } from "@/lib/schemas/common";
import { internalError } from "@/lib/api-error";

/**
 * REGRA DE NEGÓCIO: Upload de foto da balança para Produto Upgrade.
 * O QUE: Recebe base64 da foto da balança, faz upload para o bucket
 * pagamento-fotos no path upgrade/balanca/{timestamp}.jpg e retorna o path.
 * POR QUE: A foto é obrigatória no fluxo de upgrade (rastreabilidade do
 * metal recebido do cliente). O upload é feito antes de salvar a venda
 * para que o path já esteja disponível no momento do POST /api/vendas.
 * IMPACTO SE REMOVIDO: Não há como anexar foto ao item upgrade na venda,
 * quebrando a obrigatoriedade do campo.
 */

const UpgradeFotoSchema = z.object({
  foto_base64: z.string().min(1, "foto_base64 é obrigatória"),
  content_type: z.string().optional().default("image/jpeg"),
});

// POST /api/produtos/upgrade/foto
export async function POST(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;

  const raw = await req.json().catch(() => null);
  if (!raw) return NextResponse.json({ error: "JSON inválido" }, { status: 400 });

  const parsed = UpgradeFotoSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);

  const { foto_base64, content_type } = parsed.data;

  try {
    const ts = Date.now();
    const path = `upgrade/balanca/${ts}.jpg`;

    const result = await uploadFile("pagamento-fotos", path, foto_base64, content_type);

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ ok: true, path: result.path, url: result.url }, { status: 201 });
  } catch (err) {
    return internalError("[POST /api/produtos/upgrade/foto]", err, "Erro ao fazer upload da foto");
  }
}
