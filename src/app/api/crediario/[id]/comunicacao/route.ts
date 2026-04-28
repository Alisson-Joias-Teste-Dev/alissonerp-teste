import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

const ROLES_CREDIARIO = ["desenvolvedor", "admin", "gerente_loja", "consultora"];
const TIPOS_VALIDOS = ["aviso_recebimento", "cobranca", "observacao"] as const;

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

  const body = await req.json() as { tipo?: string; mensagem?: string };
  const tipo = body?.tipo ?? "observacao";
  const mensagem = (body?.mensagem ?? "").trim();

  if (!TIPOS_VALIDOS.includes(tipo as typeof TIPOS_VALIDOS[number])) {
    return NextResponse.json({ error: `tipo inválido. Use: ${TIPOS_VALIDOS.join(", ")}` }, { status: 400 });
  }
  if (!mensagem) {
    return NextResponse.json({ error: "mensagem obrigatória" }, { status: 400 });
  }

  // Verificar que conta existe
  const [conta] = await sql`SELECT id FROM alissonerp.contas_receber WHERE id = ${contaId}`;
  if (!conta) return NextResponse.json({ error: "Conta não encontrada" }, { status: 404 });

  const [nova] = await sql`
    INSERT INTO alissonerp.comunicacoes_crediario (conta_receber_id, tipo, mensagem, usuario_id)
    VALUES (${contaId}, ${tipo}, ${mensagem}, ${user.id}::uuid)
    RETURNING id, tipo, mensagem, created_at
  `;

  return NextResponse.json(nova, { status: 201 });
}
