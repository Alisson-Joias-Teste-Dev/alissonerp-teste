import sql from "@/lib/db";
import SetoresClient from "./SetoresClient";

export const dynamic = "force-dynamic";

export default async function SetoresPage() {
  const setores = await sql<
    { id: number; nome: string; deposito_id: number | null; ativo: boolean; requer_peso: boolean }[]
  >`
    SELECT id, nome, deposito_id, ativo, requer_peso
    FROM alissonerp.setores
    ORDER BY ativo DESC, nome ASC
  `;
  return <SetoresClient initialSetores={setores} />;
}
