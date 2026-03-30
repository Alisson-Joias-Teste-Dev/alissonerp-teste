import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";

// GET /api/service/pendentes
// Retorna protocolos ida PENDENTES que contêm ordens de servico_venda ou garantia.
// Auth: is_operador_service = true OU fullAccess

export async function GET(_req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [caller] = await sql`
    SELECT role, is_operador_service
    FROM alissonerp.usuarios
    WHERE id = ${user.id}::uuid
  `;
  if (!caller) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 403 });

  const hasAccess = isFullAccess(caller.role as string) || caller.is_operador_service === true;
  if (!hasAccess) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const rows = await sql`
    SELECT p.id,
           p.direcao,
           p.etapas,
           p.created_at,
           p.foto_criacao,
           json_agg(json_build_object(
             'ordem_id',          o.id,
             'numero_ordem',      o.numero_ordem,
             'tipo_ordem',        o.tipo_ordem::text,
             'peso_peca_servico', o.peso_peca_servico,
             'foto_peca_servico', o.foto_peca_servico,
             'detalhes_ordem',    o.detalhes_ordem,
             'cliente_nome',      c.nome
           ) ORDER BY o.id) AS ordens
    FROM alissonerp.protocolos p
    JOIN alissonerp.protocolo_ordens po ON po.protocolo_id = p.id
    JOIN alissonerp.ordens o ON o.id = po.ordem_id
    LEFT JOIN public.contatos c ON c.id_contato = o.cliente_id
    WHERE p.direcao = 'ida'
      AND p.etapas = 'pendente'
      AND o.tipo_ordem::text IN (
        SELECT jsonb_array_elements_text(
          COALESCE(
            (SELECT valor::jsonb FROM alissonerp.configuracoes_sistema WHERE chave = 'service_tipos_ordem'),
            '["servico_venda","garantia","servico_interno"]'::jsonb
          )
        )
      )
    GROUP BY p.id
    ORDER BY p.created_at DESC
  `;

  const protocolos = rows.map(r => ({
    ...r,
    ordens: typeof r.ordens === "string" ? JSON.parse(r.ordens as string) : r.ordens,
  }));

  return NextResponse.json({ protocolos });
}
