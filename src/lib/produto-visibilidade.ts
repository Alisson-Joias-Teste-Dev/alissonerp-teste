export type CampoVisivel = {
  foto: boolean;
  preco_venda: boolean;
  composicao_preco: boolean;
  markup: boolean;
  peso_aprox: boolean;
  ficha_tecnica: boolean;
  dados_avancados: boolean;
  pedras_catalogo: boolean;
  rota_fabricacao: boolean;
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
  pedras_catalogo:  "Pedras do catálogo (tabela + preços)",
  rota_fabricacao:  "Rota de fabricação (etapas)",
};

export const CAMPOS_ORDER: (keyof CampoVisivel)[] = [
  "foto",
  "preco_venda",
  "composicao_preco",
  "markup",
  "peso_aprox",
  "ficha_tecnica",
  "dados_avancados",
  "pedras_catalogo",
  "rota_fabricacao",
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
  //                                                                                                        pedras  rota
  consultora:      { foto: true,  preco_venda: true,  composicao_preco: true,  markup: false, peso_aprox: true,  ficha_tecnica: true,  dados_avancados: false, pedras_catalogo: false, rota_fabricacao: false },
  gerente_loja:    { foto: true,  preco_venda: true,  composicao_preco: true,  markup: true,  peso_aprox: true,  ficha_tecnica: true,  dados_avancados: true,  pedras_catalogo: true,  rota_fabricacao: false },
  gerente_fabrica: { foto: true,  preco_venda: false, composicao_preco: false, markup: false, peso_aprox: true,  ficha_tecnica: true,  dados_avancados: true,  pedras_catalogo: true,  rota_fabricacao: true  },
  ourives:         { foto: true,  preco_venda: false, composicao_preco: false, markup: false, peso_aprox: true,  ficha_tecnica: true,  dados_avancados: false, pedras_catalogo: false, rota_fabricacao: true  },
  pcp:             { foto: true,  preco_venda: false, composicao_preco: false, markup: false, peso_aprox: true,  ficha_tecnica: true,  dados_avancados: true,  pedras_catalogo: false, rota_fabricacao: true  },
  motoboy:         { foto: true,  preco_venda: false, composicao_preco: false, markup: false, peso_aprox: false, ficha_tecnica: false, dados_avancados: false, pedras_catalogo: false, rota_fabricacao: false },
  financeiro:      { foto: true,  preco_venda: true,  composicao_preco: true,  markup: true,  peso_aprox: true,  ficha_tecnica: false, dados_avancados: false, pedras_catalogo: true,  rota_fabricacao: false },
};

export const TODOS_VISIVEIS: CampoVisivel = {
  foto: true, preco_venda: true, composicao_preco: true, markup: true,
  peso_aprox: true, ficha_tecnica: true, dados_avancados: true,
  pedras_catalogo: true, rota_fabricacao: true,
};

export function getCamposVisiveis(role: string, config: ProdutoVisibilidadeConfig): CampoVisivel {
  return config[role] ?? VISIBILIDADE_DEFAULT[role] ?? TODOS_VISIVEIS;
}
