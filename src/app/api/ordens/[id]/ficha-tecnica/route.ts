import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { validarFichaTecnicaServer, type FichaTecnicaDados } from "@/lib/validar-ficha-tecnica";
import { zodError } from "@/lib/schemas/common";

const ROLES_PERMITIDOS = ["desenvolvedor", "admin", "gerente_loja", "consultora"];

const FichaTecOrdemPatchSchema = z.object({
  dados: z.object({
    tipo_item: z.string().min(1, "obrigatório"),
  }).passthrough(),
}).passthrough();

// PATCH /api/ordens/[id]/ficha-tecnica
// Body: { dados: FichaTecnicaDados }
// Permissão: consultora responsável pela ordem, gerente_loja, admin, desenvolvedor
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const ordemId = Number(id);
  if (isNaN(ordemId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const [usuario] = await sql`
    SELECT role, vendedor_id FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 403 });

  if (!ROLES_PERMITIDOS.includes(usuario.role)) {
    return NextResponse.json({ error: "Sem permissão para editar ficha técnica" }, { status: 403 });
  }

  // Buscar ordem
  const [ordem] = await sql`
    SELECT id, tipo_ordem, vendedor_id, ficha_pendente, situacao
    FROM alissonerp.ordens
    WHERE id = ${ordemId}
    LIMIT 1
  `;
  if (!ordem) return NextResponse.json({ error: "Ordem não encontrada" }, { status: 404 });
  if (ordem.tipo_ordem !== "fabricacao") {
    return NextResponse.json({ error: "Ficha técnica só pode ser editada em ordens de fabricação" }, { status: 400 });
  }

  // Consultora só pode editar a própria ordem
  if (usuario.role === "consultora" && ordem.vendedor_id !== usuario.vendedor_id) {
    return NextResponse.json({ error: "Sem permissão para editar esta ordem" }, { status: 403 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = FichaTecOrdemPatchSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = { dados: parsed.data.dados as unknown as FichaTecnicaDados };

  const erroValidacao = validarFichaTecnicaServer(body.dados);
  const fichaCompleta = erroValidacao === null;

  // Upsert ficha técnica
  const [fichaExistente] = await sql`
    SELECT id FROM alissonerp.fichas_tecnicas WHERE ordem_id = ${ordemId} LIMIT 1
  `;

  if (fichaExistente) {
    await sql`
      UPDATE alissonerp.fichas_tecnicas
      SET tipo_item = ${body.dados.tipo_item},
          dados = ${JSON.stringify(body.dados)}::jsonb,
          updated_at = now()
      WHERE ordem_id = ${ordemId}
    `;
  } else {
    await sql`
      INSERT INTO alissonerp.fichas_tecnicas (ordem_id, tipo_item, dados, created_by)
      VALUES (${ordemId}, ${body.dados.tipo_item}, ${JSON.stringify(body.dados)}::jsonb, ${user.id}::uuid)
    `;
  }

  // Atualizar ficha_pendente na ordem
  await sql`
    UPDATE alissonerp.ordens
    SET ficha_pendente = ${!fichaCompleta}
    WHERE id = ${ordemId}
  `;

  return NextResponse.json({
    ok: true,
    ficha_pendente: !fichaCompleta,
    erro_validacao: erroValidacao,
  });
}
