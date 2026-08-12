// Cria (ou retoma) 2 usuarios de teste (admin + vendedora) pro robo de teste de
// tela conseguir entrar com os dois cargos. Login de verdade (auth.users/
// auth.identities) precisa existir em PRODUCAO porque e o unico GoTrue real
// (homolog nao tem porteiro proprio). O perfil de negocio (alissonerp.usuarios)
// so precisa existir em erp_teste, que e onde o app aponta localmente.
//
// Idempotente: se o email ja existir em produção, so atualiza a senha (UPDATE),
// nunca insere duplicado.
import { readFileSync, writeFileSync } from "fs";
import crypto from "crypto";
import postgres from "postgres";

const prodUrl = readFileSync(".env.production.local", "utf8").match(/^DATABASE_URL=(.*)$/m)[1].replace(/^"|"$/g, "");

const contas = [
  { email: "e2e-admin-teste@alisson.local", nome: "TESTE E2E — Admin (não usar)", role: "admin" },
  { email: "e2e-vendedora-teste@alisson.local", nome: "TESTE E2E — Vendedora (não usar)", role: "consultora" },
];

const prod = postgres(prodUrl, { ssl: false, connection: { application_name: "claude-code-alisson" } });
const teste = postgres("postgresql://postgres:testelocal123@localhost:5433/erp_teste");

const credLines = [];

for (const c of contas) {
  c.senha = crypto.randomBytes(18).toString("base64url");

  const existente = await prod`SELECT id FROM auth.users WHERE email = ${c.email}`;
  if (existente.length) {
    c.id = existente[0].id;
    await prod`UPDATE auth.users SET encrypted_password = crypt(${c.senha}, gen_salt('bf', 10)), updated_at = now() WHERE id = ${c.id}`;
  } else {
    c.id = crypto.randomUUID();
    await prod`
      INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        confirmation_token, recovery_token, email_change_token_new, email_change,
        created_at, updated_at
      ) VALUES (
        '00000000-0000-0000-0000-000000000000', ${c.id}, 'authenticated', 'authenticated',
        ${c.email}, crypt(${c.senha}, gen_salt('bf', 10)),
        now(), '{"provider":"email","providers":["email"]}'::jsonb,
        ${prod.json({ nome: c.nome, role: c.role })},
        '', '', '', '',
        now(), now()
      )
    `;
    await prod`
      INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider, created_at, updated_at)
      VALUES (
        gen_random_uuid(), ${c.id}::text, ${c.id},
        ${prod.json({ sub: c.id, email: c.email, email_verified: false, phone_verified: false })},
        'email', now(), now()
      )
    `;
  }

  // Linha espelho no auth local do banco de teste — só pra satisfazer a FK de
  // alissonerp.usuarios.id; nunca é lida por um GoTrue de verdade.
  await teste`
    INSERT INTO auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at)
    VALUES ('00000000-0000-0000-0000-000000000000', ${c.id}, 'authenticated', 'authenticated', ${c.email}, now(), now(), now())
    ON CONFLICT (id) DO NOTHING
  `;

  credLines.push(`${c.role.toUpperCase()}_EMAIL=${c.email}`, `${c.role.toUpperCase()}_SENHA=${c.senha}`);
}

await prod`
  SELECT alissonerp.assinar_mudanca_banco(
    'alisson', 'claude-code',
    ${"Cria/atualiza senha de 2 usuarios SO-DE-TESTE (auth.users/auth.identities) pro robo de teste de tela (Playwright) logar como admin e vendedora/consultora. Sem perfil de negocio em producao (alissonerp.usuarios so existe no banco de teste local erp_teste)."},
    ${"INSERT/UPDATE auth.users/auth.identities: " + contas.map((c) => c.email).join(", ")}
  )
`;

const admin = contas.find((c) => c.role === "admin");
const vendedora = contas.find((c) => c.role === "consultora");

await teste`
  INSERT INTO alissonerp.usuarios (id, email, nome, role, ativo, tipos_ordem_permitidos, tipos_protocolo_permitidos, parcelas_padrao_mp, mx_desconto_permitido)
  VALUES (${admin.id}, ${admin.email}, ${admin.nome}, 'admin', true, '[]'::jsonb, '[]'::jsonb, 1, 100)
  ON CONFLICT (id) DO NOTHING
`;
await teste`
  INSERT INTO alissonerp.usuarios (id, email, nome, role, ativo, vendedor_id, mx_desconto_permitido, tipos_ordem_permitidos, tipos_protocolo_permitidos, parcelas_padrao_mp)
  VALUES (${vendedora.id}, ${vendedora.email}, ${vendedora.nome}, 'consultora', true, 4, 20, ${teste.json(["servico_venda", "fabricacao", "reposicao_venda", "garantia"])}, ${teste.json(["fabrica"])}, 1)
  ON CONFLICT (id) DO NOTHING
`;

await prod.end();
await teste.end();

writeFileSync(".env.e2e-credentials", credLines.join("\n") + "\n");
console.log("OK: usuarios de teste prontos (produção: login; erp_teste: perfil). Credenciais em .env.e2e-credentials (gitignored).");
