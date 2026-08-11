export interface AuditoriaHeader {
  id: number;
  local_estoque_id: number;
  local_nome: string;
  status: "em_andamento" | "concluido" | "cancelado";
  obs: string | null;
  total_itens: number;
  itens_contados: number;
  itens_divergentes: number;
  created_at: string;
  data_conclusao: string | null;
  criado_por_email: string | null;
}

export interface AuditoriaItem {
  id: number;
  auditoria_id: number;
  produto_id: number;
  sku: string | null;
  nome_produto: string;
  quantidade_sistema: number;
  quantidade_contada: number | null;
  localizacao_fisica: string | null;
  consultora: string | null;
  status: "ok" | "pendente" | "resolvido" | "aguardando";
  validado: boolean;
  observacao: string | null;
  contado_em: string | null;
  venda_id: number | null;
  venda_numero: string | null;
}

export type StatusAuditoriaItem = AuditoriaItem["status"];
export type StatusAuditoria = AuditoriaHeader["status"];

export const STATUS_LABEL: Record<string, string> = {
  ok: "OK",
  pendente: "Pendente",
  resolvido: "Concluída",
  aguardando: "Aguardando",
};

export function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return "—"; }
}

export const STATUS_CORES: Record<string, "success" | "warning" | "info" | "error"> = {
  ok: "success",
  pendente: "warning",
  resolvido: "info",
  aguardando: "error",
};
