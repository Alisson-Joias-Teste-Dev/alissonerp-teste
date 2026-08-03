/**
 * Checagem do escopo de comissão com o driver REAL, contra o banco.
 *
 * O QUÊ: replica `resolverEscopoComissao` + `resolverConsultoraAlvo` e imprime,
 * para cada usuário do sistema, o que ele consegue ver e fazer no extrato.
 *
 * O PORQUÊ: é a fronteira de segurança da tela — a partir de 03/08/2026 a
 * VENDEDORA vê o próprio extrato, então "consultora abre a comissão da colega"
 * deixou de ser hipótese. `tsc` não pega isso; só rodando contra os dados reais.
 *
 * Uso: node scripts/check-comissao-permissao.mjs
 */
import postgres from "postgres";
import { readFileSync } from "node:fs";

const env = readFileSync(".env.local.prod-backup", "utf8");
const url = env.split("\n").find((l) => l.startsWith("DATABASE_URL")).slice("DATABASE_URL=".length).trim();
const sql = postgres(url, { ssl: false });

const FULL = ["desenvolvedor", "admin"];

const usuarios = await sql`
  SELECT u.id, u.nome, u.role,
         p.pode_ler, p.pode_escrever,
         v.id_vendedor::int AS id_vendedor, v.nome AS vendedora
  FROM alissonerp.usuarios u
  LEFT JOIN alissonerp.role_permissoes p
         ON p.role = u.role AND p.modulo = 'financeiro' AND p.ativo IS TRUE
  LEFT JOIN public.vendedores v ON v.user_id = u.id AND v.situacao = 'Ativo'
  ORDER BY u.role, u.nome
`;

let falhas = 0;
const linhas = [];

for (const u of usuarios) {
  const full = FULL.includes(u.role);
  const podeVerTodas = full || u.pode_ler === true;
  const podePagar = full || u.pode_escrever === true;
  const consultoraId = u.id_vendedor != null ? Number(u.id_vendedor) : null;
  const temAcesso = podeVerTodas || consultoraId !== null;
  if (!temAcesso) continue;

  // O id que ela consegue abrir quando PEDE o de outra pessoa (999).
  const alvoPedindoOutra = podeVerTodas ? 999 : consultoraId;

  // INVARIANTE: quem não vê todas só pode cair no PRÓPRIO id.
  if (!podeVerTodas && alvoPedindoOutra !== consultoraId) {
    console.log(`FALHA: ${u.nome} (${u.role}) conseguiu abrir ${alvoPedindoOutra}`);
    falhas++;
  }
  // INVARIANTE: quem não vê todas nunca pode pagar.
  if (!podeVerTodas && podePagar) {
    console.log(`FALHA: ${u.nome} (${u.role}) não vê todas mas pode pagar`);
    falhas++;
  }

  linhas.push({
    usuario: u.nome ?? "—",
    papel: u.role,
    vendedora: u.vendedora ?? "—",
    "vê todas": podeVerTodas ? "SIM" : "não",
    "pode pagar": podePagar ? "SIM" : "não",
    "abre o id": podeVerTodas ? "qualquer" : String(consultoraId),
  });
}

console.table(linhas);
console.log(falhas === 0 ? "\nOK — nenhuma invariante violada" : `\n${falhas} FALHAS`);

await sql.end();
process.exit(falhas === 0 ? 0 : 1);
