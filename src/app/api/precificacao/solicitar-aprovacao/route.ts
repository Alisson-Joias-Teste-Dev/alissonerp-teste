/**
 * POST /api/precificacao/solicitar-aprovacao
 *
 * Salva uma simulação de mudança de markup como 'pendente' para aprovação.
 * NÃO aplica a mudança — apenas registra a intenção.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authOr401 } from "@/lib/auth-server";
import { isPrecificacaoAccess } from "@/lib/roles";
import sql from "@/lib/db";
import { zodError } from "@/lib/schemas/common";
import { resolverAprovadores } from "@/lib/aprovacoes";

const SolicitarAprovPostSchema = z.object({
  tipo: z.enum(["ouro", "pedra"]),
  faixa_id: z.coerce.number().int().positive(),
  faixa_nome: z.string().min(1, "obrigatório"),
  markup_anterior: z.coerce.number(),
  markup_novo: z.coerce.number().positive(),
  stats: z.object({
    produtos_afetados: z.coerce.number().optional(),
    variacao_media: z.coerce.number().optional(),
    variacao_min: z.coerce.number().optional(),
    variacao_max: z.coerce.number().optional(),
  }).optional(),
  simulacao: z.array(z.unknown()).optional(),
}).passthrough();

export async function POST(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!isPrecificacaoAccess(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = SolicitarAprovPostSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { tipo, faixa_id, faixa_nome, markup_anterior, markup_novo, stats, simulacao } = parsed.data;

  // REGRA DE NEGÓCIO: sem aprovador configurado, a solicitação de markup não
  // nasce (política config-first — 03b-config-first-estrito.md). Sem
  // ctx.solicitanteId: precificação não exclui quem está solicitando.
  const resol = await resolverAprovadores("precificacao");
  if (resol.status === "nao_configurado") {
    return NextResponse.json(
      { error: "Aprovador de precificação não configurado. Defina em Configurações › Aprovadores." },
      { status: 409 },
    );
  }

  try {
    const [alteracao] = await sql`
      INSERT INTO alissonerp.markup_alteracoes (
        tipo, faixa_id, faixa_nome, markup_anterior, markup_novo,
        produtos_afetados, variacao_media, variacao_min, variacao_max,
        simulacao_json, criado_por
      ) VALUES (
        ${tipo},
        ${faixa_id},
        ${faixa_nome},
        ${markup_anterior},
        ${markup_novo},
        ${stats?.produtos_afetados ?? 0},
        ${stats?.variacao_media ?? 0},
        ${stats?.variacao_min ?? 0},
        ${stats?.variacao_max ?? 0},
        ${JSON.stringify(simulacao ?? [])},
        ${user.id}::uuid
      )
      RETURNING id, tipo, faixa_nome, markup_anterior, markup_novo, status, data_criacao
    `;

    return NextResponse.json({ alteracao }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/precificacao/solicitar-aprovacao]", err);
    return NextResponse.json({ error: "Erro ao registrar solicitação" }, { status: 500 });
  }
}
