/**
 * Fonte ÚNICA de permissão do módulo Frete Avulso (BLOCO 3, 21/07/2026).
 *
 * O QUE: centraliza QUEM pode SOLICITAR (vira tarefa de aprovação — o pool
 *   decide, não libera custo na hora) e QUEM pode CRIAR DIRETO (nasce
 *   'pendente' já liberado, lança saldo_frete_gratis na hora, sem pool) um
 *   frete avulso. Backend e front IMPORTAM DAQUI — nenhum dos dois lados
 *   volta a manter a própria lista solta.
 *
 * Consumidores (todos devem importar este arquivo, não reescrever a lista):
 *   - backend: src/app/api/entregas-venda/frete-avulso/route.ts
 *     (gate de acesso ao endpoint + enforcement por modo)
 *   - front:   src/app/(dashboard)/vendas/[id]/VendaDetalheClient.tsx
 *     (botão "Solicitar frete avulso")
 *   - front:   src/app/(dashboard)/entregas-venda/EntregasVendaClient.tsx
 *     (botão "Frete Avulso" — criação direta)
 *
 * POR QUE: antes cada lugar tinha a própria lista solta (ROLES_LOJA na rota,
 *   condicional inline em cada tela) — 3 pontos de manutenção separados para
 *   a MESMA regra de negócio. Essa duplicação já gerou a mesma classe de bug
 *   3 vezes: "permissão existe de um lado, a porta não abre no outro"
 *   (ex.: diretor liberado no front da venda, mas 403 no backend porque
 *   ROLES_LOJA nunca incluiu diretor — ver P3; ou `estoquista`, role que não
 *   existe mais no banco desde a separação loja/fábrica, presa numa lista
 *   velha — ver P4, confirmado em alissonerp.usuarios).
 *
 * IMPACTO SE VOLTAR A DUPLICAR: a classe de bug "permissão existe mas a porta
 *   não" volta — alguém edita um lado (adiciona/remove papel) e esquece o
 *   outro, silenciosamente, só descoberto quando o usuário certo toma 403 (ou
 *   o usuário errado passa).
 *
 * Decisões do Jonathan (BLOCO 3, 21/07 — NÃO reabrir):
 *   - Consultora PODE criar corrida DIRETA (já liberada antes do BLOCO 3 —
 *     controle é por transparência, não por trava) e também pode solicitar.
 *   - Diretor PODE solicitar — mas NÃO cria direto (não libera o próprio
 *     custo sozinho; é quem AUTORIZA, não quem dispensa autorização).
 *   - Estoquista continua criando direto — papel REAL confirmado no banco
 *     (SELECT DISTINCT role FROM alissonerp.usuarios, homolog, 21/07) é
 *     `estoquista_loja` (a role genérica `estoquista` não existe mais desde a
 *     separação loja/fábrica). `estoquista_fabrica` NÃO entra — frete avulso é
 *     despacho de motoboy pela LOJA, fábrica não participa desse fluxo.
 *   - gerente_loja/admin/desenvolvedor: acesso total (solicitam e criam
 *     direto).
 */

// Quem pode SOLICITAR frete avulso (não libera custo sozinho — pool decide).
export const ROLES_SOLICITAR_FRETE_AVULSO = [
  "desenvolvedor",
  "admin",
  "diretor",
  "gerente_loja",
  "consultora",
  "estoquista_loja",
] as const;

// Quem pode CRIAR frete avulso DIRETO (já nasce liberado, lança saldo na
// hora). NÃO inclui diretor — decisão Jonathan: diretor só solicita.
export const ROLES_CRIAR_FRETE_AVULSO_DIRETO = [
  "desenvolvedor",
  "admin",
  "gerente_loja",
  "consultora",
  "estoquista_loja",
] as const;

// União das duas listas — quem pode ao menos CHAMAR o endpoint. O MODO
// (solicitar vs direto) é decidido pelo ponto de entrada via `solicitar` no
// body (ver comentário em route.ts), não pelo cargo — por isso o gate de
// acesso ao endpoint usa a união, e o enforcement por modo usa as listas
// específicas acima.
export const ROLES_FRETE_AVULSO: readonly string[] = Array.from(
  new Set<string>([...ROLES_SOLICITAR_FRETE_AVULSO, ...ROLES_CRIAR_FRETE_AVULSO_DIRETO]),
);

/** Pode solicitar frete avulso (cai no pool de aprovadores). */
export function podeSolicitarFreteAvulso(role: string | null | undefined): boolean {
  return !!role && (ROLES_SOLICITAR_FRETE_AVULSO as readonly string[]).includes(role);
}

/** Pode criar frete avulso DIRETO (já liberado, sem passar pelo pool). */
export function podeCriarFreteAvulsoDireto(role: string | null | undefined): boolean {
  return !!role && (ROLES_CRIAR_FRETE_AVULSO_DIRETO as readonly string[]).includes(role);
}

/** Pode ao menos chamar o endpoint (qualquer um dos dois modos). */
export function podeAcessarFreteAvulso(role: string | null | undefined): boolean {
  return !!role && ROLES_FRETE_AVULSO.includes(role);
}
