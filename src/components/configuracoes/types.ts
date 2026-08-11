export interface Gateway {
  id: number;
  nome: string;
  tipo: "pix" | "cartao" | "dinheiro" | "ouro" | "outro";
  cor: string;
  obs?: string | null;
  ativo: boolean;
}

export interface ConfigIA {
  ia_ativa: string;
  ia_provedor: string;
  ia_modelo_claude: string;
  ia_modelo_openai: string;
  ia_modelo_gemini: string;
  ia_margem_pedra_pct?: string;
}

export interface KeysStatus {
  claude: boolean;
  openai: boolean;
  gemini: boolean;
}

export interface ResultadoIA {
  peso_digitado: number;
  peso_balanca: number | null;
  confianca: string;
  match: boolean;
  mensagem: string;
  provedor: string;
}

export interface Parametros {
  ouro: number;
  dollar: number;
  euro: number;
  prata: number;
  updated_at?: string | null;
}

export interface TeorOuro {
  id: number;
  nome: string;
  sku: string;
  teor: number;
  ativo: boolean;
}

export interface LigaTipo {
  id: number;
  tipo_18k_nome: string;
  liga_nome: string;
  teor_default: number;
  saldo_liga: number;
  ativo: boolean;
}

export interface Usuario {
  id: string;
  email: string;
  nome: string;
  role: string;
  ativo: boolean;
  created_at: string;
  avatar_url?: string | null;
  deposito_id?: number | null;
  vendedor_id?: number | null;
  tipos_ordem_permitidos?: string[] | null;
  tipos_protocolo_permitidos?: string[] | null;
  is_operador_service?: boolean | null;
  is_transportador?: boolean | null;
  mx_desconto_permitido?: number | null;
}

export interface UsuarioEdit {
  id: string;
  email: string;
  nome: string;
  role: string;
  ativo: boolean;
  avatar_url: string | null;
  deposito_id: number | null;
  vendedor_id: number | null;
  tipos_ordem_permitidos: string[];
  tipos_protocolo_permitidos: string[];
  is_operador_service: boolean;
  is_transportador: boolean;
  mx_desconto_permitido: number | null;
}

export interface DepositoEdit {
  id: number;
  nome: string;
}

export interface Webhook {
  id: number;
  nome: string;
  descricao?: string | null;
  ativo: boolean;
  total_disparos: number;
  ultimo_disparo?: string | null;
}

export interface WebhookLog {
  created_at: string;
  response_status: number;
  webhook_nome: string;
  erro?: string;
}

export type Tab =
  | "parametros"
  | "webhooks"
  | "usuarios"
  | "ia"
  | "depositos"
  | "permissoes"
  | "teores"
  | "locais"
  | "tipos_servico"
  | "integracoes"
  | "comissoes"
  | "credito_loja"
  | "maquininhas"
  | "fretes"
  | "gateways"
  | "metal"
  | "produto_visibilidade"
  | "aprovadores";

export interface Props {
  parametros: Parametros;
  webhooks: Webhook[];
  logs: WebhookLog[];
  usuarios: Usuario[];
  depositos: DepositoEdit[];
  teores: TeorOuro[];
  ligaTipos: LigaTipo[];
}
