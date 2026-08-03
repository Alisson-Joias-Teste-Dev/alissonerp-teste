/**
 * page.tsx — SSR do DETALHE de um fechamento mensal da verba de frete grátis.
 *
 * REGRA DE NEGÓCIO (03/08/2026 — pedido do Jonathan: "preciso abrir e ver tudo
 * que é referente a esse fechamento"; mockup aprovado): página PRÓPRIA, não
 * drawer — decisão dele, para o endereço poder ser mandado pra gerente/chefe e
 * impresso. 100% READ-ONLY, como a aba que a origina: o fechamento é feito pela
 * rotina do dia 01 (cron `fechamento-frete-mensal`, job 23), nunca por tela.
 *
 * GATE DE PAPEL: o MESMO da aba "Fechamentos de frete"
 * (`ROLES_PAGAMENTO_MOTOBOY`, ver o gate de `aba === "fechamentos"` em
 * ../../page.tsx). Aqui não dá para "cair em outra aba" como lá, então quem não
 * tem o papel volta pra /entregas-venda.
 * IMPACTO SE REMOVIDO: consultora/estoquista_loja (que acessam o módulo de
 * entregas) passariam a ver verba, saldo e conta a pagar da gerente só
 * digitando o id na URL — exatamente o vazamento que o gate da aba já fecha.
 *
 * Tabelas envolvidas (via obterFechamentoFreteDetalhe, src/lib/frete-fechamento.ts):
 *   - alissonerp.fechamentos_frete
 *   - alissonerp.saldo_frete_gratis
 *   - alissonerp.entregas_venda / vendas_erp / public.contatos
 *   - alissonerp.tarefas / aprovacoes_tarefa
 */

import { notFound, redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import sql from "@/lib/db";
import { ROLES_PAGAMENTO_MOTOBOY } from "@/lib/pagamento-motoboy";
import { obterFechamentoFreteDetalhe } from "@/lib/frete-fechamento";
import FechamentoFreteDetalhePainel from "@/components/entregas/FechamentoFreteDetalhePainel";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function FechamentoFreteDetalhePage({ params }: PageProps) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [usuario] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario || !ROLES_PAGAMENTO_MOTOBOY.includes(usuario.role as string)) {
    redirect("/entregas-venda");
  }

  // Id inválido (não numérico) é 404, não erro 500 — mesma postura de
  // "valor de URL inválido nunca vira SQL livre" do resto do módulo.
  const { id } = await params;
  const fechamentoId = Number(id);
  if (!Number.isInteger(fechamentoId) || fechamentoId <= 0) notFound();

  const detalhe = await obterFechamentoFreteDetalhe(sql, fechamentoId);
  if (!detalhe) notFound();

  return <FechamentoFreteDetalhePainel detalhe={detalhe} />;
}
