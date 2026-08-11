import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

// GET /api/user/permissoes?user_id=UUID
// Retorna os módulos que o usuário pode acessar, conforme role_permissoes
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("user_id");
  if (!userId) return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 });

  // Verificar sessão: apenas o próprio usuário pode consultar suas permissões
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (user.id !== userId) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  // Buscar role + flag service na fonte de verdade (não user_metadata — pode estar desatualizado)
  const [usuario] = await sql`
    SELECT role, is_operador_service, ativo FROM alissonerp.usuarios WHERE id = ${userId}::uuid
  `;
  if (!usuario) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
  // BLINDAGEM: usuario desativado nao pode acessar o ERP (useAuth detecta 403 e signOut).
  if (usuario.ativo === false) {
    return NextResponse.json({ error: "Usuário desativado. Contate o administrador." }, { status: 403 });
  }

  const role = usuario.role as string;

  // Buscar permissões da role
  const rows = await sql`
    SELECT modulo, pode_ler, pode_escrever
    FROM alissonerp.role_permissoes
    WHERE role = ${role}
  `;

  const modulos_leitura  = rows.filter(p => p.pode_ler).map(p => p.modulo as string);
  const modulos_escrita  = rows.filter(p => p.pode_escrever).map(p => p.modulo as string);

  // is_vendedora: existe vendedora ATIVA ligada a este usuário?
  //
  // O PORQUÊ: é o que faz aparecer "Minha comissão" no menu (03/08/2026). Não dá
  // pra deduzir pelo papel — a Germana é `gerente_loja` e É vendedora, a Geovana
  // é `gerente_loja` e NÃO é. Mostrar por papel colocaria no menu da Geovana um
  // atalho que só a devolveria pra home.
  const [vend] = await sql`
    SELECT 1 FROM public.vendedores
    WHERE user_id = ${userId}::uuid AND situacao = 'Ativo' LIMIT 1
  `;

  return NextResponse.json({
    role, modulos_leitura, modulos_escrita,
    is_operador_service: usuario.is_operador_service ?? false,
    is_vendedora: !!vend,
  });
}
