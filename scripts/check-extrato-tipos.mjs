/**
 * Checagem do extrato de comissão com o driver REAL (postgres.js).
 *
 * O QUÊ: roda as duas fontes do extrato (itens gravados e pagamentos ainda não
 * lançados) e verifica que a chave `consultora_id` volta com o MESMO tipo nas
 * duas — e que o agrupamento gera uma linha por vendedora.
 *
 * O PORQUÊ: `vendas_erp.vendedor_id` é BIGINT e o postgres.js devolve bigint
 * como STRING; `fechamento_comissao_itens.consultora_id` é INTEGER e volta como
 * number. Sem `::int` as duas viram chaves diferentes e cada vendedora aparece
 * DUAS vezes na tela (bug achado em 03/08/2026). tsc não pega isso — só o
 * driver rodando contra o banco pega.
 *
 * Uso: node scripts/check-extrato-tipos.mjs 2026-07
 */
import postgres from "postgres";
import { readFileSync } from "node:fs";

const competencia = process.argv[2] ?? "2026-07";
const de = `${competencia}-01`;
const [ano, mes] = competencia.split("-").map(Number);
const ate = new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10);

const env = readFileSync(".env.local.prod-backup", "utf8");
const url = env.split("\n").find((l) => l.startsWith("DATABASE_URL"))?.slice("DATABASE_URL=".length).trim();
const sql = postgres(url, { ssl: false });

const ATIVAS = ["aprovado", "em_rota", "enviado", "entregue", "concluido", "virou_credito"];

const gravados = await sql`
  SELECT fi.consultora_id, fi.comissao_calculada::text AS valor
  FROM alissonerp.fechamento_comissao_itens fi
  WHERE fi.status NOT IN ('estornado','cancelado')
    AND COALESCE(fi.data_recebimento, fi.created_at::date) >= ${de}::date
    AND COALESCE(fi.data_recebimento, fi.created_at::date) <= ${ate}::date
`;

const previstos = await sql`
  SELECT v.vendedor_id::int AS consultora_id,
         CASE WHEN pv.comissionavel
              THEN ROUND(v.total_comissao * LEAST(pv.valor / NULLIF(v.total_venda,0),1),2)
              ELSE 0 END::text AS valor
  FROM alissonerp.pagamentos_venda pv
  JOIN alissonerp.vendas_erp v ON v.id = pv.venda_id AND v.situacao = ANY(${ATIVAS})
  WHERE pv.status='confirmado' AND v.vendedor_id IS NOT NULL
    AND pv.data_confirmacao >= ${de}::date
    AND pv.data_confirmacao < ${ate}::date + interval '1 day'
    AND pv.id NOT IN (
      SELECT pagamento_venda_id FROM alissonerp.fechamento_comissao_itens
      WHERE status NOT IN ('estornado','cancelado') AND pagamento_venda_id IS NOT NULL
    )
`;

const tipoG = typeof gravados[0]?.consultora_id;
const tipoP = typeof previstos[0]?.consultora_id;
console.log(`tipo consultora_id — gravados: ${tipoG} | previstos: ${tipoP}`);

const chaves = new Set([
  ...gravados.map((r) => r.consultora_id),
  ...previstos.map((r) => r.consultora_id),
]);
const nomes = await sql`SELECT id_vendedor::int AS id, nome FROM public.vendedores`;
const mapa = new Map(nomes.map((n) => [Number(n.id), n.nome]));

console.log(`\nchaves distintas no agrupamento: ${chaves.size}`);
for (const k of chaves) console.log(`  ${JSON.stringify(k)} -> ${mapa.get(Number(k)) ?? "?"}`);

const distintasPorNome = new Set(Array.from(chaves).map((k) => mapa.get(Number(k)) ?? String(k)));
const ok = tipoG === tipoP && chaves.size === distintasPorNome.size;
console.log(`\n${ok ? "OK — uma linha por vendedora" : "ERRO — vendedora duplicada no agrupamento"}`);

await sql.end();
process.exit(ok ? 0 : 1);
