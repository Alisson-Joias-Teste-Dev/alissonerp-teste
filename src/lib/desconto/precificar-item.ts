/**
 * FONTE ÚNICA DE DESCONTO — "a calculadora de desconto" do ERP.
 *
 * O QUÊ: uma única função pura que recebe (preço cheio, % de desconto, pedras,
 *   tetos, cargo) e devolve TUDO pronto — preço final, distribuição ouro/pedra,
 *   se precisa de aprovação e a comissão. Todas as telas/rotas/triggers devem
 *   passar a chamar ESTA função, em vez de cada uma recalcular do seu jeito.
 *
 * O PORQUÊ (regra de negócio): hoje o desconto é calculado em ~7 fórmulas
 *   diferentes espalhadas pelo sistema (orçamento aliança, orçamento peça,
 *   venda/PDV, detalhe da venda, fiscal, comissão, dashboard e banco). Elas
 *   divergem em teto, arredondamento, distribuição ouro/pedra e comissão — então
 *   o MESMO desconto produz números diferentes dependendo da tela. O caso visível
 *   é a aliança "par": a tela mostra a pedra CHEIA e joga o desconto todo no ouro
 *   (ouro vai a "-3"), mas a venda desconta a pedra. Ver
 *   docs/seguranca/mapa-descontos-sistema-2026-06-23.md.
 *
 * O IMPACTO SE ALTERADO/REMOVIDO: voltam as divergências de dinheiro — preço
 *   exibido ≠ preço cobrado, comissão errada em venda promocional, teto que a tela
 *   libera e o servidor recusa. Esta função é o ÚNICO lugar onde essas regras
 *   devem viver. Qualquer mudança de regra de desconto/comissão entra AQUI.
 *
 * DECISÕES DO JONATHAN (23/06/2026) que esta função encapsula:
 *   1. Arredondamento: NÃO arredonda para reais/dezenas — mantém o VALOR REAL
 *      (centavos exatos, 2 casas) para a conciliação financeira bater.
 *   2. Teto: prevalece SEMPRE o CADASTRO DO USUÁRIO (usuarios.mx_desconto_permitido).
 *      Teto de produto (max_desconto_pct) ou qualquer outra fonte = IGNORADO
 *      (decisão Jonathan 23/06: "o que prevalece sempre é o cadastro do usuário").
 *      Cadastro vazio/0 = 0% (sem cadastro, NADA de desconto sem aprovação);
 *      full-access (admin/desenvolvedor) = 100%.
 *   2b. Desconto PROMOCIONAL (módulo de promoções) é PRÉ-APROVADO: o chefe aprova
 *      ANTES da venda, então o vendedor vende naquele % SEM pedir aprovação. Para
 *      passar do %, ele SOLICITA aprovação — NÃO empilha por conta própria. O
 *      limite sem aprovação do item = o MAIOR entre o teto do cadastro e o % da
 *      promoção (não soma os dois). Campo pctPreAprovado.
 *   3. Limite de cartão (20%): vira constante configurável (LIMITE_DESCONTO_CARTAO_PADRAO),
 *      depois lida de parametros_sistema — nunca mais hardcoded em 4 lugares.
 *   4. Aprovar desconto acima do teto: comissão fica em 0,5% (não zera).
 *   + Pedra leva desconto proporcional (a tela passa a mostrar o que é cobrado).
 */

// ─── Tipos ────────────────────────────────────────────────────────────────────

/** Faixa de comissão (tabela alissonerp.faixas_comissao). */
export interface FaixaComissao {
  desconto_pct: number;
  comissao_pct: number;
}

export interface PrecificarItemInput {
  /** Preço CHEIO do item (sem desconto), JÁ incluindo ouro + pedras + gravação.
   *  É a base tanto do desconto quanto da comissão. Para item em promoção, o
   *  caller deve passar o preço cheio "oficial" (curva ou preco_promo_original),
   *  nunca o preço já promocional. */
  precoListaCheio: number;
  /** % de desconto solicitado (0–100). NÃO é cortado pelo teto — o teto só decide
   *  se precisa de aprovação. */
  pctDesconto: number;
  /** Quantidade (default 1). */
  quantidade?: number;
  /** Parte do preço cheio que é PEDRA (para distribuir o desconto proporcional). */
  pedrasRS?: number;
  /** Parte do preço cheio que é GRAVAÇÃO (idem). */
  gravacaoRS?: number;
  /** Teto de desconto do CADASTRO do usuário (usuarios.mx_desconto_permitido).
   *  É a ÚNICA fonte de teto (Jonathan 23/06): produto/campanha são ignorados.
   *  Vazio/0 = sem teto próprio → cai no fallback. */
  tetoUsuarioPct?: number | null;
  /** Cargo do usuário — full-access (admin/desenvolvedor) ignora teto (=100%). */
  role?: string | null;
  /** Cargos full-access. Default ["desenvolvedor","admin"]. */
  fullAccessRoles?: string[];
  /** Teto quando o cadastro do usuário está vazio/0. Default 0 (Jonathan 23/06). */
  fallbackTetoPct?: number;
  /** Se um desconto acima do teto JÁ foi aprovado pela direção NA HORA (exceção
   *  manual). Quando true e o desconto estourou o teto, a comissão vira 0,5%
   *  (decisão Jonathan 23/06). */
  descontoAprovado?: boolean;
  /** Desconto JÁ PRÉ-APROVADO pela PROMOÇÃO (módulo de promoções), em %. O chefe
   *  aprovou ANTES da venda, então o vendedor vende nesse % sem pedir aprovação.
   *  O limite SEM aprovação do item vira o MAIOR entre este % e o teto do cadastro
   *  (não soma os dois). Para passar disso, o vendedor SOLICITA aprovação — não
   *  empilha por conta própria. 0 = item sem promoção. A comissão segue a faixa
   *  (promo > 30% cai em 0,5%). Diferente de descontoAprovado (exceção manual
   *  aprovada na hora → 0,5%). */
  pctPreAprovado?: number;
  /** Tabela de faixas de comissão. Se vazia, comissão = 0,5% p/ desconto>30%, senão 0. */
  faixasComissao?: FaixaComissao[];
}

