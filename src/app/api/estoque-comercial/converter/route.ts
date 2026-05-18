import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { uploadFile, ensureBucket } from "@/lib/storage";
import { getParametroNumber, PARAM } from "@/lib/parametros";
import { zodError } from "@/lib/schemas/common";

const ROLES_PERMITIDOS = ["estoquista_loja", "gerente_loja", "admin", "desenvolvedor"];

const ConverterPostSchema = z.object({
  itens: z.array(z.object({
    produto_id: z.coerce.number().int().positive(),
    peso_individual: z.coerce.number().positive(),
    quantidade: z.coerce.number().positive(),
  })).min(1, "ao menos um item"),
  foto_base64: z.string().optional(),
  insumo_destino: z.coerce.number().int().positive().optional(),
}).passthrough();

// POST /api/estoque-comercial/converter
// Cria uma conversão de estoque comercial → metal
// Body: { itens: [{ produto_id, peso_individual, quantidade }], foto_base64?, insumo_destino? }
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

  const raw = await req.json().catch(() => ({}));
  const parsed = ConverterPostSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { itens, foto_base64, insumo_destino } = parsed.data;

  // Upload da foto (se fornecida — falha não bloqueia a conversão)
  let fotoPath: string | null = null;
  if (foto_base64) {
    try {
      await ensureBucket("conversao-fotos");
    } catch {
      console.warn("[converter] ensureBucket falhou — continuando sem bucket");
    }
    const fp = `abertura/${Date.now()}_${user.id}.jpg`;
    const r = await uploadFile("conversao-fotos", fp, foto_base64, "image/jpeg");
    if ("error" in r) {
      console.warn(`[converter] Upload da foto falhou — continuando sem foto: ${r.error}`);
    } else {
      fotoPath = r.path;
    }
  }

  // Calcular totais
  let pesoTotal = 0;
  let quantidadeTotal = 0;
  for (const item of itens) {
    pesoTotal += item.peso_individual;
    quantidadeTotal += item.quantidade;
  }

  // ── Buscar insumo destino padrão do sistema ──────────────────────────────
  const insumoDestino = insumo_destino ?? await getParametroNumber(PARAM.INSUMO_CONVERSAO_PADRAO).catch(() => 1);

  // ── Transação: ordem + conversao + itens + movimentações ─────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await sql.begin(async (tx: any) => {
    // 1. Gerar numero_ordem
    const [{ max_id_ali }] = await tx`
      SELECT COALESCE(MAX(id), 0) AS max_id_ali FROM alissonerp.ordens
    `;
    const [{ max_id_dir }] = await tx`
      SELECT COALESCE(MAX(id), 0) AS max_id_dir FROM directus.ordens
    `;
    const nextNum = Math.max(Number(max_id_ali), Number(max_id_dir)) + 1;
    const numeroOrdem = "C-" + String(nextNum).padStart(4, "0");

    // 2. Criar ordem (tipo_ordem='conversao', rota='protocolo')
    const [ordem] = await tx`
      INSERT INTO alissonerp.ordens (
        numero_ordem, tipo_ordem, situacao, status, rota, created_by
      ) VALUES (
        ${numeroOrdem},
        'conversao'::alissonerp.enum_tipo_ordem,
        'criado',
        'aguardando',
        'protocolo'::alissonerp.enum_rota_ordem,
        ${user.id}::uuid
      )
      RETURNING id, numero_ordem
    `;

    // 3. Criar conversoes_estoque (trigger trg_criar_tarefa_conversao roda aqui)
    const [conversao] = await tx`
      INSERT INTO alissonerp.conversoes_estoque (
        ordem_id, peso_total, quantidade_total, foto_abertura,
        insumo_destino, created_by
      ) VALUES (
        ${ordem.id}, ${pesoTotal}, ${quantidadeTotal}, ${fotoPath},
        ${insumoDestino}, ${user.id}::uuid
      )
      RETURNING id
    `;

    // 4. Para cada item: verificar saldo, criar movimentação saída, criar conversao_item
    for (const item of itens) {
      // Verificar saldo no local Loja (id=2)
      const [saldo] = await tx`
        SELECT COALESCE(SUM(disponivel), 0) AS disponivel
        FROM alissonerp.vw_saldo_estoque_comercial_v2
        WHERE produto_id = ${item.produto_id} AND local_estoque_id = 2
      `;
      if (!saldo || Number(saldo.disponivel) < item.quantidade) {
        throw new Error(
          `Saldo insuficiente para produto ${item.produto_id}. ` +
          `Disponível: ${saldo?.disponivel ?? 0}, necessário: ${item.quantidade}`
        );
      }

      // Criar reserva de estoque — 'ativo' (similar ao PDV), não deduz saldo_fisico
      const [reserva] = await tx`
        INSERT INTO alissonerp.reservas_estoque_comercial
          (produto_id, quantidade, local_estoque_id, status, ordem_id)
        VALUES
          (${item.produto_id}, ${item.quantidade}, 2, 'ativo', ${ordem.id})
        RETURNING id
      `;

      // Criar conversao_item com vínculo da reserva
      await tx`
        INSERT INTO alissonerp.conversao_itens
          (conversao_id, produto_id, peso_individual, quantidade, reserva_id)
        VALUES
          (${conversao.id}, ${item.produto_id}, ${item.peso_individual}, ${item.quantidade}, ${reserva.id})
      `;
    }

    return { ordem_id: ordem.id, numero_ordem: ordem.numero_ordem, conversao_id: conversao.id };
  });

  return NextResponse.json(result, { status: 201 });
}
