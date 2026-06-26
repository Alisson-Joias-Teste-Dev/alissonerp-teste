import { getFinanceiroData } from "../_data";
import FinanceiroClient from "../FinanceiroClient";

// REGRA DE NEGÓCIO: página de pagamento de comissões.
// O que: SSR que carrega dados do financeiro e abre na aba Comissões.
// Por que: acesso via URL /financeiro/comissoes e pelo menu lateral.
// Impacto se alterado: perde acesso direto ao módulo de comissões.

export const dynamic = 'force-dynamic';

export default async function ComissoesPage() {
  const data = await getFinanceiroData();
  return <FinanceiroClient {...data} defaultTab="comissoes" />;
}
