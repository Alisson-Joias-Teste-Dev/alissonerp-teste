"""
create-users.py — Cria usuarios de teste no Supabase Auth (via banco direto)
Uso: python scripts/create-users.py

Requer: pip install psycopg2 bcrypt
"""
import psycopg2, bcrypt, uuid, json, sys, os
from datetime import datetime, timezone
sys.stdout.reconfigure(encoding='utf-8')

DATABASE_URL = os.environ.get("DATABASE_URL",
    "postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres")

def hash_pw(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=10)).decode()

# Usuarios a criar — editar conforme necessario
USUARIOS = [
    {"email": "admin@alisson.com",      "senha": "Admin@123",      "nome": "Alisson Ranyel",  "role": "admin"},
    {"email": "gerente@alisson.com",    "senha": "Gerente@123",    "nome": "Gerente Fabrica", "role": "gerente_fabrica"},
    {"email": "ourives1@alisson.com",   "senha": "Ourives@123",    "nome": "Joao Carlos",     "role": "ourives"},
    {"email": "motoboy@alisson.com",    "senha": "Motoboy@123",    "nome": "Diego Santos",    "role": "motoboy"},
    {"email": "consultora@alisson.com", "senha": "Consultora@123", "nome": "Camila Silva",    "role": "consultora"},
    {"email": "pcp@alisson.com",        "senha": "PCP@123",        "nome": "Operador PCP",    "role": "pcp"},
]

conn = psycopg2.connect(DATABASE_URL, connect_timeout=10)
conn.autocommit = True
cur = conn.cursor()
now = datetime.now(timezone.utc)

print("Criando usuarios...")
for u in USUARIOS:
    cur.execute("SELECT id FROM auth.users WHERE email = %s", (u["email"],))
    if cur.fetchone():
        print(f"  SKIP: {u['email']} (ja existe)")
        continue

    uid = uuid.uuid4()

    # IMPORTANTE: tokens devem ser '' (vazio), nao NULL, para GoTrue autenticar
    cur.execute("""
        INSERT INTO auth.users (
            id, instance_id, aud, role, email,
            encrypted_password, email_confirmed_at,
            raw_user_meta_data, raw_app_meta_data,
            confirmation_token, recovery_token,
            email_change_token_new, email_change,
            email_change_token_current, reauthentication_token,
            phone_change, phone_change_token,
            is_sso_user, is_anonymous, created_at, updated_at
        ) VALUES (
            %s, '00000000-0000-0000-0000-000000000000',
            'authenticated', 'authenticated', %s,
            %s, %s,
            %s::jsonb, %s::jsonb,
            '', '', '', '', '', '', '', '',
            false, false, %s, %s
        )
    """, (
        str(uid), u["email"], hash_pw(u["senha"]), now,
        json.dumps({"nome": u["nome"], "role": u["role"]}),
        json.dumps({"provider": "email", "providers": ["email"]}),
        now, now,
    ))

    # Criar identity (necessario para GoTrue autenticar via email+senha)
    cur.execute("""
        INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
        VALUES (%s, %s, %s, %s::jsonb, 'email', %s, %s, %s)
        ON CONFLICT DO NOTHING
    """, (
        str(uuid.uuid4()), str(uid), str(uid),
        json.dumps({"sub": str(uid), "email": u["email"], "email_verified": False, "phone_verified": False}),
        now, now, now,
    ))

    print(f"  OK: {u['email']} ({u['role']})")

cur.execute("SELECT email, nome, role FROM alissonerp.usuarios ORDER BY role")
print(f"\nUsuarios no sistema:")
for r in cur.fetchall():
    print(f"  {r[0]} | {r[1]} | {r[2]}")
conn.close()
