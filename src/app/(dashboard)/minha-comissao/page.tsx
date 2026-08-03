/**
 * page.tsx — MINHA COMISSÃO: o extrato que a própria vendedora acompanha.
 *
 * REGRA DE NEGÓCIO (decisão do Jonathan, 03/08/2026): cada vendedora acompanha
 * o próprio extrato, que cresce dia a dia — vendas pagas, devoluções, vale-troca
 * usado, o que já foi pago e o saldo acumulado (o que a empresa ainda deve).
 *
 * POR QUE PÁGINA SEPARADA: a consultora NÃO tem acesso ao módulo Financeiro
 * (`role_permissoes`: consultora → financeiro = false), e não deve mesmo ter —
 * lá estão contas a pagar, caixa e a comissão das colegas. Esta porta mostra
 * exclusivamente o extrato dela.
 *
 * GATE: basta estar vinculada em `public.vendedores.user_id`. Não depende de
 * papel — a Germana é `gerente_loja` e a Cristiane é `consultora`; as duas
 * entram, cada uma no próprio.
 *
 * IMPACTO SE ALTERADO: o `consultoraId` daqui é conveniência de navegação, NÃO
 * é a permissão. Quem decide o que ela pode abrir é o servidor, em
 * `src/lib/comissao-permissao.ts` — a rota do extrato descarta o id pedido e
 * usa o do vínculo quando a pessoa não pode ver todas. Trocar o número na URL
 * não abre a comissão da colega.
 */

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import sql from "@/lib/db";
import { ExtratoComissao } from "../financeiro/FinanceiroClient";

export const dynamic = "force-dynamic";

export default async function MinhaComissaoPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [vend] = await sql<Array<{ id_vendedor: number; nome: string }>>`
    SELECT id_vendedor::int, nome FROM public.vendedores
    WHERE user_id = ${user.id}::uuid AND situacao = 'Ativo'
    LIMIT 1
  `;

  // Sem vínculo com vendedora não há extrato para mostrar.
  if (!vend) redirect("/");

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="mb-5">
        <h1 className="text-2xl font-bold" style={{ color: "#184036" }}>Minha comissão</h1>
        <p className="text-sm" style={{ color: "#6B7280" }}>
          {vend.nome} · o extrato vai crescendo conforme os clientes pagam
        </p>
      </div>
      <ExtratoComissao soConsultoraId={Number(vend.id_vendedor)} />
    </div>
  );
}
