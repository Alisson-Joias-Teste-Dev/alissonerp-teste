/**
 * Converte uma linha de `alissonerp.orcamento_fichas_tecnicas` no shape
 * `fichas_tecnicas.dados` (JSONB) consumido pela tela de detalhe da ordem na
 * fabrica (OrdemDetalheClient.tsx).
 *
 * Usado quando uma venda de alianca eh promovida a ordem de fabricacao
 * (`src/app/api/vendas/[id]/route.ts`). Antes, o codigo enumerava todos os
 * campos manualmente em dois lugares (anel 1 e anel 2) — agora chama esta
 * funcao para os dois aneis.
 *
 * Decisoes:
 * - `texto_gravacao` eh gravado como ARRAY `string[]` (e nao mais string com
 *   separador U+001F). O OrdemDetalheClient ja aceita ambos formatos via
 *   `formatGravacao` da lib `gravacao`. Array eh mais limpo, mais legivel em
 *   logs/queries SQL, e elimina caracteres de controle no banco.
 * - Campos numericos so entram quando significativos (ex: dome_porcentagem
 *   omitido quando = 100 default; friso_offset omitido quando = 0).
 * - Campos booleanos `false` sao omitidos. Sao adicionados apenas quando true.
 */

import { splitGravacao } from "./gravacao";

const PERFIL_NOMES: Record<string, string> = {
  Anatomica: "Anatômica",
  Boleada: "Boleada",
  BoleadaDouble: "Boleada Dupla",
  Chanfrada: "Chanfrada",
  Concava: "Côncava",
  FrisoUnico: "Friso Único",
  FrisoLateral: "Friso Lateral",
  QuadradoCanal: "Quadrado Canal",
  Simples: "Reta",
};

/** Campos minimos esperados da row. Aceita Record sem tipagem rigida porque
 *  vem do `postgres` driver com tipos dinamicos. */
type FichaRow = Record<string, unknown>;

const num = (v: unknown): number | null => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Monta o objeto `dados` (JSONB) para fichas_tecnicas a partir da row do
 * orcamento_fichas_tecnicas. Retorna apenas campos significativos.
 */
export function orcamentoFichaToDados(ft: FichaRow): Record<string, unknown> {
  const d: Record<string, unknown> = {};

  // Identificacao basica
  if (ft.largura) d.milimetragem = String(ft.largura);
  if (ft.aro_numeracao) d.numeracao = String(ft.aro_numeracao).replace("Aro ", "");
  const pf = PERFIL_NOMES[String(ft.perfil ?? "")] ?? ft.modelo ?? ft.perfil;
  if (pf) d.modelo = pf;
  if (ft.cor_metal) d.cor_metal = ft.cor_metal;

  // Dimensoes
  if (ft.peso_estimado != null) d.peso_estimado = ft.peso_estimado;
  if (ft.espessura != null) d.espessura = ft.espessura;
  if (ft.diametro != null) d.diametro = ft.diametro;
  if (ft.densidade_ouro != null) d.densidade_ouro = ft.densidade_ouro;

  const profCon = num(ft.profundidade_concava);
  if (profCon != null && profCon > 0) d.profundidade_concava = ft.profundidade_concava;

  const dome = num(ft.dome_porcentagem);
  if (dome != null && dome !== 100) d.dome_porcentagem = ft.dome_porcentagem;

  // Gravacao — armazenada como array (formato novo, sem caractere de controle).
  // splitGravacao normaliza tanto string nova (U+001F) quanto antiga (" | ").
  const nomes = splitGravacao(ft.texto);
  if (nomes.length > 0) {
    d.texto_gravacao = nomes;
    if (ft.tipo_fonte) d.tipo_fonte = ft.tipo_fonte;
  }

  // Friso/risco — so quando habilitado
  if (ft.has_friso) {
    d.has_friso = true;
    if (ft.friso_kind) d.friso_kind = ft.friso_kind;
    if (ft.friso_tipo) d.friso_tipo = ft.friso_tipo;
    if (ft.friso_lado) d.friso_lado = ft.friso_lado;
    if (ft.friso_largura != null) d.friso_largura = ft.friso_largura;
    if (ft.friso_profundidade != null) d.friso_profundidade = ft.friso_profundidade;
    const off = num(ft.friso_offset);
    if (off != null && off > 0) d.friso_offset = ft.friso_offset;
  }

  // Canal/borda/chanfro (Bordas Elevadas / Chanfrada)
  const canalL = num(ft.canal_largura);
  if (canalL != null && canalL > 0) d.canal_largura = ft.canal_largura;
  const canalB = num(ft.canal_borda_altura);
  if (canalB != null && canalB > 0) d.canal_borda_altura = ft.canal_borda_altura;
  const chanfro = num(ft.chanfro_tamanho);
  if (chanfro != null && chanfro > 0) d.chanfro_tamanho = ft.chanfro_tamanho;

  // Pedras
  if (ft.qtd_pedras) d.qtd_pedras = ft.qtd_pedras;
  if (ft.tamanho_pedra) d.tamanho_pedra = ft.tamanho_pedra;
  if (ft.tipo_aplicacao_pedra) d.tipo_aplicacao_pedra = ft.tipo_aplicacao_pedra;
  const fileiras = num(ft.pedra_fileiras);
  if (fileiras != null && fileiras > 1) d.pedra_fileiras = ft.pedra_fileiras;
  if (ft.pedra_drill) d.pedra_drill = true;
  if (ft.tipo_pedra) d.tipo_pedra = ft.tipo_pedra;
  if (Array.isArray(ft.pedras_detalhadas) && ft.pedras_detalhadas.length > 0) {
    d.pedras_detalhadas = ft.pedras_detalhadas;
  }

  return d;
}

/** Nome bonito do item da ordem (ex: "Aliança 1 - Boleada Dupla"). */
export function nomeItemOrdem(ft: FichaRow, prefix: string): string {
  const perfil = PERFIL_NOMES[String(ft.perfil ?? "")] ?? ft.modelo ?? "Personalizada";
  return `${prefix}${perfil}`;
}
