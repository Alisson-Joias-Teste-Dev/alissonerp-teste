import { getFinanceiroData } from "../_data";
import FinanceiroClient from "../FinanceiroClient";

export const dynamic = 'force-dynamic';

export default async function AReceberPage() {
  const data = await getFinanceiroData();
  return <FinanceiroClient {...data} defaultTab="receber" />;
}
