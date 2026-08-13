import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { uploadFile, ensureBucket } from "@/lib/storage";
import { getParametroNumber, PARAM } from "@/lib/parametros";
import { zodError } from "@/lib/schemas/common";

const ROLES_EXECUTORES = ["operador", "gerente_fabrica", "admin", "desenvolvedor"];

const ConcluirServicoSchema = z.object({
  conversao_sku_id: z.coerce.number().int().positive(),
  peso_final: z.coerce.number().positive(),
  quantidade_produzida: z.coerce.number().positive(),
  foto_balanca_base64: z.string().optional(),
  peso_sobra_real: z.coerce.number(),
  foto_sobra_base64: z.string().optional(),
}).passthrough();

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario || !ROLES_EXECUTORES.includes(usuario.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = ConcluirServicoSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { conversao_sku_id, peso_final, quantidade_produzida, foto_balanca_base64, peso_sobra_real, foto_sobra_base64 } = parsed.data;

  const [conv] = await sql`
    SELECT cs.*, o.numero_ordem
    FROM alissonerp.conversoes_sku cs
    JOIN alissonerp.ordens o ON o.id = cs.ordem_id
    WHERE cs.id = ${conversao_sku_id} AND cs.status_conversao = 'em_fabrica'
    LIMIT 1
  `;
  if (!conv) return NextResponse.json({ error: "Conversão não encontrada ou não está em execução" }, { status: 404 });

  let fotoBalancaPath: string | null = null;
  if (foto_balanca_base64) {
    try { await ensureBucket("conversao-fotos"); } catch { /* ok */ }
    fotoBalancaPath = `sku_balanca/${conv.ordem_id}/${Date.now()}_${user.id}.jpg`;
    const r = await uploadFile("conversao-fotos", fotoBalancaPath, foto_balanca_base64, "image/jpeg");
    if ("error" in r) { console.warn("[concluir-servico] Upload foto balança falhou"); fotoBalancaPath = null; }
  }

  let fotoSobraPath: string | null = null;
  if (foto_sobra_base64) {
    fotoSobraPath = `sku_sobra/${conv.ordem_id}/${Date.now()}_${user.id}.jpg`;
    const r = await uploadFile("conversao-fotos", fotoSobraPath, foto_sobra_base64, "image/jpeg");
    if ("error" in r) { console.warn("[concluir-servico] Upload foto sobra falhou"); fotoSobraPath = null; }
  }

  const sobraCalculada = Number(conv.sku_origem_peso) - peso_final;
  const pesoSobraReal = peso_sobra_real || 0;
  const quebra = Math.max(sobraCalculada - pesoSobraReal, 0);
  const insumoId = await getParametroNumber(PARAM.INSUMO_SOBRA_CONVERSAO_SKU).catch(() => 1);

  const [prot] = await sql`
    SELECT p.tipo_protocolo FROM alissonerp.protocolo_ordens po
    JOIN alissonerp.protocolos p ON p.id = po.protocolo_id
    WHERE po.ordem_id = ${conv.ordem_id}
      AND p.direcao = 'ida'::alissonerp.enum_direcao_protocolo
      AND p.etapas = 'concluido'::alissonerp.enum_etapas_protocolo
    ORDER BY p.created_at DESC LIMIT 1
  `;
  const localFabrica = prot?.tipo_protocolo === 'service' ? 3 : 1;

  const result = await sql.begin(async (tx: any) => {
    await tx`
      INSERT INTO alissonerp.movimentacoes_estoque_comercial
        (produto_id, tipo, quantidade, motivo, local_estoque_id, status,
         ordem_id, referencia_id, observacao, created_by)
      VALUES
        (${conv.sku_origem_id}, 'saida', ${conv.sku_origem_quantidade},
         'conversao_sku_consumo', ${localFabrica}, 'efetivado',
         ${conv.ordem_id}, ${conv.ordem_id},
         'Consumo ' || COALESCE(${conv.numero_ordem}, 'CS#' || ${conv.id}),
         ${user.id}::uuid)
    `;

    await tx`
      INSERT INTO alissonerp.movimentacoes_estoque_comercial
        (produto_id, tipo, quantidade, motivo, local_estoque_id, status,
         ordem_id, referencia_id, observacao, created_by)
      VALUES
        (${conv.sku_destino_id}, 'entrada', ${quantidade_produzida},
         'conversao_sku_producao', ${localFabrica}, 'efetivado',
         ${conv.ordem_id}, ${conv.ordem_id},
         'Producao ' || COALESCE(${conv.numero_ordem}, 'CS#' || ${conv.id}),
         ${user.id}::uuid)
    `;

    if (pesoSobraReal > 0) {
      await tx`
        INSERT INTO alissonerp.movimentacoes_estoque
          (entrada, insumo_id, deposito_id, local_estoque_id, marcador, ordem_id, obs, created_by)
        VALUES
          (${pesoSobraReal}, ${insumoId}, ${localFabrica}, ${localFabrica},
           'EM'::alissonerp.enum_marcador_estoque, ${conv.ordem_id},
           'Sobra ' || COALESCE(${conv.numero_ordem}, 'CS#' || ${conv.id}),
           ${user.id}::uuid)
      `;
    }

    await tx`
      UPDATE alissonerp.conversoes_sku
      SET status_conversao = 'aguardando_volta',
          peso_final = ${peso_final},
          quantidade_produzida = ${quantidade_produzida},
          foto_balanca_final = ${fotoBalancaPath},
          peso_sobra_calculado = ${sobraCalculada},
          peso_sobra_real = ${pesoSobraReal},
          foto_sobra = ${fotoSobraPath},
          quebra = ${quebra},
          insumo_destino_sobra = ${insumoId},
          updated_at = NOW()
      WHERE id = ${conv.id}
    `;

    if (conv.ordem_servico_id) {
      await tx`
        UPDATE alissonerp.ordens
        SET status = 'concluido', data_conclusao = NOW(), updated_at = NOW()
        WHERE id = ${conv.ordem_servico_id}
      `;
    }
    // Garantir que a ordem CS-XXXX volte para 'aguardando' (protocolo pode ter mudado)
    await tx`
      UPDATE alissonerp.ordens
      SET status = 'aguardando', updated_at = NOW()
      WHERE id = ${conv.ordem_id} AND tipo_ordem::text = 'conversao_sku'
    `;

    return {
      sobra_calculada: sobraCalculada,
      sobra_real: pesoSobraReal,
      quebra: quebra,
      status: "aguardando_volta",
    };
  });

  return NextResponse.json({
    ok: true,
    message: "Conversão concluída! Aguardando protocolo de volta.",
    ...result,
  });
}
