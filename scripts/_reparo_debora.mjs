/**
 * Reparo do registro da Débora (alissonjoias.vendas09@gmail.com)
 * Usuário foi criado via POST /api/user que não incluía todos os campos
 * obrigatórios do GoTrue → login falhava.
 *
 * O que este script faz:
 *  1. Busca o user ID pelo e-mail em auth.users
 *  2. Atualiza auth.users com os campos vazios que faltavam
 *  3. Atualiza auth.identities.identity_data com email_verified/phone_verified
 *  4. (Opcional) Redefine a senha para um valor conhecido
 *
 * Uso:
 *   node scripts/_reparo_debora.mjs
 *   node scripts/_reparo_debora.mjs --senha NovaSenha123
 */

import postgres from 'postgres';

const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres', { ssl: false });

const EMAIL = 'alissonjoias.vendas09@gmail.com';

// Lê --senha do argv
const senhaIdx = process.argv.indexOf('--senha');
const novaSenha = senhaIdx !== -1 ? process.argv[senhaIdx + 1] : null;

console.log(`\n=== Reparo do usuário: ${EMAIL} ===\n`);

// 1. Localizar usuário
const [authUser] = await sql`
  SELECT id, email, encrypted_password, email_confirmed_at,
         reauthentication_token, email_change, phone_change, phone_change_token,
         is_sso_user, is_anonymous
  FROM auth.users
  WHERE email = ${EMAIL}
  LIMIT 1
`;

if (!authUser) {
  console.error(`❌ Usuário não encontrado em auth.users para: ${EMAIL}`);
  await sql.end();
  process.exit(1);
}

console.log(`✅ Encontrado: id=${authUser.id}`);
console.log(`   email_confirmed_at : ${authUser.email_confirmed_at}`);
console.log(`   reauthentication_token : "${authUser.reauthentication_token}" (deve ser '')`);
console.log(`   email_change           : "${authUser.email_change}" (deve ser '')`);
console.log(`   phone_change           : "${authUser.phone_change}" (deve ser '')`);
console.log(`   phone_change_token     : "${authUser.phone_change_token}" (deve ser '')`);
console.log(`   is_sso_user  : ${authUser.is_sso_user} (deve ser false)`);
console.log(`   is_anonymous : ${authUser.is_anonymous} (deve ser false)`);

// 2. Corrigir auth.users
const updateFields: Record<string, unknown> = {};

if (authUser.reauthentication_token === null) updateFields.reauthentication_token = '';
if (authUser.email_change === null)            updateFields.email_change = '';
if (authUser.phone_change === null)            updateFields.phone_change = '';
if (authUser.phone_change_token === null)      updateFields.phone_change_token = '';
if (authUser.is_sso_user  === null)            updateFields.is_sso_user = false;
if (authUser.is_anonymous === null)            updateFields.is_anonymous = false;
if (!authUser.email_confirmed_at)              updateFields.email_confirmed_at = new Date();

if (novaSenha) {
  console.log(`\n🔑 Redefinindo senha...`);
  await sql`
    UPDATE auth.users
    SET encrypted_password = extensions.crypt(${novaSenha}, extensions.gen_salt('bf')),
        updated_at = now()
    WHERE id = ${authUser.id}::uuid
  `;
  console.log('   Senha atualizada.');
}

// Campos em branco (NULL → '')
await sql`
  UPDATE auth.users
  SET
    reauthentication_token = COALESCE(reauthentication_token, ''),
    email_change           = COALESCE(email_change, ''),
    phone_change           = COALESCE(phone_change, ''),
    phone_change_token     = COALESCE(phone_change_token, ''),
    is_sso_user            = COALESCE(is_sso_user, false),
    is_anonymous           = COALESCE(is_anonymous, false),
    email_confirmed_at     = COALESCE(email_confirmed_at, now()),
    updated_at             = now()
  WHERE id = ${authUser.id}::uuid
`;
console.log('\n✅ auth.users corrigido.');

// 3. Corrigir auth.identities
const [identity] = await sql`
  SELECT id, identity_data
  FROM auth.identities
  WHERE user_id = ${authUser.id}::uuid
  LIMIT 1
`;

if (!identity) {
  console.log('\n⚠️  Nenhuma identity encontrada. Criando...');
  await sql`
    INSERT INTO auth.identities (
      id, user_id, provider, provider_id, identity_data,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(),
      ${authUser.id}::uuid,
      'email',
      ${authUser.id},
      ${JSON.stringify({
        sub: authUser.id,
        email: EMAIL,
        email_verified: false,
        phone_verified: false,
      })}::jsonb,
      now(), now(), now()
    )
  `;
  console.log('   Identity criada.');
} else {
  console.log(`\n✅ Identity encontrada: id=${identity.id}`);
  console.log(`   identity_data atual: ${JSON.stringify(identity.identity_data)}`);

  const data = identity.identity_data as Record<string, unknown>;
  const atualizado = {
    sub: data.sub ?? authUser.id,
    email: data.email ?? EMAIL,
    email_verified: data.email_verified ?? false,
    phone_verified: data.phone_verified ?? false,
  };

  await sql`
    UPDATE auth.identities
    SET identity_data = ${JSON.stringify(atualizado)}::jsonb,
        updated_at    = now()
    WHERE id = ${identity.id}::uuid
  `;
  console.log(`   identity_data atualizado: ${JSON.stringify(atualizado)}`);
}

// 4. Verificação final
const [check] = await sql`
  SELECT
    u.id,
    u.email,
    u.email_confirmed_at IS NOT NULL  AS email_confirmado,
    u.reauthentication_token = ''     AS reat_ok,
    u.email_change = ''               AS ec_ok,
    u.phone_change = ''               AS pc_ok,
    u.phone_change_token = ''         AS pct_ok,
    u.is_sso_user = false             AS sso_ok,
    u.is_anonymous = false            AS anon_ok,
    i.id IS NOT NULL                  AS tem_identity
  FROM auth.users u
  LEFT JOIN auth.identities i ON i.user_id = u.id
  WHERE u.email = ${EMAIL}
  LIMIT 1
`;

console.log('\n=== Verificação final ===');
console.log(check);

const tudoCerto = check.email_confirmado && check.reat_ok && check.ec_ok &&
  check.pc_ok && check.pct_ok && check.sso_ok && check.anon_ok && check.tem_identity;

if (tudoCerto) {
  console.log('\n🎉 Registro corrigido com sucesso! O login deve funcionar agora.');
} else {
  console.warn('\n⚠️  Alguns campos ainda estão incorretos. Verifique manualmente.');
}

await sql.end();
