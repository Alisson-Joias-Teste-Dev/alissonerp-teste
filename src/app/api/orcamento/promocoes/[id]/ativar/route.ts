import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";

const ROLES_CONFIG = ["desenvolvedor", "admin", "gerente_loja"] as const;

// ─── POST /api/orcamento/promocoes/[id]/ativar ───────────────────────────────
// Reativa uma campanha do histórico: aplica os descontos dela na config atual
// e copia as datas. Aceita opcionalmente novas datas no body.
// Body opcional: { data_inicio?, data_fim? }
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });

  const [caller] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid`;
  if (!caller) return NextResponse.json({ error: "Usuario nao encontrado" }, { status: 404 });

  const role = caller.role as string;
  const canConfig = isFullAccess(role) || ROLES_CONFIG.includes(role as typeof ROLES_CONFIG[number]);
  if (!canConfig) return NextResponse.json({ error: "Sem permissao" }, { status: 403 });

  const { id } = await ctx.params;
  const promoId = Number(id);
  if (!Number.isFinite(promoId)) return NextResponse.json({ error: "ID invalido" }, { status: 400 });

  const body = await req.json().catch(() => ({})) as { data_inicio?: string; data_fim?: string };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await sql.begin(async (tx: any) => {
    const [promo] = await tx`
      SELECT id, nome, data_inicio, data_fim, descontos
      FROM alissonerp.config_orcamento_promocoes
      WHERE id = ${promoId}
      LIMIT 1
    `;
    if (!promo) throw new Error("PROMO_NOT_FOUND");

    // postgres.js retorna DATE como Date object em UTC midnight.
    // toISOString().slice(0,10) recupera a data armazenada sem shift de TZ.
    const toISODate = (v: unknown): string => {
      if (v instanceof Date) return v.toISOString().slice(0, 10);
      return String(v).slice(0, 10);
    };
    const data_inicio = body.data_inicio || toISODate(promo.data_inicio);
    const data_fim    = body.data_fim    || toISODate(promo.data_fim);
    if (data_inicio > data_fim) throw new Error("DATA_INVALIDA");

    const descontos: Array<{ categoria_id?: number; desconto_promocao?: number }> =
      Array.isArray(promo.descontos) ? promo.descontos : [];

    const [cfg] = await tx`
      SELECT pricing_categories FROM alissonerp.config_orcamento WHERE name = 'default' LIMIT 1
    `;
    const cats: Array<Record<string, unknown>> = Array.isArray(cfg?.pricing_categories) ? cfg!.pricing_categories : [];
    const mapDesc = new Map<number, number>();
    for (const d of descontos) {
      if (d?.categoria_id != null) mapDesc.set(Number(d.categoria_id), Number(d.desconto_promocao ?? 0));
    }
    // Merge preserva descontos de faixas que NÃO estavam na campanha original.
    // Mesma semântica do POST /api/orcamento/promocoes — campanhas históricas
    // não conheciam faixas adicionadas depois e zerar surpreenderia o usuário.
    const merged = cats.map((c) => {
      const cid = Number(c.id);
      const novo = mapDesc.has(cid) ? mapDesc.get(cid) : Number(c.desconto_promocao ?? 0);
      return { ...c, desconto_promocao: novo ?? 0 };
    });

    await tx`
      UPDATE alissonerp.config_orcamento SET
        promocao_inicio = ${data_inicio}::date,
        promocao_fim    = ${data_fim}::date,
        pricing_categories = ${tx.json(merged)},
        updated_at = NOW(),
        updated_by = ${user.id}::uuid
      WHERE name = 'default'
    `;

    await tx`
      UPDATE alissonerp.config_orcamento_promocoes
      SET ativada_em = NOW()
      WHERE id = ${promoId}
    `;

    return { id: promo.id, nome: promo.nome, data_inicio, data_fim, descontos };
  }).catch((e: Error) => {
    if (e.message === "PROMO_NOT_FOUND") return null;
    if (e.message === "DATA_INVALIDA") return "DATA_INVALIDA";
    throw e;
  });

  if (result === null) return NextResponse.json({ error: "Campanha nao encontrada" }, { status: 404 });
  if (result === "DATA_INVALIDA") return NextResponse.json({ error: "Data inicio > fim" }, { status: 400 });

  return NextResponse.json({ ok: true, promocao: result });
}
