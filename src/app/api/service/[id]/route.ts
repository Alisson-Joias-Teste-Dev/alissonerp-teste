import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { normalizeRow } from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";

// GET /api/service/[id]
// Retorna serviço completo com dados da ordem, cliente, operador e fotos.
// Auth: is_operador_service = true OU fullAccess

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const servicoId = parseInt(id);
  if (isNaN(servicoId)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

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

  const [row] = await sql`
    SELECT
      s.id,
      s.ordem_id,
      s.tentativa,
      s.peso_entrada,
      s.peso_saida,
      s.usou_solda,
      s.peso_fio_antes,
      s.peso_fio_depois,
      s.consumo_solda,
      s.colocou_pedra,
      s.pedras_colocadas,
      s.status,
      s.foto_recebimento,
      s.foto_conclusao,
      s.foto_fio_solda,
      s.recebido_em,
      s.concluido_em,
      o.numero_ordem,
      o.tipo_ordem::text    AS tipo_ordem,
      o.detalhes_ordem,
      o.foto_peca_servico,
      o.video_observacao,
      o.data_entrega,
      o.tipos_servico_ids,
      o.peso_peca_servico,
      o.ficha_tecnica_id,
      c.nome                AS cliente_nome,
      d.nome                AS operador_nome
    FROM alissonerp.servicos s
    JOIN alissonerp.ordens o ON o.id = s.ordem_id
    LEFT JOIN public.contatos c ON c.id_contato = o.cliente_id
    LEFT JOIN alissonerp.depositos d ON d.id = s.operador_id
    WHERE s.id = ${servicoId}
  `;

  if (!row) return NextResponse.json({ error: "Serviço não encontrado" }, { status: 404 });

  const servico = normalizeRow(row as Record<string, unknown>, [
    "peso_entrada", "peso_saida", "peso_fio_antes", "peso_fio_depois", "consumo_solda", "peso_peca_servico",
  ], ["pedras_colocadas", "tipos_servico_ids"]);

  // Buscar itens da ordem
  const ordemId = Number((row as Record<string, unknown>).ordem_id);
  const itens = await sql`
    SELECT io.id, io.nome_produto, io.sku, io.quantidade, io.peso_estimado, io.observacao
    FROM alissonerp.itens_ordem io
    WHERE io.ordem_id = ${ordemId}
    ORDER BY io.id
  `;

  // Buscar nomes dos tipos de serviço
  const tiposIds = (servico as Record<string, unknown>).tipos_servico_ids as number[] | null;
  let tiposServico: {id: number; nome: string}[] = [];
  if (tiposIds && Array.isArray(tiposIds) && tiposIds.length > 0) {
    tiposServico = await sql`
      SELECT id, nome FROM alissonerp.tipos_servico WHERE id = ANY(${tiposIds})
    `;
  }

  return NextResponse.json({ servico, itens, tipos_servico: tiposServico });
}
