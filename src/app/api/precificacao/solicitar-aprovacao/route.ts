/**
 * POST /api/precificacao/solicitar-aprovacao
 *
 * Salva uma simulação de mudança de markup como 'pendente' para aprovação.
 * NÃO aplica a mudança — apenas registra a intenção.
 */

import { NextRequest, NextResponse } from "next/server";
import { authOr401 } from "@/lib/auth-server";
import { isPrecificacaoAccess } from "@/lib/roles";
import sql from "@/lib/db";

export async function POST(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!isPrecificacaoAccess(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const body = await req.json() as {
    tipo: "ouro" | "pedra";
    faixa_id: number;
    faixa_nome: string;
    markup_anterior: number;
    markup_novo: number;
    stats: {
      produtos_afetados: number;
      variacao_media: number;
      variacao_min: number;
      variacao_max: number;
    };
    simulacao: unknown[];
  };

  const { tipo, faixa_id, faixa_nome, markup_anterior, markup_novo, stats, simulacao } = body;

  if (!tipo || !faixa_id || !faixa_nome || !markup_anterior || !markup_novo) {
    return NextResponse.json({ error: "Campos obrigatórios ausentes" }, { status: 400 });
  }
  if (!["ouro", "pedra"].includes(tipo)) {
    return NextResponse.json({ error: "tipo inválido" }, { status: 400 });
  }
  if (markup_novo <= 0) {
    return NextResponse.json({ error: "markup_novo deve ser positivo" }, { status: 400 });
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
