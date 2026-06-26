import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { processarFila } from "@/lib/fila-sync-worker";
import { zodError } from "@/lib/schemas/common";

const FilaSyncPostSchema = z.object({
  limite: z.coerce.number().int().min(1).max(50).optional(),
}).passthrough();

async function getCallerRole(userId: string): Promise<string | null> {
  const [caller] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${userId}::uuid LIMIT 1`;
  return (caller?.role as string) ?? null;
}

// GET /api/admin/fila-sync — lista itens da fila de sync externo
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const role = await getCallerRole(user.id);
  if (!role || !["desenvolvedor", "admin"].includes(role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const status = sp.get("status");
  const sistema = sp.get("sistema");
  const page = Math.max(1, Number(sp.get("page") ?? 1));
  const limit = 50;
  const offset = (page - 1) * limit;

  const rows = await sql`
    SELECT id, sistema, acao, status, tentativas, ultimo_erro,
           proxima_execucao, criado_em, processado_em,
           jsonb_pretty(payload) AS payload_fmt
    FROM alissonerp.fila_sync_externo
    WHERE (${status}::text IS NULL OR status = ${status})
      AND (${sistema}::text IS NULL OR sistema = ${sistema})
    ORDER BY criado_em DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const [{ total }] = await sql`
    SELECT COUNT(*)::int AS total
    FROM alissonerp.fila_sync_externo
    WHERE (${status}::text IS NULL OR status = ${status})
      AND (${sistema}::text IS NULL OR sistema = ${sistema})
  `;

  const [contadores] = await sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'pendente')::int         AS pendentes,
      COUNT(*) FILTER (WHERE status = 'processando')::int      AS processando,
      COUNT(*) FILTER (WHERE status = 'processado')::int       AS processados,
      COUNT(*) FILTER (WHERE status = 'falha_definitiva')::int AS falhas
    FROM alissonerp.fila_sync_externo
  `;

  return NextResponse.json({ rows, total, page, contadores });
}

// POST /api/admin/fila-sync — dispara o worker manualmente (cron externo ou admin)
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const role = await getCallerRole(user.id);
  if (!role || !["desenvolvedor", "admin"].includes(role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = FilaSyncPostSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const limite = Math.min(50, Math.max(1, Number(parsed.data.limite ?? 10)));

  const result = await processarFila(limite);
  return NextResponse.json(result);
}
