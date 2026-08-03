/**
 * Quem pode ver e pagar comissão — resolvido no SERVIDOR
 *
 * O QUÊ
 *   Recebe o usuário logado e devolve o escopo dele no módulo de comissão:
 *   vê todas as consultoras? pode pagar? e, se não vê todas, QUAL consultora
 *   ele é.
 *
 * O PORQUÊ (decisão do Jonathan, 03/08/2026)
 *   O extrato passa a ser visto pelas VENDEDORAS, não só pelo financeiro — cada
 *   uma acompanha o próprio, que cresce dia a dia. A partir daí, esconder botão
 *   no front deixou de ser suficiente: o escopo tem que ser decidido aqui, senão
 *   basta trocar o número na URL para ver a comissão da colega.
 *
 *   E a permissão sai da lista cravada e passa a vir de `role_permissoes`, que é
 *   a tela de papéis. Antes, cada rota de comissão repetia
 *   `["desenvolvedor","admin","gerente_fabrica","gerente_loja"]`, que DIVERGIA
 *   do cadastro: `gerente_fabrica` via comissão sem estar autorizado, e
 *   `administrativo` e `diretor` estavam autorizados e não conseguiam entrar.
 *
 * O IMPACTO SE ALTERADO
 *   Devolver `podeVerTodas: true` por engano expõe a comissão de todas as
 *   consultoras para quem só deveria ver a própria. E `consultoraId` NUNCA pode
 *   sair do que o cliente mandou — sempre do vínculo `vendedores.user_id`.
 */

import sql from "@/lib/db";
import { isFullAccess } from "@/lib/roles";

export interface EscopoComissao {
  userId: string;
  role: string;
  /** Vê o extrato de todas as consultoras (financeiro, gerência, admin). */
  podeVerTodas: boolean;
  /** Pode registrar pagamento, estorno e lançamento manual. */
  podePagar: boolean;
  /**
   * A consultora que este usuário É (via `vendedores.user_id`). Null para quem
   * é só financeiro. Quando `podeVerTodas` é false, este é o ÚNICO id que ele
   * pode abrir.
   */
  consultoraId: number | null;
}

/**
 * Resolve o escopo. Devolve null quando o usuário não tem nada a ver com
 * comissão — a rota responde 403.
 */
export async function resolverEscopoComissao(userId: string): Promise<EscopoComissao | null> {
  const [perfil] = await sql<Array<{ role: string }>>`
    SELECT role FROM alissonerp.usuarios WHERE id = ${userId}::uuid
  `;
  if (!perfil) return null;

  const [perm] = await sql<Array<{ pode_ler: boolean; pode_escrever: boolean }>>`
    SELECT pode_ler, pode_escrever
    FROM alissonerp.role_permissoes
    WHERE role = ${perfil.role} AND modulo = 'financeiro' AND ativo IS TRUE
  `;

  // O vínculo usuário → vendedora. É ele que permite a consultora abrir o
  // próprio extrato sem ter acesso ao módulo Financeiro.
  const [vend] = await sql<Array<{ id_vendedor: number }>>`
    SELECT id_vendedor::int FROM public.vendedores
    WHERE user_id = ${userId}::uuid AND situacao = 'Ativo'
    LIMIT 1
  `;

  const full = isFullAccess(perfil.role);
  const podeVerTodas = full || perm?.pode_ler === true;
  const podePagar = full || perm?.pode_escrever === true;
  const consultoraId = vend ? Number(vend.id_vendedor) : null;

  // Nem vê o módulo nem é vendedora: não tem o que fazer aqui.
  if (!podeVerTodas && consultoraId === null) return null;

  return { userId, role: perfil.role, podeVerTodas, podePagar, consultoraId };
}

/**
 * Qual consultora este usuário pode de fato abrir.
 *
 * REGRA: quem não vê todas só abre a PRÓPRIA — o id pedido pelo cliente é
 * descartado, não recusado. Assim trocar o número na URL não vaza nem revela,
 * pela diferença entre 403 e 200, quais ids existem.
 *
 * Devolve null quando o pedido é inválido (não vê todas e não é vendedora).
 */
export function resolverConsultoraAlvo(escopo: EscopoComissao, pedido: number | null): number | null {
  if (escopo.podeVerTodas) return pedido ?? escopo.consultoraId;
  return escopo.consultoraId;
}
