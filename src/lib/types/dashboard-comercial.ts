// =====================================================================
// Tipos do Dashboard Comercial
// =====================================================================

export type TipoMeta = "Prata" | "Ouro" | "Diamante";

// ==================== Entidades base (das views) =====================

export interface DashVendedor {
  id_vendedor: number;
  nome: string | null;
  foto: string | null;
  situacao: string | null;
  email: string | null;
  comissao: number | null;
}

export interface DashVenda {
  fonte: string;
  id: number;
  data_venda: string | null;
  status: number | null;
  vendedor_id: number | null;
  cliente_id: number | null;
  total_venda: number | null;
  total_produtos: number | null;
  frete_pago_cliente: number | null;
  forma_envio_id: number | null;
  forma_frete_id: number | null;
  numero_pedido: number | null;
  numero_pedido_tiny: string | null;
  id_api_tiny: number | null;
  entregue: boolean;
}

export interface DashMetaMensal {
  id: number;
  mes_ano: string;
  consultora: number;
  valor_ouro: number;
  valor_prata: number;
  valor_diamante: number;
  dias_trabalhados: number;
  horas_dia: number;
  hora_inicio: number;
  dias_nao_trabalhados: string | null;
}

export interface DashMetaPorHora {
  id: number;
  meta_mensal_id: number | null;
  data_hora: string;
  consultora: number;
  tipo_meta: TipoMeta;
  valor_meta: number;
  meta_acumulada: number | null;
}

export interface DashItemVenda {
  id: number;
  venda_id: number | null;
  produto_id: number | null;
  sku: string | null;
  quantidade: number | null;
  preco_tabela: number | null;
  preco_unitario_final: number | null;
  preco_total: number | null;
  desconto_percentual: number | null;
  comissao_percentual: number | null;
  comissao_valor: number | null;
}

export interface DashComissaoFaixa {
  desconto_ate: number;
  comissao: number;
}

export interface DashComissao {
  id: number;
  nome: string | null;
  tabela: DashComissaoFaixa[];
}

export interface DashControleEntrega {
  id: number;
  data_entrega: string;
  valor_entrega: number;
  frete_pago_cliente: number | null;
  status_aprovacao: string;
  aprovada: boolean;
  vendedor_responsavel_id: number;
  entregador_responsavel: string;
  bairro_entrega: string | null;
  numero_pedido_plataforma: string | null;
  nome_cliente: string;
}

export interface DashFormaEnvio {
  id: number;
  nome: string | null;
}

export interface DashLead {
  id: number;
  id_lead: number;
  data_entrada: string | null;
  data_fechamento: string | null;
  etapa_lead: string | null;
  status_id: number | null;
  id_vendedor: number | null;
  motivo_perda: string | null;
}

export interface DashParcelaPedido {
  id_parcela: number;
  pedido_id_api: number | null;
  forma_pagamento: string | null;
  valor: number | null;
  data: string | null;
}

// ==================== Agregados / Response types ====================

export interface ResumoConsultora {
  id_vendedor: number;
  nome: string;
  foto: string | null;
  alcancado_periodo: number;
  alcancado_bruto: number;
  valor_vale_troca: number;
  quantidade_vendas: number;
  ticket_medio: number;
  metas: {
    Prata: MetaResumo;
    Ouro: MetaResumo;
    Diamante: MetaResumo;
  };
}

export interface MetaResumo {
  esperado_ate_momento: number;
  esperado_fim_periodo: number;
  diferenca_ate_momento: number;
  diferenca_fim_periodo: number;
  percentual_ate_momento: number;
  percentual_fim_periodo: number;
}

export interface VisaoGeral {
  alcancado: number;
  alcancado_bruto: number;
  valor_vale_troca: number;
  quantidade_vendas: number;
  ticket_medio: number;
  esperado_ate_momento: {
    Prata: number;
    Ouro: number;
    Diamante: number;
  };
  esperado_fim_periodo: {
    Prata: number;
    Ouro: number;
    Diamante: number;
  };
}

export interface CardsMetas {
  Prata: number;
  Ouro: number;
  Diamante: number;
}

export interface VendasDashboardResponse {
  cardsMetas: CardsMetas;
  visaoGeral: VisaoGeral;
  tabelaConsultoras: ResumoConsultora[];
  vendasBrutas: DashVendaComVendedor[];
}

export interface DashVendaComVendedor extends DashVenda {
  vendedor_nome: string | null;
  vendedor_foto: string | null;
  cliente_nome: string | null;
  valor_vale_troca: number;
  valor_liquido: number;
}

// ==================== Ranking ====================

export interface RankingConsultora {
  posicao: number;
  id_vendedor: number;
  nome: string;
  foto: string | null;
  total_vendas: number;
  valor_liquido: number;
  total_vale_troca: number;
  quantidade_vendas: number;
  ticket_medio: number;
  meta_prata: number;
  meta_ouro: number;
  meta_diamante: number;
  percentual_prata: number;
  percentual_ouro: number;
  percentual_diamante: number;
  atingiu_prata: boolean;
  atingiu_ouro: boolean;
  atingiu_diamante: boolean;
  maior_meta_atingida: TipoMeta | null;
}

