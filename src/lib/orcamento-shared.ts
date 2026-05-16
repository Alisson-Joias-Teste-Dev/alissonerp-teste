/**
 * Constantes e helpers compartilhados do modulo orcamento.
 * Antes estavam duplicados em 4+ arquivos (route.ts, [id]/route.ts, page.tsx,
 * detalhe/[id]/page.tsx, OrcamentoClient.tsx, OrcamentoDetalheClient.tsx).
 * Centralizar reduz risco de divergencia (ex: adicionar role novo num arquivo
 * e esquecer dos outros — bug #1 da onda 1 nasceu assim).
 */

// Roles que enxergam/criam orcamento (vendedora, gerentes, admin, dev).
export const ROLES_ORCAMENTO = [
  "desenvolvedor",
  "admin",
  "gerente_loja",
  "gerente_fabrica",
  "consultora",
] as const;
export type RoleOrcamento = typeof ROLES_ORCAMENTO[number];

// Subconjunto que pode APROVAR/REJEITAR (sem consultora).
export const ROLES_APROVACAO = [
  "desenvolvedor",
  "admin",
  "gerente_loja",
  "gerente_fabrica",
] as const;
export type RoleAprovacao = typeof ROLES_APROVACAO[number];

// Status validos do orcamento. Espelha o CHECK chk_orcamentos_status
// (migration 260). Adicionar status aqui exige migration nova.
export const ORCAMENTO_STATUS = [
  "rascunho",
  "enviado",
  "aprovado",
  "rejeitado",
  "convertido",
] as const;
export type OrcamentoStatus = typeof ORCAMENTO_STATUS[number];

// Nome unico da linha em alissonerp.config_orcamento (singleton).
export const ORCAMENTO_CONFIG_NAME = "default";

/**
 * Valida um valor numerico vindo do body de uma rota. Retorna mensagem de
 * erro pt-BR ou null. Antes esse helper estava duplicado byte-a-byte entre
 * route.ts POST e [id]/route.ts PUT.
 *
 * @param v       valor cru (qualquer tipo)
 * @param label   nome do campo pra mensagem
 * @param opts.min       minimo (default 0)
 * @param opts.max       maximo (default infinito)
 * @param opts.allowNull se aceita null/undefined (default true)
 */
export function numCheck(
  v: unknown,
  label: string,
  opts: { min?: number; max?: number; allowNull?: boolean } = {},
): string | null {
  const { min = 0, max = Number.POSITIVE_INFINITY, allowNull = true } = opts;
  if (v === null || v === undefined) return allowNull ? null : `${label} é obrigatório`;
  const n = Number(v);
  if (!Number.isFinite(n)) return `${label} inválido (não é número)`;
  if (n < min) return `${label} não pode ser menor que ${min}`;
  if (n > max) return `${label} maior que o limite (${max})`;
  return null;
}

/**
 * Helper pra rodar uma serie de numCheck em sequencia. Retorna a primeira
 * mensagem de erro encontrada ou null se tudo passa.
 */
export function validateNumericFields(
  fields: ReadonlyArray<readonly [unknown, string, { min?: number; max?: number; allowNull?: boolean }?]>,
): string | null {
  for (const [val, label, opts] of fields) {
    const err = numCheck(val, label, opts ?? {});
    if (err) return err;
  }
  return null;
}

/**
 * Conjunto padrao de validacoes numericas pra POST/PUT de orcamento.
 * Concentra os limites no proprio modulo (antes eram literais inline).
 */
export function orcamentoNumericChecks(body: {
  peso?: unknown; valor?: unknown; markup?: unknown; desconto_pct?: unknown;
  cotacao_ouro?: unknown; cotacao_dolar?: unknown;
  valor_ouro?: unknown; valor_pedras?: unknown;
}): string | null {
  return validateNumericFields([
    [body.peso, "peso", { max: 10000 }],
    [body.valor, "valor", { max: 1_000_000_000 }],
    [body.markup, "markup", { min: 0.1, max: 1000 }],
    [body.desconto_pct, "desconto_pct", { max: 100 }],
    [body.cotacao_ouro, "cotacao_ouro", { max: 100000 }],
    [body.cotacao_dolar, "cotacao_dolar", { max: 1000 }],
    [body.valor_ouro, "valor_ouro", { max: 1_000_000_000 }],
    [body.valor_pedras, "valor_pedras", { max: 1_000_000_000 }],
  ]);
}
