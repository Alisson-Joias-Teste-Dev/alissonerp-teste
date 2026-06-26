import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";
import { isFullAccess } from "@/lib/roles";
import { zodError } from "@/lib/schemas/common";

const PermissoesPatchSchema = z.object({
  changes: z.array(z.object({
    role: z.string().min(1),
    modulo: z.string().min(1),
    pode_ler: z.boolean(),
    pode_escrever: z.boolean(),
  })).min(1),
}).passthrough();

// ─── Auto-create table + seed on first use ─────────────────────────────────────
async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS alissonerp.role_permissoes (
      id            SERIAL PRIMARY KEY,
      role          VARCHAR(50)  NOT NULL,
      modulo        VARCHAR(50)  NOT NULL,
      pode_ler      BOOLEAN      NOT NULL DEFAULT false,
      pode_escrever BOOLEAN      NOT NULL DEFAULT false,
      criado_em     TIMESTAMPTZ  NOT NULL DEFAULT now(),
      atualizado_em TIMESTAMPTZ  NOT NULL DEFAULT now(),
      UNIQUE(role, modulo)
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_role_permissoes_role
      ON alissonerp.role_permissoes(role)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_role_permissoes_modulo
      ON alissonerp.role_permissoes(modulo)
  `;

  // Seed com os valores do permissions.ts (ON CONFLICT DO NOTHING = idempotente)
  await sql`
    INSERT INTO alissonerp.role_permissoes (role, modulo, pode_ler, pode_escrever) VALUES
      ('desenvolvedor','dashboard',true,true),('desenvolvedor','dashboard_comercial',true,true),('desenvolvedor','dashboard_fabrica',true,true),
      ('desenvolvedor','ordens',true,true),('desenvolvedor','pcp',true,true),
      ('desenvolvedor','distribuicao',true,true),('desenvolvedor','estoque',true,true),
      ('desenvolvedor','quebra',true,true),('desenvolvedor','insumos',true,true),
      ('desenvolvedor','compras',true,true),('desenvolvedor','protocolo',true,true),
      ('desenvolvedor','conferencia',true,true),('desenvolvedor','entrega',true,true),
      ('desenvolvedor','auditoria',true,true),('desenvolvedor','vendas',true,true),
      ('desenvolvedor','financeiro',true,true),('desenvolvedor','produtos',true,true),
      ('desenvolvedor','precificacao',true,true),('desenvolvedor','configuracoes',true,true),
      ('admin','dashboard',true,true),('admin','dashboard_comercial',true,true),('admin','dashboard_fabrica',true,true),
      ('admin','ordens',true,true),('admin','pcp',true,true),
      ('admin','distribuicao',true,true),('admin','estoque',true,true),
      ('admin','quebra',true,true),('admin','insumos',true,true),
      ('admin','compras',true,true),('admin','protocolo',true,true),
      ('admin','conferencia',true,true),('admin','entrega',true,true),
      ('admin','auditoria',true,true),('admin','vendas',true,true),
      ('admin','financeiro',true,true),('admin','produtos',true,true),
      ('admin','precificacao',true,true),('admin','configuracoes',true,true),
      ('gerente_fabrica','dashboard',true,true),('gerente_fabrica','dashboard_comercial',false,false),('gerente_fabrica','dashboard_fabrica',true,true),
      ('gerente_fabrica','ordens',true,true),('gerente_fabrica','pcp',true,true),
      ('gerente_fabrica','distribuicao',true,true),('gerente_fabrica','estoque',true,true),
      ('gerente_fabrica','quebra',true,true),('gerente_fabrica','insumos',true,true),
      ('gerente_fabrica','compras',true,true),('gerente_fabrica','protocolo',true,true),
      ('gerente_fabrica','conferencia',false,false),('gerente_fabrica','entrega',false,false),
      ('gerente_fabrica','auditoria',true,true),('gerente_fabrica','vendas',true,true),
      ('gerente_fabrica','financeiro',true,true),('gerente_fabrica','produtos',false,false),
      ('gerente_fabrica','precificacao',false,false),('gerente_fabrica','configuracoes',false,false),
      ('gerente_loja','dashboard',true,true),('gerente_loja','dashboard_comercial',true,true),('gerente_loja','dashboard_fabrica',false,false),
      ('gerente_loja','ordens',true,true),('gerente_loja','pcp',false,false),
      ('gerente_loja','distribuicao',false,false),('gerente_loja','estoque',true,true),
      ('gerente_loja','quebra',false,false),('gerente_loja','insumos',false,false),
      ('gerente_loja','compras',false,false),('gerente_loja','protocolo',true,true),
      ('gerente_loja','conferencia',true,true),('gerente_loja','entrega',true,true),
      ('gerente_loja','auditoria',true,true),('gerente_loja','vendas',true,true),
      ('gerente_loja','financeiro',false,false),('gerente_loja','produtos',true,true),
      ('gerente_loja','precificacao',true,true),('gerente_loja','configuracoes',false,false),
      ('ourives','dashboard',false,false),('ourives','dashboard_comercial',false,false),('ourives','dashboard_fabrica',false,false),
      ('ourives','ordens',true,true),('ourives','pcp',true,true),
      ('ourives','distribuicao',false,false),('ourives','estoque',false,false),
      ('ourives','quebra',false,false),('ourives','insumos',false,false),
      ('ourives','compras',false,false),('ourives','protocolo',false,false),
      ('ourives','conferencia',false,false),('ourives','entrega',false,false),
      ('ourives','auditoria',false,false),('ourives','vendas',false,false),
      ('ourives','financeiro',false,false),('ourives','produtos',false,false),
      ('ourives','precificacao',false,false),('ourives','configuracoes',false,false),
      ('motoboy','dashboard',false,false),('motoboy','dashboard_comercial',false,false),('motoboy','dashboard_fabrica',false,false),
      ('motoboy','ordens',false,false),('motoboy','pcp',false,false),
      ('motoboy','distribuicao',false,false),('motoboy','estoque',false,false),
      ('motoboy','quebra',false,false),('motoboy','insumos',false,false),
      ('motoboy','compras',false,false),('motoboy','protocolo',true,true),
      ('motoboy','conferencia',false,false),('motoboy','entrega',false,false),
      ('motoboy','auditoria',false,false),('motoboy','vendas',false,false),
      ('motoboy','financeiro',false,false),('motoboy','produtos',false,false),
      ('motoboy','precificacao',false,false),('motoboy','configuracoes',false,false),
      ('consultora','dashboard',false,false),('consultora','dashboard_comercial',true,false),('consultora','dashboard_fabrica',false,false),
      ('consultora','ordens',true,true),('consultora','pcp',false,false),
      ('consultora','distribuicao',false,false),('consultora','estoque',true,true),
      ('consultora','quebra',false,false),('consultora','insumos',false,false),
      ('consultora','compras',false,false),('consultora','protocolo',false,false),
      ('consultora','conferencia',true,true),('consultora','entrega',false,false),
      ('consultora','auditoria',false,false),('consultora','vendas',false,false),
      ('consultora','financeiro',false,false),('consultora','produtos',false,false),
      ('consultora','precificacao',false,false),('consultora','configuracoes',false,false),
      /**
       * REGRA DE NEGÓCIO: vendedoras/consultoras têm acesso ao módulo Metal
       * para registrar compra e recebimento no fluxo comercial.
       * IMPACTO SE REMOVIDO: permissões seed não criam acesso e o menu pode
       * ocultar o módulo para novas bases/ambientes.
       */
      ('consultora','metal',true,true),
      ('estoquista_fabrica','dashboard',false,false),('estoquista_fabrica','dashboard_comercial',false,false),('estoquista_fabrica','dashboard_fabrica',false,false),
      ('estoquista_fabrica','ordens',false,false),('estoquista_fabrica','pcp',false,false),
      ('estoquista_fabrica','distribuicao',false,false),('estoquista_fabrica','estoque',true,true),
      ('estoquista_fabrica','quebra',true,true),('estoquista_fabrica','insumos',true,true),
      ('estoquista_fabrica','compras',true,true),('estoquista_fabrica','protocolo',false,false),
      ('estoquista_fabrica','conferencia',false,false),('estoquista_fabrica','entrega',false,false),
      ('estoquista_fabrica','auditoria',false,false),('estoquista_fabrica','vendas',false,false),
      ('estoquista_fabrica','financeiro',false,false),('estoquista_fabrica','produtos',false,false),
      ('estoquista_fabrica','precificacao',false,false),('estoquista_fabrica','configuracoes',false,false),
      ('estoquista_loja','dashboard',false,false),('estoquista_loja','dashboard_comercial',false,false),('estoquista_loja','dashboard_fabrica',false,false),
      ('estoquista_loja','ordens',false,false),('estoquista_loja','pcp',false,false),
      ('estoquista_loja','distribuicao',false,false),('estoquista_loja','estoque',true,true),
      ('estoquista_loja','quebra',false,false),('estoquista_loja','insumos',false,false),
      ('estoquista_loja','compras',false,false),('estoquista_loja','protocolo',false,false),
      ('estoquista_loja','conferencia',false,false),('estoquista_loja','entrega',false,false),
      ('estoquista_loja','auditoria',false,false),('estoquista_loja','vendas',false,false),
      ('estoquista_loja','financeiro',false,false),('estoquista_loja','produtos',false,false),
      ('estoquista_loja','precificacao',false,false),('estoquista_loja','configuracoes',false,false),
      ('pcp','dashboard',true,true),('pcp','dashboard_comercial',false,false),('pcp','dashboard_fabrica',false,false),
      ('pcp','ordens',true,true),('pcp','pcp',true,true),
      ('pcp','distribuicao',true,true),('pcp','estoque',false,false),
      ('pcp','quebra',true,true),('pcp','insumos',false,false),
      ('pcp','compras',false,false),('pcp','protocolo',false,false),
      ('pcp','conferencia',false,false),('pcp','entrega',false,false),
      ('pcp','auditoria',false,false),('pcp','vendas',false,false),
      ('pcp','financeiro',false,false),('pcp','produtos',false,false),
      ('pcp','precificacao',false,false),('pcp','configuracoes',false,false)
    ON CONFLICT (role, modulo) DO NOTHING
  `;
}

// ─── Auth helper ───────────────────────────────────────────────────────────────
async function authCheck(req?: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return { user: null, errRes };
  if (!isFullAccess(user.role)) {
    return { user: null, errRes: NextResponse.json({ error: "Sem permissão" }, { status: 403 }) };
  }
  return { user, errRes: null };
}

// ─── GET /api/configuracoes/permissoes ─────────────────────────────────────────
// Retorna todas as permissões agrupadas por role
export async function GET(req: NextRequest) {
  const { user, errRes } = await authCheck(req);
  if (errRes) return errRes;
  void user;

  await ensureTable();

  const rows = await sql`
    SELECT role, modulo, pode_ler, pode_escrever
    FROM alissonerp.role_permissoes
    ORDER BY role, modulo
  `;

  // Agrupar por role
  const byRole: Record<string, { modulo: string; pode_ler: boolean; pode_escrever: boolean }[]> = {};
  for (const row of rows) {
    const r = row.role as string;
    if (!byRole[r]) byRole[r] = [];
    byRole[r].push({
      modulo:        row.modulo as string,
      pode_ler:      row.pode_ler as boolean,
      pode_escrever: row.pode_escrever as boolean,
    });
  }

  const permissoes = Object.entries(byRole).map(([role, modulos]) => ({ role, modulos }));

  return NextResponse.json({ permissoes, total: rows.length });
}

// ─── PATCH /api/configuracoes/permissoes ───────────────────────────────────────
// Body: { changes: [{ role, modulo, pode_ler, pode_escrever }] }
export async function PATCH(req: NextRequest) {
  const { user, errRes } = await authCheck(req);
  if (errRes) return errRes;
  void user;

  const raw = await req.json().catch(() => ({}));
  const parsed = PermissoesPatchSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;

  const ROLES_SUPER = ["desenvolvedor", "admin"];
  const updates: { role: string; modulo: string; pode_ler: boolean; pode_escrever: boolean }[] = [];

  for (const c of body.changes) {
    if (ROLES_SUPER.includes(c.role)) continue; // super-admins não são editáveis
    if (!c.role || !c.modulo) continue;

    // Escrever implica ler
    const pode_ler      = c.pode_ler || c.pode_escrever;
    const pode_escrever = c.pode_escrever;

    updates.push({ role: c.role, modulo: c.modulo, pode_ler, pode_escrever });
  }

  if (updates.length === 0) {
    return NextResponse.json({ ok: true, atualizados: 0 });
  }

  // UPSERT em batch
  for (const u of updates) {
    await sql`
      INSERT INTO alissonerp.role_permissoes (role, modulo, pode_ler, pode_escrever)
      VALUES (${u.role}, ${u.modulo}, ${u.pode_ler}, ${u.pode_escrever})
      ON CONFLICT (role, modulo) DO UPDATE
        SET pode_ler      = EXCLUDED.pode_ler,
            pode_escrever = EXCLUDED.pode_escrever,
            atualizado_em = now()
    `;
  }

  return NextResponse.json({ ok: true, atualizados: updates.length });
}
