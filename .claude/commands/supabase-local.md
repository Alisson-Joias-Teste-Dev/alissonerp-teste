# /supabase-local — Subir o Supabase LOCAL de teste (Windows + WSL)

Use esta skill para montar, na máquina de um dev/diretor, uma **cópia do banco rodando no PC**,
isolada da PRODUÇÃO. Resolve o problema de "localhost = banco de PROD": com isto, `npm run dev`
salva no banco LOCAL, sem risco de mexer em produção. Loga com as contas reais (auth incluído).

> **Pré-requisito do ambiente:** Windows 11 + WSL **Ubuntu**, repositório em
> `~/projetos/alissonerp`. Tudo roda via WSL.

> **Pré-requisito do pacote:** o Jonathan compartilha um **pacote-semente** (zip). Extraia em
> `~/alissonerp-seed/` (no WSL). Deve conter: `erp_data.dump`, `auth_users.csv`, `auth_identities.csv`.

---

## ⚠️ Gotcha #1 — quoting ao rodar comandos no WSL
Passar comando inline por `wsl -d Ubuntu -- bash -lc '...'` **corrompe aspas (`"`→`\"`) e `$(...)`**.
SEMPRE que o comando tiver aspas/parênteses/SQL: escreva um `.sh` (Write na UNC
`\\wsl.localhost\Ubuntu\home\<user>\x.sh`), rode `sed -i 's/\r$//' x.sh` e depois `bash x.sh`.
Para psql, prefira variáveis `PG*` em vez de connection string.

## ⚠️ Gotcha #2 — manter a distro WSL acordada (CRÍTICO)
O WSL **desliga a distro ~8s após o último processo terminar** → derruba systemd→docker→todos os
containers. Aí o Supabase parece num "crash-loop" (db "starting up"/"not accepting connections",
`RestartCount=0`, intervalos irregulares). **NÃO é bug do Supabase.** Sintoma no log:
`systemd[1]: Startup finished in Xs` repetindo. O passo 7 instala um keepalive que resolve isso.

---

## Passos (executar em ordem)

### 0. Conferir ambiente
```bash
wsl -l -v                       # confirmar distro "Ubuntu" rodando
```
No WSL: confirmar `~/projetos/alissonerp` e `~/alissonerp-seed/` (com os 3 arquivos).

### 1. Instalar Docker Engine no WSL (se faltar)
Checar: `docker --version`. Se faltar, **o usuário** roda (precisa da senha dele — sudo é interativo):
crie `~/setup-docker.sh` com o conteúdo abaixo e peça pra ele rodar `sudo bash ~/setup-docker.sh`.
```bash
#!/usr/bin/env bash
set -euo pipefail
apt-get update -y && apt-get install -y ca-certificates curl gnupg
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
. /etc/os-release
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" > /etc/apt/sources.list.d/docker.list
apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
usermod -aG docker "${SUDO_USER:-$USER}"
systemctl enable docker 2>/dev/null || true
systemctl start docker 2>/dev/null || service docker start 2>/dev/null || true
docker --version
```
Depois: no **PowerShell** rode `wsl --shutdown` e reabra o WSL (ativa o grupo `docker`, pra usar sem sudo).

### 2. Instalar o Supabase CLI no WSL (se faltar)
Checar: `supabase --version`. Se faltar (binário, sem sudo):
```bash
mkdir -p "$HOME/.local/share/supabase"
curl -fsSL https://github.com/supabase/cli/releases/latest/download/supabase_linux_amd64.tar.gz \
  | tar -xzf - -C "$HOME/.local/share/supabase"   # tem que extrair 'supabase' E 'supabase-go' JUNTOS
grep -q ".local/share/supabase" ~/.bashrc || echo 'export PATH="$HOME/.local/share/supabase:$HOME/.local/bin:$PATH"' >> ~/.bashrc
export PATH="$HOME/.local/share/supabase:$PATH"
supabase --version
```
> O CLI novo é um "shim" que chama o binário irmão `supabase-go` — os dois TÊM que ficar na mesma pasta.

### 3. Iniciar o stack (vazio — vamos restaurar o dump por cima)
```bash
cd ~/projetos/alissonerp
[ -f supabase/config.toml ] || printf 'N\nN\n' | supabase init
# subir SEM aplicar migrations (vamos restaurar o dump): some com a pasta temporariamente
[ -d supabase/migrations ] && mv supabase/migrations supabase/migrations.hold
supabase start            # 1ª vez baixa imagens (~minutos)
```
Anote as URLs/portas: Studio 54323 · API 54321 · DB 54322. Ao final, devolva a pasta:
`[ -d supabase/migrations.hold ] && mv supabase/migrations.hold supabase/migrations`.

