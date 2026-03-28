import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { uploadFile, deleteFile } from "@/lib/storage";

const FULL_ACCESS_ROLES = ["desenvolvedor", "admin"];
const ALL_TIPOS = [
  "servico_venda", "servico_loja", "fabricacao", "reposicao_venda",
  "reposicao_loja", "compra_fornecedor", "garantia", "servico_interno",
];
const SERVICO_TIPOS = ["servico_venda", "servico_loja"];

// POST /api/ordens — cria uma nova ordem no ERP
// Body: { tipo_ordem, cliente_id?, vendedor_id?, data_entrega?, peso_metal_negociado?,
//         foto_peca_servico?, peso_peca_servico?, video_observacao?,
//         detalhes_ordem?,   (observações livres, vai em ordens.detalhes_ordem)
//         fotos_base64?,     (string[] base64 — upload server-side para bucket ordem-fotos)
//         itens?: [{ produto_id, quantidade, peso_estimado? }] }
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = await req.json();
  const {
    tipo_ordem,
    cliente_id,
    vendedor_id,
    data_entrega,
    peso_metal_negociado,
    foto_peca_servico,   // storage path (já enviado pelo client)
    peso_peca_servico,
    video_observacao,    // storage path (já enviado pelo client)
    detalhes_ordem,      // texto livre de observações
    fotos_base64,        // string[] — upload server-side para bucket ordem-fotos
    itens = [],
  } = body;

  if (!tipo_ordem) {
    return NextResponse.json({ error: "tipo_ordem é obrigatório" }, { status: 400 });
  }

  // ── Verificar permissão ──────────────────────────────────────────────────
  const [usuario] = await sql`
    SELECT role, tipos_ordem_permitidos
    FROM alissonerp.usuarios
    WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario) {
    return NextResponse.json({ error: "Usuário não encontrado no ERP" }, { status: 403 });
  }

  const isFullAccess = FULL_ACCESS_ROLES.includes(usuario.role);
  const tiposPermitidos: string[] = isFullAccess
    ? ALL_TIPOS
    : (usuario.tipos_ordem_permitidos ?? []);

  if (!tiposPermitidos.includes(tipo_ordem)) {
    return NextResponse.json(
      { error: `Sem permissão para criar ordens do tipo "${tipo_ordem}"` },
      { status: 403 }
    );
  }

  // ── Upload de fotos de referência (server-side, antes da transação) ──────
  // Se qualquer upload falhar → retorna erro sem criar a ordem
  const fotosPaths: string[] = [];
  if (Array.isArray(fotos_base64) && fotos_base64.length > 0) {
    for (let i = 0; i < fotos_base64.length; i++) {
      const base64 = fotos_base64[i] as string;
      if (!base64) continue;
      const path = `reposicao/${Date.now()}_${i}.jpg`;
      const result = await uploadFile("ordem-fotos", path, base64, "image/jpeg");
      if ("error" in result) {
        // Limpar uploads já realizados para evitar órfãos
        for (const p of fotosPaths) {
          await deleteFile("ordem-fotos", p).catch(() => {});
        }
        return NextResponse.json(
          { error: `Erro ao enviar foto ${i + 1}: ${result.error}` },
          { status: 500 }
        );
      }
      fotosPaths.push(result.path);
    }
  }

  // ── Gerar numero_ordem (C-XXXX) ─────────────────────────────────────────
  // Verifica MAX nos dois schemas para evitar colisão com PDV
  const [{ max_num: maxAlisson }] = await sql`
    SELECT COALESCE(MAX(CAST(SUBSTRING(numero_ordem FROM 3) AS INTEGER)), 0) AS max_num
    FROM alissonerp.ordens
    WHERE numero_ordem ~ '^C-[0-9]+$'
  `;
  const [{ max_num: maxDirectus }] = await sql`
    SELECT COALESCE(MAX(CAST(SUBSTRING(numero_ordem FROM 3) AS INTEGER)), 0) AS max_num
    FROM directus.ordens
    WHERE numero_ordem ~ '^C-[0-9]+$'
  `;
  const nextNum = Math.max(Number(maxAlisson), Number(maxDirectus)) + 1;
  const numeroOrdem = `C-${String(nextNum).padStart(4, "0")}`;

  // ── Determinar rota ──────────────────────────────────────────────────────
  const rota = SERVICO_TIPOS.includes(tipo_ordem) ? "protocolo" : "pcp";

  const fotosPathsVal = fotosPaths.length > 0 ? fotosPaths : null;

  // ── Transação: ordem + itens + auditoria loja ───────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const novaOrdem = await sql.begin(async (tx: any) => {
    // 1. Inserir ordem
    const [ordem] = await tx`
      INSERT INTO alissonerp.ordens (
        numero_ordem, tipo_ordem, cliente_id, vendedor_id,
        data_entrega, peso_metal_negociado,
        foto_peca_servico, peso_peca_servico, video_observacao,
        detalhes_ordem, fotos_paths,
        situacao, status, rota, origem, created_by
      ) VALUES (
        ${numeroOrdem},
        ${tipo_ordem}::alissonerp.enum_tipo_ordem,
        ${cliente_id ?? null},
        ${vendedor_id ?? null},
        ${data_entrega ?? null},
        ${peso_metal_negociado ?? 0},
        ${foto_peca_servico ?? null},
        ${peso_peca_servico ?? null},
        ${video_observacao ?? null},
        ${detalhes_ordem ?? null},
        ${fotosPathsVal},
        'criado',
        'aguardando',
        ${rota}::alissonerp.enum_rota_ordem,
        'erp',
        ${user.id}::uuid
      )
      RETURNING id, numero_ordem
    `;

    // 2. Inserir itens (se houver)
    for (const item of itens) {
      if (!item.produto_id) continue;
      const [produto] = await tx`
        SELECT id_produto, nome, sku, peso_precificado
        FROM public.produtos
        WHERE id_produto = ${item.produto_id}
        LIMIT 1
      `;
      if (!produto) continue;
      // peso_estimado: respeita valor do body se fornecido, senão usa DB
      const pesoEstimado = item.peso_estimado != null
        ? Number(item.peso_estimado)
        : (produto.peso_precificado != null ? Number(produto.peso_precificado) : null);
      await tx`
        INSERT INTO alissonerp.itens_ordem (
          ordem_id, produto_id, nome_produto, sku, quantidade, peso_estimado
        ) VALUES (
          ${ordem.id},
          ${produto.id_produto},
          ${produto.nome},
          ${produto.sku},
          ${item.quantidade ?? 1},
          ${pesoEstimado}
        )
      `;
    }

    // 3. Criar auditoria loja (igual ao fn_ponte)
    await tx`
      INSERT INTO alissonerp.auditorias (
        situacao, tipo_auditoria, rota_processo, ordem_id,
        peso_negociado, dados_ordem
      ) VALUES (
        'pendente',
        'loja',
        'entrada_ordem',
        ${ordem.id},
        ${peso_metal_negociado ?? 0},
        ${JSON.stringify({
          numero_ordem: numeroOrdem,
          tipo_ordem,
          rota,
          peso_negociado: peso_metal_negociado ?? 0,
          peso_externo: 0,
          cliente_id: cliente_id ?? null,
          vendedor_id: vendedor_id ?? null,
          data_entrega: data_entrega ?? null,
          itens_fabricacao: null,
          ficha_tecnica_id: null,
          origem: "erp",
        })}::jsonb
      )
    `;

    return ordem;
  });

  return NextResponse.json(
    { id: novaOrdem.id, numero_ordem: novaOrdem.numero_ordem },
    { status: 201 }
  );
}
