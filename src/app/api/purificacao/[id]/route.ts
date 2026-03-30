import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { uploadFile } from "@/lib/storage";
import { isFullAccess } from "@/lib/roles";

const ROLES_CANCELAR = ["admin", "desenvolvedor"];

// GET /api/purificacao/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const purif_id = parseInt(id);
  if (isNaN(purif_id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const [purif] = await sql`
    SELECT
      p.id,
      p.status,
      p.itens,
      p.peso_total_enviado,
      p.teor_medio,
      p.peso_esperado_24k,
      p.foto_envio,
      p.observacao_envio,
      p.data_envio,
      p.peso_retornado_24k,
      p.perda_processo,
      p.perda_percentual,
      p.foto_retorno,
      p.observacao_retorno,
      p.data_retorno,
      p.criado_por,
      p.concluido_por,
      p.created_at,
      p.updated_at,
      up.name       AS criado_por_nome,
      up.avatar_url AS criado_por_foto,
      uc.name       AS concluido_por_nome
    FROM alissonerp.purificacoes p
    LEFT JOIN public.user_profiles up ON up.id_user = p.criado_por
    LEFT JOIN public.user_profiles uc ON uc.id_user = p.concluido_por
    WHERE p.id = ${purif_id}
  `;

  if (!purif) {
    return NextResponse.json({ error: "Purificação não encontrada" }, { status: 404 });
  }

  return NextResponse.json(purif);
}

// PATCH /api/purificacao/[id] — concluir purificação (retorno 24k)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const purif_id = parseInt(id);
  if (isNaN(purif_id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const body = await req.json() as {
    peso_retornado_24k: number;
    foto_retorno?: string | null;
    observacao_retorno?: string | null;
    user_id?: string | null;
    user_role?: string | null;
  };

  const { peso_retornado_24k, foto_retorno, observacao_retorno, user_id, user_role } = body;

  if (!user_id || !user_role) {
    return NextResponse.json({ error: "user_id e user_role obrigatórios" }, { status: 400 });
  }

  // Verificar permissão granular (admin/dev passam sempre)
  if (!isFullAccess(user_role)) {
    const [perm] = await sql`
      SELECT permitido FROM alissonerp.permissoes_usuario
      WHERE usuario_id = ${user_id}::uuid AND acao = 'concluir_purificacao'
    `;
    if (!perm?.permitido) {
      return NextResponse.json(
        { error: "Você não tem permissão para esta ação. Solicite ao administrador." },
        { status: 403 },
      );
    }
  }

  if (!peso_retornado_24k || peso_retornado_24k <= 0) {
    return NextResponse.json({ error: "peso_retornado_24k deve ser maior que zero" }, { status: 400 });
  }

  // Carregar purificação
  const [purif] = await sql`
    SELECT id, status, peso_esperado_24k, itens
    FROM alissonerp.purificacoes
    WHERE id = ${purif_id}
  `;

  if (!purif) {
    return NextResponse.json({ error: "Purificação não encontrada" }, { status: 404 });
  }

  if ((purif as { status: string }).status !== "em_processo") {
    return NextResponse.json(
      { error: `Purificação está com status "${(purif as { status: string }).status}" — somente em_processo pode ser concluída` },
      { status: 400 },
    );
  }

  const peso_esperado = Number((purif as { peso_esperado_24k: string | number }).peso_esperado_24k);

  // Validar que retornado não excede esperado × 1.05 (5% tolerância)
  if (peso_retornado_24k > peso_esperado * 1.05) {
    return NextResponse.json(
      { error: `Peso retornado (${peso_retornado_24k}g) excede o esperado com tolerância (${(peso_esperado * 1.05).toFixed(2)}g)` },
      { status: 400 },
    );
  }

  // Calcular perdas
  const perda_processo   = Number((peso_esperado - peso_retornado_24k).toFixed(2));
  const perda_percentual = Number(((perda_processo / peso_esperado) * 100).toFixed(2));

  // Buscar insumo Ouro 24k
  const [ouro24k] = await sql`
    SELECT id FROM alissonerp.insumos WHERE sku = 'OURO-24K' LIMIT 1
  `;
  if (!ouro24k) {
    return NextResponse.json({ error: "Insumo Ouro 24k (OURO-24K) não encontrado no banco" }, { status: 500 });
  }
  const ouro24k_id = (ouro24k as { id: number }).id;

  // Upload foto retorno
  let foto_url: string | null = null;
  if (foto_retorno) {
    const timestamp = Date.now();
    const uploadResult = await uploadFile(
      "purificacao-fotos",
      `purif-retorno-${purif_id}-${timestamp}.jpg`,
      foto_retorno,
      "image/jpeg",
    );
    if ("error" in uploadResult) {
      return NextResponse.json({ error: `Erro ao fazer upload da foto: ${uploadResult.error}` }, { status: 500 });
    }
    foto_url = uploadResult.url;
  }

  // Atualizar purificação
  await sql`
    UPDATE alissonerp.purificacoes SET
      status              = 'concluida',
      peso_retornado_24k  = ${peso_retornado_24k},
      perda_processo      = ${perda_processo},
      perda_percentual    = ${perda_percentual},
      foto_retorno        = ${foto_url},
      observacao_retorno  = ${observacao_retorno ?? null},
      data_retorno        = NOW(),
      concluido_por       = ${user_id}::uuid,
      updated_at          = NOW()
    WHERE id = ${purif_id}
  `;

  // Inserir movimentação de entrada de Ouro 24k no pote (deposito_id=1)
  await sql`
    INSERT INTO alissonerp.movimentacoes_estoque
      (insumo_id, deposito_id, entrada, marcador, obs, created_by, created_at, local_estoque_id)
    VALUES
      (
        ${ouro24k_id},
        1,
        ${peso_retornado_24k}::real,
        'PURIF_ENTRADA'::alissonerp.enum_marcador_estoque,
        ${'Purificação #' + purif_id + ' — retorno 24k fino'},
        ${user_id}::uuid,
        NOW(),
        1
      )
  `;

  return NextResponse.json({
    ok: true,
    peso_retornado_24k,
    perda_processo,
    perda_percentual,
  });
}

// DELETE /api/purificacao/[id] — cancelar purificação (estornar saídas)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const purif_id = parseInt(id);
  if (isNaN(purif_id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const body = await req.json() as {
    user_id?: string | null;
    user_role?: string | null;
  };
  const { user_id, user_role } = body;

  // Validar role (só admin/desenvolvedor)
  if (!user_role || !ROLES_CANCELAR.includes(user_role)) {
    return NextResponse.json(
      { error: "Acesso negado. Somente admin e desenvolvedor podem cancelar purificações" },
      { status: 403 },
    );
  }

  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 });
  }

  // Carregar purificação
  const [purif] = await sql`
    SELECT id, status, itens
    FROM alissonerp.purificacoes
    WHERE id = ${purif_id}
  `;

  if (!purif) {
    return NextResponse.json({ error: "Purificação não encontrada" }, { status: 404 });
  }

  if ((purif as { status: string }).status !== "em_processo") {
    return NextResponse.json(
      { error: `Purificação está com status "${(purif as { status: string }).status}" — somente em_processo pode ser cancelada` },
      { status: 400 },
    );
  }

  const itens = (purif as { itens: { insumo_id: number; peso: number; teor: number }[] }).itens;

  // Estornar: inserir entradas de retorno para cada item (PURIF_CANCEL)
  for (const item of itens) {
    await sql`
      INSERT INTO alissonerp.movimentacoes_estoque
        (insumo_id, deposito_id, entrada, marcador, obs, created_by, created_at, local_estoque_id)
      VALUES
        (
          ${item.insumo_id},
          1,
          ${item.peso}::real,
          'PURIF_CANCEL'::alissonerp.enum_marcador_estoque,
          ${'Cancelamento purificação #' + purif_id + ' — estorno de saída'},
          ${user_id}::uuid,
          NOW(),
          1
        )
    `;
  }

  // Marcar como cancelada
  await sql`
    UPDATE alissonerp.purificacoes SET
      status     = 'cancelada',
      updated_at = NOW()
    WHERE id = ${purif_id}
  `;

  return NextResponse.json({ ok: true });
}
