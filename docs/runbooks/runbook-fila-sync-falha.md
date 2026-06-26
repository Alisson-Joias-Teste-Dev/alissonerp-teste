# Runbook: Falha na Fila de Sincronização com Tiny

**Módulo:** Integração Tiny ERP  
**Severidade:** Alta (venda não aparece no Tiny)  
**Tempo estimado de resolução:** 5–15 min

---

## Sintoma

- Contato ou venda não sincronizou com o Tiny ERP
- Status `tiny_sync_status = 'erro'` em `alissonerp.vendas_erp`
- Item em `alissonerp.fila_sync_externo` com `status = 'falha_definitiva'`
- Usuário relata que venda não aparece no Tiny

---

## Diagnóstico

```sql
-- 1. Ver falhas recentes na fila
SELECT id, sistema, acao, tentativas, ultimo_erro, criado_em
FROM alissonerp.fila_sync_externo
WHERE status = 'falha_definitiva'
ORDER BY criado_em DESC
LIMIT 20;

-- 2. Ver vendas com erro Tiny
SELECT id, numero_venda, tiny_sync_status, tiny_sync_erro, updated_at
FROM alissonerp.vendas_erp
WHERE tiny_sync_status = 'erro'
ORDER BY updated_at DESC
LIMIT 20;

-- 3. Ver itens pendentes ou em retry (não definitivos)
SELECT id, sistema, acao, tentativas, ultimo_erro, proxima_execucao
FROM alissonerp.fila_sync_externo
WHERE status IN ('pendente', 'processando')
ORDER BY criado_em DESC
LIMIT 20;
```

---

## Causas Comuns e Procedimento

### Causa 1: Token Tiny expirado ou inválido

**Identificação:** `ultimo_erro` contém `401` ou `Unauthorized` ou `token inválido`.

**Resolução:**
1. Acessar o ERP → **Configurações > Integrações > Tiny ERP**
2. Clicar em **Reconectar** e seguir o fluxo OAuth
3. Aguardar novo token ser salvo
4. Reprocessar os itens com falha (ver seção Reprocessamento)

---

### Causa 2: Produto sem ID Tiny vinculado

**Identificação:** `ultimo_erro` contém `produto não encontrado` ou `id_tiny null`.

**Resolução:**
1. Identificar o produto pelo `ultimo_erro` (geralmente tem o nome ou SKU)
2. Localizar o produto no Tiny ERP e copiar o ID
3. No ERP → **Produtos** → editar o produto → campo **ID Tiny**
4. Reprocessar os itens com falha (ver seção Reprocessamento)

---

### Causa 3: Rate limit do Tiny (429 Too Many Requests)

**Identificação:** `ultimo_erro` contém `429` ou `rate limit`.

**Resolução:**
1. Aguardar ~5 minutos para o rate limit resetar
2. Reprocessar os itens (o sistema fará retry automático com backoff)

---

### Causa 4: Erro de payload / validação

**Identificação:** `ultimo_erro` contém `400` ou campo obrigatório ausente.

**Resolução:**
1. Analisar o `ultimo_erro` completo para identificar o campo problemático
2. Corrigir o dado no ERP (ex.: CEP inválido, CNPJ incorreto)
3. Reprocessar o item

---

## Reprocessamento

### Via Interface Web (preferido)
1. Acessar `/admin/fila-sync` no ERP
2. Filtrar por status `falha_definitiva`
3. Clicar em **Reprocessar** no item desejado
4. Ou usar **Reprocessar Todos** para falhas em lote

### Via API
```bash
# Reprocessar item específico (substituir {id} pelo ID real)
curl -X POST https://seu-dominio.com/api/admin/fila-sync/{id}/reprocessar \
  -H "Cookie: sb-access-token=..."

# Verificar status após reprocessamento
curl https://seu-dominio.com/api/admin/fila-sync/{id}
```

### Via SQL (emergência — usar com cuidado)
```sql
-- Recolocar item na fila para retry
UPDATE alissonerp.fila_sync_externo
SET status = 'pendente',
    tentativas = 0,
    ultimo_erro = NULL,
    proxima_execucao = NOW()
WHERE id = {id};
```

---

## Rollback

Não há rollback necessário — a fila de sincronização é **idempotente**. Reprocessar um item já sincronizado com sucesso detecta o duplicado via upsert no Tiny e não cria registros duplicados.

---

## Monitoramento Pós-Resolução

```sql
-- Confirmar que o item foi processado com sucesso
SELECT id, status, tentativas, processado_em
FROM alissonerp.fila_sync_externo
WHERE id = {id};

-- Confirmar sync da venda
SELECT id, numero_venda, tiny_sync_status, tiny_sync_erro
FROM alissonerp.vendas_erp
WHERE id = {venda_id};
```

---

## Escalonamento

Se o erro persistir após os procedimentos acima, acionar **Jonathan Araújo** com:
- IDs dos itens com falha
- Conteúdo completo do campo `ultimo_erro`
- Horário das tentativas
