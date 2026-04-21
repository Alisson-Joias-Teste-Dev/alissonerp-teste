/**
 * Helper compartilhado para validacao e formatacao de personalizacao de produtos.
 * Usado por:
 *   - POST /api/vendas/*                 (ao criar venda/item, valida antes de INSERT)
 *   - POST /api/ordens                   (ao propagar para itens_ordem)
 *   - POST /api/produtos/[id]/personalizacao (admin cadastra regra)
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

/**
 * Estrutura canonica do JSONB salvo em itens_venda_erp.personalizacao
 * e itens_ordem.personalizacao. Snapshot dos valores no momento da venda.
 */
export interface PersonalizacaoAplicada {
  tipo: string;
  valor: string;
  max_caracteres: number;
  label?: string;
}

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
 * Constroi objeto canonico para salvar no JSONB (snapshot).
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
 * Gera texto legivel para concatenar no campo 'observacao'
 * (compatibilidade com relatorios antigos que leem so observacao).
 *
 * Ex: { tipo: "nome", valor: "JOAO" } → "Nome gravado: JOAO"
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

/**
 * Concatena uma nova linha de personalizacao na observacao existente.
 * Se obs existente ja contiver a mesma personalizacao, nao duplica.
 */
export function appendPersonalizacaoObservacao(
  observacaoExistente: string | null | undefined,
  personalizacao: PersonalizacaoAplicada,
): string {
  const linha = personalizacaoParaObservacao(personalizacao);
  const base  = (observacaoExistente ?? "").trim();
  if (!base) return linha;
  if (base.includes(linha)) return base;
  return `${base}\n${linha}`;
}

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
