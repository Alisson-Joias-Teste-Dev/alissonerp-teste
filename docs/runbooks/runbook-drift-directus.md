# Runbook: Drift entre Directus e Alisson ERP

**Módulo:** Integração Legado / Directus  
**Severidade:** Média (dado exibido incorretamente)  
**Tempo estimado:** 10–20 min diagnóstico + ação coordenada

---

## Contexto

O `directus.*` é o sistema legado e é **somente-leitura** no contexto do ERP atual (`fabricaAJ`). Qualquer divergência entre `directus.ordens` e `alissonerp.ordens` deve ser corrigida **no Directus** (via painel admin do Directus), nunca no schema `alissonerp` de forma direta que sobrescreva dados do Directus.

---

## Sintoma

- Ordem aparece com status diferente no ERP vs no painel Directus
- Campo `situacao`, `status` ou `rota` divergem entre sistemas
- Usuário vê dado desatualizado em tela que lê do Directus

---

## Diagnóstico

```sql
-- 1. Verificar se existe view de drift (criada em algumas versões)
SELECT table_name
FROM information_schema.views
WHERE table_schema = 'alissonerp'
  AND table_name LIKE '%drift%';

-- 2. Se existir: usar a view
SELECT * FROM alissonerp.mv_drift_directus
ORDER BY id
LIMIT 20;

-- 3. Alternativa manual: comparar situacao entre os sistemas
SELECT
  d.id,
  d.situacao       AS dir_situacao,
  a.situacao       AS ali_situacao,
  d.status         AS dir_status,
  d.updated_at     AS dir_updated_at
FROM directus.ordens d
LEFT JOIN alissonerp.ordens a ON a.id = d.id
WHERE d.situacao != a.situacao::text
   OR d.status != a.status::text
ORDER BY d.updated_at DESC
LIMIT 20;

-- 4. Verificar ordens que existem no Directus mas não no ERP
SELECT d.id, d.situacao, d.status, d.tipo_ordem, d.created_at
FROM directus.ordens d
LEFT JOIN alissonerp.ordens a ON a.id = d.id
WHERE a.id IS NULL
ORDER BY d.created_at DESC
LIMIT 20;

-- 5. Verificar ordens que existem no ERP mas não no Directus
SELECT a.id, a.situacao, a.status, a.criado_em
FROM alissonerp.ordens a
LEFT JOIN directus.ordens d ON d.id = a.id
WHERE d.id IS NULL
ORDER BY a.criado_em DESC
LIMIT 20;
```

---

## Legenda de Valores Legados (Directus)

| Campo | Valor | Significado |
|-------|-------|-------------|
| `situacao` | `"1"` | Cancelado |
| `situacao` | `"2"` | Criado |
| `situacao` | `"3"` | Rascunho |
| `status` | `"1"` | Aguardando |
| `status` | `"2"` | Em Andamento |
| `status` | `"3"` | Concluído |
| `rota` | `"1"` | PCP |
| `rota` | `"2"` | Protocolo |
| `tipo_ordem` | `"1"` | Serviço |
| `tipo_ordem` | `"2"` | Fabricação |
| `tipo_ordem` | `"3"` | Rep. Venda |
| `tipo_ordem` | `"4"` | Rep. Loja |
| `tipo_ordem` | `"5"` | Compra |
| `tipo_ordem` | `"6"` | Garantia |
| `tipo_ordem` | `"7"` | Serv. Interno |

---

## Ação por Tipo de Drift

### Caso 1: Status diferente (mais comum)

Drift de `situacao` ou `status` geralmente indica que uma ação foi feita em apenas um dos sistemas.

**Verificar qual sistema está correto:**
```sql
-- Ver histórico de alterações na ordem (se existir log)
SELECT *
FROM alissonerp.audit_log
WHERE entidade = 'ordens' AND entidade_id = {ordem_id}
ORDER BY criado_em DESC
LIMIT 10;
```

**Ação:**
- Se o Directus está desatualizado → corrigir no painel admin do Directus
- Se o ERP está desatualizado → verificar se o trigger/sync falhou e reprocessar

### Caso 2: Ordem existe no Directus, não no ERP

Pode indicar que a ordem foi criada no Directus mas o processo de importação/sync falhou.

**Verificar se há job de importação:**
```sql
SELECT *
FROM alissonerp.fila_sync_externo
WHERE acao = 'importar_ordem'
  AND status IN ('falha_definitiva', 'pendente')
ORDER BY criado_em DESC
LIMIT 10;
```

Se não houver fila de importação, acionar Jonathan — a ordem precisa ser criada manualmente no ERP ou o processo de sincronização precisa ser revisado.

### Caso 3: Ordem existe no ERP, não no Directus

Ordem criada diretamente no ERP (nova arquitetura). Verificar se isso é esperado pelo fluxo atual.

---

## Regra Crítica

**`directus.*` é READONLY para o ERP.** O código da aplicação (`src/app/api/`) nunca faz INSERT/UPDATE/DELETE em tabelas do schema `directus`. Se uma tela precisa exibir dado do Directus, apenas lê — nunca escreve.

Se for necessário corrigir um dado no Directus:
1. Usar o painel admin do Directus diretamente
2. Ou acionar Jonathan para executar o UPDATE diretamente no servidor

---

## Verificação de Acesso Read-Only

```sql
-- Confirmar que o usuário da aplicação não tem permissão de escrita no Directus
SELECT grantee, table_schema, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'directus'
  AND grantee = 'postgres'
  AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE');
-- Idealmente: zero linhas retornadas
```

---

## Escalonamento

Acionar **Jonathan Araújo** se:
- Drift afeta ordens em produção com impacto para clientes
- Necessidade de corrigir dado diretamente no Directus
- Drift sistemático (muitas ordens com divergência ao mesmo tempo)
- Drift em campos financeiros (`peso_metal_negocido`, valores de ordem)

**Nota sobre typo legado:** O campo `directus.ordens.peso_metal_negocido` tem typo proposital (sem o "a") — assim está na origem e deve ser referenciado exatamente assim no código.
