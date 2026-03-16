import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";

const MODULOS = [
  "dashboard","dashboard_fabrica","ordens","pcp","distribuicao","estoque",
  "quebra","insumos","compras","protocolo","conferencia","entrega",
  "auditoria","vendas","financeiro","produtos","precificacao","configuracoes",
] as const;

async function authCheck() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const role = user.user_metadata?.role as string | undefined;
  if (!isFullAccess(role)) return null;
  return user;
}

// GET /api/configuracoes/roles — lista todas as roles
export async function GET() {
  const user = await authCheck();
  if (!user) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const roles = await sql`
    SELECT nome, descricao, ativo, criado_em
    FROM alissonerp.roles
    ORDER BY
      CASE nome WHEN 'desenvolvedor' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
      nome
  `;

  return NextResponse.json({ roles });
}

// POST /api/configuracoes/roles — criar nova role
export async function POST(req: NextRequest) {
  const user = await authCheck();
  if (!user) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const body = await req.json() as { nome?: string; descricao?: string };
  const nome = body.nome?.trim().toLowerCase();
  const descricao = body.descricao?.trim() || null;

  // Validar nome: lowercase, underscores, 3-50 chars
  if (!nome) return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 });
  if (!/^[a-z][a-z0-9_]{2,49}$/.test(nome)) {
    return NextResponse.json({
      error: "Nome inválido — use apenas letras minúsculas, números e underscore (3-50 chars)",
    }, { status: 400 });
  }

  // Verificar se já existe
  const existing = await sql`SELECT 1 FROM alissonerp.roles WHERE nome = ${nome}`;
  if (existing.length > 0) {
    return NextResponse.json({ error: `Role '${nome}' já existe` }, { status: 409 });
  }

  // INSERT em roles
  const [role] = await sql`
    INSERT INTO alissonerp.roles (nome, descricao)
    VALUES (${nome}, ${descricao})
    RETURNING nome, descricao, ativo, criado_em
  `;

  // INSERT 18 linhas em role_permissoes (tudo false)
  for (const modulo of MODULOS) {
    await sql`
      INSERT INTO alissonerp.role_permissoes (role, modulo, pode_ler, pode_escrever)
      VALUES (${nome}, ${modulo}, false, false)
      ON CONFLICT (role, modulo) DO NOTHING
    `;
  }

  return NextResponse.json({ success: true, role });
}
