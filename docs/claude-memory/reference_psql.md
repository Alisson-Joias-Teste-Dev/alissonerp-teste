---
name: psql e conexão DB
description: Localização do psql no Windows e como conectar ao banco via shell
type: reference
---

## psql no Windows

**Binário:** `C:\Program Files\pgAdmin 4\runtime\psql.exe`

**Conexão via PowerShell (funciona):**
```powershell
$env:PGPASSWORD = '<senha do .env.local → DATABASE_URL>'
& 'C:\Program Files\pgAdmin 4\runtime\psql.exe' -h '72.60.55.140' -p 5543 -U 'postgres' -d postgres -c "SELECT ..."
```

**Conexão Supabase pooler NÃO funciona** do shell (DNS restrito para supabase.co).
Usar sempre o IP direto: `72.60.55.140:5543` com credenciais do `.env.local` → `DATABASE_URL`.

**Bash shell (WSL/Git Bash):** `psql` não está no PATH — usar via `powershell.exe -NonInteractive -Command`.