### 4. Restaurar os DADOS do app (alissonerp + crm + public)
```bash
PGHOST=127.0.0.1 PGPORT=54322 PGUSER=postgres PGPASSWORD=postgres \
  pg_restore -d postgres --no-owner --no-privileges -j 4 ~/alissonerp-seed/erp_data.dump 2> ~/restore_err.log
echo "EXIT=$?"; wc -l ~/restore_err.log
```
Erros ESPERADOS (ignorar): `schema "public" already exists`; `relation "directus.*" does not exist` e
`role "directus" does not exist` (schema directus foi pulado de propósito); `violates foreign key ... created_by`
(FKs pra `auth.users` — os dados entram, só a FK não é recriada).

### 5. Restaurar os LOGINS (auth) dos CSVs
Crie e rode `~/restore_auth.sh` (lê as colunas do cabeçalho do CSV — tolerante a versão):
```bash
#!/usr/bin/env bash
S=~/alissonerp-seed
P() { PGHOST=127.0.0.1 PGPORT=54322 PGUSER=postgres PGPASSWORD=postgres PGDATABASE=postgres psql "$@"; }
UCOLS=$(head -1 "$S/auth_users.csv")
ICOLS=$(head -1 "$S/auth_identities.csv")
P -c "truncate auth.identities, auth.users cascade"
P -c "\copy auth.users($UCOLS) from '$S/auth_users.csv' (format csv, header true)"
P -c "\copy auth.identities($ICOLS) from '$S/auth_identities.csv' (format csv, header true)"
echo "users=$(P -tAc 'select count(*) from auth.users') identities=$(P -tAc 'select count(*) from auth.identities')"
```
(senha é bcrypt → portável; login com as contas reais funciona no local.)

### 6. Apontar o app pro LOCAL (com backup)
```bash
cd ~/projetos/alissonerp
cp -f .env.local .env.local.prod-backup     # backup pra voltar pra PROD depois
```
Edite o `.env.local` trocando SÓ estas 4 (mantenha Tiny, Mercado Pago, etc.). As chaves locais são
as **padrão fixas** do Supabase CLI (não são segredo):
```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU
```
> Voltar pra PROD a qualquer momento: `cp .env.local.prod-backup .env.local`.

### 7. Keepalive — manter a distro acordada (Startup do Windows)
Crie `C:\Users\<Usuário>\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup\wsl-keepalive.vbs`:
```vbs
' Mantem a distro WSL Ubuntu acordada (Supabase local). Roda escondido no logon. Apague para remover.
CreateObject("WScript.Shell").Run "wsl.exe -d Ubuntu -u root --exec /bin/sleep infinity", 0, False
```
Ativar agora (sem reiniciar): `wscript "<caminho do .vbs>"`. Confere: deve aparecer um
`/bin/sleep infinity` em `wsl -d Ubuntu -u root -- bash -lc "ps -eo pid,cmd | grep '[s]leep infinity'"`.
(Se não tiver permissão de Tarefa Agendada, este método do Startup NÃO precisa de admin.)

### 8. Validar (provar que funcionou)
```bash
# contagens (devem bater com o esperado do pacote)
PGHOST=127.0.0.1 PGPORT=54322 PGUSER=postgres PGPASSWORD=postgres psql -tAc \
  "select 'vendas '||count(*) from alissonerp.vendas_erp" 
# endpoints
curl -s -o /dev/null -w "auth %{http_code}\n" http://127.0.0.1:54321/auth/v1/health
curl -s -o /dev/null -w "api  %{http_code}\n" http://127.0.0.1:54321/rest/v1/
```
Studio (ver dados): http://127.0.0.1:54323 · Mailpit (e-mails de teste): http://127.0.0.1:54324.
Por fim, `npm run dev` e logar com uma conta real → tudo cai no banco local.

---

## Uso depois de montado
- Subir: `cd ~/projetos/alissonerp && supabase start` · Parar: `supabase stop`.
- Se "cair sozinho": a distro dormiu — confira o keepalive (passo 7).
- Voltar pra PROD: `cp .env.local.prod-backup .env.local`.

## Aviso conhecido
Restaurado **sem GRANTs** (`--no-privileges`). Server-side do app (service_role + conexão direta) funciona.
Se alguma tela que lê via API anônima vier vazia/erro de permissão, recriar os GRANTs daquele schema.

---

## Apêndice — como o JONATHAN gera/atualiza o pacote-semente (roda na máquina dele)
Só o Jonathan faz isto (tem acesso à PROD). Conexão da PROD vem do `.env.production.local`.
```bash
# 1) dump dos dados do app (só leitura na PROD)
PGHOST=72.60.55.140 PGPORT=5543 PGUSER=postgres PGPASSWORD=<senha do .env.production.local> PGDATABASE=postgres \
  pg_dump -n alissonerp -n crm -n public --no-owner --no-privileges -Fc -f ~/alissonerp-seed/erp_data.dump
# 2) auth (users+identities) — exportar do LOCAL já montado (ou da PROD), só colunas não-geradas:
#    \copy (select <cols is_generated=NEVER> from auth.users) to 'auth_users.csv' csv header   (idem identities)
```
Zipar `~/alissonerp-seed/` e compartilhar. Re-gerar quando os dados ficarem velhos.
