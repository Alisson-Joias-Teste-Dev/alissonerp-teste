# Runbook: Totais de Metal no PCP Divergentes

**Módulo:** PCP (Planejamento e Controle de Produção)  
**Severidade:** Alta (rastreamento de ouro comprometido)  
**Tempo estimado de resolução:** 10–30 min

---

## Sintoma

- Total de metal no PCP diverge do valor esperado
- Campos `dist_ouro_real`, `dist_ouro_retornou` ou `pmc_ouro` inconsistentes com os apontamentos
- Ourives relatam divergência entre o metal distribuído e o registrado
- Relatório de ouro fecha com diferença

---

## Conceitos Importantes

| Campo | Significado |
|-------|-------------|
| `dist_ouro_real` | Ouro distribuído para o ourives (entrada) |
| `dist_ouro_retornou` | Ouro devolvido após produção |
| `pmc_ouro` | PMC = peso_final - outros - metal_externo (só no PCP) |
| `pmc_quebra` | Quebra calculada = dist_ouro_real - peso_final - pmc_outros |

**Regra crítica:** Quebra só é registrada quando `total_metal > 0`. Se `dist_ouro_real = 0`, não há quebra.

---

## Diagnóstico

```sql
-- 1. Identificar PCPs com divergência entre campo armazenado e soma dos apontamentos
SELECT
  p.id,
  p.dist_ouro_real AS armazenado,
  p.pmc_ouro,
  COALESCE(SUM(
    CASE WHEN a.tipo_apontamento_id IN (1, 2) THEN a.qtd ELSE 0 END
  ), 0) AS soma_entrada_calculada,
  ABS(p.dist_ouro_real - COALESCE(SUM(
    CASE WHEN a.tipo_apontamento_id IN (1, 2) THEN a.qtd ELSE 0 END
  ), 0)) AS diferenca
FROM alissonerp.pcp p
LEFT JOIN alissonerp.apontamentos_pcp a ON a.pcp_id = p.id
GROUP BY p.id, p.dist_ouro_real, p.pmc_ouro
HAVING ABS(p.dist_ouro_real - COALESCE(SUM(
  CASE WHEN a.tipo_apontamento_id IN (1, 2) THEN a.qtd ELSE 0 END
), 0)) > 0.01
ORDER BY diferenca DESC
LIMIT 20;

-- 2. Ver todos os apontamentos de um PCP específico (substituir {pcp_id})
SELECT
  a.id,
  a.tipo_apontamento_id,
  a.qtd,
  a.criado_em,
  a.usuario_id
FROM alissonerp.apontamentos_pcp a
WHERE a.pcp_id = {pcp_id}
ORDER BY a.criado_em;

-- 3. Verificar se há apontamentos duplicados
SELECT tipo_apontamento_id, COUNT(*) AS qtd_registros, SUM(qtd) AS total
FROM alissonerp.apontamentos_pcp
WHERE pcp_id = {pcp_id}
GROUP BY tipo_apontamento_id
HAVING COUNT(*) > 1;

-- 4. Ver movimentações de estoque relacionadas ao PCP
SELECT id, insumo_id, quantidade, tipo, local_estoque_id, criado_em, referencia_id
FROM alissonerp.movimentacoes_estoque
WHERE referencia_id = {pcp_id}::text
  AND tipo IN ('saida', 'entrada')
ORDER BY criado_em;
```

---

## Procedimento de Resolução

### Passo 1: Identificar o PCP divergente

Executar a query de diagnóstico (query 1) e anotar os IDs com diferença > 0.01g.

### Passo 2: Analisar os apontamentos

Para cada PCP divergente, executar a query 2 e verificar:
- Todos os apontamentos esperados estão presentes?
- Há apontamentos duplicados?
- Algum apontamento tem `qtd` incorreto?

### Passo 3: Recalcular via endpoint

```bash
# Recalcular totais de um PCP específico
curl -X POST https://seu-dominio.com/api/pcp/{pcp_id}/recalcular \
  -H "Cookie: sb-access-token=..."
```

Ou via código TypeScript:
```typescript
import { recalcularTotaisPcp } from '@/lib/recalcular-totais-pcp';
await recalcularTotaisPcp(pcpId);
```

### Passo 4: Corrigir apontamento duplicado (se identificado)

```sql
-- ATENÇÃO: só remover duplicata confirmada
-- Identificar o ID do apontamento duplicado antes de executar
-- Fazer backup antes:
-- pg_dump -h 72.60.55.140 -p 5543 -U postgres -d postgres -n alissonerp -t alissonerp.apontamentos_pcp > backup_apontamentos_$(date +%Y%m%d).sql

DELETE FROM alissonerp.apontamentos_pcp
WHERE id = {id_apontamento_duplicado};

-- Recalcular após correção
-- (usar endpoint ou script conforme Passo 3)
```

### Passo 5: Verificar movimentações de estoque

Se os apontamentos estiverem corretos mas o estoque divergir, verificar as movimentações (query 4). O saldo de estoque é calculado via `vw_saldo_estoque` — usar sempre `SUM(saldo)` e nunca `LIMIT 1`.

```sql
-- Verificar saldo atual do insumo (ex.: Ouro 18k = insumo_id 1, deposito_id do ourives)
SELECT deposito_id, SUM(saldo) AS saldo_total
FROM alissonerp.vw_saldo_estoque
WHERE insumo_id = 1
GROUP BY deposito_id;
```

---

## Zonas Proibidas

**NUNCA alterar diretamente:**
- `fn_processar_apontamento_pcp` (migration 018)
- `fn_processar_transferencia_saida` (migration 019)

Qualquer alteração nestas funções requer autorização explícita de Jonathan.

---

## Rollback

Se o recálculo piorar o estado:
1. Parar imediatamente
2. Restaurar `dist_ouro_real` / `pmc_ouro` com os valores do backup
3. Acionar Jonathan para investigação conjunta

---

## Escalonamento

Acionar **Jonathan Araújo** com:
- IDs dos PCPs divergentes
- Tabela comparando valor armazenado vs soma calculada
- Apontamentos completos do PCP (output da query 2)
- Horário em que a divergência foi detectada
