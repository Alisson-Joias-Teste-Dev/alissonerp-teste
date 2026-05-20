export type CampoVisivel = {
  foto: boolean;
  preco_venda: boolean;
  composicao_preco: boolean;
  markup: boolean;
  peso_aprox: boolean;
  ficha_tecnica: boolean;
  dados_avancados: boolean;
};

export type ProdutoVisibilidadeConfig = Record<string, CampoVisivel>;

export const CAMPOS_LABELS: Record<keyof CampoVisivel, string> = {
  foto:             "Foto do produto",
  preco_venda:      "Preço de venda (R$)",
  composicao_preco: "Composição do preço (Ouro + Pedras)",
  markup:           "Markup",
  peso_aprox:       "Peso aproximado (g)",
  ficha_tecnica:    "Ficha técnica (medidas)",
  dados_avancados:  "Dados avançados (metal, BOM, variações)",
};

export const CAMPOS_ORDER: (keyof CampoVisivel)[] = [
  "foto",
  "preco_venda",
  "composicao_preco",
  "markup",
  "peso_aprox",
  "ficha_tecnica",
  "dados_avancados",
];

export const ROLES_CONFIGURAVEIS = [
  "consultora",
  "gerente_loja",
  "gerente_fabrica",
  "ourives",
  "pcp",
  "motoboy",
  "financeiro",
] as const;

export const ROLE_LABELS: Record<string, string> = {
  consultora:      "Consultora",
  gerente_loja:    "Gerente Loja",
  gerente_fabrica: "Gerente Fábrica",
  ourives:         "Ourives",
  pcp:             "PCP",
  motoboy:         "Motoboy",
  financeiro:      "Financeiro",
};

export const VISIBILIDADE_DEFAULT: ProdutoVisibilidadeConfig = {
  consultora:      { foto: true,  preco_venda: true,  composicao_preco: true,  markup: false, peso_aprox: true,  ficha_tecnica: true,  dados_avancados: false },
  gerente_loja:    { foto: true,  preco_venda: true,  composicao_preco: true,  markup: true,  peso_aprox: true,  ficha_tecnica: true,  dados_avancados: true  },
  gerente_fabrica: { foto: true,  preco_venda: false, composicao_preco: false, markup: false, peso_aprox: true,  ficha_tecnica: true,  dados_avancados: true  },
  ourives:         { foto: true,  preco_venda: false, composicao_preco: false, markup: false, peso_aprox: true,  ficha_tecnica: true,  dados_avancados: false },
  pcp:             { foto: true,  preco_venda: false, composicao_preco: false, markup: false, peso_aprox: true,  ficha_tecnica: true,  dados_avancados: true  },
  motoboy:         { foto: true,  preco_venda: false, composicao_preco: false, markup: false, peso_aprox: false, ficha_tecnica: false, dados_avancados: false },
  financeiro:      { foto: true,  preco_venda: true,  composicao_preco: true,  markup: true,  peso_aprox: true,  ficha_tecnica: false, dados_avancados: false },
};

export const TODOS_VISIVEIS: CampoVisivel = {
  foto: true, preco_venda: true, composicao_preco: true, markup: true,
  peso_aprox: true, ficha_tecnica: true, dados_avancados: true,
};

export function getCamposVisiveis(role: string, config: ProdutoVisibilidadeConfig): CampoVisivel {
  return config[role] ?? VISIBILIDADE_DEFAULT[role] ?? TODOS_VISIVEIS;
}
