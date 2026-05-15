# Runbook: Rollback de Migration

**Módulo:** Database / Migrations  
**Severidade:** Alta (pode afetar funcionalidade ou dados)  
**Tempo estimado:** 15–45 min

---

## Quando Usar

- Migration aplicada causou erro de runtime
- Função SQL alterada se comporta incorretamente
- Schema adicionado quebrou queries existentes
- Necessidade de testar reversão antes de nova tentativa

---

## Regra de Ouro

**NUNCA fazer rollback em produção sem testar em homolog primeiro.**  
**NUNCA usar DROP TABLE ou DROP COLUMN sem backup prévio.**

---

## Passo 1: Tirar Backup Antes de Qualquer Alteração

```bash
# Via WSL — backup do schema alissonerp completo
pg_dump -h 72.60.55.140 -p 5543 -U postgres -d postgres \
  -n alissonerp \
  -Fc \
  -f backup_antes_rollback_$(date +%Y%m%d_%H%M).dump

# Confirmar que o arquivo foi criado
ls -lh backup_antes_rollback_*.dump
```

---

## Tipo 1: Rollback de Função (CREATE OR REPLACE)

Para reverter uma função SQL alterada, basta criar a versão anterior com `CREATE OR REPLACE`.

### Exemplo: Reverter `fn_criar_par_movimentacao` (migration 198)

Se a migration 198 alterou a assinatura ou comportamento da função e precisa ser revertida:

```sql
-- Verificar a versão atual da função
SELECT pg_get_functiondef(oid)
FROM pg_proc
WHERE proname = 'fn_criar_par_movimentacao'
  AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'alissonerp');

-- Restaurar para versão RETURNS void (versão anterior à migration 198)
CREATE OR REPLACE FUNCTION alissonerp.fn_criar_par_movimentacao(
  p_insumo_id INTEGER,
  p_quantidade NUMERIC,
  p_origem_id INTEGER,
  p_destino_id INTEGER,
  p_referencia_id TEXT,
  p_observacao TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql AS $function$
BEGIN
  -- Debito: saída do depósito origem
  INSERT INTO alissonerp.movimentacoes_estoque (
    insumo_id, quantidade, tipo, local_estoque_id, referencia_id, observacao
  ) VALUES (
    p_insumo_id, p_quantidade, 'saida', p_origem_id, p_referencia_id, p_observacao
  );

  -- Crédito: entrada no depósito destino
  INSERT INTO alissonerp.movimentacoes_estoque (
    insumo_id, quantidade, tipo, local_estoque_id, referencia_id, observacao
  ) VALUES (
    p_insumo_id, p_quantidade, 'entrada', p_destino_id, p_referencia_id, p_observacao
  );
END;
$function$;
```

**Regra:** Sempre usar `CREATE OR REPLACE` — nunca `DROP FUNCTION` seguido de `CREATE`.

---

## Tipo 2: Rollback de Schema (ADD COLUMN)

Para reverter adição de coluna que causou problema.

### Exemplo: Reverter migration 200 (`fila_sync_externo.proxima_execucao`)

```sql
-- Verificar se a coluna existe antes de remover
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'alissonerp'
  AND table_name = 'fila_sync_externo'
  AND column_name = 'proxima_execucao';

-- Remover índice associado (se existir)
DROP INDEX IF EXISTS alissonerp.idx_fila_sync_pendente;

-- Remover coluna (IF EXISTS é seguro — não falha se já foi removida)
ALTER TABLE alissonerp.fila_sync_externo
  DROP COLUMN IF EXISTS proxima_execucao;
```

**Regra:** Sempre usar `DROP COLUMN IF EXISTS` — nunca `DROP COLUMN` direto.

---

## Tipo 3: Rollback de Índice

```sql
-- Remover índice específico
DROP INDEX IF EXISTS alissonerp.idx_nome_do_indice;

-- Recriar versão anterior (se necessário)
CREATE INDEX IF NOT EXISTS idx_nome_do_indice
  ON alissonerp.tabela (coluna);
```

---

## Tipo 4: Rollback de Trigger

```sql
-- Desabilitar trigger temporariamente para investigação
ALTER TABLE alissonerp.tabela DISABLE TRIGGER nome_trigger;

-- Reabilitar após resolução
ALTER TABLE alissonerp.tabela ENABLE TRIGGER nome_trigger;

-- Ou remover e recriar versão anterior
DROP TRIGGER IF EXISTS nome_trigger ON alissonerp.tabela;
CREATE TRIGGER nome_trigger
  BEFORE INSERT ON alissonerp.tabela
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_versao_anterior();
```

---

## Tipo 5: Rollback de Dados (UPDATE/DELETE acidental)

Se dados foram alterados incorretamente e há backup disponível:

```bash
# Extrair tabela específica do backup
pg_restore -h 72.60.55.140 -p 5543 -U postgres -d postgres \
  -t alissonerp.nome_tabela \
  --data-only \
  backup_antes_rollback_YYYYMMDD_HHMM.dump
```

**Atenção:** restaurar dados pode violar constraints se houver registros novos dependentes.

---

## Funções na Zona Proibida

As seguintes funções **NUNCA devem ser alteradas sem autorização explícita de Jonathan**:

| Função | Migration | Risco |
|--------|-----------|-------|
| `fn_processar_apontamento_pcp` | 018 | Rastreamento de ouro PCP |
| `fn_processar_transferencia_saida` | 019 | Transferência de metal entre operadores |
| `fn_processar_fechamento_dist` | 020 | Fechamento de distribuição |
| `fn_concluir_protocolo` | — | Protocolo de serviço |
| `fn_processar_auditoria` | — | Auditoria de estoque |
| `fn_criar_servico_from_pcp` | 092 | Criação de serviço via PCP |

Se o rollback envolver qualquer uma dessas funções, **parar e acionar Jonathan imediatamente**.

---

## Verificação Pós-Rollback

```sql
-- Confirmar que a função voltou ao comportamento esperado
SELECT proname, prosrc IS NOT NULL AS tem_codigo
FROM pg_proc
WHERE proname = 'nome_funcao'
  AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'alissonerp');

-- Confirmar que a coluna foi removida (Tipo 2)
SELECT COUNT(*) AS colunas_encontradas
FROM information_schema.columns
WHERE table_schema = 'alissonerp'
  AND table_name = 'nome_tabela'
  AND column_name = 'coluna_removida';
-- Esperado: 0
```

---

## Escalonamento

Acionar **Jonathan Araújo** se:
- Rollback envolve funções da zona proibida
- Restauração de dados é necessária (risco de perda)
- Rollback em produção (nunca fazer sem autorização)
