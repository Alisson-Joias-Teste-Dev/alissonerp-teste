import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";
import {
  LIMITS,
  checkArrayLength,
  checkStringLength,
  payloadTooLargeResponse,
} from "@/lib/payload-limits";
import { zodError } from "@/lib/schemas/common";
import { criarNotificacao } from "@/lib/notificacoes";

const TarefaPostSchema = z.object({
  titulo: z.string().min(1, "obrigatório"),
  descricao: z.string().optional(),
  responsavel_id: z.string().optional(),
  prioridade: z.string().optional(),
  data_limite: z.string().optional(),
  ordem_id: z.coerce.number().int().optional(),
  ordem_ids: z.array(z.coerce.number().int()).optional(),
  peso_metal: z.coerce.number().optional(),
  venda_id: z.coerce.number().int().optional(),
  tags: z.array(z.string()).optional(),
  tipo: z.string().optional(),
}).passthrough();

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const responsavel = url.searchParams.get("responsavel_id");
  const criador = url.searchParams.get("criado_por");
  const prioridade = url.searchParams.get("prioridade");
  const ordem_id = url.searchParams.get("ordem_id");
  const venda_id = url.searchParams.get("venda_id");
  const tipo = url.searchParams.get("tipo");
  const tagsParam = url.searchParams.get("tags");
  const visao = url.searchParams.get("visao");
  const busca = url.searchParams.get("busca");

  const isAdmin = isFullAccess(usuario?.role);
  const userId = user.id;

  // REGRA DE NEGÓCIO (Fase 5 conversão reversa): a tarefa de aprovação de
  // conversão reversa deve aparecer pra TODOS os aprovadores configurados em
  // Configurações → Aprovadores, não só pro responsável. Fragmento reutilizado
  // nos filtros de visibilidade abaixo.
  const reversaAprovadorCond = sql`(t.tipo = 'conversao_reversa' AND EXISTS (
    SELECT 1 FROM alissonerp.configuracoes_sistema cs
    WHERE cs.chave = 'aprovadores_conversao_reversa'
      AND ${userId}::text = ANY(string_to_array(cs.valor, ','))
  ))`;

  // REGRA DE NEGÓCIO (16/07 — decisão do Jonathan): "toda aprovação pode ter
  // mais de um aprovador, todos devem RECEBER a tarefa de aprovação — só
  // basta um aprovar". Sem isto, só quem virou `responsavel_id` (o 1º UUID
  // resolvido na criação — ver resolverAprovadores/criarTarefaAprovacao) via
  // a tarefa na fila; o 2º+ aprovador configurado na MESMA chave (MULTI,
  // separada por vírgula) não a via, mesmo podendo decidir (podeDecidir já
  // aceitava qualquer um da lista — só a LISTAGEM que só mostrava o 1º).
  // Generaliza o padrão que já existia só pra conversao_reversa (acima) pros
  // eventos que hoje suportam múltiplos aprovadores. Mapeamento tipo/tags →
  // chave de config conferido direto no código de cada criação (grep, 16/07)
  // — não adivinhado.
  //
  // 16/07 (2ª rodada) — cobre TODOS os eventos do CATALOGO que criam tarefa.
  // Os 4 que faltavam (conversao_sku, compra_metal, recebimento_metal,
  // limpeza_ouro) entraram depois de um achado testando no homolog: a tarefa
  // 305 (conversao_sku) ficou SEM SAÍDA. Ela nasce com responsavel_id de quem
  // o fluxo elegeu (Paloma), que NÃO estava em `aprovador_conversao` — então
  // quem podia decidir (config) não via, e quem via não podia decidir
  // (podeDecidir é config-first estrito, sem fallback por cargo). Resultado:
  // travada, só saía por SQL. `precificacao` ficou de fora de propósito: não
  // existe criação de tarefa pra ela em lugar nenhum (só permissão de módulo).
  // IMPACTO SE REMOVIDO: volta o problema — só o "sortudo" (responsavel_id)
  // recebe a tarefa; os outros aprovadores configurados ficam cegos, e se o
  // responsavel_id não estiver na config a aprovação trava de vez.
  const multiAprovadorCond = sql`(
    ${reversaAprovadorCond}
    OR (t.tipo = 'desconto_acima' AND EXISTS (
      SELECT 1 FROM alissonerp.configuracoes_sistema cs
      WHERE cs.chave = 'aprovador_desconto_padrao' AND ${userId}::text = ANY(string_to_array(cs.valor, ','))
    ))
    OR (t.tipo = 'cartao_desconto' AND EXISTS (
      SELECT 1 FROM alissonerp.configuracoes_sistema cs
      WHERE cs.chave = 'aprovador_cartao_desconto_padrao' AND ${userId}::text = ANY(string_to_array(cs.valor, ','))
    ))
    OR (t.tipo = 'entrega_sem_pagamento_total' AND EXISTS (
      SELECT 1 FROM alissonerp.configuracoes_sistema cs
      WHERE cs.chave = 'aprovador_entrega_sem_pagamento' AND ${userId}::text = ANY(string_to_array(cs.valor, ','))
    ))
    OR (t.tipo = 'compra_comercial' AND EXISTS (
      SELECT 1 FROM alissonerp.configuracoes_sistema cs
      WHERE cs.chave = 'aprovador_compra_comercial' AND ${userId}::text = ANY(string_to_array(cs.valor, ','))
    ))
    OR (t.tipo = 'conversao' AND EXISTS (
      SELECT 1 FROM alissonerp.configuracoes_sistema cs
      WHERE cs.chave = 'aprovador_conversao' AND ${userId}::text = ANY(string_to_array(cs.valor, ','))
    ))
    -- conversao_sku: MESMA chave de 'conversao' (decisão do Jonathan, 12/07 — vide catalogo.ts).
    OR (t.tipo = 'conversao_sku' AND EXISTS (
      SELECT 1 FROM alissonerp.configuracoes_sistema cs
      WHERE cs.chave = 'aprovador_conversao' AND ${userId}::text = ANY(string_to_array(cs.valor, ','))
    ))
    -- compra_metal e recebimento_metal: chave 'metal_aprovador_id' (api/metal/compras
    -- e api/metal/recebimentos gravam esses tipos — conferido no INSERT, 16/07).
    OR (t.tipo IN ('compra_metal', 'recebimento_metal') AND EXISTS (
      SELECT 1 FROM alissonerp.configuracoes_sistema cs
      WHERE cs.chave = 'metal_aprovador_id' AND ${userId}::text = ANY(string_to_array(cs.valor, ','))
    ))
    -- limpeza de ouro: a tarefa nasce com tipo 'aprovacao_quebra_metal' (NÃO
    -- 'limpeza_ouro') — api/purificacao/limpeza grava assim de propósito, porque o
    -- aprovador valida a QUEBRA, não o recebimento. Chave: 'aprovador_limpeza'.
    OR (t.tipo = 'aprovacao_quebra_metal' AND EXISTS (
      SELECT 1 FROM alissonerp.configuracoes_sistema cs
      WHERE cs.chave = 'aprovador_limpeza' AND ${userId}::text = ANY(string_to_array(cs.valor, ','))
    ))
    -- garantia fora do prazo (17/07): tarefa nasce com tipo 'garantia_fora_prazo'
    -- em api/garantia/solicitar-aprovacao (conferido no INSERT, não adivinhado).
    -- Chave: 'aprovadores_garantia_fora_prazo'. Ver docs/regras-negocio/ordens.md §3.
    OR (t.tipo = 'garantia_fora_prazo' AND EXISTS (
      SELECT 1 FROM alissonerp.configuracoes_sistema cs
      WHERE cs.chave = 'aprovadores_garantia_fora_prazo' AND ${userId}::text = ANY(string_to_array(cs.valor, ','))
    ))
    -- frete avulso solicitado (migration 353, camada central — evento 'frete_avulso'
    -- em src/lib/aprovacoes/catalogo.ts): tarefa nasce com tipo 'frete_avulso' em
    -- criarFreteAvulso (src/lib/entrega-venda.ts). Chave: 'aprovadores_frete_avulso'.
    -- REGRA "QUEM PAGA" (migration 359, 21/07): a MESMA tarefa (tipo='frete_avulso')
    -- espelha os 2 eventos do catálogo (frete_avulso / frete_avulso_loja, ver
    -- eventoDaTarefa) por evfa.pagante (entregas_venda, join abaixo) — NULL/
    -- 'cliente' = pagante='cliente' (chave de sempre); 'loja' = pagante='loja'
    -- (chave nova, autoriza o CUSTO).
    -- FIX (BLOCO 2, jul/2026): era pela tag 'frete_pagante:loja' em t.tags —
    -- array que o PRÓPRIO solicitante podia editar via PATCH /api/tarefas/[id]
    -- (isOwner inclui criado_por, sem validação de campo). Trocar a tag mudava
    -- pra qual pool a tarefa aparecia na listagem SEM mudar o custo real —
    -- agora casa pelo mesmo dado que eventoDaTarefa usa (evfa.pagante), que o
    -- solicitante não edita. evfa é o LEFT JOIN com entregas_venda pelo
    -- vínculo tarefa_aprovacao_id (migration 353), declarado no FROM abaixo.
    -- IMPACTO SE UMA DAS DUAS CLÁUSULAS FOR REMOVIDA: quem só está na lista da
    -- loja deixaria de ver o botão nas tarefas de custo da loja (ou vice-versa).
    -- IMPACTO SE VOLTAR A LER A TAG: reabre o caminho de o solicitante trocar
    -- a tag e mudar pra qual pool a tarefa aparece na listagem.
    OR (t.tipo = 'frete_avulso' AND COALESCE(evfa.pagante, 'cliente') <> 'loja' AND EXISTS (
      SELECT 1 FROM alissonerp.configuracoes_sistema cs
      WHERE cs.chave = 'aprovadores_frete_avulso' AND ${userId}::text = ANY(string_to_array(cs.valor, ','))
    ))
    OR (t.tipo = 'frete_avulso' AND COALESCE(evfa.pagante = 'loja', false) AND EXISTS (
      SELECT 1 FROM alissonerp.configuracoes_sistema cs
      WHERE cs.chave = 'aprovadores_frete_avulso_loja' AND ${userId}::text = ANY(string_to_array(cs.valor, ','))
    ))
    -- fechamento mensal de frete grátis com saldo negativo (BLOCO 4, jul/2026,
    -- src/lib/frete-fechamento.ts): tarefa nasce com tipo
    -- 'fechamento_frete_negativo', exclusiva desse fluxo (não compete com
    -- outros tipos/tags). Chave: 'aprovadores_fechamento_frete'.
    OR (t.tipo = 'fechamento_frete_negativo' AND EXISTS (
      SELECT 1 FROM alissonerp.configuracoes_sistema cs
      WHERE cs.chave = 'aprovadores_fechamento_frete' AND ${userId}::text = ANY(string_to_array(cs.valor, ','))
    ))
    -- credito_loja: tags = ['credito_loja', 'gerente'|'diretor'] (vendas-credito-aprovar.ts) — tipo NULL.
    --
    -- ASSIMETRIA CONHECIDA (20/07) entre este SQL e o TS (eventoDaTarefa,
    -- src/lib/aprovacoes/evento-da-tarefa.ts):
    -- O QUÊ: esta cláusula casa a tarefa de crédito SÓ pelas TAGS
    --   ('credito_loja' + 'gerente'|'diretor'), porque vendas-credito-aprovar.ts
    --   (~L162-170) cria a tarefa com tags=['credito_loja', tipo] e SEM gravar a
    --   coluna tipo. Já o TS (eventoDaTarefa ~L90-101) exige, ALÉM das tags,
    --   que a venda ligada esteja ATIVA (venda_situacao NÃO é cancelado/
    --   entregue/aprovado) E que vendas_erp.aprovacao_credito_tipo esteja
    --   preenchido — critérios que este SQL não tem como aplicar sem JOIN.
    -- POR QUÊ: o SQL só resolve pode_decidir pra listagem/exibição de botão;
    --   quem realmente autoriza a ação é o PATCH .../aprovacao, que chama
    --   eventoDaTarefa com os dados da venda já resolvidos — os dois nunca
    --   precisaram concordar 100% porque o PATCH é a fonte de verdade.
    -- IMPACTO: numa tarefa de crédito ESTAGNADA (venda já entregue/aprovada/
    --   cancelada, ou aprovacao_credito_tipo NULL), este SQL devolve
    --   pode_decidir=true mas eventoDaTarefa devolve null → o 2º/3º aprovador
    --   configurado VÊ o botão Aprovar/Rejeitar na tela e leva 403 ao clicar.
    --   NÃO é falha de segurança — o PATCH nega corretamente (config-first
    --   estrito) — é papercut de UX (botão fantasma numa tarefa velha).
    -- POR QUE NÃO CORRIGIMOS AGORA: alinhar exigiria LEFT JOIN vendas_erp
    --   nesta query inteira (usada tanto na listagem quanto no pode_decidir
    --   por linha), num PR que já está grande (frete avulso). O efeito
    --   negativo é só um 403 numa tarefa de crédito antiga — antes desta
    --   correção (5fac3e5c) esses usuários não tinham botão NENHUM, então
    --   isto não é uma regressão introduzida agora.
    OR ('credito_loja' = ANY(t.tags) AND 'gerente' = ANY(t.tags) AND EXISTS (
      SELECT 1 FROM alissonerp.configuracoes_sistema cs
      WHERE cs.chave = 'aprovadora_credito_gerente' AND ${userId}::text = ANY(string_to_array(cs.valor, ','))
    ))
    OR ('credito_loja' = ANY(t.tags) AND 'diretor' = ANY(t.tags) AND EXISTS (
      SELECT 1 FROM alissonerp.configuracoes_sistema cs
      WHERE cs.chave = 'aprovador_credito_diretor' AND ${userId}::text = ANY(string_to_array(cs.valor, ','))
    ))
    -- devolucao: tags=['devolucao'] (etapa 1) vs tags=['devolucao','devolucao_estoque'] (etapa 2) — tipo NULL (devolucoes.ts).
    OR ('devolucao_estoque' = ANY(t.tags) AND EXISTS (
      SELECT 1 FROM alissonerp.configuracoes_sistema cs
      WHERE cs.chave = 'aprovador_devolucao_estoque' AND ${userId}::text = ANY(string_to_array(cs.valor, ','))
    ))
    OR ('devolucao' = ANY(t.tags) AND NOT ('devolucao_estoque' = ANY(t.tags)) AND EXISTS (
      SELECT 1 FROM alissonerp.configuracoes_sistema cs
      WHERE cs.chave = 'aprovador_devolucao' AND ${userId}::text = ANY(string_to_array(cs.valor, ','))
    ))
  )`;

  const tagsList = tagsParam ? tagsParam.split(",").map(t => t.trim()).filter(Boolean) : [];

  const tarefas = await sql`
    SELECT
      t.id, t.titulo, t.descricao, t.prioridade, t.status, t.tipo,
      t.data_limite, t.ordem_id, t.ordem_ids, t.peso_metal, t.tags,
      t.venda_id, t.posicao,
      t.created_at, t.updated_at, t.concluida_em,
      t.responsavel_id, t.criado_por,
      ur.nome AS responsavel_nome,
      uc.nome AS criador_nome,
      o.numero_ordem,
      -- REGRA DE NEGÓCIO (20/07 — correção do 2º/3º aprovador configurado): expõe
      -- pra cada tarefa, SEM N+1 (reusa a mesma expressão SQL de multiAprovadorCond
      -- já usada no WHERE acima), se ESTE usuário está configurado como aprovador
      -- do evento da tarefa — mesmo critério que já libera a LISTAGEM (16/07).
      -- O QUÊ: o front (TarefaDrawer) usa este flag pra mostrar os botões
      --   Aprovar/Rejeitar pro 2º/3º aprovador, não só pro 1º (responsavel_id
      --   gravado na criação, único que aparecia como aprovador_id na linha de
      --   aprovacoes_tarefa).
      -- POR QUÊ: sem isto, só o "sortudo" (1º da lista) vê o botão — o pool de
      --   aprovadores configurados não funciona na prática mesmo já autorizado
      --   pelo PATCH (podeDecidir, config-first).
      -- IMPACTO SE REMOVIDO: volta o botão escondido pro 2º/3º aprovador, que
      --   segue autorizado pela API mas sem jeito de clicar em nada na tela.
      (${multiAprovadorCond}) AS pode_decidir
    FROM alissonerp.tarefas t
    LEFT JOIN alissonerp.usuarios ur ON ur.id = t.responsavel_id
    LEFT JOIN alissonerp.usuarios uc ON uc.id = t.criado_por
    LEFT JOIN alissonerp.ordens o ON o.id = t.ordem_id
    -- REGRA DE NEGÓCIO (BLOCO 2, jul/2026 — ver multiAprovadorCond acima): traz
    -- entregas_venda.pagante pra resolver frete_avulso x frete_avulso_loja pelo
    -- DADO (não pela tag). 1:1 por desenho (tarefa_aprovacao_id só é gravado
    -- por criarFreteAvulso, uma vez, pra tarefas tipo='frete_avulso') — sem
    -- risco de duplicar linha pras tarefas dos outros tipos (ev.pagante fica
    -- NULL e as cláusulas acima já filtram por t.tipo = 'frete_avulso').
    LEFT JOIN alissonerp.entregas_venda evfa ON evfa.tarefa_aprovacao_id = t.id
    WHERE 1=1
      -- REGRA DE NEGÓCIO (Fase 5, Jonathan 15/07): a tarefa de conversão reversa
      -- SÓ é visível pros aprovadores configurados em Configurações → Aprovadores —
      -- NEM admin vê se não estiver na lista, e o solicitante também não a vê na
      -- fila (ele acompanha pelo selo "aguardando aprovação" na aba Ouro). Vale pra
      -- QUALQUER visão (por isso é global, fora dos filtros de visao/isAdmin abaixo).
      -- BUGFIX (16/07 — achado testando o front): 'conversao_reversa' <> t.tipo
      -- dá NULL (não FALSE) quando t.tipo IS NULL em SQL — e credito_loja e
      -- devolucao NUNCA setam t.tipo (só tags — ver vendas-credito-aprovar.ts/
      -- devolucoes.ts). Resultado: NULL OR FALSE = NULL = linha EXCLUÍDA da
      -- consulta pra QUALQUER usuário, inclusive admin (bypass de isAdmin nunca
      -- chegava a rodar — a linha já tinha sumido aqui). 2 tarefas de crédito
      -- reais ficaram invisíveis em PRODUÇÃO por causa disso (achado 16/07,
      -- corrigido na mesma sessão). COALESCE trata o NULL como "não é reversa".
      ${sql`AND (COALESCE(t.tipo, '') <> 'conversao_reversa' OR ${reversaAprovadorCond})`}
      -- BLOCO 5 (jul/2026), P2 — 'Minhas solicitações': visão NOVA e ESCOPADA
      -- (não mexe em 'minhas'). O QUE: quem CRIOU a tarefa (coluna criado_por)
      -- vê TUDO que pediu, em QUALQUER status — inclusive 'rejeitada' (sem
      -- essa visão, uma solicitação recusada some de vez: 'concluidas' só
      -- aceita status IN ('concluida','aprovada'), e 'minhas'/'aguardando'
      -- nunca olham criado_por). POR QUE NÃO estender 'minhas': 'minhas' é
      -- responsavel_id-based e é a FILA DE TRABALHO de todo mundo (inclusive
      -- quem aprova) — misturar criado_por ali faria QUALQUER usuário que já
      -- criou uma tarefa pra outra pessoa (ex.: gerente delegando) ver essas
      -- tarefas para sempre na própria fila, poluindo um fluxo usado por
      -- TODOS os tipos de tarefa, não só frete avulso. Escopar numa visão
      -- própria evita esse efeito colateral. IMPACTO SE REMOVIDO: quem
      -- solicita (ex.: consultora pedindo frete avulso) fica sem NENHUMA tela
      -- que mostre o próprio pedido depois que ele sai da fila do aprovador —
      -- achado original: "a permissão existe, mas a porta não" (4a ocorrência
      -- desta classe de bug no módulo).
      ${visao === "minhas"
          ? sql`AND (t.responsavel_id = ${userId}::uuid)`
          : visao === "solicitadas"
            ? sql`AND (t.criado_por = ${userId}::uuid)`
            : visao === "time"
              ? sql``
              : !isAdmin
                ? sql`AND (t.responsavel_id = ${userId}::uuid OR t.criado_por = ${userId}::uuid OR ${multiAprovadorCond})`
                : sql``}
      -- BUGFIX (16/07 — achado pelo Jonathan testando o front): "Aprovações
      -- pendentes" mostrava a tarefa pra QUALQUER admin/desenvolvedor, mesmo
      -- fora da lista configurada — clicar em Aprovar já dava 403 corretamente
      -- (podeDecidir nunca teve esse furo), mas a tarefa NÃO devia nem
      -- aparecer pra eles (mesma regra já valia pra conversao_reversa desde a
      -- Fase 5 — "nem admin vê se não estiver configurado"). Removido o bypass
      -- de isAdmin aqui: a fila de aprovação agora respeita SEMPRE
      -- responsavel_id/multiAprovadorCond, admin incluso. "Tarefas do time"
      -- (visao=time, acima) continua sem restrição — é a visão de supervisão
      -- geral, não a fila de aprovação.
      ${(visao === "aguardando_aprovacao" || visao === "aguardando")
        ? sql`AND t.status = 'aguardando_aprovacao' AND (t.responsavel_id = ${userId}::uuid OR ${multiAprovadorCond})`
        : sql``}
      ${visao === "concluidas" ? sql`AND t.status IN ('concluida', 'aprovada')` : sql``}
      ${visao === "pendentes" ? sql`AND t.status IN ('pendente', 'em_andamento', 'aguardando_aprovacao')` : sql``}
      ${visao === "vencidas" ? sql`AND (t.status = 'vencida' OR (t.data_limite < CURRENT_DATE AND t.status NOT IN ('concluida','cancelada','vencida','aprovada')))` : sql``}
      ${status && !visao ? sql`AND t.status = ${status}` : sql``}
      ${responsavel ? sql`AND t.responsavel_id = ${responsavel}::uuid` : sql``}
      ${criador ? sql`AND t.criado_por = ${criador}::uuid` : sql``}
      ${prioridade ? sql`AND t.prioridade = ${prioridade}` : sql``}
      ${ordem_id ? sql`AND t.ordem_id = ${Number(ordem_id)}` : sql``}
      ${venda_id ? sql`AND t.venda_id = ${Number(venda_id)}` : sql``}
      ${tipo ? sql`AND t.tipo = ${tipo}` : sql``}
      ${tagsList.length > 0 ? sql`AND t.tags && ${tagsList}` : sql``}
      ${busca ? sql`AND (t.titulo ILIKE ${'%' + busca + '%'} OR t.descricao ILIKE ${'%' + busca + '%'})` : sql``}
    ORDER BY
      CASE t.prioridade WHEN 'urgente' THEN 1 WHEN 'alta' THEN 2 WHEN 'media' THEN 3 ELSE 4 END,
      t.created_at DESC
    LIMIT 200
  `;

  return NextResponse.json(tarefas);
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const raw = await req.json().catch(() => ({}));
  const parsed = TarefaPostSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;

  try {
    checkStringLength("titulo", body.titulo, LIMITS.TITULO_MAX);
    checkStringLength("descricao", body.descricao, LIMITS.DESCRICAO_LONGA_MAX);
    checkArrayLength("ordem_ids", body.ordem_ids, LIMITS.ORDENS_LOTE_MAX);
    checkArrayLength("tags", body.tags, 20);
  } catch (e) {
    const r = payloadTooLargeResponse(e);
    if (r) return r;
    throw e;
  }

  if (!body.titulo?.trim()) {
    return NextResponse.json({ error: "Título obrigatório" }, { status: 400 });
  }

  const [tarefa] = await sql`
    INSERT INTO alissonerp.tarefas
      (titulo, descricao, responsavel_id, criado_por, prioridade, data_limite,
       ordem_id, ordem_ids, peso_metal, venda_id, tags, tipo)
    VALUES (
      ${body.titulo.trim()},
      ${body.descricao ?? null},
      ${body.responsavel_id ?? null}::uuid,
      ${user.id}::uuid,
      ${body.prioridade ?? "media"},
      ${body.data_limite ?? null},
      ${body.ordem_id ?? null},
      ${body.ordem_ids ?? null},
      ${body.peso_metal ?? null},
      ${body.venda_id ?? null},
      ${body.tags ?? []},
      ${body.tipo ?? null}
    )
    RETURNING id, titulo, status, prioridade, tipo, created_at
  `;

  if (body.responsavel_id && body.responsavel_id !== user.id) {
    await criarNotificacao({
      usuarioId: body.responsavel_id,
      tipo: "tarefa",
      titulo: "Nova tarefa atribuída: " + body.titulo.trim(),
      mensagem: body.descricao ?? body.titulo.trim(),
      remetenteId: user.id,
      link: `/tarefas?abrir=${tarefa.id}`,
    }).catch(() => {});
  }

  return NextResponse.json(tarefa, { status: 201 });
}
