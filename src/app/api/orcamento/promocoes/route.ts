import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";
import { zodError } from "@/lib/schemas/common";

const ROLES_CONFIG = ["desenvolvedor", "admin", "gerente_loja"] as const;

const PromoPostSchema = z.object({
  nome: z.string().min(1, "obrigatório"),
  data_inicio: z.string().min(1, "obrigatório"),
  data_fim: z.string().min(1, "obrigatório"),
  descontos: z.array(z.object({
    categoria_id: z.coerce.number().int().optional(),
    nome: z.string().optional(),
    desconto_promocao: z.coerce.number().optional(),
  })).optional(),
}).passthrough();

// ─── GET /api/orcamento/promocoes ────────────────────────────────────────────
// Lista o histórico de campanhas (mais recentes primeiro).
// Datas serializadas como YYYY-MM-DD pra evitar shift de timezone no client.
export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });

  const rows = await sql`
    SELECT id, nome,
           to_char(data_inicio, 'YYYY-MM-DD') AS data_inicio,
           to_char(data_fim,    'YYYY-MM-DD') AS data_fim,
           descontos, criado_em, ativada_em
    FROM alissonerp.config_orcamento_promocoes
    ORDER BY criado_em DESC
    LIMIT 50
  `;

  return NextResponse.json({ promocoes: rows });
}

// ─── POST /api/orcamento/promocoes ───────────────────────────────────────────
// Salva uma nova campanha e a ativa na config_orcamento atual.
// Body: { nome, data_inicio, data_fim, descontos: [{categoria_id, nome, desconto_promocao}] }
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });

  const [caller] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid`;
  if (!caller) return NextResponse.json({ error: "Usuario nao encontrado" }, { status: 404 });

  const role = caller.role as string;
  const canConfig = isFullAccess(role) || ROLES_CONFIG.includes(role as typeof ROLES_CONFIG[number]);
  if (!canConfig) return NextResponse.json({ error: "Sem permissao" }, { status: 403 });

  const raw = await req.json().catch(() => ({}));
  const parsed = PromoPostSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;

  const nome = body.nome.trim();
  const data_inicio = body.data_inicio.trim();
  const data_fim = body.data_fim.trim();
  const descontos = Array.isArray(body.descontos) ? body.descontos : [];

  if (data_inicio > data_fim) return NextResponse.json({ error: "Data inicio > fim" }, { status: 400 });

  // Em transação: persiste no histórico, atualiza pricing_categories da config ativa
  // com os novos descontos, e atualiza as datas.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await sql.begin(async (tx: any) => {
    const [inserted] = await tx`
      INSERT INTO alissonerp.config_orcamento_promocoes
        (nome, data_inicio, data_fim, descontos, criado_por, ativada_em)
      VALUES (
        ${nome},
        ${data_inicio}::date,
        ${data_fim}::date,
        ${tx.json(descontos)},
        ${user.id}::uuid,
        NOW()
      )
      RETURNING id, nome,
                to_char(data_inicio, 'YYYY-MM-DD') AS data_inicio,
                to_char(data_fim,    'YYYY-MM-DD') AS data_fim,
                descontos, criado_em, ativada_em
    `;

    // Carrega pricing_categories atual, mescla os descontos da campanha por categoria_id
    const [cfg] = await tx`
      SELECT pricing_categories FROM alissonerp.config_orcamento WHERE name = 'default' LIMIT 1
    `;
    const cats: Array<Record<string, unknown>> = Array.isArray(cfg?.pricing_categories) ? cfg!.pricing_categories : [];
    const mapDesc = new Map<number, number>();
    for (const d of descontos) {
      if (d?.categoria_id != null) mapDesc.set(Number(d.categoria_id), Number(d.desconto_promocao ?? 0));
    }
    const merged = cats.map((c) => {
      const id = Number(c.id);
      const novo = mapDesc.has(id) ? mapDesc.get(id) : Number(c.desconto_promocao ?? 0);
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

    return inserted;
  });

  return NextResponse.json({ ok: true, promocao: result });
}
