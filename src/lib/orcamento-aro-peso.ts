/**
 * Recálculo do peso da aliança quando o ARO é confirmado na abertura da ordem.
 *
 * O QUE: a partir de uma linha de `alissonerp.orcamento_fichas_tecnicas` e de um
 * novo número de aro, devolve o diâmetro e o peso estimado correspondentes.
 *
 * POR QUE: o aro define o diâmetro interno, e o diâmetro entra direto no volume
 * de metal (computeWeight em orcamento/constants.ts). Aliança aro 14 e aro 24
 * do mesmo modelo NÃO pesam a mesma coisa. Quando a consultora confirma um aro
 * diferente do que foi orçado (o clássico: ela chutou um número só para fechar
 * a venda), a FICHA e a ORDEM precisam sair com o peso do aro real — senão o
 * ourives recebe uma grama que não fecha com a peça que ele tem que fazer.
 *
 * DECISÃO DE NEGÓCIO (Jonathan, 27/07/2026): trocar o aro corrige o peso da
 * produção e NÃO altera o valor negociado com o cliente. Por isso esta lib
 * mexe apenas em peso/diâmetro — `orcamentos.peso` e `orcamentos.valor`
 * (base do preço, travada por snapshot) não são tocados por ninguém aqui.
 *
 * COMO o peso é calculado — por DELTA, não do zero:
 *   peso_novo = peso_gravado + (raw(aro novo) − raw(aro antigo))
 * O peso gravado na ficha veio do orçamento com todos os parâmetros de
 * calibração/config vigentes (ex.: ajuste percentual de pedra da migration 265).
 * Recalculando do zero aqui, qualquer diferença de config produziria um peso
 * diferente do orçado MESMO SEM TROCAR O ARO. Pelo delta, o que muda é só o
 * efeito do diâmetro: aro igual ⇒ delta zero ⇒ peso idêntico ao orçamento.
 *
 * IMPACTO SE ALTERADO: mudar para recálculo absoluto faz o peso da ordem
 * divergir do orçamento em peças antigas; remover o arredondamento de 0,5 g
 * quebra o padrão de peso do sistema (computeWeight arredonda em passos de 0,5).
 */

import { RING_SIZES, computeWeight } from "@/app/(dashboard)/orcamento/constants";
import { ProfileType, type RingParams } from "@/app/(dashboard)/orcamento/types";

/** Linha de orcamento_fichas_tecnicas (driver postgres devolve tipos dinâmicos). */
type FichaRow = Record<string, unknown>;

const n = (v: unknown, fallback = 0): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
};

/** Aro válido = existe na tabela RING_SIZES (1–36). Não aceita texto livre. */
export function aroValido(aro: number): boolean {
  return RING_SIZES.some((r) => r.size === aro);
}

/** Diâmetro interno (mm) do aro. null se o aro não existir na tabela. */
export function diametroDoAro(aro: number): number | null {
  return RING_SIZES.find((r) => r.size === aro)?.diameter ?? null;
}

/**
 * Número do aro gravado na ficha. A coluna guarda "Aro 18" (formato do
 * orçamento, ver buildFicha em OrcamentoClient.tsx), mas fichas antigas podem
 * ter só "18" — por isso o replace antes do Number.
 */
export function aroDaFicha(ft: FichaRow): number | null {
  if (ft.aro_numeracao == null) return null;
  const num = Number(String(ft.aro_numeracao).replace("Aro ", "").trim());
  return Number.isFinite(num) && num > 0 ? num : null;
}

/**
 * Monta o RingParams usado por computeWeight. Só os campos que entram no
 * volume importam; os de precificação/visual vão com valor neutro (o peso não
 * depende deles). Mesma leitura de colunas do toViewerData de
 * /api/ordens/[id]/ring-params — se as colunas da ficha mudarem, os dois lugares
 * precisam mudar juntos.
 */
