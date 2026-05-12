/**
 * Helper compartilhado para validacao e formatacao de personalizacao de produtos.
 * Usado por:
 *   - POST /api/vendas/*                 (ao criar venda/item, valida antes de INSERT)
 *   - POST /api/ordens                   (ao propagar para itens_ordem)
 *   - POST /api/produtos/[id]/personalizacao (admin cadastra regra)
 *
 * === Evolucao para Multi-Campos ===
 * Agora suporta tanto formato legado (1 campo) quanto novo (N campos).
 * Veja CamposPersonalizacao / PersonalizacaoAplicadaMulti.
 */

export type CaracteresPermitidos =
  | "alfa"
  | "alfa_acento"
  | "alfa_acento_espaco"
  | "alfanum"
  | "alfanum_acento_espaco"
  | "numero"
  | "qualquer";

export interface ConfigPersonalizacao {
  tipo: string;
  obrigatorio: boolean;
  min_caracteres: number;
  max_caracteres: number;
  caracteres_permitidos: CaracteresPermitidos;
  label?: string;
}

/**
 * Config com campos de precificacao (usado em calculo server-side).
 * Superset do ConfigPersonalizacao, com campos opcionais de preco e peso.
 */
export interface ConfigPersonalizacaoCompleta extends ConfigPersonalizacao {
  preco_por_letra?: number | null;
  peso_por_letra?:  number | null;
}

// ─── FORMATO LEGADO (1 campo) ──────────────────────────────────────────────

/**
 * Estrutura canonica do JSONB salvo em itens_venda_erp.personalizacao
 * e itens_ordem.personalizacao. Formato legado (1 campo).
 */
export interface PersonalizacaoAplicada {
  tipo: string;
  valor: string;
  max_caracteres: number;
  label?: string;
}

// ─── FORMATO NOVO (N campos) ───────────────────────────────────────────────

/**
 * Um campo dentro do array "campos" do novo formato.
 * Cada campo representa um input de personalizacao (ex: "Nome 1", "Nome 2").
 */
export interface CampoPersonalizacao {
  label: string;
  valor: string | null;
  max_caracteres: number;
  obrigatorio: boolean;
}

/**
 * Estrutura canonica do novo formato JSONB (multi-campos).
 * Usado quando um produto tem N campos de personalizacao.
 */
export interface PersonalizacaoAplicadaMulti {
  campos: CampoPersonalizacao[];
}

/**
 * Union type: personalizacao pode ser legado OU multi-campos.
 */
export type PersonalizacaoQualquer = PersonalizacaoAplicada | PersonalizacaoAplicadaMulti;

// ─── HELPERS DE DETECCAO ───────────────────────────────────────────────────

/**
 * Detecta se a personalizacao esta no formato multi-campos.
 * Um objeto com a chave "campos" (array) = novo formato.
 */
export function isMultiCampo(
  p: PersonalizacaoQualquer | null | undefined,
): p is PersonalizacaoAplicadaMulti {
  if (!p) return false;
  return "campos" in p && Array.isArray((p as PersonalizacaoAplicadaMulti).campos);
}

/**
 * Retorna texto legivel concatenado para observacao.
 * Para legado: "Nome gravado: JOAO"
 * Para multi: "Nome 1: Maria | Nome 2: João"
 */
export function personalizacaoParaTexto(
  p: PersonalizacaoQualquer | null | undefined,
): string {
  if (!p) return "";

  if (isMultiCampo(p)) {
    return p.campos
      .filter((c) => c.valor?.trim())
      .map((c) => `${c.label}: ${c.valor!.trim()}`)
      .join(" | ");
  }

  // Formato legado
  return personalizacaoParaObservacao(p as PersonalizacaoAplicada);
}

/**
 * Versão legada (backward compat).
 */
export function personalizacaoParaObservacao(
  personalizacao: PersonalizacaoAplicada,
): string {
  const label =
    personalizacao.label ??
    (personalizacao.tipo === "nome" ? "Nome gravado" :
     personalizacao.tipo === "iniciais" ? "Iniciais" :
     personalizacao.tipo === "data" ? "Data gravada" :
     personalizacao.tipo === "numero" ? "Numero gravado" :
     personalizacao.tipo);
  return `${label}: ${personalizacao.valor}`;
}

// ─── VALIDACAO ─────────────────────────────────────────────────────────────

export const REGEX_POR_TIPO: Record<CaracteresPermitidos, RegExp> = {
  alfa:                  /^[A-Za-z]+$/,
  alfa_acento:           /^[A-Za-zÀ-ÖØ-öø-ÿ]+$/,
  alfa_acento_espaco:    /^[A-Za-zÀ-ÖØ-öø-ÿ ]+$/,
  alfanum:               /^[A-Za-z0-9]+$/,
  alfanum_acento_espaco: /^[A-Za-z0-9À-ÖØ-öø-ÿ ]+$/,
  numero:                /^[0-9]+$/,
  qualquer:              /^.+$/,
};

export interface ResultadoValidacao {
  ok: boolean;
  erro?: string;
}

