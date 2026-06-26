import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";
import { isFullAccess } from "@/lib/roles";
import { zodError } from "@/lib/schemas/common";

const RolePostSchema = z.object({
  nome: z.string().min(1, "obrigatório"),
  descricao: z.string().optional(),
}).passthrough();

const MODULOS = [
  "dashboard","dashboard_fabrica","ordens","pcp","distribuicao","estoque",
  "quebra","insumos","compras","protocolo","conferencia","entrega",
  "auditoria","vendas","financeiro","produtos","precificacao","configuracoes",
] as const;

async function authCheck(req?: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return { user: null, errRes };
  if (!isFullAccess(user.role)) {
    return { user: null, errRes: NextResponse.json({ error: "Sem permissão" }, { status: 403 }) };
  }
  return { user, errRes: null };
}

// GET /api/configuracoes/roles — lista todas as roles
export async function GET(req: NextRequest) {
  const { user, errRes } = await authCheck(req);
  if (errRes) return errRes;
  void user;

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
  const { user, errRes } = await authCheck(req);
  if (errRes) return errRes;
  void user;

  const raw = await req.json().catch(() => ({}));
  const parsed = RolePostSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;
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
