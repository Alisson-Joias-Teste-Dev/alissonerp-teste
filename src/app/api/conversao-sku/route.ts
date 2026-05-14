import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { uploadFile, ensureBucket } from "@/lib/storage";

const ROLES_PERMITIDOS = ["estoquista_loja", "gerente_loja", "admin", "desenvolvedor"];

// POST /api/conversao-sku
// Cria uma solicitação de conversão SKU
// Body: { sku_origem_id, sku_origem_quantidade, sku_origem_peso, local_origem_id, sku_destino_id, sku_destino_quantidade_desejada, local_destino_id, foto_base64 }
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario || !ROLES_PERMITIDOS.includes(usuario.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const body = await req.json() as {
    sku_origem_id: number;
    sku_origem_quantidade: number;
    sku_origem_peso: number;
    local_origem_id: number;
    sku_destino_id: number;
    sku_destino_quantidade_desejada: number;
    local_destino_id: number;
    foto_base64?: string;
  };

  const {
    sku_origem_id, sku_origem_quantidade, sku_origem_peso,
    local_origem_id, sku_destino_id, sku_destino_quantidade_desejada,
    local_destino_id, foto_base64,
  } = body;

  // Validações
  if (!sku_origem_id || sku_origem_id <= 0) {
    return NextResponse.json({ error: "sku_origem_id inválido" }, { status: 400 });
  }
  if (!sku_origem_quantidade || sku_origem_quantidade <= 0) {
    return NextResponse.json({ error: "sku_origem_quantidade inválido" }, { status: 400 });
  }
  if (!sku_origem_peso || sku_origem_peso <= 0) {
    return NextResponse.json({ error: "sku_origem_peso inválido" }, { status: 400 });
  }
  if (!sku_destino_id || sku_destino_id <= 0) {
    return NextResponse.json({ error: "sku_destino_id inválido" }, { status: 400 });
  }
  if (!sku_destino_quantidade_desejada || sku_destino_quantidade_desejada <= 0) {
    return NextResponse.json({ error: "sku_destino_quantidade_desejada inválido" }, { status: 400 });
  }
  if (!local_origem_id || local_origem_id <= 0) {
    return NextResponse.json({ error: "local_origem_id inválido" }, { status: 400 });
  }
  if (!local_destino_id || local_destino_id <= 0) {
    return NextResponse.json({ error: "local_destino_id inválido" }, { status: 400 });
  }

  // Upload da foto
  let fotoPath: string | null = null;
  if (foto_base64) {
    try {
      await ensureBucket("conversao-fotos");
    } catch {
      console.warn("[conversao-sku] ensureBucket falhou");
    }
    const fp = `sku_abertura/${Date.now()}_${user.id}.jpg`;
    const r = await uploadFile("conversao-fotos", fp, foto_base64, "image/jpeg");
    if ("error" in r) {
      console.warn(`[conversao-sku] Upload foto falhou: ${r.error}`);
    } else {
      fotoPath = r.path;
    }
  }

  // Transação
  const result = await sql.begin(async (tx: any) => {
    // 1. Gerar numero_ordem
    const [{ max_id }] = await tx`
      SELECT COALESCE(MAX(id), 0) AS max_id FROM alissonerp.ordens
    `;
    const nextNum = Number(max_id) + 1;
    const numeroOrdem = "CS-" + String(nextNum).padStart(4, "0");

    // 2. Verificar saldo no local de origem
    const [saldo] = await tx`
      SELECT COALESCE(SUM(disponivel), 0) AS disponivel
      FROM alissonerp.vw_saldo_estoque_comercial_v2
      WHERE produto_id = ${sku_origem_id} AND local_estoque_id = ${local_origem_id}
    `;
    if (!saldo || Number(saldo.disponivel) < sku_origem_quantidade) {
      throw new Error(
        `Saldo insuficiente para o SKU origem. Disponivel: ${saldo?.disponivel ?? 0}, necessario: ${sku_origem_quantidade}`
      );
    }

    // 3. Criar ordem (tipo_ordem='conversao_sku', rota='protocolo')
    const [ordem] = await tx`
      INSERT INTO alissonerp.ordens (
        numero_ordem, tipo_ordem, situacao, status, rota, created_by
      ) VALUES (
        ${numeroOrdem},
        'conversao_sku'::alissonerp.enum_tipo_ordem,
        'criado',
        'aguardando',
        'protocolo'::alissonerp.enum_rota_ordem,
        ${user.id}::uuid
      )
      RETURNING id, numero_ordem
    `;

    // 4. Criar reserva do SKU origem (status='ativo')
    const [reserva] = await tx`
      INSERT INTO alissonerp.reservas_estoque_comercial
        (produto_id, quantidade, local_estoque_id, status, ordem_id)
      VALUES
        (${sku_origem_id}, ${sku_origem_quantidade}, ${local_origem_id}, 'ativo', ${ordem.id})
      RETURNING id
    `;

    // 5. Criar conversoes_sku (trigger trg_criar_tarefa_conversao_sku roda aqui)
    const [conv] = await tx`
      INSERT INTO alissonerp.conversoes_sku (
        ordem_id,
        sku_origem_id, sku_origem_quantidade, sku_origem_peso, local_origem_id,
        sku_destino_id, sku_destino_quantidade_desejada, local_destino_id,
        foto_abertura, reserva_id, created_by
      ) VALUES (
        ${ordem.id},
        ${sku_origem_id}, ${sku_origem_quantidade}, ${sku_origem_peso}, ${local_origem_id},
        ${sku_destino_id}, ${sku_destino_quantidade_desejada}, ${local_destino_id},
        ${fotoPath}, ${reserva.id}, ${user.id}::uuid
      )
      RETURNING id
    `;

    return { ordem_id: ordem.id, numero_ordem: ordem.numero_ordem, conversao_sku_id: conv.id };
  });

  return NextResponse.json(result, { status: 201 });
}
