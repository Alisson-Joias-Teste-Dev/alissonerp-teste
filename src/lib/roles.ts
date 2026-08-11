// Roles com acesso total ao sistema (equivalentes a super-admin)
export const ROLES_FULL_ACCESS = ["admin", "desenvolvedor", "diretor"] as const;

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

// Roles que podem aprovar crédito do gerente (aprovar vendas com A Receber)
export const ROLES_APROVAR_CREDITO = [...ROLES_FULL_ACCESS, "gerente_loja"] as const;

// Roles que podem abrir/gerenciar devoluções, vale-troca e reembolsos
export const ROLES_DEVOLUCAO = ["admin", "desenvolvedor", "diretor", "gerente_loja"] as const;

// REGRA DE NEGÓCIO: roles que podem ABRIR/solicitar uma devolução (fase inicial do fluxo).
// O QUE: além de quem GERENCIA (ROLES_DEVOLUCAO), a consultora pode criar a devolução
//   da PRÓPRIA venda e mandar pra aprovação — mas NÃO aprova/inspeciona/conclui
//   (isso gera vale-troca/estorno/reembolso e continua restrito a ROLES_DEVOLUCAO).
//   Por isso é uma lista SEPARADA: não vaza vale-troca nem autorização de pagamento,
//   que também usam ROLES_DEVOLUCAO.
// POR QUE: a vendedora abre a devolução da cliente dela sem depender do gerente estar junto.
// IMPACTO SE REMOVIDO: consultora perde acesso a abrir/ver devolução (403) e o menu some.
// OBS: o escopo "só as vendas dela" é garantido nas rotas via ownership (auth-vendas.ts).
export const ROLES_DEVOLUCAO_ABRIR = [...ROLES_DEVOLUCAO, "consultora"] as const;

// Roles que podem gerenciar o módulo fiscal (emitentes, regras, dados fiscais, emitir notas)
export const ROLES_FISCAL = [
  ...ROLES_FULL_ACCESS,
  "gerente_fabrica",
  "gerente_loja",
] as const;

// Roles que podem dar baixa no caixa dinheiro
export const ROLES_BAIXA_CAIXA = ["admin", "desenvolvedor", "gerente_loja", "gerente_fabrica"] as const;

// REGRA DE NEGÓCIO: Fonte única da verdade para acesso ao módulo Metal.
// O QUE: centraliza a lista de roles que acessam compras e recebimentos de metal.
// POR QUE: antes estava duplicada em 10+ arquivos (compras, recebimentos,
//   aprovações, sidebar) com inconsistências entre si.
// IMPACTO SE REMOVIDO: quebra verificação de permissão em todas as rotas
//   do módulo metal, causando 403 para todos os usuários.
export const ROLES_METAL = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja", "estoquista_fabrica", "consultora"];

export const ROLES_METAL_APROVACOES = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja", "consultora"];

export function podedarBaixaCaixa(role: string | null | undefined): boolean {
  return ROLES_BAIXA_CAIXA.includes(role as typeof ROLES_BAIXA_CAIXA[number]);
}

// REGRA DE NEGÓCIO: Fonte única de roles do inventário comercial.
// O QUE: centraliza quem pode VER, CONTAR e GERENCIAR (abrir/concluir/
//   cancelar/resolver pendência) inventários do estoque comercial.
// POR QUE: as listas estavam duplicadas em 5 rotas e a visualização era
//   liberada para QUALQUER usuário logado — quantidades de um estoque de
//   milhões visíveis para roles sem necessidade (motoboy, ourives...).
// IMPACTO SE REMOVIDO: rotas /api/estoque-comercial/inventario/* quebram
//   e o inventário volta a ficar exposto a todos os usuários.
export const ROLES_INVENTARIO_GERENTES = [
  "desenvolvedor", "admin", "diretor", "gerente_fabrica", "gerente_loja",
] as const;
// operador_inventario (v2.83.0 — Ytalo/Geovana): VÊ tudo do estoque e conta
// via leitor RFID, mas NÃO edita nada direto — abrir/concluir/cancelar
// inventário viram SOLICITAÇÃO aprovada pelo admin (solicitacoes_inventario).
export const ROLE_OPERADOR_INVENTARIO = "operador_inventario";
export const ROLES_INVENTARIO_CONTAR = [
  ...ROLES_INVENTARIO_GERENTES, "estoquista_fabrica", "estoquista_loja",
  ROLE_OPERADOR_INVENTARIO,
] as const;
// Ver = mesmos que podem contar (inventário não é dado público interno)
export const ROLES_INVENTARIO_VER = ROLES_INVENTARIO_CONTAR;

// Quem pode MOVIMENTAR estoque comercial (entrada por scanner, receber
// transferência, leituras de contagem): gerência + estoquistas.
// POR QUÊ: vendedora/motoboy NUNCA mexem em saldo — brecha fechada em v2.81.1
// (qualquer logado conseguia gerar entrada via /api/rfid/scan).
export const ROLES_ESTOQUE_MOVIMENTAR = [
  ...ROLES_INVENTARIO_GERENTES, "estoquista_fabrica", "estoquista_loja",
] as const;

// Baixa manual GENÉRICA não existe para ninguém (v2.81.3 — bloqueada na rota
// /estoque-comercial/movimentos). Esta constante vale para as DUAS exceções
// rastreáveis que restam: ESTORNO de movimento e DESFECHO de pendência do
// inventário que gera movimento (motivo + validação + auditoria) — SOMENTE
// admin/desenvolvedor (Jonathan), em casos excepcionais.
export const ROLES_BAIXA_MANUAL = ["desenvolvedor", "admin"] as const;

// Verifica se a role está na lista permitida
export function hasRole(role: string | null | undefined, permitidas: readonly string[]): boolean {
  if (!role) return false;
  return permitidas.includes(role);
}

/**
 * REGRA DE NEGÓCIO (fecha buraco de autorização, 21/07): "Tarefas do time"
 * (GET /api/tarefas?visao=time) é a visão de SUPERVISÃO GERAL — mostra
 * tarefas de QUALQUER usuário, sem filtro de dono/responsável. Antes só o
 * FRONT escondia a aba (TarefasClient.tsx) pra quem não é gerência; a API
 * não validava nada, então qualquer autenticado lia a lista completa
 * (inclusive dados sensíveis, como endereço de cliente em tarefas de frete
 * avulso). Fonte ÚNICA: front (TarefasClient.tsx) e API
 * (app/api/tarefas/route.ts) importam esta mesma constante — antes a lista
 * de roles estava hardcoded só no front, sem espelho na API.
 * POR QUE: quem pode ver "o time inteiro" é a mesma gerência que já
 * enxergava o botão da aba — não é uma lista nova, é o valor que já existia.
 * IMPACTO SE REMOVIDO/DIVERGENTE: front e API voltam a poder dessincronizar
 * (front esconde, API libera) — reabre o vazamento.
 */
export const ROLES_TAREFAS_GERENCIAR = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja"] as const;
export function podeGerenciarTarefas(role: string | null | undefined): boolean {
  return ROLES_TAREFAS_GERENCIAR.includes(role as typeof ROLES_TAREFAS_GERENCIAR[number]);
}
