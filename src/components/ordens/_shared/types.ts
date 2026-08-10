export interface Cliente {
  id:        number;
  nome:      string;
  cpf_cnpj:  string | null;
  telefone:  string | null;
  celular:   string | null;
}

export interface Venda {
  id:           number;
  numero_venda: string;
  data_venda:   string;
  total_venda:  number;
  situacao:     string;
  qtd_itens:    number;
}

export interface ItemVenda {
  id:              number;
  produto_id:      number;
  nome_produto:    string;
  sku:             string | null;
  quantidade:      number;
  preco_unitario:  number;
  total_item:      number;
}

/** Produto retornado por /api/ordens/produtos-busca (ordens que partem de um produto, nao de uma venda). */
export interface ProdutoBusca {
  id_produto:       number;
  nome:             string;
  sku:              string;
  peso_precificado: number | null;
  tipo_metal?:      string | null;
}
