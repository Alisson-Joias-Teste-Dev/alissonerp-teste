import { z } from "zod";
import { IdSchema } from "@/lib/schemas/common";

// ═══════════════════════════════════════════════════════════════════════════
// TASK-002: Types e Zod schemas do módulo Metal
//
// REGRA DE NEGÓCIO: Este módulo gerencia dois fluxos de entrada de metal:
//   1. COMPRA: empresa compra metal de fornecedor. Pagamento via MP.
//   2. RECEBIMENTO: cliente entrega metal como parte de pagamento de venda.
//      Excedente vira saldo do cliente.
//
// IMPACTO SE REMOVIDO: Perde tipagem de todo o módulo metal. Validações
// de entrada deixam de existir e dados inválidos podem entrar no banco.
// ═══════════════════════════════════════════════════════════════════════════

// ─── Configurações ──────────────────────────────────────────────────────────
/** Configurações do módulo metal lidas de alissonerp.configuracoes_sistema */
export interface MetalConfig {
  /** Percentual MÍNIMO da cotação XAU pago na compra de metal. Ex: 80 = 80% */
  compra_metal_min_pct: number;
  /** Percentual MÁXIMO (teto) da cotação XAU pago na compra de metal. Ex: 85 = 85% */
  compra_metal_max_pct: number;
  /** Percentual de comissão do funcionário sobre a economia (spread) */
  compra_metal_comm_pct: number;
  /** Percentual MÍNIMO da cotação creditado no recebimento. Ex: 95 = 95% */
  receb_metal_min_pct: number;
  /** Percentual MÁXIMO da cotação creditado no recebimento. Ex: 100 = 100% */
  receb_metal_max_pct: number;
  /** UUID do usuário que aprova compras acima do teto (vazio = sem aprovador configurado) */
  metal_aprovador_id?: string;
  /**
   * REGRA DE NEGÓCIO: Lista de roles que abrem direto no módulo Metal ao logar.
   * Configurável pelo admin via /api/metal/configuracoes.
   * Array vazio = ninguém é redirecionado (comportamento padrão).
   */
  metal_home_roles: string[];
}

// REGRA DE NEGÓCIO: Valores padrão usados quando as configs não existem no banco.
// Compra: 80-85% da cotação XAU (margem de 15-20% para a loja)
// Comissão: 50% sobre a economia (incentivo a negociar menor preço)
// Recebimento: 95-100% da cotação (cliente recebe valor próximo do mercado)
export const DEFAULT_METAL_CONFIG: MetalConfig = {
  compra_metal_min_pct: 80,
  compra_metal_max_pct: 85,
  compra_metal_comm_pct: 50,
  receb_metal_min_pct: 95,
  receb_metal_max_pct: 100,
  metal_aprovador_id: "",
  // REGRA DE NEGÓCIO: Por padrão ninguém é redirecionado para /metal.
  // O admin deve configurar explicitamente quais roles abrem no módulo.
  metal_home_roles: [],
};

// ─── Compra de Metal ────────────────────────────────────────────────────────

// REGRA DE NEGÓCIO: Ao registrar compra, o valor pago por grama deve estar
// entre min_limit (compra_metal_min_pct% da cotação) e max_limit
// (compra_metal_max_pct% da cotação). Se fora da faixa, erro.
export const CompraPostSchema = z.object({
  fornecedor_id: IdSchema.describe("Fornecedor que vendeu o metal para a empresa"),
  peso_gramas: z.coerce.number().positive("Peso deve ser maior que zero"),
  valor_pago_grama: z.coerce.number().positive("Valor pago deve ser maior que zero"),
  foto_base64: z.string().optional(),
  foto_media_type: z.string().optional(),
  observacao: z.string().max(2000).nullable().optional(),
  acima_teto: z.boolean().optional().default(false),
});

export type CompraInput = z.infer<typeof CompraPostSchema>;

