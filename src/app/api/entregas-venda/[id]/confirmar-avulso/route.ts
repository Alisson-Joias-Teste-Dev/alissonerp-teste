/**
 * POST /api/entregas-venda/[id]/confirmar-avulso
 *
 * Confirma um frete avulso sem código de verificação.
 *
 * REGRA DE NEGÓCIO: avulso não usa código A/B — o motoboy clica "Confirmar"
 * no app. Apenas o motoboy dono da entrega OU admin/gerente/desenvolvedor
 * podem confirmar. Entrega vai de 'pendente' para 'confirmada' e entra
 * no acerto financeiro do motoboy.
 *
 * IMPACTO SE ALTERADO: esta rota é exclusiva para is_avulso=true.
 * Entregas normais continuam usando /confirmar com código de verificação.
 *
 * FOTOS (migration 357 — decisão Jonathan 21/07): body aceita fotos_base64
 * OPCIONAL (várias, até MAX_FOTOS_ENTREGA) — comprovante da corrida avulsa,
 * mesmo padrão de /confirmar. Nunca bloqueia a finalização.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import sql from "@/lib/db";
import { confirmarFreteAvulso, MAX_FOTOS_ENTREGA } from "@/lib/entrega-venda";
import { zodError } from "@/lib/schemas/common";
import { LIMITS, checkArrayLength, checkBase64Length, payloadTooLargeResponse } from "@/lib/payload-limits";

const ConfirmarAvulsoSchema = z.object({
  fotos_base64: z.array(z.string().max(LIMITS.IMAGE_BASE64_MAX)).max(MAX_FOTOS_ENTREGA).optional(),
});

// REGRA: motoboy só confirma a própria corrida; admin/gerente confirma qualquer uma
const ROLES_ADMIN = ["desenvolvedor", "admin", "gerente_loja"];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const entregaId = Number(id);
  if (!entregaId || isNaN(entregaId)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const [usuario] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const isAdmin = ROLES_ADMIN.includes(usuario.role as string);
  // REGRA: role 'entregador' é o motoboy do app; 'motoboy' é protocolista.
  // Ambos podem confirmar a própria corrida; admin confirma qualquer uma.
  const isMotoboy = usuario.role === "entregador" || usuario.role === "motoboy";

  if (!isAdmin && !isMotoboy) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  // Motoboy só pode confirmar a própria corrida
  if (isMotoboy) {
    const [entrega] = await sql`
      SELECT motoboy_id, is_avulso, created_by
      FROM alissonerp.entregas_venda
      WHERE id = ${entregaId} LIMIT 1
    `;
    if (!entrega) return NextResponse.json({ error: "Entrega não encontrada" }, { status: 404 });
    if (!entrega.is_avulso) return NextResponse.json({ error: "Entrega não é avulsa" }, { status: 400 });
    if (String(entrega.motoboy_id) !== user.id) {
      return NextResponse.json({ error: "Você não é o motoboy desta entrega" }, { status: 403 });
    }
    // REGRA DE NEGÓCIO (anti-fraude): corrida que o PRÓPRIO motoboy registrou
    // fica pendente de confirmação da LOJA — ele não confirma o próprio
    // lançamento. Avulso criado pela loja e atribuído a ele segue confirmável
    // por ele no app (created_by != motoboy).
    if (String(entrega.created_by) === user.id) {
      return NextResponse.json(
        { error: "Corrida registrada por você aguarda confirmação da loja." },
        { status: 403 },
      );
    }
  }

  // Body opcional — fotos_base64 (comprovante). Corpo vazio/ausente é válido
  // (nada obrigatório aqui; a checagem de estado da corrida é feita na lib).
  const raw = await req.json().catch(() => ({}));
  const parsed = ConfirmarAvulsoSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { fotos_base64 } = parsed.data;

  if (fotos_base64) {
    try {
      checkArrayLength("fotos_base64", fotos_base64, MAX_FOTOS_ENTREGA);
      fotos_base64.forEach((f, i) => checkBase64Length(`fotos_base64[${i}]`, f, LIMITS.IMAGE_BASE64_MAX));
    } catch (e) {
      const r = payloadTooLargeResponse(e);
      if (r) return r;
      throw e;
    }
  }

  try {
    await confirmarFreteAvulso(entregaId, user.id, fotos_base64);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao confirmar";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
