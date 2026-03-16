import sql from "@/lib/db";
import QuebraClient from "@/components/QuebraClient";

export const dynamic = 'force-dynamic';

export default async function QuebraPage() {
  const [quebraOurives, quebraMensal, quebraDeposito, parametros] =
    await Promise.all([
      sql`
        SELECT operador_id, operador_nome, total_ordens,
               total_metal, total_retorno, total_pmc, total_quebra, percentual_medio
        FROM alissonerp.vw_quebra_por_ourives
      `,
      sql`
        SELECT mes, mes_label, total_ordens, total_metal, total_quebra, percentual_quebra
        FROM alissonerp.vw_quebra_mensal
        ORDER BY mes ASC
      `,
      sql`
        SELECT deposito_id, deposito_nome, total_entrada, total_saida, saldo
        FROM alissonerp.vw_quebra_por_deposito
        ORDER BY saldo DESC
      `,
      sql`SELECT cotacao_ouro FROM alissonerp.parametros LIMIT 1`,
    ]);

  return (
    <QuebraClient
      quebraOurives={quebraOurives}
      quebraMensal={quebraMensal}
      quebraDeposito={quebraDeposito}
      cotacaoOuro={Number(parametros[0]?.cotacao_ouro ?? 0)}
    />
  );
}
