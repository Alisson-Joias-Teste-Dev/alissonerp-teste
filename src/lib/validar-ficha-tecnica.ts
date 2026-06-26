// Validação da ficha técnica — compartilhada entre client e server

export type TipoItem =
  | "alianca" | "par_alianca" | "corrente" | "anel" | "pingente"
  | "bracelete" | "escapulario" | "brinco" | "tornozeleira" | "pulseira"
  | "colar_nome" | "monograma";

export interface FichaTecnicaDados {
  tipo_item: TipoItem;
  [key: string]: string | undefined;
}

export function validarFichaTecnicaServer(dados: FichaTecnicaDados | null | undefined): string | null {
  if (!dados) return "Ficha técnica não preenchida.";
  const t = dados.tipo_item;
  if (!t) return "Selecione o tipo de item.";

  const req = (campo: string, label: string) =>
    !dados[campo]?.trim() ? `${label} é obrigatório.` : null;

  if (t === "alianca") {
    return req("milimetragem", "Milimetragem") ?? req("numeracao", "Numeração") ?? req("modelo", "Modelo") ?? req("modelo_interno", "Modelo Interno") ?? req("tipo_fonte", "Tipo de Fonte") ?? null;
  }
  if (t === "par_alianca") {
    return req("1_milimetragem", "Milimetragem 1") ?? req("1_numeracao", "Numeração 1") ?? req("1_modelo", "Modelo 1") ?? req("1_modelo_interno", "Modelo Interno 1") ?? req("1_tipo_fonte", "Tipo de Fonte 1")
      ?? req("2_milimetragem", "Milimetragem 2") ?? req("2_numeracao", "Numeração 2") ?? req("2_modelo", "Modelo 2") ?? req("2_modelo_interno", "Modelo Interno 2") ?? req("2_tipo_fonte", "Tipo de Fonte 2") ?? null;
  }
  if (t === "corrente") {
    return req("comprimento_cm", "Comprimento") ?? req("tipo_elo", "Tipo de Elo") ?? req("tipo_fecho", "Tipo de Fecho") ?? null;
  }
  if (t === "anel") {
    return req("modelo_anel", "Modelo do Anel") ?? req("numeracao", "Numeração") ?? req("milimetragem_base_mm", "Milimetragem da Base") ?? req("milimetragem_aro_mm", "Milimetragem do Aro") ?? req("modelo_interno", "Modelo Interno") ?? req("modelo_externo", "Modelo Externo") ?? null;
  }
  if (t === "pingente") {
    return req("modelo_pingente", "Modelo do Pingente") ?? req("altura_mm", "Altura") ?? req("largura_mm", "Largura") ?? null;
  }
  if (t === "bracelete") {
    return req("tipo_fecho", "Tipo de Fecho") ?? null;
  }
  if (t === "escapulario") {
    return req("altura_placa_mm", "Altura da Placa") ?? req("largura_placa_mm", "Largura da Placa") ?? req("espessura_chapa_mm", "Espessura da Chapa") ?? null;
  }
  if (t === "brinco") {
    return req("tipo_tarraxa", "Tipo de Tarraxa") ?? null;
  }
  if (t === "tornozeleira" || t === "pulseira") {
    return req("comprimento_cm", "Comprimento") ?? req("tipo_elo", "Tipo de Elo") ?? req("tipo_fecho", "Tipo de Fecho") ?? null;
  }
  if (t === "colar_nome") {
    return req("nome_chapa", "Nome na Chapa") ?? null;
  }
  if (t === "monograma") {
    return req("altura_placa_mm", "Altura da Placa") ?? req("largura_placa_mm", "Largura da Placa") ?? req("espessura_chapa_mm", "Espessura da Chapa") ?? req("texto_monograma", "Texto do Monograma") ?? null;
  }
  return null;
}