function fichaToParams(ft: FichaRow, diametro: number): { profile: ProfileType; params: RingParams } {
  const perfilRaw = String(ft.perfil ?? "Anatomica");

  // Perfis legados FrisoUnico/FrisoLateral não existem mais como perfil: viraram
  // Simples + friso (mesma normalização do orçamento e do visualizador 3D).
  let perfilNorm = perfilRaw;
  let grooveType: "lateral" | "centro" | "duplo" = "lateral";
  if (perfilRaw === "FrisoUnico") { perfilNorm = "Simples"; grooveType = "lateral"; }
  else if (perfilRaw === "FrisoLateral") { perfilNorm = "Simples"; grooveType = "duplo"; }
  else if (ft.friso_tipo === "centro" || ft.friso_tipo === "duplo") grooveType = ft.friso_tipo;

  const hasGroove = perfilRaw === "FrisoUnico" || perfilRaw === "FrisoLateral" || ft.has_friso === true;
  const qtdPedras = n(ft.qtd_pedras);

  return {
    profile: perfilNorm as ProfileType,
    params: {
      diameter: diametro,
      width: n(ft.largura, 5),
      height: n(ft.espessura, 1.5),
      concaveDepth: n(ft.profundidade_concava, 0.3),
      grooveSide: ft.friso_lado === "LOWER" ? "LOWER" : "UPPER",
      grooveWidth: n(ft.friso_largura),
      grooveDepth: n(ft.friso_profundidade),
      grooveOffset: n(ft.friso_offset),
      canalWidth: n(ft.canal_largura),
      canalBorderHeight: n(ft.canal_borda_altura),
      chamferSize: n(ft.chanfro_tamanho),
      domePercentage: n(ft.dome_porcentagem, 100),
      metalColor: "",
      goldDensity: n(ft.densidade_ouro, 15.5),
      goldPrice: 0,
      startMkp: 1,
      discountPercent: 0,
      hasGroove,
      grooveKind: ft.friso_kind === "risco" ? "risco" : "friso",
      grooveType,
      hasStones: qtdPedras > 0,
      stoneSize: n(ft.tamanho_pedra),
      stoneRows: n(ft.pedra_fileiras, 1),
      stoneCount: qtdPedras,
      stoneDrill: ft.pedra_drill === true,
      stoneHalfMoon: ft.pedra_meia_lua === true,
      stoneFull: ft.pedra_volta_completa === true,
      stoneType: String(ft.tipo_pedra ?? "diamante"),
      textEnabled: false,
      textFontType: 1,
      textContent: "",
    },
  };
}

export type PesoParaAro = {
  /** Aro pedido. */
  aro: number;
  /** Diâmetro interno (mm) do aro pedido. */
  diametro: number;
  /** Peso estimado (g) da aliança nesse aro, em passos de 0,5 g. */
  peso: number;
  /** Peso que está gravado na ficha hoje (g). */
  pesoAtual: number;
  /** peso − pesoAtual, em gramas (positivo = aliança mais pesada). */
  delta: number;
};

/**
 * Peso da aliança da ficha `ft` no aro `aro`. Retorna null se o aro não existe
 * na tabela de aros (bloqueia número inventado antes de virar ordem).
 */
export function pesoParaAro(ft: FichaRow, aro: number): PesoParaAro | null {
  const diametro = diametroDoAro(aro);
  if (diametro == null) return null;

  const pesoAtual = n(ft.peso_estimado);
  const aroAtual = aroDaFicha(ft);
  // Sem aro/peso de referência não há delta possível: devolve o peso gravado.
  // (Não deveria acontecer — o orçamento exige o aro — mas ficha legada existe.)
  const diametroAtual = aroAtual != null ? diametroDoAro(aroAtual) : n(ft.diametro) || null;
  if (pesoAtual <= 0 || diametroAtual == null) {
    return { aro, diametro, peso: pesoAtual, pesoAtual, delta: 0 };
  }

  const novo = fichaToParams(ft, diametro);
  const antigo = fichaToParams(ft, diametroAtual);
  const rawNovo = computeWeight(novo.params, novo.profile).weightRaw;
  const rawAntigo = computeWeight(antigo.params, antigo.profile).weightRaw;

  // Passos de 0,5 g — mesmo arredondamento do computeWeight, para o peso da
  // ordem sair no mesmo "formato" do peso do orçamento.
  const peso = Math.max(0.5, Math.round((pesoAtual + (rawNovo - rawAntigo)) * 2) / 2);
  return { aro, diametro, peso, pesoAtual, delta: Math.round((peso - pesoAtual) * 100) / 100 };
}
