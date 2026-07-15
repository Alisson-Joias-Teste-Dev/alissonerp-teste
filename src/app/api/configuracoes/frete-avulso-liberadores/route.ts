// ═══════════════════════════════════════════════════════════════════════════
// API de Configuração dos Liberadores de Frete Avulso (modelo POOL)
//
// REGRA DE NEGÓCIO (migration 346): a consultora SOLICITA o frete avulso a
// partir de uma venda própria, mas não escolhe quem libera — a solicitação
// cai numa aba comum que TODO usuário cadastrado aqui como "liberador ativo"
// enxerga (além de admin/desenvolvedor/diretor, que já têm acesso total via
// isFullAccess). Esta rota gerencia essa lista: só admin/dev/diretor podem
// adicionar ou remover liberadores.
//
// GET    → lista os liberadores ATIVOS (com nome/role via JOIN em usuarios).
// POST   → adiciona (ou reativa) um usuário como liberador.
// DELETE → soft-delete (ativo=false) — mantém histórico de quem já foi liberador.
//
// A checagem de "este usuário pode liberar/recusar frete avulso solicitado?"
// fica em podeGerenciarSolicitacoesAvulso() (src/lib/entrega-venda.ts), usada
// pelas rotas liberar-avulso/recusar-avulso/GET de entregas-venda e pelo SSR
// da tela de entregas. Duplicar essa checagem aqui geraria divergência entre
// quem a tela mostra e quem a API realmente autoriza.
//
// IMPACTO SE REMOVIDO: a lista de liberadores fica congelada — só dá para
// adicionar/remover usuário por SQL direto no banco.
// ═══════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/auth-server";
import { isFullAccess } from "@/lib/roles";
import { zodError } from "@/lib/schemas/common";

const UserIdSchema = z.object({
  userId: z.string().uuid("userId deve ser um UUID válido"),
});

// GET /api/configuracoes/frete-avulso-liberadores
// Lista os liberadores ativos (id, nome, role, ativo, created_at).
export async function GET() {
  try {
    const user = await requireAuth();
    if (!isFullAccess(user.role)) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    const liberadores = await sql`
      SELECT l.user_id, u.nome, u.role, l.ativo, l.created_at
      FROM alissonerp.frete_avulso_liberadores l
      JOIN alissonerp.usuarios u ON u.id = l.user_id
      WHERE l.ativo = true
      ORDER BY u.nome
    `;

    // Lista ABERTA de usuários elegíveis (qualquer usuário ativo pode virar
    // liberador — mesmo padrão de "lista aberta" usado em outras configs de
    // aprovador, ex.: aprovador_devolucao_fora_prazo).
    const usuarios = await sql`
      SELECT id, nome, role FROM alissonerp.usuarios
      WHERE ativo = true ORDER BY nome
    `;

    return NextResponse.json({
      liberadores: liberadores.map((r) => ({
        userId: String(r.user_id),
        nome: r.nome as string,
        role: r.role as string,
        ativo: Boolean(r.ativo),
        createdAt: String(r.created_at),
      })),
      usuarios,
    });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 });
    console.error("[frete-avulso-liberadores] Erro no GET:", e);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

// POST /api/configuracoes/frete-avulso-liberadores
// Adiciona (ou reativa, se já existia e estava inativo) um liberador.
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    if (!isFullAccess(user.role)) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
    }
    const parsed = UserIdSchema.safeParse(raw);
    if (!parsed.success) return zodError(parsed.error);

    // Garante que o usuário existe antes de inserir (evita FK genérica sem
    // mensagem clara — a FK aponta para auth.users, mas o operacional do ERP
    // é alissonerp.usuarios).
    const [alvo] = await sql`
      SELECT id FROM alissonerp.usuarios WHERE id = ${parsed.data.userId}::uuid LIMIT 1
    `;
    if (!alvo) {
      return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
    }

    await sql`
      INSERT INTO alissonerp.frete_avulso_liberadores (user_id, created_by)
      VALUES (${parsed.data.userId}::uuid, ${user.id}::uuid)
      ON CONFLICT (user_id) DO UPDATE SET ativo = true
    `;

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 });
    console.error("[frete-avulso-liberadores] Erro no POST:", e);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

// DELETE /api/configuracoes/frete-avulso-liberadores?userId=...
// Soft-delete: marca ativo=false (mantém histórico — não perde rastreabilidade
// de quem já liberou fretes avulsos no passado).
export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuth();
    if (!isFullAccess(user.role)) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    const url = new URL(req.url);
    let userId = url.searchParams.get("userId");
    if (!userId) {
      try {
        const body = (await req.json()) as { userId?: string };
        userId = body.userId ?? null;
      } catch {
        // sem body — segue com userId nulo, cai no 400 abaixo
      }
    }

    const parsed = UserIdSchema.safeParse({ userId });
    if (!parsed.success) return zodError(parsed.error);

    await sql`
      UPDATE alissonerp.frete_avulso_liberadores
      SET ativo = false
      WHERE user_id = ${parsed.data.userId}::uuid
    `;

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 });
    console.error("[frete-avulso-liberadores] Erro no DELETE:", e);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
