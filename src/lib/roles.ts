// Roles com acesso total ao sistema (equivalentes a super-admin)
export const ROLES_FULL_ACCESS = ["admin", "desenvolvedor"] as const;

// Roles que podem concluir protocolo
export const ROLES_CONCLUIR_PROTOCOLO = [
  ...ROLES_FULL_ACCESS,
  "gerente_fabrica",
  "gerente_loja",
] as const;

// Roles com acesso ao painel gerencial do Service
export const ROLES_SERVICE_PANEL = ["admin", "desenvolvedor", "gerente_fabrica", "gerente_loja"] as const;

// Roles com acesso à precificação (ver, editar, simular, enviar pra aprovação)
export const ROLES_PRECIFICACAO = [...ROLES_FULL_ACCESS, "gerente_loja"] as const;

// Verifica se a role tem acesso total
export function isFullAccess(role: string | null | undefined): boolean {
  return ROLES_FULL_ACCESS.includes(role as typeof ROLES_FULL_ACCESS[number]);
}

// Verifica se pode acessar precificação (ver/editar/simular/enviar) — NÃO inclui aprovar/rejeitar
export function isPrecificacaoAccess(role: string | null | undefined): boolean {
  return ROLES_PRECIFICACAO.includes(role as typeof ROLES_PRECIFICACAO[number]);
}

// Produtos usa as mesmas roles da precificação
export const ROLES_PRODUTOS = ROLES_PRECIFICACAO;
export function isProdutosAccess(role: string | null | undefined): boolean {
  return ROLES_PRODUTOS.includes(role as typeof ROLES_PRODUTOS[number]);
}

// Verifica se a role está na lista permitida
export function hasRole(role: string | null | undefined, permitidas: readonly string[]): boolean {
  if (!role) return false;
  return permitidas.includes(role);
}