/** Registro completo de uma compra de metal */
export interface CompraRecord {
  id: number;
  numero: string;
  fornecedor_id: number;
  fornecedor_nome?: string;
  fornecedor_cpf?: string;
  peso_gramas: number;
  cotacao_ouro: number;
  valor_pago_grama: number;
  min_limit: number;
  max_limit: number;
  spread_grama: number;
  valor_total: number;
  economia_total: number;
  comissao_pct: number;
  comissao_valor: number;
  foto_path: string | null;
  foto_peso_ia: number | null;
  ia_confianca: string | null;
  ia_match: boolean | null;
  status: "pendente_pagamento" | "pendente_aprovacao" | "confirmado" | "cancelado";
  mp_preference_id: string | null;
  mp_payment_id: string | null;
  mp_payment_status: string | null;
  mp_valor_pago: number | null;
  mp_data_pagamento: string | null;
  mp_diferenca_valor: number | null;
  cofre_registrado: boolean;
  observacao: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// ─── Pagamento MP ───────────────────────────────────────────────────────────

// REGRA DE NEGÓCIO: A EMPRESA (não o cliente) é quem paga o fornecedor.
// O ID do pagamento fica amarrado à compra para rastreabilidade.
export const PagarCompraSchema = z.object({
  metodo: z.enum(["pix", "cartao", "pix_pdv"], "Método deve ser pix, cartao ou pix_pdv"),
  payer_email: z.string().email("Email inválido").optional(),
  payer_nome: z.string().optional(),
});

export type PagarCompraInput = z.infer<typeof PagarCompraSchema>;

// ─── Recebimento de Metal ───────────────────────────────────────────────────

// REGRA DE NEGÓCIO: Recebimento é quando o CLIENTE entrega metal como parte
// do pagamento de uma joia. O crédito é vinculado a uma venda específica.
// Se o crédito > valor da venda, o excedente vira saldo do cliente.
export const RecebimentoPostSchema = z.object({
  cliente_id: IdSchema.describe("Cliente que entregou o metal"),
  peso_gramas: z.coerce.number().positive("Peso deve ser maior que zero"),
  valor_credito_grama: z.coerce.number().positive("Valor do crédito deve ser maior que zero"),
  venda_id: z.coerce.number().int().positive("ID da venda é obrigatório"),
  foto_base64: z.string().optional(),
  foto_media_type: z.string().optional(),
  observacao: z.string().max(2000).nullable().optional(),
  acima_teto: z.boolean().optional().default(false),
});

export type RecebimentoInput = z.infer<typeof RecebimentoPostSchema>;

/** Registro completo de um recebimento de metal */
export interface RecebimentoRecord {
  id: number;
  numero: string;
  cliente_id: number;
  cliente_nome?: string;
  peso_gramas: number;
  cotacao_ouro: number;
  valor_credito_grama: number;
  min_limit: number;
  max_limit: number;
  excedeu_teto: boolean;
  valor_total: number;
  venda_id: number | null;
  credito_excedente: number | null;
  credito_excedente_id: number | null;
  foto_path: string | null;
  foto_peso_ia: number | null;
  ia_confianca: string | null;
  ia_match: boolean | null;
  status: "ativo" | "pendente_aprovacao" | "cancelado";
  cofre_registrado: boolean;
  tarefa_aprovacao_id: number | null;
  observacao: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// ─── Crédito do Cliente ─────────────────────────────────────────────────────

/** Saldo de crédito acumulativo do cliente para uso futuro */
export interface CreditoClienteRecord {
  id: number;
  cliente_id: number;
  cliente_nome?: string;
  saldo_disponivel: number;
  recebimento_id: number;
  venda_origem_id: number;
  status: "ativo" | "usado" | "cancelado";
  created_at: string;
  updated_at: string;
}

// ─── Filtros ────────────────────────────────────────────────────────────────

/** Filtros para consulta de histórico */
export interface MetalFiltros {
  data_inicio?: string;
  data_fim?: string;
  status?: string;
  cliente_id?: number;
  fornecedor_id?: number;
  page?: number;
  limit?: number;
}

// ─── Resultado IA ───────────────────────────────────────────────────────────

/** Resultado da validação de peso por IA */
export interface IaValidacaoResult {
  match: boolean;
  peso_digitado: number;
  peso_balanca: number | null;
  confianca: string;
  mensagem: string;
  provedor: string;
}

// ─── Aprovação de Metal acima do teto ───────────────────────────────────────

/**
 * Registro de aprovação de metal acima do teto.
 *
 * REGRA DE NEGÓCIO: Quando o valor > max_limit (teto), a operação
 * (compra ou recebimento) é criada com status 'pendente_aprovacao'
 * e fica bloqueada até que o aprovador configurado aprove ou rejeite.
 * Durante pendência: não entra no cofre, não afeta financeiro.
 */
export interface CompraAprovacaoRecord {
  id: number;
  compra_id: number;
  solicitante_id: string;
  aprovador_id: string | null;
  valor_pago_grama: number;
  max_limit: number;
  cotacao_ouro: number;
  status: "pendente" | "aprovado" | "rejeitado";
  motivo: string | null;
  created_at: string;
  updated_at: string;
}
