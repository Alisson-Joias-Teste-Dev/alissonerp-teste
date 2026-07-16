import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { uploadFile, ensureBucket } from "@/lib/storage";
import { zodError } from "@/lib/schemas/common";
import { resolverAprovadores } from "@/lib/aprovacoes";

const ROLES_PERMITIDOS = ["estoquista_loja", "gerente_loja", "admin", "desenvolvedor"];

const ConversaoReversaPostSchema = z.object({
  origem_tipo: z.enum(["venda_ouro", "upgrade", "compra_metal", "conversao"]),
  origem_id: z.coerce.number().int().positive(),
  produto_id: z.coerce.number().int().positive(),
  quantidade: z.coerce.number().int().positive(),
  peso_saida: z.coerce.number().positive(),
  // Foto do peso da joia é OBRIGATÓRIA (requisito Jonathan 15/07) — é a prova
  // física do que saiu do cofre e virou peça. Sem ela a reversa não abre.
  foto_base64: z.string().min(1, "Foto do peso é obrigatória"),
  motivo: z.string().optional(),
}).passthrough();

/**
 * REGRA DE NEGÓCIO: peso restante disponível no Caixa de Ouro para uma origem
 * (conversão de estoque concluída OU compra de metal confirmada — as duas
 * únicas formas de metal já registrado no cofre, cofre_registrado = true).
 *
 * O QUE: peso_origem (peso_total da conversão OU peso_gramas da compra) menos
 *   a soma de tudo que já foi baixado do cofre para essa MESMA origem, em
 *   baixas ainda válidas (status 'pendente' | 'em_trafego' | 'concluido' —
 *   baixa 'cancelado' não consome o saldo).
 * POR QUE: o mesmo lote de ouro que entrou no cofre pode ter várias baixas
 *   (sangria pra Alisson/Fábrica/Service, conversão reversa) — nunca pode
 *   sair mais metal do que efetivamente entrou.
 * IMPACTO SE ALTERADO: pode liberar saída de metal sem lastro no cofre
 *   (saldo negativo), quebrando a auditoria do Caixa de Ouro.
 *
 * ESTA FÓRMULA É IDÊNTICA à usada em /api/conversao-reversa/aprovar — qualquer
 * mudança aqui deve ser replicada lá (e vice-versa).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buscarPesoRestanteOrigem(db: any, origemTipo: "venda_ouro" | "upgrade" | "compra_metal" | "conversao", origemId: number) {
  // REGRA DE NEGÓCIO: cada tipo de origem guarda o peso bruto que entrou no cofre
  // num lugar diferente. status_ok = origem confirmada/registrada no cofre.
  let origem: { peso_origem: number; status_ok: boolean; origem_referencia: string | null } | undefined;
  if (origemTipo === "conversao") {
    [origem] = await db`
      SELECT ce.peso_total AS peso_origem,
             (ce.status_conversao = 'concluido' AND ce.cofre_registrado = true) AS status_ok,
             o.numero_ordem AS origem_referencia
      FROM alissonerp.conversoes_estoque ce
      JOIN alissonerp.ordens o ON o.id = ce.ordem_id
      WHERE ce.id = ${origemId} LIMIT 1
    `;
  } else if (origemTipo === "compra_metal") {
    [origem] = await db`
      SELECT peso_gramas AS peso_origem,
             (status = 'confirmado' AND cofre_registrado = true) AS status_ok,
             numero AS origem_referencia
      FROM alissonerp.compras_metal
      WHERE id = ${origemId} LIMIT 1
    `;
  } else if (origemTipo === "venda_ouro") {
    // Pagamento de venda em ouro: o peso em gramas fica em pagamentos_venda.OURO_PESO
    // (a coluna ouro_gramas fica nula nesses pagamentos — o front expõe ouro_peso AS
    // ouro_gramas). origem_id = pagamentos_venda.id.
    [origem] = await db`
      SELECT pv.ouro_peso AS peso_origem,
             (pv.ouro_peso IS NOT NULL AND pv.ouro_peso > 0) AS status_ok,
             ('Venda #' || COALESCE(ve.numero_venda::text, pv.venda_id::text)) AS origem_referencia
      FROM alissonerp.pagamentos_venda pv
      LEFT JOIN alissonerp.vw_vendas_erp_completa ve ON ve.id = pv.venda_id
      WHERE pv.id = ${origemId} LIMIT 1
    `;
  } else {
    // upgrade: peso = peso_gramas do item de upgrade (origem_id = item_venda_id)
    [origem] = await db`
      SELECT iuv.peso_gramas AS peso_origem,
             (iuv.cofre_registrado = true) AS status_ok,
             ('Venda #' || COALESCE(ve.numero_venda::text, ive.venda_id::text)) AS origem_referencia
      FROM alissonerp.itens_venda_upgrade iuv
      JOIN alissonerp.itens_venda_erp ive ON ive.id = iuv.item_venda_id
      LEFT JOIN alissonerp.vw_vendas_erp_completa ve ON ve.id = ive.venda_id
      WHERE iuv.item_venda_id = ${origemId} LIMIT 1
    `;
  }

  if (!origem) return null;

  const [{ gramas_baixadas }] = await db`
    SELECT COALESCE(SUM(boi.gramas), 0) AS gramas_baixadas
    FROM alissonerp.cofre_ouro_baixa_itens boi
    JOIN alissonerp.cofre_ouro_baixas b ON b.id = boi.baixa_id
    WHERE boi.origem_tipo = ${origemTipo} AND boi.origem_id = ${origemId}
      AND b.status IN ('pendente', 'em_trafego', 'concluido')
  `;

  return {
    statusOk: origem.status_ok === true,
    restante: Number(origem.peso_origem) - Number(gramas_baixadas),
    origemReferencia: String(origem.origem_referencia ?? ""),
  };
}

// POST /api/conversao-reversa
// Abre uma conversão reversa: metal já registrado no Caixa de Ouro (conversão
// de estoque concluída ou compra de metal confirmada) sai do cofre e vira
// peça pronta no estoque comercial. Fica 'pendente' até admin/desenvolvedor
// aprovar em /api/conversao-reversa/aprovar (a trigger de banco já cria a
// tarefa 'aguardando_aprovacao' — a rota NÃO cria tarefa manualmente).
// Body: { origem_tipo, origem_id, produto_id, quantidade, peso_saida, foto_base64?, motivo? }
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

  // REGRA DE NEGÓCIO (alinhado à política config-first — ver
  // docs/regras-negocio/aprovacoes-refatoracao/03b-config-first-estrito.md): a
  // conversão reversa EXIGE pelo menos um aprovador configurado em
  // Configurações → Aprovadores. Sem isso a solicitação NÃO abre — mesma
  // checagem (`resolverAprovadores`) usada pelos ~15 outros fluxos de aprovação
  // do sistema, em vez de reimplementar a leitura de configuracoes_sistema aqui.
  const resolucao = await resolverAprovadores("conversao_reversa");
  if (resolucao.status === "nao_configurado") {
    return NextResponse.json(
      { error: "Nenhum aprovador de Conversão Reversa configurado. Vá em Configurações → Aprovadores → \"Conversão Reversa\" e defina ao menos um antes de abrir a solicitação." },
      { status: 400 },
    );
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = ConversaoReversaPostSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { origem_tipo, origem_id, produto_id, quantidade, peso_saida, foto_base64, motivo } = parsed.data;

  // ── Validar origem: precisa estar concluída/confirmada e já registrada no cofre ──
  const infoOrigem = await buscarPesoRestanteOrigem(sql, origem_tipo, origem_id);
  if (!infoOrigem) {
    return NextResponse.json({ error: "Origem não encontrada" }, { status: 400 });
  }
  if (!infoOrigem.statusOk) {
    return NextResponse.json(
      { error: `Origem (${origem_tipo} #${origem_id}) ainda não está confirmada/registrada no Caixa de Ouro` },
      { status: 400 },
    );
  }
  if (infoOrigem.restante < peso_saida) {
    return NextResponse.json(
      {
        error: `Peso insuficiente no cofre para esta origem. Restante: ${infoOrigem.restante.toFixed(3)}g, saída solicitada: ${peso_saida.toFixed(3)}g`,
      },
      { status: 400 },
    );
  }

  // ── Validar produto: precisa existir e estar ativo (public.produtos.situacao = 'A') ──
  const [produto] = await sql`
    SELECT id_produto, nome, situacao FROM public.produtos WHERE id_produto = ${produto_id} LIMIT 1
  `;
  if (!produto) {
    return NextResponse.json({ error: "Produto não encontrado" }, { status: 400 });
  }
  if (produto.situacao !== "A") {
    return NextResponse.json({ error: `Produto "${produto.nome}" não está ativo` }, { status: 400 });
  }

  // ── Bloquear duplicata: já existe conversão reversa PENDENTE para a mesma origem ──
  const [duplicada] = await sql`
    SELECT id FROM alissonerp.conversoes_reversas
    WHERE origem_tipo = ${origem_tipo} AND origem_id = ${origem_id} AND status_conversao = 'pendente'
    LIMIT 1
  `;
  if (duplicada) {
    return NextResponse.json(
      { error: `Já existe uma conversão reversa pendente para esta origem (id ${duplicada.id})` },
      { status: 409 },
    );
  }

  // Upload da foto de abertura — OBRIGATÓRIA. Diferente das outras conversões,
  // aqui a falha de upload BLOQUEIA: não abrimos reversa sem a prova do peso.
  try {
    await ensureBucket("conversao-fotos");
  } catch {
    console.warn("[conversao-reversa] ensureBucket falhou");
  }
  const fp = `reversa/${Date.now()}_${user.id}.jpg`;
  const up = await uploadFile("conversao-fotos", fp, foto_base64, "image/jpeg");
  if ("error" in up) {
    return NextResponse.json({ error: "Falha ao salvar a foto do peso. Tente novamente." }, { status: 502 });
  }
  const fotoPath: string = up.path;

  // ── Transação: ordem + conversao_reversa (trigger cria a tarefa de aprovação sozinha) ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await sql.begin(async (tx: any) => {
    // 1. Gerar numero_ordem CR-xxxx (mesmo padrão do CS-xxxx da conversao-sku)
    const [{ max_id }] = await tx`
      SELECT COALESCE(MAX(id), 0) AS max_id FROM alissonerp.ordens
    `;
    const nextNum = Number(max_id) + 1;
    const numeroOrdem = "CR-" + String(nextNum).padStart(4, "0");

    // 2. Criar ordem (tipo_ordem='conversao_reversa', rota='protocolo')
    // REGRA DE NEGÓCIO: a ordem conclui direto na aprovação (não circula
    // fisicamente por protocolo), mas segue a mesma rota das demais conversões
    // para reaproveitar a listagem/telas existentes de ordens.
    const [ordem] = await tx`
      INSERT INTO alissonerp.ordens (
        numero_ordem, tipo_ordem, situacao, status, rota, created_by
      ) VALUES (
        ${numeroOrdem},
        'conversao_reversa'::alissonerp.enum_tipo_ordem,
        'criado',
        'aguardando',
        'protocolo'::alissonerp.enum_rota_ordem,
        ${user.id}::uuid
      )
      RETURNING id, numero_ordem
    `;

    // 3. Criar conversoes_reversas — trigger trg_criar_tarefa_conversao_reversa
    //    (fn_processar_conversao_reversa) cria a tarefa 'aguardando_aprovacao'
    //    automaticamente. NÃO criar a tarefa manualmente aqui (duplicaria).
    const [conversao] = await tx`
      INSERT INTO alissonerp.conversoes_reversas (
        ordem_id, origem_tipo, origem_id, produto_id, quantidade, peso_saida,
        foto_abertura, motivo, created_by
      ) VALUES (
        ${ordem.id}, ${origem_tipo}, ${origem_id}, ${produto_id}, ${quantidade}, ${peso_saida},
        ${fotoPath}, ${motivo ?? null}, ${user.id}::uuid
      )
      RETURNING id
    `;

    return { ordem_id: ordem.id, numero_ordem: ordem.numero_ordem, conversao_reversa_id: conversao.id };
  });

  return NextResponse.json(result, { status: 201 });
}

// GET /api/conversao-reversa?status=pendente
// Lista as conversões reversas (default: só as PENDENTES). O front da aba Ouro
// usa isto para marcar os itens que já têm uma reversa aguardando aprovação
// (selo "Reversa aguardando aprovação" + botão desabilitado) — evita o usuário
// abrir uma segunda solicitação para a mesma origem (que a rota POST barra com 409).
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const status = req.nextUrl.searchParams.get("status") ?? "pendente";

  const rows = status === "todos"
    ? await sql`
        SELECT cr.id, cr.origem_tipo, cr.origem_id, cr.produto_id, cr.quantidade,
               cr.peso_saida, cr.status_conversao, cr.ordem_id, o.numero_ordem
        FROM alissonerp.conversoes_reversas cr
        JOIN alissonerp.ordens o ON o.id = cr.ordem_id
        ORDER BY cr.created_at DESC
      `
    : await sql`
        SELECT cr.id, cr.origem_tipo, cr.origem_id, cr.produto_id, cr.quantidade,
               cr.peso_saida, cr.status_conversao, cr.ordem_id, o.numero_ordem
        FROM alissonerp.conversoes_reversas cr
        JOIN alissonerp.ordens o ON o.id = cr.ordem_id
        WHERE cr.status_conversao = ${status}
        ORDER BY cr.created_at DESC
      `;

  return NextResponse.json({ conversoes: rows });
}
