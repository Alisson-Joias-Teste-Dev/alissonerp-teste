import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";
import { zodError } from "@/lib/schemas/common";
import { invalidarCachePermissoesUsuario } from "@/lib/permissoes";

const ACOES_VALIDAS = ["abrir_purificacao", "concluir_purificacao", "abrir_ligacao", "concluir_ligacao", "editar_teor_ligacao"] as const;

const PermissoesUsuarioPatchSchema = z.object({
  user_id: z.string().uuid("UUID inválido"),
  permissoes: z.record(z.string(), z.boolean()),
}).passthrough();

// GET /api/configuracoes/permissoes-usuario?user_id=UUID
export async function GET(req: NextRequest) {
  const user_id = req.nextUrl.searchParams.get("user_id");
  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 });
  }

  const rows = await sql`
    SELECT acao, permitido
    FROM alissonerp.permissoes_usuario
    WHERE usuario_id = ${user_id}::uuid
  `;

  const permissoes: Record<string, boolean> = {};
  for (const acao of ACOES_VALIDAS) {
    const found = rows.find(r => r.acao === acao);
    permissoes[acao] = found ? (found.permitido as boolean) : false;
  }

  return NextResponse.json({ permissoes });
}

// PATCH /api/configuracoes/permissoes-usuario
// Body: { user_id: UUID, permissoes: { abrir_purificacao: true, ... } }
export async function PATCH(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  // Só admin/desenvolvedor podem alterar permissões de outros
  const [caller] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!caller || !isFullAccess(caller.role as string)) {
    return NextResponse.json(
      { error: "Somente admin e desenvolvedor podem alterar permissões." },
      { status: 403 },
    );
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = PermissoesUsuarioPatchSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { user_id, permissoes } = parsed.data;

  for (const [acao, permitido] of Object.entries(permissoes)) {
    if (!ACOES_VALIDAS.includes(acao as typeof ACOES_VALIDAS[number])) continue;
    await sql`
      INSERT INTO alissonerp.permissoes_usuario (usuario_id, acao, permitido)
      VALUES (${user_id}::uuid, ${acao}, ${permitido})
      ON CONFLICT (usuario_id, acao)
      DO UPDATE SET permitido = ${permitido}, updated_at = now()
    `;
  }

  // INVALIDACAO DE CACHE: temPermissao guarda a resposta por 60s (cache-memoria).
  // Sem esta linha, a permissao recem-salva no painel so valeria depois de 60s
  // e o operador acharia que o sistema ignorou a mudanca.
  invalidarCachePermissoesUsuario(user_id);

  return NextResponse.json({ ok: true });
}
