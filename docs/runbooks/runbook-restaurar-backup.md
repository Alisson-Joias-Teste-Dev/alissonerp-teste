# Runbook: Restaurar Backup do Banco de Dados

**Módulo:** Database / Disaster Recovery  
**Severidade:** Crítica  
**Tempo estimado:** 30–120 min (depende do tamanho do backup)

---

## Quando Usar

- Dados corrompidos por migration problemática
- DELETE ou UPDATE acidental em tabela crítica
- Schema em estado inconsistente após falha parcial
- Necessidade de restaurar ponto anterior ao incidente

---

## Pré-requisitos

- [ ] Backup disponível (pg_dump ou snapshot do servidor)
- [ ] Acesso ao servidor `72.60.55.140:5543`
- [ ] WSL com `pg_dump` / `pg_restore` / `psql` instalado
- [ ] Autorização de Jonathan para restauração em produção

---

## Passo 0: Avaliar o Escopo

Antes de restaurar, determinar:

1. **Qual tabela/schema foi afetado?**
2. **Quando ocorreu o incidente?** (para selecionar o backup correto)
3. **Restauração parcial ou completa?**
   - Parcial: restaurar apenas tabelas afetadas (menos impacto)
   - Completa: restaurar schema inteiro (mais seguro, mais lento)

---

## Passo 1: Criar Backup do Estado Atual (antes de restaurar)

Mesmo que o estado atual esteja corrompido, sempre salvar antes de sobrescrever:

```bash
# Backup completo do schema alissonerp (WSL)
pg_dump \
  -h 72.60.55.140 \
  -p 5543 \
  -U postgres \
  -d postgres \
  -n alissonerp \
  -Fc \
  -f /tmp/backup_pre_restore_$(date +%Y%m%d_%H%M).dump

echo "Backup criado: $(ls -lh /tmp/backup_pre_restore_*.dump | tail -1)"
```

---

## Passo 2: Gerar Backup de Ponto Anterior (se não disponível)

Se não houver backup do ponto desejado, o servidor Supabase pode ter snapshots:

```bash
# Backup completo em formato SQL (mais portável)
pg_dump \
  -h 72.60.55.140 \
  -p 5543 \
  -U postgres \
  -d postgres \
  -n alissonerp \
  --file=/tmp/backup_$(date +%Y%m%d).sql

# Verificar tamanho e integridade
ls -lh /tmp/backup_$(date +%Y%m%d).sql
head -5 /tmp/backup_$(date +%Y%m%d).sql
```

---

## Passo 3: Restauração Parcial (tabela específica)

**Preferir restauração parcial** para minimizar impacto em dados não afetados.

```bash
# Restaurar apenas uma tabela do backup em formato custom (.dump)
pg_restore \
  -h 72.60.55.140 \
  -p 5543 \
  -U postgres \
  -d postgres \
  --schema=alissonerp \
  -t nome_tabela \
  --data-only \
  --single-transaction \
  /tmp/backup_YYYYMMDD_HHMM.dump

# Verificar se os dados foram restaurados
psql -h 72.60.55.140 -p 5543 -U postgres -d postgres \
  -c "SELECT COUNT(*) FROM alissonerp.nome_tabela;"
```

---

## Passo 4: Restauração Completa do Schema (emergência)

Usar apenas quando a restauração parcial não for suficiente.

```bash
# ATENÇÃO: isso sobrescreve TODOS os dados do schema alissonerp

# Opção A: Restaurar de arquivo .dump (formato custom)
pg_restore \
  -h 72.60.55.140 \
  -p 5543 \
  -U postgres \
  -d postgres \
  --schema=alissonerp \
  --clean \
  --if-exists \
  --single-transaction \
  /tmp/backup_YYYYMMDD_HHMM.dump

# Opção B: Restaurar de arquivo .sql (formato texto)
psql \
  -h 72.60.55.140 \
  -p 5543 \
  -U postgres \
  -d postgres \
  < /tmp/backup_YYYYMMDD.sql
```

---

## Passo 5: Verificação Pós-Restauração

```sql
-- Confirmar integridade das tabelas críticas
SELECT
  'pcp' AS tabela, COUNT(*) AS registros FROM alissonerp.pcp
UNION ALL
SELECT 'movimentacoes_estoque', COUNT(*) FROM alissonerp.movimentacoes_estoque
UNION ALL
SELECT 'apontamentos_pcp', COUNT(*) FROM alissonerp.apontamentos_pcp
UNION ALL
SELECT 'vendas_erp', COUNT(*) FROM alissonerp.vendas_erp
UNION ALL
SELECT 'fila_sync_externo', COUNT(*) FROM alissonerp.fila_sync_externo;

-- Verificar saldo de ouro (não deve ser negativo)
SELECT deposito_id, SUM(saldo) AS saldo_total
FROM alissonerp.vw_saldo_estoque
WHERE insumo_id = 1
GROUP BY deposito_id
ORDER BY deposito_id;
```

---

## Schemas NÃO Restaurar

Os seguintes schemas são **somente-leitura** no ERP e **não devem ser alterados**:

| Schema | Dono | Ação |
|--------|------|------|
| `public` | Supabase/Directus | NUNCA restaurar via ERP |
| `directus` | Sistema legado | NUNCA restaurar via ERP |
| `auth` | Supabase GoTrue | NUNCA restaurar |
| `storage` | Supabase Storage | NUNCA restaurar |

---

## Troubleshooting

### Erro: "role does not exist"
```bash
# Garantir que o role postgres existe
psql -h 72.60.55.140 -p 5543 -U postgres -d postgres \
  -c "SELECT rolname FROM pg_roles WHERE rolname = 'postgres';"
```

### Erro: "constraint violation" durante restauração
A restauração parcial pode violar FKs se tabelas relacionadas estiverem desatualizadas. Nesse caso, restaurar também as tabelas relacionadas ou usar `--disable-triggers` com cuidado.

### Restauração lenta
Processos de restauração grandes (>100MB) podem levar 30+ minutos. Manter a conexão ativa e não interromper.

---

## Escalonamento Imediato

Acionar **Jonathan Araújo** antes de qualquer restauração em **produção**:
- Descrever o incidente (o que aconteceu, quando, quais tabelas)
- Indicar o backup disponível e seu timestamp
- Aguardar autorização antes de executar o Passo 4

**Contato:** jonathan@alissonjoias.com.br  
**Acesso direto:** servidor `72.60.55.140` (Jonathan possui acesso root)