/**
 * Valida um valor contra a config de personalizacao.
 * Use antes de INSERT em itens_venda_erp / itens_ordem.
 *
 * Se obrigatorio=false e valor vazio → ok (usuario nao personalizou).
 * Se obrigatorio=true e valor vazio → erro.
 * Valida comprimento (min/max) e regex.
 */
export function validarPersonalizacao(
  valor: string | null | undefined,
  config: ConfigPersonalizacao,
): ResultadoValidacao {
  if (config.obrigatorio && !valor?.trim()) {
    return { ok: false, erro: "Personalizacao obrigatoria nao preenchida" };
  }
  if (!valor?.trim()) return { ok: true };

  const v = valor.trim();
  if (v.length < config.min_caracteres) {
    return {
      ok: false,
      erro: `Minimo ${config.min_caracteres} caractere(s) — recebido ${v.length}`,
    };
  }
  if (v.length > config.max_caracteres) {
    return {
      ok: false,
      erro: `Maximo ${config.max_caracteres} caractere(s) — recebido ${v.length}`,
    };
  }
  const rx = REGEX_POR_TIPO[config.caracteres_permitidos];
  if (!rx) {
    return {
      ok: false,
      erro: `caracteres_permitidos invalido: ${config.caracteres_permitidos}`,
    };
  }
  if (!rx.test(v)) {
    return {
      ok: false,
      erro: `Caracteres nao permitidos (regra: ${config.caracteres_permitidos})`,
    };
  }
  return { ok: true };
}

/**
 * Constroi objeto canonico para salvar no JSONB (snapshot) — formato legado.
 * Use apos validar.
 */
export function normalizarPersonalizacao(
  valor: string,
  config: ConfigPersonalizacao,
): PersonalizacaoAplicada {
  return {
    tipo: config.tipo,
    valor: valor.trim(),
    max_caracteres: config.max_caracteres,
    label: config.label,
  };
}

/**
 * Constroi objeto canonico para o novo formato multi-campos.
 * Cada campo validado individualmente.
 */
export function normalizarPersonalizacaoMulti(
  campos: Array<{ label: string; valor: string | null; max_caracteres: number; obrigatorio: boolean }>,
): PersonalizacaoAplicadaMulti {
  return {
    campos: campos.map((c) => ({
      label: c.label,
      valor: c.valor?.trim() ?? null,
      max_caracteres: c.max_caracteres,
      obrigatorio: c.obrigatorio,
    })),
  };
}

/**
 * Concatena texto de personalizacao na observacao existente.
 * Suporta ambos formatos (legado e multi-campos).
 * Se obs existente ja contiver o mesmo texto, nao duplica.
 */
export function appendPersonalizacaoObservacao(
  observacaoExistente: string | null | undefined,
  personalizacao: PersonalizacaoQualquer,
): string {
  const linha = personalizacaoParaTexto(personalizacao);
  const base  = (observacaoExistente ?? "").trim();
  if (!base) return linha;
  if (base.includes(linha)) return base;
  return `${base}\n${linha}`;
}

// ─── CALCULOS (preco/peso por letra — apenas formato legado) ───────────────

/**
 * Calcula preco do item baseado em qtd de letras x preco_por_letra.
 *
 * Retorna null se a config nao tem preco_por_letra configurado ou se
 * o valor esta vazio. Nesse caso o backend usa preco_lista vindo do body.
 *
 * Arredonda para 2 casas decimais (centavos).
 *
 * @example
 *   calcularPrecoPorLetra({..., preco_por_letra: 1000}, "JOAO", 0, 1, 3)
 *   // { preco_lista: 4000, preco_unitario: 4000, total_item: 4000, valor_comissao: 120 }
 */
export function calcularPrecoPorLetra(
  config: ConfigPersonalizacaoCompleta,
  valor: string,
  pctDesconto: number,
  quantidade: number,
  pctComissao: number,
): {
  preco_lista:    number;
  preco_unitario: number;
  total_item:     number;
  valor_comissao: number;
} | null {
  if (config.preco_por_letra == null) return null;
  const precoPorLetra = Number(config.preco_por_letra);
  if (!Number.isFinite(precoPorLetra) || precoPorLetra <= 0) return null;

  const qtdLetras = (valor ?? "").trim().length;
  if (qtdLetras === 0) return null;

  const qtd     = Math.max(1, Number(quantidade) || 1);
  const pctDesc = Math.max(0, Math.min(100, Number(pctDesconto) || 0));
  const pctCom  = Math.max(0, Math.min(100, Number(pctComissao) || 0));

  const precoLista    = qtdLetras * precoPorLetra;
  const precoUnitario = precoLista * (1 - pctDesc / 100);
  const totalItem     = precoUnitario * qtd;
  const valorComissao = totalItem * (pctCom / 100);

  const r2 = (n: number) => Math.round(n * 100) / 100;

  return {
    preco_lista:    r2(precoLista),
    preco_unitario: r2(precoUnitario),
    total_item:     r2(totalItem),
    valor_comissao: r2(valorComissao),
  };
}

