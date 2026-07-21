/**
 * POST /api/entregas-venda/frete-avulso
 *
 * Cria um frete avulso — corrida de motoboy sem venda vinculada.
 *
 * REGRA DE NEGÓCIO: avulso não tem itens, não tem código de verificação
 * e não dispara WhatsApp. Motoboy e frete_cobrado são obrigatórios.
 * O motoboy confirma a corrida pelo app com um botão simples.
 * O valor do frete entra normalmente no acerto financeiro do motoboy.
 *
 * IMPACTO SE ALTERADO: não contornar com INSERT direto — usar criarFreteAvulso()
 * para garantir geração do codigo_entrega e auditoria.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import sql from "@/lib/db";
import { criarFreteAvulso, calcularValorMotoboy } from "@/lib/entrega-venda";
import { zodError } from "@/lib/schemas/common";
import { requireVendaOwnership, NotFoundError } from "@/lib/auth-vendas";
import { AuthError, ForbiddenError, type AuthUser } from "@/lib/auth-server";
import { LIMITS, checkBase64Length, payloadTooLargeResponse } from "@/lib/payload-limits";
import {
  podeAcessarFreteAvulso,
  podeSolicitarFreteAvulso,
  podeCriarFreteAvulsoDireto,
} from "@/lib/permissoes/frete-avulso";

// REGRA DE NEGÓCIO (BLOCO 3 — fonte única de permissão, ver
// src/lib/permissoes/frete-avulso.ts): quem PODE chamar esta rota vem de lá,
// não é mais uma lista local. `podeAcessarFreteAvulso` é a UNIÃO de quem
// solicita + quem cria direto (gate de entrada); o MODO (`solicitar` no body)
// decide qual das duas listas específicas se aplica — ver enforcement logo
// abaixo de `ehSolicitacao`.
// IMPACTO SE VOLTAR A TER LISTA LOCAL: reabre a classe de bug "permissão
// existe mas a porta não" (front libera um papel, backend não conhece).

const FreteAvulsoSchema = z.object({
  // REGRA DE NEGÓCIO (pool de motoboy — patch A2): motoboyId é OPCIONAL na
  // criação pela loja. Quem SOLICITA (solicitar=true) não escolhe motoboy
  // (cai no pool, ver enderecoEntrega/vendaId abaixo); quem cria DIRETO
  // também pode criar sem motoboy (nasce 'pendente' sem dono, pool). Quando
  // informado, a corrida já nasce com dono.
  motoboyId: z.string().uuid("motoboyId deve ser um UUID válido").optional(),
  regiao: z.enum(["fortaleza", "fora_fortaleza", "longe", "correios"]),
  freteCobrado: z.number().nonnegative("freteCobrado não pode ser negativo"),
  freteMotoboyOverride: z.number().positive().optional(),
  descricaoAvulso: z.string().min(1, "Descrição da corrida é obrigatória").max(500),
  contatoId: z.number().int().positive().optional(),
  observacoes: z.string().max(2000).optional(),
  // REGRA DE NEGÓCIO (intenção explícita — ponto de entrada decide, não o
  // cargo): quem chama declara SE quer solicitar (`solicitar: true`) ou criar
  // direto (omitido/false). O QUÊ: antes o backend inferia isso pelo CARGO
  // (`role === "consultora"`) — o mesmo endpoint fazia coisas diferentes por
  // trás das costas de quem chamava. POR QUÊ: isso tornava a feature
  // intestável para admin/dev (não davam para testar a solicitação, só a
  // criação direta) e o comportamento era surpreendente (mesmo botão, 2
  // resultados diferentes conforme quem clicava). Agora é o PONTO DE ENTRADA
  // (menu Tarefas → Solicitações vs botão da tela de Entregas) que decide,
  // e manda essa intenção explícita no body.
  // IMPACTO SE VOLTAR A INFERIR POR CARGO: volta o comportamento fantasma —
  // o mesmo clique podendo gerar solicitação OU avulso liberado sem aviso.
  solicitar: z.boolean().optional(),
  // REGRA DE NEGÓCIO (fix 21/07 — venda deixa de ser obrigatória): frete
  // avulso é POR NATUREZA uma corrida que pode não ter venda (ex.: "levar
  // material à loja", "buscar peça"). Continua opcional MESMO com
  // `solicitar=true` — quando informado, ownership + janela de situações +
  // guard de duplicata são checados (ver bloco `ehSolicitacao` abaixo); sem
  // ele, a solicitação nasce só com o endereço informado (obrigatório, ver
  // enderecoEntrega* abaixo).
  // IMPACTO SE VOLTAR A EXIGIR: reabre o erro original — travava a
  // solicitação de corridas legítimas sem venda (a maioria dos casos reais).
  vendaId: z.number().int().positive().optional(),
  // REGRA DE NEGÓCIO (migration 355 — endereço estruturado, 21/07): antes um
  // único texto livre (`enderecoEntrega`, concatenado no client) — agora
  // campo a campo, espelhando vendas_erp.endereco_entrega_* (mesmos nomes,
  // ver EnderecoForm.tsx). Mínimo exigido no modo solicitação (validado
  // abaixo, fora do schema, porque só se aplica quando solicitar=true):
  // logradouro + número + cidade.
  enderecoEntregaLogradouro: z.string().max(300).optional(),
  enderecoEntregaNumero: z.string().max(20).optional(),
  enderecoEntregaComplemento: z.string().max(200).optional(),
  enderecoEntregaBairro: z.string().max(150).optional(),
  enderecoEntregaCidade: z.string().max(150).optional(),
  enderecoEntregaCep: z.string().max(10).optional(),
  enderecoEntregaUf: z.string().max(2).optional(),
  // REGRA DE NEGÓCIO (migration 354, 21/07 — "quem paga"): obrigatório junto
  // com solicitar=true (validado abaixo, não no schema, porque só se aplica
  // ao modo solicitação). Decide comprovante obrigatório e o pool de
  // aprovador — ver criarFreteAvulso em @/lib/entrega-venda.
  pagante: z.enum(["loja", "cliente"]).optional(),
  // Comprovante de pagamento (base64/data URL) — OBRIGATÓRIO quando
  // pagante='cliente'. Tamanho limitado (checkBase64Length abaixo) antes de
  // chegar no upload.
  comprovanteBase64: z.string().optional(),
});

// REGRA DE NEGÓCIO: o entregador registra a PRÓPRIA corrida pelo app.
// Só escolhe descrição + região; o valor é FIXO pela tabela (não digita),
// motoboy_id é forçado como ele mesmo e a corrida nasce PENDENTE de
// confirmação da loja. Regiões com valor 0 (longe/correios) não são
// oferecidas ao motoboy — só as com valor fixo na tabela.
const FreteAvulsoMotoboySchema = z.object({
  regiao: z.enum(["fortaleza", "fora_fortaleza"]),
  descricaoAvulso: z.string().min(1, "Descrição da corrida é obrigatória").max(500),
  observacoes: z.string().max(2000).optional(),
});

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  const role = usuario?.role as string | undefined;
  const ehEntregador = role === "entregador";
  if (!role || (!ehEntregador && !podeAcessarFreteAvulso(role))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  // Entregador registra a própria corrida: valor fixo pela tabela, sem cobrança
  // de cliente (frete_cobrado = frete_motoboy → não mexe no saldo da gerente),
  // motoboy_id forçado como ele mesmo, nasce pendente.
  if (ehEntregador) {
    const parsed = FreteAvulsoMotoboySchema.safeParse(raw);
    if (!parsed.success) return zodError(parsed.error);
    const { regiao, descricaoAvulso, observacoes } = parsed.data;
    const valor = calcularValorMotoboy(regiao);
    try {
      const avulso = await criarFreteAvulso(
        { motoboyId: user.id, regiao, freteCobrado: valor, descricaoAvulso, observacoes },
        user.id,
      );
      return NextResponse.json({ avulso });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao registrar corrida";
      console.error("[frete-avulso/motoboy] Erro:", err);
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  const parsed = FreteAvulsoSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);

  // REGRA DE NEGÓCIO (intenção explícita — ponto de entrada decide, não o
  // cargo): quem SOLICITA (não libera o custo sozinho) é quem chamou a rota
  // com `solicitar: true` no body — vindo do menu Tarefas › Solicitações,
  // INDEPENDENTE do cargo, respeitando ROLES_SOLICITAR_FRETE_AVULSO (ver
  // src/lib/permissoes/frete-avulso.ts). O avulso nasce 'solicitada' (criarFreteAvulso com
  // modoSolicitacao=true) e cai no pool de liberadores (qualquer um decide);
  // só entra no saldo da gerente quando liberado.
  // O QUÊ MUDOU: antes esse ramo só rodava para `role === "consultora"` —
  // qualquer outro cargo (mesmo com a MESMA intenção de solicitar) caía no
  // ramo de criação direta sem passar por aqui.
  // IMPACTO SE VOLTAR A CHECAR CARGO: quem solicita pelo cargo errado
  // criaria avulso já 'pendente' (liberado), assumindo custo de frete sem
  // controle de nenhum liberador — e admin/dev não conseguiriam nem testar
  // o fluxo de solicitação.
  const ehSolicitacao = parsed.data.solicitar === true;

  // REGRA DE NEGÓCIO (reforma da tela Entregas, 21/07 — decisão do Jonathan:
  // botão "Frete Avulso" passa a usar o MESMO formulário completo da
  // solicitação, mas criando DIRETO): `usaFormularioCompleto` é true tanto na
  // solicitação real quanto no novo modo direto-com-formulário-completo
  // (detectado pela presença de `pagante` — só o formulário completo manda
  // esse campo; o formulário enxuto antigo/legado nunca manda). Espelha o
  // MESMO cálculo de src/lib/entrega-venda.ts (criarFreteAvulso) — mantido
  // aqui só para a validação de endereço/pagante/comprovante ANTES de chamar
  // a lib (defesa em profundidade, mesmo padrão já usado no resto da rota).
  // IMPACTO SE DIVERGIR DA LIB: a rota deixaria passar (ou bloquear) payloads
  // que a lib trataria diferente — ver criarFreteAvulso para a autoridade real.
  const usaFormularioCompleto = ehSolicitacao || parsed.data.pagante !== undefined;

  // REGRA DE NEGÓCIO (BLOCO 3 — enforcement por MODO, fonte única em
  // src/lib/permissoes/frete-avulso.ts): o gate de entrada acima
  // (podeAcessarFreteAvulso) só garante acesso ao endpoint — aqui checa se o
  // papel pode o MODO específico escolhido. Isto é o que de fato impede, por
  // exemplo, diretor (só está em ROLES_SOLICITAR_FRETE_AVULSO) de criar um
  // avulso DIRETO mandando `solicitar: false`/omitido — sem isto o gate de
  // entrada sozinho deixaria passar (diretor tem acesso ao endpoint), e só o
  // front (que nem mostra esse botão pra diretor) impediria — 403 nenhum.
  // IMPACTO SE REMOVIDO: quem só deveria solicitar (diretor) consegue criar
  // direto via chamada de API direta, já liberado, sem passar pelo pool.
  if (ehSolicitacao && !podeSolicitarFreteAvulso(role)) {
    return NextResponse.json({ error: "Sem permissão para solicitar frete avulso" }, { status: 403 });
  }
  if (!ehSolicitacao && !podeCriarFreteAvulsoDireto(role)) {
    return NextResponse.json({ error: "Sem permissão para criar frete avulso direto" }, { status: 403 });
  }

  // REGRA DE NEGÓCIO (BLOCO 3 — ownership virou invariante, não mais preso ao
  // modo): antes só rodava dentro de `if (ehSolicitacao)` — a criação DIRETA
  // (ehSolicitacao=false) gravava venda_id no INSERT (ver criarFreteAvulso)
  // sem NUNCA checar dono da venda. Resultado (IDOR real): quem tivesse acesso
  // a este endpoint podia mandar `vendaId` de venda de OUTRA consultora no
  // modo direto e a entrega nascia pendurada lá, sem 403. Agora reusa
  // requireVendaOwnership (mesma checagem de /api/vendas) SEMPRE que
  // `vendaId` vier, independente do modo — full-access passa validando só a
  // existência da venda; os demais precisam ser donos (vendedor_id).
  // IMPACTO SE VOLTAR A SÓ ehSolicitacao: reabre o IDOR — criação direta em
  // nome de venda de colega, sem checagem nenhuma.
  if (parsed.data.vendaId) {
    const authUser: AuthUser = { id: user.id, role, email: user.email ?? "" };
    try {
      await requireVendaOwnership(authUser, parsed.data.vendaId);
    } catch (e) {
      if (e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
      if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
      if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 });
      throw e;
    }
  }

  if (usaFormularioCompleto) {
    // REGRA DE NEGÓCIO (migration 355 — endereço estruturado; fix 21/07 —
    // venda deixa de ser obrigatória; reforma da tela Entregas — estendido
    // ao modo DIRETO com formulário completo): mínimo exigido é logradouro +
    // número + cidade (mesmo padrão validado de novo em criarFreteAvulso —
    // defesa em profundidade). Complemento/bairro/UF/CEP ajudam mas não
    // bloqueiam. `vendaId` NÃO entra nesta validação — é opcional (frete
    // avulso pode não ter venda, ex.: "levar material à loja"); é o endereço
    // quem diz para onde a corrida vai.
    if (
      !parsed.data.enderecoEntregaLogradouro?.trim() ||
      !parsed.data.enderecoEntregaNumero?.trim() ||
      !parsed.data.enderecoEntregaCidade?.trim()
    ) {
      return NextResponse.json(
        { error: "Logradouro, número e cidade são obrigatórios para o endereço de entrega do frete avulso" },
        { status: 400 },
      );
    }
    // REGRA DE NEGÓCIO (migration 354 — "quem paga"; estendido ao modo
    // DIRETO com formulário completo): validado no SERVIDOR, não só no
    // front (FreteAvulsoModal). "loja" não exige comprovante; "cliente"
    // exige — criarFreteAvulso valida de novo (defesa em profundidade,
    // mesmo padrão de requireVendaOwnership abaixo).
    if (parsed.data.pagante !== "loja" && parsed.data.pagante !== "cliente") {
      return NextResponse.json(
        { error: "Informe quem paga o frete avulso: loja ou cliente" },
        { status: 400 },
      );
    }
    if (parsed.data.pagante === "cliente" && !parsed.data.comprovanteBase64) {
      return NextResponse.json(
        { error: "Comprovante de pagamento é obrigatório quando o frete é pago pelo cliente" },
        { status: 400 },
      );
    }
    if (parsed.data.comprovanteBase64) {
      try {
        checkBase64Length("comprovanteBase64", parsed.data.comprovanteBase64, LIMITS.IMAGE_BASE64_MAX);
      } catch (e) {
        const r = payloadTooLargeResponse(e);
        if (r) return r;
        throw e;
      }
    }
    // Ownership de vendaId já foi checada ACIMA (fora deste bloco) — vale nos
    // dois modos, ver comentário BLOCO 3 antes de `ehSolicitacao`.
  }

  try {
    const avulso = await criarFreteAvulso(
      {
        // REGRA DE NEGÓCIO (reforma da tela Entregas, 21/07): `pagante` e
        // `comprovanteBase64` NÃO são mais descartados no modo direto —
        // `...parsed.data` já os inclui como vieram no body (undefined nos
        // dois campos para o formulário enxuto/legado, que nunca os manda).
        // `criarFreteAvulso` decide sozinho quando validar/gravar cada um
        // via `usaFormularioCompleto` (mesmo cálculo desta rota, ver acima).
        // IMPACTO SE VOLTAR A FORÇAR undefined FORA DA SOLICITAÇÃO: o modo
        // direto com formulário completo perderia silenciosamente quem pagou
        // e o comprovante anexado.
        ...parsed.data,
        modoSolicitacao: ehSolicitacao,
      },
      user.id,
    );
    return NextResponse.json({ avulso });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: 401 });
    const message = err instanceof Error ? err.message : "Erro ao criar frete avulso";
    console.error("[frete-avulso] Erro:", err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
