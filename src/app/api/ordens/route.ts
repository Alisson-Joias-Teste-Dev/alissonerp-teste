import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { uploadFile, deleteFile } from "@/lib/storage";
import { validarFichaTecnicaServer } from "@/lib/validar-ficha-tecnica";
import {
  personalizacaoParaObservacao,
  type PersonalizacaoAplicada,
} from "@/lib/personalizacao-validacao";

const FULL_ACCESS_ROLES = ["desenvolvedor", "admin"];
const ALL_TIPOS = [
  "servico_venda", "servico_loja", "fabricacao", "reposicao_venda",
  "reposicao_loja", "compra_fornecedor", "garantia", "servico_interno",
];
const SERVICO_TIPOS = ["servico_venda", "servico_loja", "garantia", "servico_interno"];

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
    foto_peca_servico,         // storage path (já enviado pelo client)
    foto_peca_servico_base64,  // base64 — upload server-side
    peso_peca_servico,
    peso_metal_externo,        // peso do metal do cliente (garantia)
    video_observacao,          // storage path (já enviado pelo client)
    video_observacao_base64,   // base64 — upload server-side
    detalhes_ordem,            // texto livre de observações
    fotos_base64,        // string[] — upload server-side para bucket ordem-fotos
    tipos_servico_ids,   // integer[] — tipos de serviço (servico_interno + garantia)
    venda_id,            // integer — referência à venda (garantia)
    venda_item_ids,      // integer[] — itens da venda em garantia
    rota_override,          // "pcp" | "protocolo" — para fabricação (escolha do usuário)
    ficha_tecnica_dados,    // { tipo_item, ...dados } — ficha técnica (fabricação)
    numero_pedido_manual,   // string — pedido PDV sem venda no ERP (fallback manual)
    itens = [],
  } = body;

  if (!tipo_ordem) {
    return NextResponse.json({ error: "tipo_ordem é obrigatório" }, { status: 400 });
  }

  // ── Validações específicas por tipo ─────────────────────────────────────
  if (tipo_ordem === "servico_interno") {
    if (!foto_peca_servico) {
      return NextResponse.json({ error: "foto_peca_servico é obrigatória para serviço interno" }, { status: 400 });
    }
    if (!video_observacao) {
      return NextResponse.json({ error: "video_observacao é obrigatório para serviço interno" }, { status: 400 });
    }
    if (!Array.isArray(tipos_servico_ids) || tipos_servico_ids.length === 0) {
      return NextResponse.json({ error: "Selecione pelo menos um tipo de serviço" }, { status: 400 });
    }
  }

  if (tipo_ordem === "garantia" || tipo_ordem === "servico_venda") {
    const label = tipo_ordem === "garantia" ? "garantia" : "serviço venda";
    if (!cliente_id) {
      return NextResponse.json({ error: `Cliente é obrigatório para ${label}` }, { status: 400 });
    }
    if (!foto_peca_servico && !foto_peca_servico_base64) {
      return NextResponse.json({ error: `Foto da balança é obrigatória para ${label}` }, { status: 400 });
    }
    if (!peso_metal_externo && peso_metal_externo !== 0) {
      return NextResponse.json({ error: `Peso do metal externo é obrigatório para ${label}` }, { status: 400 });
    }
    if (tipo_ordem === "garantia" && (!Array.isArray(tipos_servico_ids) || tipos_servico_ids.length === 0)) {
      return NextResponse.json({ error: "Selecione pelo menos um tipo de serviço" }, { status: 400 });
    }
  }

  if (tipo_ordem === "reposicao_venda") {
    if (!cliente_id) {
      return NextResponse.json({ error: "Cliente é obrigatório para reposição venda" }, { status: 400 });
    }
    if (!Array.isArray(itens) || itens.length === 0) {
      return NextResponse.json({ error: "Selecione pelo menos um item para reposição" }, { status: 400 });
    }
  }

  if (tipo_ordem === "fabricacao") {
    if (!cliente_id) {
      return NextResponse.json({ error: "Cliente é obrigatório para fabricação" }, { status: 400 });
    }
    if (!numero_pedido_manual && (!Array.isArray(itens) || itens.length === 0)) {
      return NextResponse.json({ error: "Selecione pelo menos um item para fabricação" }, { status: 400 });
    }
    if (!peso_metal_negociado && peso_metal_negociado !== 0) {
      return NextResponse.json({ error: "Peso do metal negociado é obrigatório para fabricação" }, { status: 400 });
    }
  }

  // ── Verificar permissão ──────────────────────────────────────────────────
  const [usuario] = await sql`
    SELECT role, tipos_ordem_permitidos, vendedor_id
    FROM alissonerp.usuarios
    WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario) {
    return NextResponse.json({ error: "Usuário não encontrado no ERP" }, { status: 403 });
  }

  // Auto-preencher vendedor_id a partir do usuário logado se não veio no body
  const vendedorIdFinal = vendedor_id ?? usuario.vendedor_id ?? null;

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
  if (Array.isArray(fotos_base64) && fotos_base64.length > 10) {
    return NextResponse.json({ error: "Máximo 10 fotos por ordem" }, { status: 400 });
  }
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

  // ── Upload foto_peca_servico/video_observacao de base64 se fornecido ────
  let fotoPecaServicoFinal = foto_peca_servico ?? null;
  if (foto_peca_servico_base64 && !fotoPecaServicoFinal) {
    const mt = foto_peca_servico_base64.startsWith("data:image/png") ? "image/png" : "image/jpeg";
    const fp = `servico-venda/${Date.now()}_peca.jpg`;
    const fr = await uploadFile("service-fotos", fp, foto_peca_servico_base64, mt);
    if ("error" in fr) return NextResponse.json({ error: `Erro ao enviar foto: ${fr.error}` }, { status: 500 });
    fotoPecaServicoFinal = fr.path;
  }

  let videoObservacaoFinal = video_observacao ?? null;
  if (video_observacao_base64 && !videoObservacaoFinal) {
    const vp = `servico-venda/${Date.now()}_video.mp4`;
    const vr = await uploadFile("service-fotos", vp, video_observacao_base64, "video/mp4");
    if ("error" in vr) return NextResponse.json({ error: `Erro ao enviar vídeo: ${vr.error}` }, { status: 500 });
    videoObservacaoFinal = vr.path;
  }

  // ── Determinar rota ──────────────────────────────────────────────────────
  // Rota: fabricação permite override (PCP ou Protocolo), demais seguem regra padrão
  const rota = tipo_ordem === "fabricacao" && rota_override
    ? (rota_override === "protocolo" ? "protocolo" : "pcp")
    : SERVICO_TIPOS.includes(tipo_ordem) ? "protocolo" : "pcp";

  // ── Data de entrega: fabricação usa data informada ou +10 dias úteis ─────
  let dataEntregaFinal: Date | null = data_entrega ? new Date(data_entrega) : null;
  if (tipo_ordem === "fabricacao" && !dataEntregaFinal) {
    const [{ data_entrega: de }] = await sql`
      SELECT alissonerp.fn_adicionar_dias_uteis(CURRENT_DATE, 10) AS data_entrega
    `;
    dataEntregaFinal = de;
  }

  const fotosPathsVal = fotosPaths.length > 0 ? fotosPaths : null;

  // ── Transação: ordem + itens + auditoria loja ───────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const novaOrdem = await sql.begin(async (tx: any) => {
    // 0. Gerar numero_ordem dentro da transação (evita race condition)
    const [{ max_id_ali }] = await tx`SELECT COALESCE(MAX(id), 0) AS max_id_ali FROM alissonerp.ordens`;
    const [{ max_id_dir }] = await tx`SELECT COALESCE(MAX(id), 0) AS max_id_dir FROM directus.ordens`;
    const nextNum = Math.max(Number(max_id_ali), Number(max_id_dir)) + 1;
    const numeroOrdem = "C-" + String(nextNum).padStart(4, "0");

    // 1. Inserir ordem
    // Preparar tipos_servico_ids como array SQL (pode ser null ou vazio)
    const tiposIds: number[] = Array.isArray(tipos_servico_ids)
      ? tipos_servico_ids.map(Number).filter(n => !isNaN(n))
      : [];
    // postgres.js: passar array diretamente é o approach correto
    const tiposIdsVal = tiposIds.length > 0 ? tiposIds : ([] as number[]);

    const vendaItemIdsVal: number[] = Array.isArray(venda_item_ids)
      ? venda_item_ids.map(Number).filter((n: number) => !isNaN(n))
      : [];

    // Buscar numero_venda se venda_id foi informado — alimenta numero_pedido
    // na ordem pra aparecer na coluna "PEDIDO PDV" da listagem de ordens.
    let numeroVendaLigada: string | null = numero_pedido_manual ?? null;
    if (venda_id && !numeroVendaLigada) {
      const [vRow] = await tx`SELECT numero_venda FROM alissonerp.vendas_erp WHERE id = ${venda_id}`;
      numeroVendaLigada = vRow?.numero_venda ?? null;
    }

    // Determinar ficha_pendente para fabricação
    const fichaPendente = tipo_ordem === "fabricacao"
      ? (validarFichaTecnicaServer(ficha_tecnica_dados) !== null)
      : false;

    const [ordem] = await tx`
      INSERT INTO alissonerp.ordens (
        numero_ordem, tipo_ordem, cliente_id, vendedor_id,
        data_entrega, peso_metal_negociado, peso_metal_externo,
        foto_peca_servico, peso_peca_servico, video_observacao,
        detalhes_ordem, fotos_paths, tipos_servico_ids,
        venda_id, venda_item_ids, numero_pedido,
        situacao, status, rota, origem, ficha_pendente, created_by
      ) VALUES (
        ${numeroOrdem},
        ${tipo_ordem}::alissonerp.enum_tipo_ordem,
        ${cliente_id ?? null},
        ${vendedorIdFinal},
        ${dataEntregaFinal},
        ${peso_metal_negociado ?? 0},
        ${peso_metal_externo ?? null},
        ${fotoPecaServicoFinal},
        ${peso_peca_servico ?? null},
        ${videoObservacaoFinal},
        ${detalhes_ordem ?? null},
        ${fotosPathsVal},
        ${tiposIdsVal},
        ${venda_id ?? null},
        ${vendaItemIdsVal.length > 0 ? vendaItemIdsVal : null},
        ${numeroVendaLigada},
        'criado',
        'aguardando',
        ${rota}::alissonerp.enum_rota_ordem,
        'erp',
        ${fichaPendente},
        ${user.id}::uuid
      )
      RETURNING id, numero_ordem
    `;

    // 2. Inserir itens (se houver)
    //    Personalizacao e propagada da venda (itens_venda_erp.personalizacao)
    //    quando a ordem for criada com venda_item_ids. Caso contrario, pode vir
    //    no body do item como { personalizacao: { valor, ... } }.
    //    Se houver, o texto legivel e concatenado em observacao (ourives ler la).
    let personalizacoesPorProdutoId: Map<number, PersonalizacaoAplicada> = new Map();
    if (venda_id && vendaItemIdsVal.length > 0) {
      const itensPersonalizados = await tx`
        SELECT produto_id, personalizacao
        FROM alissonerp.itens_venda_erp
        WHERE id = ANY(${vendaItemIdsVal})
          AND personalizacao IS NOT NULL
      `;
      for (const it of itensPersonalizados) {
        if (it.produto_id != null && it.personalizacao) {
          personalizacoesPorProdutoId.set(
            Number(it.produto_id),
            it.personalizacao as PersonalizacaoAplicada,
          );
        }
      }
    }

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

      // Personalizacao: da venda vinculada (prioridade) ou do body direto
      const produtoIdNum = Number(produto.id_produto);
      const personalizacao: PersonalizacaoAplicada | null =
        personalizacoesPorProdutoId.get(produtoIdNum) ??
        (item.personalizacao && typeof item.personalizacao === "object" && item.personalizacao.valor
          ? (item.personalizacao as PersonalizacaoAplicada)
          : null);

      // observacao: se houver personalizacao, append texto legivel
      const observacaoFinal =
        personalizacao
          ? [item.observacao ?? null, personalizacaoParaObservacao(personalizacao)]
              .filter(Boolean)
              .join("\n")
          : (item.observacao ?? null);

      await tx`
        INSERT INTO alissonerp.itens_ordem (
          ordem_id, produto_id, nome_produto, sku, quantidade,
          peso_estimado, observacao, personalizacao
        ) VALUES (
          ${ordem.id},
          ${produto.id_produto},
          ${produto.nome},
          ${produto.sku},
          ${item.quantidade ?? 1},
          ${pesoEstimado},
          ${observacaoFinal},
          ${personalizacao ? sql.json(personalizacao as never) : null}
        )
      `;
    }

    // 3. Criar auditoria loja
    //    Ordens que vão para Service (protocolo + tipos service) → auto-aprovada
    //    Demais → pendente (aguarda conferência da loja)
    const isServiceOrder = rota === "protocolo" && SERVICO_TIPOS.includes(tipo_ordem);
    await tx`
      INSERT INTO alissonerp.auditorias (
        situacao, tipo_auditoria, rota_processo, ordem_id,
        peso_negociado, parecer, dados_ordem
      ) VALUES (
        ${isServiceOrder ? 'aprovado' : 'pendente'},
        'loja',
        'entrada_ordem',
        ${ordem.id},
        ${peso_metal_negociado ?? 0},
        ${isServiceOrder ? 'Aprovação automática — ordem de serviço' : null},
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

    // 4. Criar ficha técnica (se houver dados)
    if (ficha_tecnica_dados && ficha_tecnica_dados.tipo_item) {
      await tx`
        INSERT INTO alissonerp.fichas_tecnicas (ordem_id, tipo_item, dados, created_by)
        VALUES (
          ${ordem.id},
          ${ficha_tecnica_dados.tipo_item},
          ${JSON.stringify(ficha_tecnica_dados)}::jsonb,
          ${user.id}::uuid
        )
      `;
    }

    return ordem;
  });

  return NextResponse.json(
    { id: novaOrdem.id, numero_ordem: novaOrdem.numero_ordem },
    { status: 201 }
  );
}