/**
 * Calcula peso estimado do item baseado em qtd de letras x peso_por_letra.
 * Retorna null se a config nao tem peso_por_letra ou se o valor esta vazio.
 * Nesse caso o backend usa peso_estimado vindo do body (ou peso_precificado).
 *
 * Arredonda para 2 casas decimais (centi-gramas).
 *
 * @example
 *   calcularPesoPorLetra({..., peso_por_letra: 0.5}, "JOAO")
 *   // 2.0 (4 letras * 0.5g)
 */
export function calcularPesoPorLetra(
  config: ConfigPersonalizacaoCompleta,
  valor: string,
): number | null {
  if (config.peso_por_letra == null) return null;
  const pesoPorLetra = Number(config.peso_por_letra);
  if (!Number.isFinite(pesoPorLetra) || pesoPorLetra <= 0) return null;

  const qtdLetras = (valor ?? "").trim().length;
  if (qtdLetras === 0) return null;

  return Math.round(qtdLetras * pesoPorLetra * 100) / 100;
}

// ─── FORMATACAO AUTOMATICA BASEADA EM REGRAS ────────────────────────────────

export interface RegrasFormatacao {
  primeira_letra_maiuscula: boolean;
  sem_espacos: boolean;
  sem_numeros: boolean;
  sem_simbolos: boolean;
  sem_acentos: boolean;
}

const MAPA_ACENTOS: Record<string, string> = {
  'á': 'a', 'à': 'a', 'ã': 'a', 'â': 'a', 'ä': 'a',
  'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e',
  'í': 'i', 'ì': 'i', 'î': 'i', 'ï': 'i',
  'ó': 'o', 'ò': 'o', 'õ': 'o', 'ô': 'o', 'ö': 'o',
  'ú': 'u', 'ù': 'u', 'û': 'u', 'ü': 'u',
  'ç': 'c', 'ñ': 'n',
  'Á': 'A', 'À': 'A', 'Ã': 'A', 'Â': 'A', 'Ä': 'A',
  'É': 'E', 'È': 'E', 'Ê': 'E', 'Ë': 'E',
  'Í': 'I', 'Ì': 'I', 'Î': 'I', 'Ï': 'I',
  'Ó': 'O', 'Ò': 'O', 'Õ': 'O', 'Ô': 'O', 'Ö': 'O',
  'Ú': 'U', 'Ù': 'U', 'Û': 'U', 'Ü': 'U',
  'Ç': 'C', 'Ñ': 'N',
};

const REGEX_SIMBOLOS = /[^a-zA-Z0-9áàãâäéèêëíìîïóòõôöúùûüçñÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇÑ ]/g;
const REGEX_NUMEROS = /[0-9]/g;

/**
 * Aplica as regras de formatacao definidas na config ao valor digitado.
 *
 * Ordem de aplicacao:
 * 1. Remove acentos (se sem_acentos)
 * 2. Remove numeros (se sem_numeros)
 * 3. Remove simbolos (se sem_simbolos)
 * 4. Remove espacos (se sem_espacos)
 * 5. Primeira letra maiuscula + resto minusculo (se primeira_letra_maiuscula)
 *
 * @example
 *   formatarComRegras("marIA 123!", { primeira_letra_maiuscula: true, sem_numeros: true, sem_simbolos: true })
 *   // => "Maria"
 */
export function formatarComRegras(
  valor: string,
  regras: RegrasFormatacao | null | undefined,
): string {
  if (!valor) return "";
  let v = valor;

  // 1. Remove acentos
  if (regras?.sem_acentos) {
    v = v.split('').map((c) => MAPA_ACENTOS[c] ?? c).join('');
  }

  // 2. Remove numeros
  if (regras?.sem_numeros) {
    v = v.replace(REGEX_NUMEROS, '');
  }

  // 3. Remove simbolos
  if (regras?.sem_simbolos) {
    v = v.replace(REGEX_SIMBOLOS, '');
  }

  // 4. Remove espacos
  if (regras?.sem_espacos) {
    v = v.replace(/\s+/g, '');
  }

  // 5. Primeira letra maiuscula + resto minusculo
  if (regras?.primeira_letra_maiuscula && v.length > 0) {
    v = v.charAt(0).toUpperCase() + v.slice(1).toLowerCase();
  }

  return v;
}

/**
 * Normaliza o valor aplicando as regras e limitando ao max_caracteres.
 * Usado no onChange dos inputs de personalizacao.
 */
export function normalizarCampoPersonalizacao(
  valor: string,
  regras: RegrasFormatacao | null | undefined,
  maxCaracteres: number,
): string {
  const formatado = formatarComRegras(valor, regras);
  return formatado.slice(0, maxCaracteres);
}

/**
 * Retorna as regras padrao para um tipo de personalizacao.
 * Usado quando ainda nao ha config salva no banco.
 */
export function regrasPadrao(): RegrasFormatacao {
  return {
    primeira_letra_maiuscula: true,
    sem_espacos: false,
    sem_numeros: true,
    sem_simbolos: true,
    sem_acentos: false,
  };
}
