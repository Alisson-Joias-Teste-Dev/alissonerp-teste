import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { ForbiddenError } from "@/lib/auth-server";
import { requireCrediarioOwnership, NotFoundError } from "@/lib/auth-vendas";
import { LIMITS, checkStringLength, payloadTooLargeResponse } from "@/lib/payload-limits";
import { zodError } from "@/lib/schemas/common";

const ROLES_CREDIARIO = ["desenvolvedor", "admin", "gerente_loja", "consultora"];
const TIPOS_VALIDOS = ["aviso_recebimento", "cobranca", "observacao"] as const;

const ComunicacaoSchema = z.object({
  tipo: z.enum(TIPOS_VALIDOS).optional(),
  mensagem: z.string().min(1, "mensagem obrigatoria").max(LIMITS.MENSAGEM_MAX),
});

// POST /api/crediario/[id]/comunicacao
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const contaId = Number(id);
  if (isNaN(contaId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const [usuario] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario || !ROLES_CREDIARIO.includes(usuario.role as string)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = ComunicacaoSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const tipo = parsed.data.tipo ?? "observacao";
  const mensagem = parsed.data.mensagem.trim();

  // Guard de tamanho (defesa em profundidade — zod ja limita, mas mantemos
  // o helper pra retornar 413 explicito quando alguem desabilita o schema).
  try {
    checkStringLength("mensagem", mensagem, LIMITS.MENSAGEM_MAX);
  } catch (e) {
    const r = payloadTooLargeResponse(e);
    if (r) return r;
    throw e;
  }

  if (!mensagem) {
    return NextResponse.json({ error: "mensagem obrigatória" }, { status: 400 });
  }

  // Verificar que conta existe + Onda 1D: consultora so opera em conta propria
  const [conta] = await sql`SELECT id FROM alissonerp.contas_receber WHERE id = ${contaId}`;
  if (!conta) return NextResponse.json({ error: "Conta não encontrada" }, { status: 404 });
  try {
    await requireCrediarioOwnership({ id: user.id, role: usuario.role as string, email: user.email ?? "" }, contaId);
  } catch (e) {
    if (e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const [nova] = await sql`
    INSERT INTO alissonerp.comunicacoes_crediario (conta_receber_id, tipo, mensagem, usuario_id)
    VALUES (${contaId}, ${tipo}, ${mensagem}, ${user.id}::uuid)
    RETURNING id, tipo, mensagem, created_at
  `;

  return NextResponse.json(nova, { status: 201 });
}
