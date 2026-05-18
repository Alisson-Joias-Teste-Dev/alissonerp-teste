import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { uploadFile } from "@/lib/storage";
import { isFullAccess } from "@/lib/roles";
import { requireAuth, AuthError } from "@/lib/auth-server";
import { zodError } from "@/lib/schemas/common";

const LigacaoPatchSchema = z.object({
  peso_18k_real: z.coerce.number().positive(),
  foto_resultado: z.string().nullable().optional(),
  observacao: z.string().nullable().optional(),
}).passthrough();

const ROLES_CANCELAR = ["admin", "desenvolvedor"];

function authErrorResponse(e: unknown) {
  if (e instanceof AuthError) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  throw e;
}

// PATCH /api/purificacao/ligacao/[id] — Concluir (18k produzido)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let user;
  try { user = await requireAuth(req); } catch (e) { return authErrorResponse(e); }

  const { id } = await params;
  const ligacao_id = parseInt(id);
  if (isNaN(ligacao_id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = LigacaoPatchSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { peso_18k_real, foto_resultado, observacao } = parsed.data;

  // Verificar permissão granular (admin/dev/diretor passam sempre)
  if (!isFullAccess(user.role)) {
    const [perm] = await sql`
      SELECT permitido FROM alissonerp.permissoes_usuario
      WHERE usuario_id = ${user.id}::uuid AND acao = 'concluir_ligacao'
    `;
    if (!perm?.permitido) {
      return NextResponse.json(
        { error: "Você não tem permissão para esta ação. Solicite ao administrador." },
        { status: 403 },
      );
    }
  }

  if (!peso_18k_real || peso_18k_real <= 0) {
    return NextResponse.json({ error: "peso_18k_real deve ser maior que zero" }, { status: 400 });
  }

  // Carregar ligação
  const [ligacao] = await sql`
    SELECT id, status, tipo_18k_insumo_id, tipo_18k_nome, liga_insumo_id, liga_nome,
           peso_24k, teor, peso_liga_calculado, peso_18k_esperado
    FROM alissonerp.ligacoes
    WHERE id = ${ligacao_id}
  `;

  if (!ligacao) {
    return NextResponse.json({ error: "Ligação não encontrada" }, { status: 404 });
  }

  if ((ligacao as any).status !== "em_processo") {
    return NextResponse.json(
      { error: `Ligação está com status "${(ligacao as any).status}" — somente em_processo pode ser concluída` },
      { status: 400 },
    );
  }

  const peso_esperado = Number((ligacao as any).peso_18k_esperado);

  // Tolerância 5%
  if (peso_18k_real > peso_esperado * 1.05) {
    return NextResponse.json(
      { error: `Peso real (${peso_18k_real}g) excede o esperado com tolerância (${(peso_esperado * 1.05).toFixed(3)}g)` },
      { status: 400 },
    );
  }

  // Calcular perda
  const perda_processo   = Number((peso_esperado - peso_18k_real).toFixed(3));
  const perda_percentual = Number(((perda_processo / peso_esperado) * 100).toFixed(2));

  // Upload foto
  let foto_url: string | null = null;
  if (foto_resultado) {
    const timestamp = Date.now();
    const uploadResult = await uploadFile(
      "purificacao-fotos",
      `ligacao-resultado-${ligacao_id}-${timestamp}.jpg`,
      foto_resultado,
      "image/jpeg",
    );
    if ("error" in uploadResult) {
      return NextResponse.json({ error: `Erro ao fazer upload da foto: ${uploadResult.error}` }, { status: 500 });
    }
    foto_url = uploadResult.url;
  }

  // Atualizar ligação
  await sql`
    UPDATE alissonerp.ligacoes SET
      status               = 'concluida',
      peso_18k_real        = ${peso_18k_real},
      perda_processo       = ${perda_processo},
      perda_percentual     = ${perda_percentual},
      foto_resultado       = ${foto_url},
      observacao_resultado = ${observacao ?? null},
      data_conclusao       = NOW(),
      concluido_por        = ${user.id}::uuid,
      updated_at           = NOW()
    WHERE id = ${ligacao_id}
  `;

  // CE entrada 18k no pote
  const tipo_18k_insumo_id = Number((ligacao as any).tipo_18k_insumo_id);
  await sql`
    INSERT INTO alissonerp.movimentacoes_estoque
      (insumo_id, deposito_id, entrada, marcador, obs, created_by, created_at, local_estoque_id)
    VALUES (
      ${tipo_18k_insumo_id}, 1,
      ${peso_18k_real}::real,
      'LIGA_ENTRADA_18K'::alissonerp.enum_marcador_estoque,
      ${'Ligação #' + ligacao_id + ' — entrada ' + (ligacao as any).tipo_18k_nome},
      ${user.id}::uuid,
      NOW(), 1
    )
  `;

  return NextResponse.json({
    ok: true,
    peso_18k_real,
    perda_processo,
    perda_percentual,
  });
}

// DELETE /api/purificacao/ligacao/[id] — Cancelar
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let user;
  try { user = await requireAuth(req); } catch (e) { return authErrorResponse(e); }

  const { id } = await params;
  const ligacao_id = parseInt(id);
  if (isNaN(ligacao_id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  // Validar role
  if (!ROLES_CANCELAR.includes(user.role)) {
    return NextResponse.json(
      { error: "Acesso negado. Somente admin e desenvolvedor podem cancelar ligações" },
      { status: 403 },
    );
  }

  // Carregar ligação
  const [ligacao] = await sql`
    SELECT id, status, peso_24k, liga_insumo_id, liga_nome, peso_liga_calculado
    FROM alissonerp.ligacoes
    WHERE id = ${ligacao_id}
  `;

  if (!ligacao) {
    return NextResponse.json({ error: "Ligação não encontrada" }, { status: 404 });
  }

  if ((ligacao as any).status !== "em_processo") {
    return NextResponse.json(
      { error: `Ligação está com status "${(ligacao as any).status}" — somente em_processo pode ser cancelada` },
      { status: 400 },
    );
  }

  const { peso_24k, liga_insumo_id, liga_nome, peso_liga_calculado } = ligacao as any;

  // CE reversa: 24k volta pro pote
  await sql`
    INSERT INTO alissonerp.movimentacoes_estoque
      (insumo_id, deposito_id, entrada, marcador, obs, created_by, created_at, local_estoque_id)
    VALUES (
      275, 1,
      ${Number(peso_24k)}::real,
      'LIGA_CANCEL'::alissonerp.enum_marcador_estoque,
      ${'Cancelamento Ligação #' + ligacao_id + ' — estorno Ouro 24k'},
      ${user.id}::uuid,
      NOW(), 1
    )
  `;

  // CE reversa: liga volta pro pote
  await sql`
    INSERT INTO alissonerp.movimentacoes_estoque
      (insumo_id, deposito_id, entrada, marcador, obs, created_by, created_at, local_estoque_id)
    VALUES (
      ${Number(liga_insumo_id)}, 1,
      ${Number(peso_liga_calculado)}::real,
      'LIGA_CANCEL'::alissonerp.enum_marcador_estoque,
      ${'Cancelamento Ligação #' + ligacao_id + ' — estorno ' + liga_nome},
      ${user.id}::uuid,
      NOW(), 1
    )
  `;

  // Marcar como cancelada
  await sql`
    UPDATE alissonerp.ligacoes SET
      status     = 'cancelada',
      updated_at = NOW()
    WHERE id = ${ligacao_id}
  `;

  return NextResponse.json({ ok: true });
}
