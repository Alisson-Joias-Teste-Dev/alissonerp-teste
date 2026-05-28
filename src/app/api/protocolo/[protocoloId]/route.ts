import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { ROLES_CONCLUIR_PROTOCOLO } from "@/lib/roles";
import { uploadFile, ensureBucket } from "@/lib/storage";
import { authOr401 } from "@/lib/auth-server";
import { zodError } from "@/lib/schemas/common";

const ProtocoloPatchSchema = z.object({
  etapas: z.string().min(1, "obrigatório"),
  recebedor_id: z.string().optional(),
  foto_conclusao: z.string().optional(),
  ordens_detalhes: z.array(z.object({
    ordem_id: z.coerce.number().int().positive(),
    foto_base64: z.string(),
  })).optional(),
}).passthrough();

// GET /api/protocolo/[protocoloId] — ordens do protocolo
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ protocoloId: string }> }
) {
  const [, errRes] = await authOr401(req);
  if (errRes) return errRes;

  const { protocoloId } = await params;
  const id = parseInt(protocoloId);

  const rows = await sql`
    SELECT
      po.ordem_id,
      o.numero_ordem,
      o.tipo_ordem::text,
      o.peso_metal_negociado,
      c.nome AS cliente_nome
    FROM alissonerp.protocolo_ordens po
    LEFT JOIN alissonerp.ordens o ON o.id = po.ordem_id
    LEFT JOIN public.contatos c ON c.id_contato = o.cliente_id
    WHERE po.protocolo_id = ${id}
    ORDER BY o.numero_ordem
  `;
  return NextResponse.json(rows);
}

// PATCH /api/protocolo/[protocoloId] — atualiza etapas + recebedor + foto_conclusao
//   + ordens_detalhes para conversao: [{ ordem_id, foto_base64 }]
//
// Auth: admin/desenvolvedor/gerente_fabrica/motoboy. Conclusao em si exige role
// em ROLES_CONCLUIR_PROTOCOLO (validado no recebedor abaixo).
const ROLES_PROTOCOLO_PATCH = ["admin", "desenvolvedor", "gerente_fabrica", "gerente_loja", "motoboy"];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ protocoloId: string }> }
) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!ROLES_PROTOCOLO_PATCH.includes(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { protocoloId } = await params;
  const id = parseInt(protocoloId);
  const raw = await req.json().catch(() => ({}));
  const parsed = ProtocoloPatchSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;
  const { etapas, recebedor_id, foto_conclusao, ordens_detalhes } = body;

  // Validar role ao concluir
  if (etapas === "concluido" && recebedor_id) {
    const roleResult = await sql`
      SELECT role::text AS role
      FROM alissonerp.usuarios
      WHERE id = ${recebedor_id}::uuid
    `;
    const userRole = roleResult[0]?.role;
    if (!ROLES_CONCLUIR_PROTOCOLO.includes(userRole as typeof ROLES_CONCLUIR_PROTOCOLO[number])) {
      return NextResponse.json(
        { error: "Apenas gerentes ou administradores podem concluir o protocolo." },
        { status: 403 }
      );
    }
  }

  // Atualizar protocolo
  const rows = await sql`
    UPDATE alissonerp.protocolos
    SET
      etapas        = ${etapas},
      recebedor_id  = COALESCE(${recebedor_id ?? null}::uuid, recebedor_id),
      foto_conclusao= COALESCE(${foto_conclusao ?? null}, foto_conclusao),
      updated_at    = now()
    WHERE id = ${id}
    RETURNING id, etapas
  `;

  if (rows.length === 0) {
    return NextResponse.json({ error: "Protocolo não encontrado" }, { status: 404 });
  }

  // Processar ordens_detalhes (fotos da balança para conversão)
  if (ordens_detalhes && ordens_detalhes.length > 0) {
    await ensureBucket("conversao-fotos");

    for (const det of ordens_detalhes) {
      // Upload da foto da balança para cada ordem de conversão
      const fotoPath = `balanca/${det.ordem_id}/${Date.now()}_${id}.jpg`;
      const uploadResult = await uploadFile("conversao-fotos", fotoPath, det.foto_base64, "image/jpeg");

      if ("error" in uploadResult) {
        console.error(`[protocolo] Erro upload foto balança ordem ${det.ordem_id}:`, uploadResult.error);
        continue; // Não falha o protocolo todo por causa de uma foto
      }

      // Vincular a foto aos itens da conversão (via ordem_id → conversao_id)
      await sql`
        UPDATE alissonerp.conversao_itens ci
        SET foto_item = ${uploadResult.path}
        FROM alissonerp.conversoes_estoque ce
        WHERE ci.conversao_id = ce.id
          AND ce.ordem_id = ${det.ordem_id}
          AND ci.foto_item IS NULL
      `;
    }
  }

  return NextResponse.json(rows[0]);
}
