/**
 * API de gerenciamento das regras de precificação de pedras
 * Tabela: alissonerp.pedras_precificacao_regras
 *
 * GET    /api/precificacao/regras-pedras          — listar todas as regras
 * GET    /api/precificacao/regras-pedras?categoria=diamante — filtrar por categoria
 * POST   /api/precificacao/regras-pedras          — criar nova regra
 * PATCH  /api/precificacao/regras-pedras          — atualizar regra (id no body)
 * DELETE /api/precificacao/regras-pedras?id=X     — remover regra
 *
 * Regra de negócio: cada categoria pode ter VÁRIAS regras ativas ao mesmo tempo
 * (uma por faixa de tamanho — ex.: diamante tem 8 faixas). Ativar/editar uma regra
 * NÃO desativa as outras. A view vw_pedras_preco escolhe a faixa certa pelo tamanho.
 * IMPACTO se desativar uma faixa: as pedras daquele tamanho ficam sem preço.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authOr401 } from "@/lib/auth-server";
import { isFullAccess } from "@/lib/roles";
import sql from "@/lib/db";
import { zodError } from "@/lib/schemas/common";

const RegraPostSchema = z.object({
  nome_tabela: z.string().min(1, "nome_tabela obrigatório"),
  categoria_pedra: z.string().min(1, "categoria_pedra obrigatório"),
  custo_usd_ct: z.coerce.number().nullable().optional(),
  preco_rs_un: z.coerce.number().nullable().optional(),
  tamanho_inicial_mm: z.coerce.number().positive(),
  tamanho_final_mm: z.coerce.number().positive(),
  markup_inicial: z.coerce.number().positive(),
  markup_final: z.coerce.number().positive(),
  ativa: z.boolean().optional(),
}).passthrough();

const RegraPatchSchema = z.object({
  id: z.coerce.number().int().positive(),
  nome_tabela: z.string().optional(),
  categoria_pedra: z.string().optional(),
  custo_usd_ct: z.coerce.number().nullable().optional(),
  preco_rs_un: z.coerce.number().nullable().optional(),
  tamanho_inicial_mm: z.coerce.number().positive().optional(),
  tamanho_final_mm: z.coerce.number().positive().optional(),
  markup_inicial: z.coerce.number().positive().optional(),
  markup_final: z.coerce.number().positive().optional(),
  ativa: z.boolean().optional(),
}).passthrough();

async function authorize(req?: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return { error: errRes, user: null };
  if (!isFullAccess(user.role)) {
    return { error: NextResponse.json({ error: "Sem permissão" }, { status: 403 }), user: null };
  }
  return { error: null, user };
}

export async function GET(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!isFullAccess(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const categoria = req.nextUrl.searchParams.get("categoria")?.trim() ?? "";

  try {
    const regras = categoria
      ? await sql`
          SELECT id, nome_tabela, categoria_pedra, custo_usd_ct, preco_rs_un,
                 tamanho_inicial_mm, tamanho_final_mm, markup_inicial, markup_final,
                 ativa, created_at, updated_at
          FROM alissonerp.pedras_precificacao_regras
          WHERE categoria_pedra = ${categoria}
          ORDER BY tamanho_inicial_mm ASC
        `
      : await sql`
          SELECT id, nome_tabela, categoria_pedra, custo_usd_ct, preco_rs_un,
                 tamanho_inicial_mm, tamanho_final_mm, markup_inicial, markup_final,
                 ativa, created_at, updated_at
          FROM alissonerp.pedras_precificacao_regras
          ORDER BY categoria_pedra, tamanho_inicial_mm ASC
        `;

    return NextResponse.json({ regras });
  } catch (err) {
    console.error("[GET /api/precificacao/regras-pedras]", err);
    return NextResponse.json({ error: "Erro ao buscar regras de pedras" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { error, user } = await authorize(req);
  if (error) return error;

  const raw = await req.json().catch(() => ({}));
  const parsed = RegraPostSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const d = parsed.data;

  // Validação: pelo menos um dos dois preços (USD/ct ou R$/un) deve ser informado
  const custo = d.custo_usd_ct != null ? Number(d.custo_usd_ct) : null;
  const precoUn = d.preco_rs_un != null ? Number(d.preco_rs_un) : null;
  if (!custo && !precoUn) {
    return NextResponse.json({ error: "Informe custo_usd_ct ou preco_rs_un" }, { status: 400 });
  }
  if (Number(d.tamanho_final_mm) <= Number(d.tamanho_inicial_mm)) {
    return NextResponse.json({ error: "tamanho_final_mm deve ser maior que tamanho_inicial_mm" }, { status: 400 });
  }

  const ativa = d.ativa === true;

  try {
    // Pedras: várias regras ativas por categoria (uma por faixa). Criar uma regra ativa
    // NÃO desativa as outras — cada faixa de tamanho precisa continuar ativa.
    const [regra] = await sql`
      INSERT INTO alissonerp.pedras_precificacao_regras
        (nome_tabela, categoria_pedra, custo_usd_ct, preco_rs_un,
         tamanho_inicial_mm, tamanho_final_mm, markup_inicial, markup_final,
         ativa, created_by)
      VALUES (
        ${d.nome_tabela},
        ${d.categoria_pedra},
        ${custo},
        ${precoUn},
        ${Number(d.tamanho_inicial_mm)},
        ${Number(d.tamanho_final_mm)},
        ${Number(d.markup_inicial)},
        ${Number(d.markup_final)},
        ${ativa},
        ${user!.id}::uuid
      )
      RETURNING *
    `;
    return NextResponse.json({ regra }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/precificacao/regras-pedras]", err);
    return NextResponse.json({ error: "Erro ao criar regra de pedra" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const { error, user } = await authorize(req);
  if (error) return error;
  void user;

  const raw = await req.json().catch(() => ({}));
  const parsed = RegraPatchSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const d = parsed.data;
  const id = Number(d.id);

  // Pedras: várias regras ativas por categoria (uma por faixa de tamanho).
  // Ativar/editar uma regra NÃO desativa as outras — senão as pedras das demais
  // faixas ficam sem preço (foi exatamente o que quebrou em 23/06). A existência
  // da regra é validada pelo RETURNING do UPDATE abaixo (404 se não achar).

  // Validações de range
  if (d.tamanho_final_mm !== undefined && d.tamanho_inicial_mm !== undefined) {
    if (Number(d.tamanho_final_mm) <= Number(d.tamanho_inicial_mm)) {
      return NextResponse.json({ error: "tamanho_final_mm deve ser maior que tamanho_inicial_mm" }, { status: 400 });
    }
  }

  try {
    const [regra] = await sql`
      UPDATE alissonerp.pedras_precificacao_regras
      SET
        nome_tabela        = COALESCE(${d.nome_tabela ?? null}, nome_tabela),
        categoria_pedra    = COALESCE(${d.categoria_pedra ?? null}, categoria_pedra),
        custo_usd_ct       = COALESCE(${d.custo_usd_ct !== undefined ? (d.custo_usd_ct === null ? null : Number(d.custo_usd_ct) as any) : null}, custo_usd_ct),
        preco_rs_un        = COALESCE(${d.preco_rs_un !== undefined ? (d.preco_rs_un === null ? null : Number(d.preco_rs_un) as any) : null}, preco_rs_un),
        tamanho_inicial_mm = COALESCE(${d.tamanho_inicial_mm != null ? Number(d.tamanho_inicial_mm) : null}, tamanho_inicial_mm),
        tamanho_final_mm   = COALESCE(${d.tamanho_final_mm != null ? Number(d.tamanho_final_mm) : null}, tamanho_final_mm),
        markup_inicial     = COALESCE(${d.markup_inicial != null ? Number(d.markup_inicial) : null}, markup_inicial),
        markup_final       = COALESCE(${d.markup_final != null ? Number(d.markup_final) : null}, markup_final),
        ativa              = COALESCE(${d.ativa ?? null}, ativa),
        updated_at         = NOW()
      WHERE id = ${id}
      RETURNING *
    `;

    if (!regra) return NextResponse.json({ error: "Regra não encontrada" }, { status: 404 });

    return NextResponse.json({ regra });
  } catch (err) {
    console.error("[PATCH /api/precificacao/regras-pedras]", err);
    return NextResponse.json({ error: "Erro ao atualizar regra de pedra" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { error } = await authorize(req);
  if (error) return error;

  const id = Number(req.nextUrl.searchParams.get("id") ?? 0);
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  try {
    const [regra] = await sql`
      DELETE FROM alissonerp.pedras_precificacao_regras
      WHERE id = ${id}
      RETURNING id
    `;
    if (!regra) return NextResponse.json({ error: "Regra não encontrada" }, { status: 404 });

    return NextResponse.json({ ok: true, id });
  } catch (err) {
    console.error("[DELETE /api/precificacao/regras-pedras]", err);
    return NextResponse.json({ error: "Erro ao remover regra de pedra" }, { status: 500 });
  }
}
