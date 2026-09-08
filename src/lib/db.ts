import postgres from "postgres";

/**
 * POOL DE CONEXOES DO BANCO — configuracao critica de performance.
 *
 * O QUE FAZ: define quantas conversas simultaneas o ERP consegue manter com o
 * Postgres. Todas as ~505 rotas de API e os Server Components compartilham
 * ESTE pool unico (o container do ERP e um processo Node so).
 *
 * O PORQUE: estava fixo em 5. Como cada requisicao consome o pool varias vezes
 * (identidade + permissao + a consulta em si), com poucos usuarios simultaneos
 * as requisicoes ficavam na fila esperando conexao livre — era a causa
 * principal da lentidao relatada pelos usuarios.
 *
 * O IMPACTO SE ALTERADO:
 *  - Baixar demais (ex: 5) -> volta a lentidao por fila de conexao.
 *  - Subir acima do folego do servidor -> o Postgres recusa conexao
 *    ("too many clients") e o ERP cai. O teto seguro depende de
 *    `SHOW max_connections;` MENOS o que os outros servicos do Supabase
 *    (auth, storage, realtime, postgrest) ja consomem.
 *  - Ajuste em producao pela env DB_POOL_MAX, sem precisar de novo build.
 *
 * POR QUE 15 (e nao mais): 15 e conservador de proposito. E 3x o valor antigo,
 * o que ja resolve a fila, e cabe com folga em qualquer Postgres com
 * max_connections >= 50. O valor foi escolhido SEM ter medido
 * `SHOW max_connections;` na producao. Depois de medir, da para subir para
 * 25 so trocando a env DB_POOL_MAX — sem novo build, sem novo deploy.
 */
const MAX_CONEXOES = Number(process.env.DB_POOL_MAX) || 15;

const sql = postgres(process.env.DATABASE_URL!, {
  ssl: false,
  max: MAX_CONEXOES,
  idle_timeout: 20,
  // Se o banco travar, a requisicao falha em 10s em vez de pendurar para sempre
  // segurando uma vaga do pool (efeito domino que derruba o ERP inteiro).
  connect_timeout: 10,
  // Recicla cada conexao a cada 30min: evita conexao "zumbi" acumulando memoria
  // no Postgres e libera a vaga se alguma ficar presa.
  max_lifetime: 60 * 30,
  // search_path garante que triggers SECURITY DEFINER (migrations 141, 161)
  // resolvam tabelas como 'vendas_erp' -> 'alissonerp.vendas_erp'
  connection: {
    search_path: "alissonerp,public",
  },
});

export default sql;

/**
 * Converte campos NUMERIC (que postgres.js retorna como string) para number,
 * e campos JSONB/json_agg (que podem vir como string) para array/objeto.
 * Usar em TODA API route e Server Component que retorna dados com NUMERIC ou JSONB.
 */
export function normalizeRow<T extends Record<string, unknown>>(
  row: T,
  numericFields: string[],
  jsonFields: string[] = [],
): T {
  const result = { ...row } as Record<string, unknown>;
  for (const field of numericFields) {
    if (field in result && result[field] !== null && result[field] !== undefined) {
      const val = result[field];
      result[field] = typeof val === "string" ? parseFloat(val) : val;
    }
  }
  for (const field of jsonFields) {
    if (field in result && result[field] !== null && result[field] !== undefined) {
      const val = result[field];
      if (typeof val === "string") {
        try { result[field] = JSON.parse(val); } catch { result[field] = []; }
      }
      if (!Array.isArray(result[field])) {
        result[field] = [];
      }
    }
  }
  return result as T;
}
