// =====================================================================
// Tipos do Módulo de Pagamento de Comissões
// =====================================================================
// REGRA DE NEGÓCIO: comissão proporcional ao valor recebido.
// O que: tipos para fechamento mensal de comissão por consultora,
// com rastreio detalhado por venda/pagamento recebido.
// Por que: garante tipagem forte em todo o módulo e impede
// inconsistências entre API e frontend.
// Impacto se alterado: quebra de contrato entre frontend e API.

export type FechamentoStatus =
  | "rascunho"
  | "fechado"
  | "enviado_financeiro"
  | "pago"
  | "cancelado";

export type ItemStatus =
  | "liberado"
  | "fechado"
  | "pago"
  | "estornado"
  | "cancelado";

export type ItemTipo =
  | "normal"
  | "ajuste_positivo"
  | "ajuste_negativo"
  | "estorno";

export interface FechamentoComissao {
  id: string;
  consultora_id: number;
  consultora_nome_snapshot: string;
  periodo_inicio: string;
  periodo_fim: string;
  competencia: string;
  valor_total: number;
  status: FechamentoStatus;
  conta_pagar_id: number | null;
  created_by: string;
  approved_by: string | null;
  approved_at: string | null;
  paid_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
  // Joins
  qtd_itens: number;
  itens?: FechamentoComissaoItem[];
}

export interface FechamentoComissaoItem {
  id: string;
  fechamento_id: string;
  venda_id: string;
  numero_venda_snapshot: string;
  pagamento_venda_id: string | null;
  conta_receber_id: number | null;
  consultora_id: number;
  cliente_nome_snapshot: string | null;
  data_venda: string;
  data_recebimento: string | null;
  forma_recebimento: string;
  valor_venda: number;
  valor_pagamento: number;
  valor_comissionavel: number;
  percentual_rateio: number;
  comissao_total_venda: number;
  comissao_calculada: number;
  status: ItemStatus;
  tipo_item: ItemTipo;
  estorno_de_item_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ComissoesResumo {
  disponivel: number;
  em_rascunho: number;
  gerado: number;
  pago: number;
  qtd_pendentes: number;
  qtd_rascunho: number;
  qtd_gerado: number;
  qtd_pago: number;
}

export interface ElegivelComissao {
  venda_id: string;
  numero_venda: string;
  pagamento_venda_id: string;
  conta_receber_id: number | null;
  consultora_id: number;
  consultora_nome: string;
  cliente_nome: string | null;
  data_venda: string;
  data_recebimento: string;
  forma_recebimento: string;
  valor_pagamento: number;
  valor_comissionavel: number;
  percentual_rateio: number;
  comissao_calculada: number;
}

export interface AjusteInput {
  consultora_id: number;
  tipo_item: ItemTipo;
  valor: number;
  justificativa: string;
  venda_id?: string;
}
