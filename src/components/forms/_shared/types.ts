export interface Insumo {
  id:                number;
  nome:              string;
  sku:               string | null;
  categoria_id:      number;
  saldo_disponivel?: number;
  unidade?:          string;
  peso_pedra?:       number | null;
}
