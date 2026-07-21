import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { uploadFile, deleteFile } from "@/lib/storage";
import { validarFichaTecnicaServer } from "@/lib/validar-ficha-tecnica";
import {
  personalizacaoParaTexto,
  type PersonalizacaoQualquer,
} from "@/lib/personalizacao-validacao";
import { zodError, IdSchema, DateSchema } from "@/lib/schemas/common";
import { LIMITS } from "@/lib/payload-limits";
import { assertVendaForaDeRascunho, VendaGuardError } from "@/lib/venda-guards";
import { avaliarGarantia, GarantiaGuardError } from "@/lib/garantia/prazo-garantia";
import { GARANTIA_FORA_PRAZO_TIPO } from "@/lib/garantia/solicitar-aprovacao";

const FULL_ACCESS_ROLES = ["desenvolvedor", "admin"];
const ALL_TIPOS = [
  "servico_venda", "servico_loja", "fabricacao", "reposicao_venda",
  "reposicao_loja", "compra_fornecedor", "garantia", "servico_interno",
  "conversao",
];

// Schema de entrada. Permissivo — campos opcionais cobrem variacoes por tipo_ordem
// (validacoes de obrigatoriedade por tipo continuam no handler).
const OrdensPostSchema = z.object({
  tipo_ordem: z.string().min(1, "tipo_ordem é obrigatório").max(50),
  cliente_id: IdSchema.nullable().optional(),
  vendedor_id: IdSchema.nullable().optional(),
  data_entrega: DateSchema.nullable().optional(),
  peso_metal_negociado: z.number().nullable().optional(),
  foto_peca_servico: z.string().max(500).nullable().optional(),
  foto_peca_servico_base64: z.string().max(LIMITS.IMAGE_BASE64_MAX).nullable().optional(),
  peso_peca_servico: z.number().nullable().optional(),
  peso_metal_externo: z.number().nullable().optional(),
  video_observacao: z.string().max(500).nullable().optional(),
  video_observacao_base64: z.string().max(LIMITS.VIDEO_BASE64_MAX).nullable().optional(),
  detalhes_ordem: z.string().max(LIMITS.DESCRICAO_LONGA_MAX).nullable().optional(),
  fotos_base64: z.array(z.string().max(LIMITS.IMAGE_BASE64_MAX)).max(LIMITS.IMAGES_ARRAY_MAX).optional(),
  tipos_servico_ids: z.array(z.number().int()).max(50).optional(),
  venda_id: IdSchema.nullable().optional(),
  venda_item_ids: z.array(z.number().int()).max(LIMITS.ITENS_VENDA_MAX).optional(),
  rota_override: z.enum(["pcp", "protocolo"]).nullable().optional(),
  ficha_tecnica_dados: z.record(z.string(), z.unknown()).nullable().optional(),
  numero_pedido_manual: z.string().max(100).nullable().optional(),
  itens: z.array(z.record(z.string(), z.unknown())).max(LIMITS.ITENS_VENDA_MAX).optional(),
}).passthrough();
const SERVICO_TIPOS = ["servico_venda", "servico_loja", "garantia", "servico_interno"];
const CONVERSAO_TIPOS = ["conversao"];

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

  const raw = await req.json().catch(() => ({}));
  const parsedBody = OrdensPostSchema.safeParse(raw);
  if (!parsedBody.success) return zodError(parsedBody.error);
  const body = parsedBody.data;
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

  // Consultora sem vendedor_id configurado não pode criar ordens — o campo é
  // obrigatório para que a ordem apareça na listagem dela. Admin deve configurar
  // usuarios.vendedor_id antes de liberar o acesso.
  if (usuario.role === "consultora" && vendedorIdFinal == null) {
    return NextResponse.json(
      { error: "Seu usuário não está vinculado a um vendedor. Contate o administrador para configurar o vínculo antes de criar ordens." },
      { status: 422 },
    );
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
  // Conversão: sempre protocolo
  const rota = tipo_ordem === "fabricacao" && rota_override
    ? (rota_override === "protocolo" ? "protocolo" : "pcp")
    : CONVERSAO_TIPOS.includes(tipo_ordem) ? "protocolo"
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
  let novaOrdem;
  try {
    novaOrdem = await sql.begin(async (tx: any) => {
    // 0-a. Trava de rascunho: ordem vinculada a uma venda_id só pode ser
    // criada se a venda já saiu do estado 'rascunho' (pagamento confirmado).
    // Ver src/lib/venda-guards.ts para o motivo/impacto — checagem dentro
    // da mesma transação do INSERT para evitar race condition (TOCTOU).
    if (venda_id) {
      await assertVendaForaDeRascunho(tx, venda_id, "abrir ordem");
    }

    // 0-b. Trava de garantia (docs/regras-negocio/ordens.md, Jonathan 17/07):
    //   1. só de venda ENTREGUE; 2. Acabamento e polimento é vitalício; 3. resto
    //   vale 7 dias úteis desde a entrega, e fora disso exige aprovação prévia.
    //   Dentro da transação (mesma razão TOCTOU do guard de rascunho). Se estiver
    //   fora do prazo, guardamos o id da tarefa aprovada para CONSUMIR depois do
    //   INSERT — uso único (uma aprovação = uma garantia). Ver ordens.md §2.6/§3.1.
    let tarefaGarantiaAConsumir: number | null = null;
    if (tipo_ordem === "garantia" && venda_id) {
      const tiposGarantia: number[] = Array.isArray(tipos_servico_ids)
        ? tipos_servico_ids.map(Number).filter((n) => !isNaN(n))
        : [];
      const aval = await avaliarGarantia(tx, venda_id, tiposGarantia);
      if (!aval.permitido) {
        if (aval.motivo === "fora_do_prazo") {
          // Procura aprovação concedida e AINDA NÃO consumida para esta venda.
          // COALESCE(tipo,'') — tipo é NULL em vários fluxos (armadilha aprovacoes.md §5).
          const [aprovada] = await tx`
            SELECT id
              FROM alissonerp.tarefas
             WHERE COALESCE(tipo, '') = ${GARANTIA_FORA_PRAZO_TIPO}
               AND venda_id = ${venda_id}
               AND status = 'aprovada'
               AND ordem_id IS NULL
             ORDER BY id DESC
             LIMIT 1
          `;
          if (!aprovada) {
            throw new GarantiaGuardError("fora_do_prazo", aval.mensagem ?? "Garantia fora do prazo — solicite aprovação.");
          }
          tarefaGarantiaAConsumir = Number(aprovada.id);
        } else {
          // venda_nao_entregue: trava seca, sem saída por aprovação.
          throw new GarantiaGuardError("venda_nao_entregue", aval.mensagem ?? "Só é possível abrir garantia de pedido entregue.");
        }
      }
    }

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

    // Determinar ficha_pendente para fabricação. Cast via unknown para alinhar
    // com a tipagem do validador (zod retorna Record<string, unknown> opaco).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fichaTecnicaDados = ficha_tecnica_dados as any;
    const fichaPendente = tipo_ordem === "fabricacao"
      ? (validarFichaTecnicaServer(fichaTecnicaDados) !== null)
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

    // 1-b. Consumir a aprovação de garantia fora do prazo (uso único). O
    //   `WHERE ordem_id IS NULL` fecha a corrida entre duas abas: se a mesma
    //   aprovação já foi gasta por outra ordem, o UPDATE pega 0 linhas e a
    //   transação inteira aborta — nada de duas garantias numa aprovação só.
    //   Ver docs/regras-negocio/ordens.md §2.6/§3.1.
    if (tarefaGarantiaAConsumir) {
      const consumo = await tx`
        UPDATE alissonerp.tarefas
           SET ordem_id = ${ordem.id}, updated_at = now()
         WHERE id = ${tarefaGarantiaAConsumir}
           AND ordem_id IS NULL
      `;
      if (consumo.count === 0) {
        throw new GarantiaGuardError(
          "fora_do_prazo",
          "A aprovação desta garantia já foi usada em outra ordem. Solicite uma nova aprovação.",
        );
      }
    }

    // 2. Inserir itens (se houver)
    //    Personalizacao e propagada da venda (itens_venda_erp.personalizacao)
    //    quando a ordem for criada com venda_item_ids. Caso contrario, pode vir
    //    no body do item como { personalizacao: { valor, ... } }.
    //    Se houver, o texto legivel e concatenado em observacao (ourives ler la).
    const personalizacoesPorProdutoId: Map<number, PersonalizacaoQualquer> = new Map();
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
            it.personalizacao as PersonalizacaoQualquer,
          );
        }
      }
    }

    for (const item of itens) {
      if (!item.produto_id) continue;
      const [produto] = await tx`
        SELECT id_produto, nome, sku, peso_precificado
        FROM alissonerp.produtos_compat
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
      const personalizacao: PersonalizacaoQualquer | null =
        personalizacoesPorProdutoId.get(produtoIdNum) ??
        (item.personalizacao && typeof item.personalizacao === "object"
          ? (item.personalizacao as PersonalizacaoQualquer)
          : null);

      // observacao: se houver personalizacao, append texto legivel
      const observacaoFinal =
        personalizacao
          ? [item.observacao ?? null, personalizacaoParaTexto(personalizacao)]
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

    // 3. Auditoria criada e aprovada automaticamente pelo trigger trg_auto_auditoria_loja
    //    — não inserir manualmente para evitar unique constraint violation

    // 4. Criar ficha técnica (se houver dados)
    if (fichaTecnicaDados && fichaTecnicaDados.tipo_item) {
      await tx`
        INSERT INTO alissonerp.fichas_tecnicas (ordem_id, tipo_item, dados, created_by)
        VALUES (
          ${ordem.id},
          ${fichaTecnicaDados.tipo_item},
          ${JSON.stringify(fichaTecnicaDados)}::text::jsonb,
          ${user.id}::uuid
        )
      `;
    }

    return ordem;
    });
  } catch (err) {
    // Trava de rascunho (venda-guards.ts): mapeia o erro tipado para HTTP.
    // Qualquer outro erro é relançado — não altera o comportamento atual
    // de nenhuma outra falha da transação (constraint, upload, etc).
    if (err instanceof VendaGuardError && err.motivo === "rascunho") {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    if (err instanceof VendaGuardError && err.motivo === "nao_encontrada") {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    // Trava de garantia (prazo-garantia.ts): venda não entregue = 422 (seca);
    // fora do prazo sem aprovação = 409 (falta solicitar aprovação). O front usa
    // o status pra decidir se mostra o botão "Solicitar aprovação".
    if (err instanceof GarantiaGuardError) {
      const status = err.motivo === "fora_do_prazo" ? 409 : 422;
      return NextResponse.json({ error: err.message, motivo: err.motivo }, { status });
    }
    throw err;
  }

  return NextResponse.json(
    { id: novaOrdem.id, numero_ordem: novaOrdem.numero_ordem },
    { status: 201 }
  );
}
