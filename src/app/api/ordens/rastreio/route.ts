import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

// GET /api/ordens/rastreio?inicio=YYYY-MM-DD&fim=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const inicio = searchParams.get("inicio"); // YYYY-MM-DD
  const fim = searchParams.get("fim");       // YYYY-MM-DD

  if (!inicio || !fim) {
    return NextResponse.json(
      { error: "inicio e fim são obrigatórios" },
      { status: 400 }
    );
  }

  // Auth
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  // Get role and vendedor_id from alissonerp.usuarios
  const usuarioRows = await sql`
    SELECT role, vendedor_id
    FROM alissonerp.usuarios
    WHERE id = ${user.id}::uuid
    LIMIT 1
  `;
  const usuario = usuarioRows[0] ?? null;
  const isConsultora =
    usuario?.role === "consultora" && usuario?.vendedor_id != null;
  const vendedorId = isConsultora ? (usuario.vendedor_id as number) : null;

  // ─── 1. PCP em andamento ──────────────────────────────────────────────────
  // Ordens com PCP ativo (não concluído, não cancelado) criadas no período
  const pcpRows = vendedorId
    ? await sql`
        SELECT DISTINCT o.id, o.numero_ordem
        FROM alissonerp.ordens o
        JOIN alissonerp.pcp p ON p.ordem_id = o.id
        WHERE o.created_at >= ${inicio}::date
          AND o.created_at <  (${fim}::date + INTERVAL '1 day')
          AND p.etapas NOT IN ('concluido', 'cancelado')
          AND o.vendedor_id = ${vendedorId}
        ORDER BY o.id DESC
      `
    : await sql`
        SELECT DISTINCT o.id, o.numero_ordem
        FROM alissonerp.ordens o
        JOIN alissonerp.pcp p ON p.ordem_id = o.id
        WHERE o.created_at >= ${inicio}::date
          AND o.created_at <  (${fim}::date + INTERVAL '1 day')
          AND p.etapas NOT IN ('concluido', 'cancelado')
        ORDER BY o.id DESC
      `;

  // ─── 2. Protocolo Ida (pendente) ─────────────────────────────────────────
  // Ordens em protocolo de direcao='ida' com etapas='pendente'
  const protIdaRows = vendedorId
    ? await sql`
        SELECT DISTINCT o.id, o.numero_ordem
        FROM alissonerp.ordens o
        JOIN alissonerp.protocolo_ordens po ON po.ordem_id = o.id
        JOIN alissonerp.protocolos p ON p.id = po.protocolo_id
        WHERE o.created_at >= ${inicio}::date
          AND o.created_at <  (${fim}::date + INTERVAL '1 day')
          AND p.direcao = 'ida'
          AND p.etapas = 'pendente'
          AND o.vendedor_id = ${vendedorId}
        ORDER BY o.id DESC
      `
    : await sql`
        SELECT DISTINCT o.id, o.numero_ordem
        FROM alissonerp.ordens o
        JOIN alissonerp.protocolo_ordens po ON po.ordem_id = o.id
        JOIN alissonerp.protocolos p ON p.id = po.protocolo_id
        WHERE o.created_at >= ${inicio}::date
          AND o.created_at <  (${fim}::date + INTERVAL '1 day')
          AND p.direcao = 'ida'
          AND p.etapas = 'pendente'
        ORDER BY o.id DESC
      `;

  // ─── 3. Protocolo Volta (pendente) ────────────────────────────────────────
  // Ordens em protocolo de direcao='volta' com etapas='pendente'
  const protVoltaRows = vendedorId
    ? await sql`
        SELECT DISTINCT o.id, o.numero_ordem
        FROM alissonerp.ordens o
        JOIN alissonerp.protocolo_ordens po ON po.ordem_id = o.id
        JOIN alissonerp.protocolos p ON p.id = po.protocolo_id
        WHERE o.created_at >= ${inicio}::date
          AND o.created_at <  (${fim}::date + INTERVAL '1 day')
          AND p.direcao = 'volta'
          AND p.etapas = 'pendente'
          AND o.vendedor_id = ${vendedorId}
        ORDER BY o.id DESC
      `
    : await sql`
        SELECT DISTINCT o.id, o.numero_ordem
        FROM alissonerp.ordens o
        JOIN alissonerp.protocolo_ordens po ON po.ordem_id = o.id
        JOIN alissonerp.protocolos p ON p.id = po.protocolo_id
        WHERE o.created_at >= ${inicio}::date
          AND o.created_at <  (${fim}::date + INTERVAL '1 day')
          AND p.direcao = 'volta'
          AND p.etapas = 'pendente'
        ORDER BY o.id DESC
      `;

  // ─── 4. Auditoria pendente ────────────────────────────────────────────────
  // Ordens com auditoria (loja ou fábrica) no status pendente/em_analise
  const auditoriaRows = vendedorId
    ? await sql`
        SELECT DISTINCT o.id, o.numero_ordem
        FROM alissonerp.ordens o
        JOIN alissonerp.auditorias a ON a.ordem_id = o.id
        WHERE o.created_at >= ${inicio}::date
          AND o.created_at <  (${fim}::date + INTERVAL '1 day')
          AND a.situacao IN ('pendente', 'em_analise', 'pendenciado')
          AND o.vendedor_id = ${vendedorId}
        ORDER BY o.id DESC
      `
    : await sql`
        SELECT DISTINCT o.id, o.numero_ordem
        FROM alissonerp.ordens o
        JOIN alissonerp.auditorias a ON a.ordem_id = o.id
        WHERE o.created_at >= ${inicio}::date
          AND o.created_at <  (${fim}::date + INTERVAL '1 day')
          AND a.situacao IN ('pendente', 'em_analise', 'pendenciado')
        ORDER BY o.id DESC
      `;

  // ─── 5. Conferência (aprovações consultora pendentes) ────────────────────
  // aprovacoes_consultora com etapas='pendente' ou 'aguardando'
  const conferenciaRows = vendedorId
    ? await sql`
        SELECT DISTINCT o.id, o.numero_ordem
        FROM alissonerp.ordens o
        JOIN alissonerp.aprovacoes_consultora ac ON ac.ordem_id = o.id
        WHERE o.created_at >= ${inicio}::date
          AND o.created_at <  (${fim}::date + INTERVAL '1 day')
          AND ac.etapas IN ('pendente', 'aguardando')
          AND o.vendedor_id = ${vendedorId}
        ORDER BY o.id DESC
      `
    : await sql`
        SELECT DISTINCT o.id, o.numero_ordem
        FROM alissonerp.ordens o
        JOIN alissonerp.aprovacoes_consultora ac ON ac.ordem_id = o.id
        WHERE o.created_at >= ${inicio}::date
          AND o.created_at <  (${fim}::date + INTERVAL '1 day')
          AND ac.etapas IN ('pendente', 'aguardando')
        ORDER BY o.id DESC
      `;

  // ─── 6. Entregues ─────────────────────────────────────────────────────────
  // preparacoes_entrega com etapas='concluido' OU ordens com status='concluido'
  const entreguesRows = vendedorId
    ? await sql`
        SELECT DISTINCT o.id, o.numero_ordem
        FROM alissonerp.ordens o
        JOIN alissonerp.preparacoes_entrega pe ON pe.ordem_id = o.id
        WHERE o.created_at >= ${inicio}::date
          AND o.created_at <  (${fim}::date + INTERVAL '1 day')
          AND pe.etapas = 'concluido'
          AND o.vendedor_id = ${vendedorId}
        ORDER BY o.id DESC
      `
    : await sql`
        SELECT DISTINCT o.id, o.numero_ordem
        FROM alissonerp.ordens o
        JOIN alissonerp.preparacoes_entrega pe ON pe.ordem_id = o.id
        WHERE o.created_at >= ${inicio}::date
          AND o.created_at <  (${fim}::date + INTERVAL '1 day')
          AND pe.etapas = 'concluido'
        ORDER BY o.id DESC
      `;

  return NextResponse.json({
    pcp: {
      total: pcpRows.length,
      ordens: pcpRows,
    },
    protocolo_ida: {
      total: protIdaRows.length,
      ordens: protIdaRows,
    },
    protocolo_volta: {
      total: protVoltaRows.length,
      ordens: protVoltaRows,
    },
    auditoria: {
      total: auditoriaRows.length,
      ordens: auditoriaRows,
    },
    conferencia: {
      total: conferenciaRows.length,
      ordens: conferenciaRows,
    },
    entregues: {
      total: entreguesRows.length,
      ordens: entreguesRows,
    },
  });
}