// ==================== Análise Resultado ====================

export type PeriodoAnalise = "hoje-acumulado" | "hoje-diario" | "mes-acumulado" | "mes-inteiro";

export interface ResumoPerformance {
  id_vendedor: number;
  nome: string;
  foto: string | null;
  alcancado_periodo: number;
  vendas_hoje: number;
  quantidade_vendas: number;
  ticket_medio: number;
  metas: {
    Prata: { esperado: number; projecao_valor: number; projecao_percentual: number };
    Ouro: { esperado: number; projecao_valor: number; projecao_percentual: number };
    Diamante: { esperado: number; projecao_valor: number; projecao_percentual: number };
  };
}

export interface AnalisePerformanceResponse {
  total_metas: CardsMetas;
  horario_acumulado: ResumoPerformance[];
  horario_diario: ResumoPerformance[];
  mensal_acumulado: ResumoPerformance[];
  projecao_mensal: ResumoPerformance[];
}

// ==================== Análise Frete ====================

export interface VendaFreteAnalise {
  id: number;
  data_venda: string;
  numero_pedido: number | string | null;
  consultora: string;
  forma_envio: string;
  total_venda: number;
  frete_pago_cliente: number;
}

export interface EntregaFreteAnalise {
  id: number;
  data_entrega: string;
  numero_pedido_plataforma: string | null;
  solicitante: string;
  entregador: string;
  regiao: string | null;
  frete_recebido: number;
  frete_pago: number;
}

export interface AnaliseFreteResponse {
  total_recebido_clientes: number;
  total_pago_transportadores: number;
  saldo: number;
  vendas: VendaFreteAnalise[];
  entregas: EntregaFreteAnalise[];
}

// ==================== Análise Comissões ====================

export interface ItemComissaoDetalhado {
  id: number;
  id_vendedor: number;
  consultora: string;
  foto: string | null;
  data_venda: string;
  numero_pedido: number | string | null;
  sku: string | null;
  quantidade: number;
  preco_cheio: number;
  preco_vendido: number;
  desconto_percentual: number;
  comissao_percentual: number;
  comissao_ganha: number;
  comissao_perdida: number;
  // Comissão proporcional ao valor recebido
  // REGRA DE NEGÓCIO: comissão_liberada = comissao_ganha * (valor_pago_valido / total_venda)
  // O que: calcula quanto da comissão já pode ser paga com base nos pagamentos confirmados,
  // excluindo Vale-Troca e A Receber pendente.
  // Por que: a consultora só recebe comissão sobre o que foi efetivamente pago.
  // Impacto se alterado: pode pagar comissão antes do recebimento ou travar pagamento indevido.
  comissao_liberada: number;
  comissao_pendente: number;
  comissao_excluida_vt: number;
  // Valores de referência para auditoria
  valor_pago_valido: number;
  valor_vale_troca: number;
  valor_a_receber: number;
}

export interface ResumoComissaoConsultora {
  id_vendedor: number;
  nome: string;
  foto: string | null;
  total_desejado: number;
  total_realizado: number;
  valor_vale_troca: number;
  media_desconto: number;
  media_comissao: number;
  comissao_ganha: number;
  comissao_perdida: number;
  comissao_liberada: number;
  comissao_pendente: number;
  comissao_excluida_vt: number;
  valor_pago_valido: number;
  comissao_na_meta: number;
  comissao_fora_meta: number;
  meta_prata: number;
  esta_dentro_meta: boolean;
  qtd_itens: number;
}

export interface RankingComissao {
  maior_comissao_media_perc: number;
  maior_comissao_valor: number;
  maior_comissao_liberada: number;
  maior_desconto_medio: number;
  maior_comissao_perdida: number;
}

export interface AnaliseComissoesResponse {
  resumo_consultoras: ResumoComissaoConsultora[];
  itens_detalhados: ItemComissaoDetalhado[];
  ranking: RankingComissao;
}

// ==================== Leads ====================

export interface LeadsConsultoraStats {
  id_vendedor: number;
  nome: string;
  foto: string | null;
  total_leads: number;
  leads_ativos: number;
  leads_fechados: number;
  ganhos: number;
  perdidos: number;
  vendas_realizadas: number;
  taxa_conversao_geral: number;
  taxa_conversao_fechamento: number;
}

export interface LeadsGeral {
  total_leads: number;
  leads_ativos: number;
  leads_fechados: number;
  ganhos: number;
  perdidos: number;
  taxa_conversao_geral: number;
  taxa_conversao_fechamento: number;
  percentual_ativos: number;
  percentual_fechados: number;
  percentual_ganhos: number;
  percentual_perdidos: number;
}

export interface LeadsDashboardResponse {
  geral: LeadsGeral;
  por_consultora: LeadsConsultoraStats[];
}

// ==================== Filtros ====================

export interface DateRange {
  from: string; // ISO date YYYY-MM-DD
  to: string;
}