export interface PrecificarItemResult {
  /** % efetivamente aplicado (pctDesconto saneado para 0–100). */
  pctEfetivo: number;
  /** Limite de desconto SEM aprovação que valeu para o item (maior entre o teto
   *  do cadastro e o % pré-aprovado da promoção; 100 p/ full-access). */
  tetoAplicado: number;
  /** Desconto passou do teto? */
  estourouTeto: boolean;
  /** Precisa de aprovação da direção? (estourou teto e não é full-access). */
  precisaAprovacao: boolean;
  /** Preço unitário com desconto, VALOR REAL (2 casas, sem arredondar p/ reais). */
  precoUnitario: number;
  /** Total do item (precoUnitario * quantidade). */
  totalItem: number;
  /** Valor do desconto em R$ ((cheio - unit) * qtd). */
  valorDescontoRS: number;
  /** Parte OURO do total, com o desconto distribuído proporcional. */
  valorOuroRS: number;
  /** Parte PEDRAS do total, com o desconto distribuído proporcional. */
  valorPedrasRS: number;
  /** Parte GRAVAÇÃO do total, com o desconto distribuído proporcional. */
  valorGravacaoRS: number;
  /** Preço cheio reconstruído (= base usada) — p/ gravar preco_lista coerente. */
  precoListaReconstruido: number;
  /** % de comissão resultante. */
  comissaoPct: number;
  /** Valor da comissão em R$ (totalItem * comissaoPct / 100). */
  valorComissaoRS: number;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

/** Cargos que ignoram o teto de desconto (podem dar até 100% sem aprovação).
 *  Espelha SUPER de NovaVendaClientV2/page.tsx. */
export const FULL_ACCESS_ROLES_DESCONTO = ["desenvolvedor", "admin"] as const;

/** Teto quando o cadastro do usuário está vazio/0 (decisão Jonathan 23/06: 0% —
 *  sem cadastro, nada de desconto sem aprovação). */
export const FALLBACK_TETO_DESCONTO_PCT = 0;

/** Limite padrão de desconto no CARTÃO. Vira configurável via parametros_sistema
 *  (decisão Jonathan 23/06) — este é só o default enquanto o parâmetro não existe.
 *  IMPACTO: hoje 20% está hardcoded em ≥4 lugares; centralizar aqui acaba com isso. */
export const LIMITE_DESCONTO_CARTAO_PADRAO = 20;

// ─── Helpers puros ────────────────────────────────────────────────────────────

/** Arredonda para 2 casas (centavos) — VALOR REAL, sem arredondar para reais/dezenas.
 *  O + Number.EPSILON evita o erro clássico de float (ex.: 1.005 → 1.00). */
export function arredondarMoeda(x: number): number {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

/**
 * Comissão a partir do % de desconto, espelhando getComissao de NovaVendaClientV2:
 *  - desconto > 30% → 0,5% (fixo)
 *  - senão, faixa cujo desconto_pct == round(pct); se não houver, 0%.
 * IMPACTO: é a fórmula promo-aware oficial — usar a MESMA em venda nova, detalhe,
 *   dashboard e análise acaba com o "4% chumbado" e a comissão errada ao editar.
 */
export function comissaoDaFaixa(pctDesconto: number, faixas: FaixaComissao[] = []): number {
  if (pctDesconto > 30) return 0.5;
  const faixa = faixas.find((f) => f.desconto_pct === Math.round(pctDesconto));
  return faixa ? faixa.comissao_pct : 0;
}

/**
 * Teto de desconto que vale para o item — FONTE ÚNICA: o cadastro do usuário.
 *  - full-access (admin/desenvolvedor) → 100
 *  - cadastro do usuário definido (>0) → esse valor
 *  - cadastro vazio/0 → fallback (0: nada sem aprovação)
 * Teto de produto/campanha NÃO entra (decisão Jonathan 23/06): só o cadastro do
 * usuário prevalece. IMPACTO: acaba a divergência onde o teto de um produto, ou
 * um fallback escondido por cargo (ex.: gerente_loja=50), sobrepunha o cadastro.
 */
export function calcularTetoDesconto(
  tetoUsuarioPct?: number | null,
  role?: string | null,
  fullAccessRoles: readonly string[] = FULL_ACCESS_ROLES_DESCONTO,
  fallbackTetoPct: number = FALLBACK_TETO_DESCONTO_PCT,
): number {
  if (role && fullAccessRoles.includes(role)) return 100;
  if (tetoUsuarioPct != null && tetoUsuarioPct > 0) return tetoUsuarioPct;
  return fallbackTetoPct;
}

// ─── Função principal ─────────────────────────────────────────────────────────

/**
 * Calcula um item com desconto — FONTE ÚNICA. Ver doc do topo do arquivo.
 *
 * Distribuição ouro/pedra (o fix do "-3"): o MESMO fator (1 - pct/100) é aplicado
 *   a ouro E pedra E gravação, de forma que valorOuro + valorPedras + valorGravacao
 *   == totalItem. Assim a tela mostra exatamente o que será cobrado e o ouro nunca
 *   fica negativo. Espelha o fatorEfetivo de OrcamentoClient (save/snapshot).
 */
export function calcularItemComDesconto(input: PrecificarItemInput): PrecificarItemResult {
  const {
    precoListaCheio,
    pctDesconto,
    quantidade = 1,
    pedrasRS = 0,
    gravacaoRS = 0,
    tetoUsuarioPct,
    role,
    fullAccessRoles = FULL_ACCESS_ROLES_DESCONTO,
    fallbackTetoPct = FALLBACK_TETO_DESCONTO_PCT,
    descontoAprovado = false,
    pctPreAprovado = 0,
    faixasComissao = [],
  } = input;

  // Saneia entradas: preço >= 0, qtd >= 1, desconto 0–100.
  const cheio = Math.max(0, precoListaCheio);
  const qtd = Math.max(1, Math.floor(quantidade) || 1);
  const pctEfetivo = Math.min(100, Math.max(0, pctDesconto || 0));
  const pctPreAprovadoSan = Math.min(100, Math.max(0, pctPreAprovado || 0));

  // Teto + aprovação. O limite SEM aprovação é o MAIOR entre o teto do cadastro e
  // o % pré-aprovado da promoção — NÃO soma os dois (Jonathan 23/06: "na promoção
  // ele pode SOLICITAR mais, não empilhar por conta própria"). Acima disso →
  // precisa solicitar aprovação. IMPACTO: sem isto, uma promoção de 50% pediria
  // aprovação, ou o vendedor empilharia teto + promoção sozinho.
  const tetoUsuario = calcularTetoDesconto(tetoUsuarioPct, role, fullAccessRoles, fallbackTetoPct);
  const tetoAplicado = Math.max(pctPreAprovadoSan, tetoUsuario);
  const estourouTeto = pctEfetivo > tetoAplicado;
  const precisaAprovacao = tetoAplicado < 100 && estourouTeto;

  // Fórmula única do preço (VALOR REAL, 2 casas — sem arredondar p/ reais).
  const fator = 1 - pctEfetivo / 100;
  const precoUnitario = arredondarMoeda(cheio * fator);
  const totalItem = arredondarMoeda(precoUnitario * qtd);
  const valorDescontoRS = arredondarMoeda((cheio - precoUnitario) * qtd);

  // Distribuição proporcional ouro/pedra/gravação — todas levam o MESMO fator.
  // Ouro = o que sobra do preço cheio depois de tirar pedra e gravação.
  const ouroBruto = Math.max(0, cheio - pedrasRS - gravacaoRS);
  const valorPedrasRS = arredondarMoeda(pedrasRS * fator * qtd);
  const valorGravacaoRS = arredondarMoeda(gravacaoRS * fator * qtd);
  // Ouro fecha por diferença, pra garantir ouro + pedra + gravação == totalItem
  // (evita centavo perdido no arredondamento). Nunca negativo.
  const valorOuroRS = arredondarMoeda(Math.max(0, totalItem - valorPedrasRS - valorGravacaoRS));

  // Comissão. Base = desconto REAL derivado dos preços (coerente com o dinheiro).
  // Se o desconto estourou o teto e foi APROVADO → 0,5% (decisão Jonathan 23/06).
  // Senão, faixa promo-aware (que já dá 0,5% p/ desconto > 30%).
  const descParaComissao = cheio > 0
    ? arredondarMoeda(((cheio - precoUnitario) / cheio) * 100)
    : 0;
  const comissaoPct = (precisaAprovacao && descontoAprovado)
    ? 0.5
    : comissaoDaFaixa(descParaComissao, faixasComissao);
  const valorComissaoRS = arredondarMoeda((totalItem * comissaoPct) / 100);

  return {
    pctEfetivo,
    tetoAplicado,
    estourouTeto,
    precisaAprovacao,
    precoUnitario,
    totalItem,
    valorDescontoRS,
    valorOuroRS,
    valorPedrasRS,
    valorGravacaoRS,
    precoListaReconstruido: cheio,
    comissaoPct,
    valorComissaoRS,
  };
}
