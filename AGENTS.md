# House Rules

⚠️ **NUNCA alterar nada no código, banco ou arquivos sem aprovação explícita do usuário.** Mesmo em modo build, qualquer modificação precisa de autorização verbal prévia.

## Todo código novo ou alterado DEVE ser comentado com a regra de negócio

Qualquer arquivo modificado precisa conter comentários explicando:
- **O que** o trecho faz
- **Por que** foi implementado daquela forma (a regra de negócio por trás)
- **Impacto** se for alterado ou removido (o que vai quebrar)

Comentários devem ser em português, no padrão do projeto. Use `//` para one-liners e `/** */` para blocos de documentação no topo de funções/arquivos. Se uma lógica está documentada no `AGENTS.md`, referencie a seção relevante (ex: `// REGRA DE OURO #4`).

# Database Access Rules

O banco de dados da Alisson Joias (schema `alissonerp`) é **PROTEGIDO**.

## Quem pode tocar no banco

Apenas o agente **dba-alisson** (`.opencode/agent/dba-alisson.md`) tem permissão irrestrita para executar SQL.

## O que fazer quando precisar de dados do banco

1. Delegue para o agente **dba-alisson** usando a Task tool com `subagent_type: "dba-alisson"`
2. O agente dba-alisson vai executar a consulta e trazer o resultado
3. Se o resultado for uma consulta (SELECT): ele executa direto
4. Se for modificação (INSERT/UPDATE/DELETE/CREATE): ele apresenta o Plano de Aprovação

## O que NÃO fazer

- NÃO execute `psql` — o sistema de permissões vai te perguntar e o usuário deve negar
- NÃO execute `pg_dump` — mesma coisa
- NÃO use `node -e "require('pg')..."` ou `import postgres` para conectar no banco — o sistema de permissões vai te perguntar e o usuário deve negar
- NÃO tente instalar `postgresql-client` — não há permissão sudo

## Por quê

O banco é a **fonte única da verdade** da Alisson Joias. Dados de produção de ouro, pedras, ordens, financeiro — qualquer erro custa dinheiro real. Apenas o agente DBA especializado (dba-alisson) tem o protocolo correto de aprovação e verificação anti-duplicação.

Se o agente dba-alisson não estiver disponível na Task tool, peça autorização EXPLÍCITA ao usuário antes de qualquer SQL.

# Módulo Crediário — Blindagem

Este módulo foi reconstruído em 21/05/2026 por Jonathan + AI. **Tudo aqui é sensível — qualquer alteração não autorizada pode quebrar a baixa de pagamentos, o split de crédito ou o saldo do gerente.**

## Arquitetura do módulo

```
src/app/api/crediario/
  [id]/route.ts              → GET detalhe (conta + comunicações + ouro)
  [id]/registrar-pagamento/route.ts  → POST baixa manual (Dinheiro, Cartão, Pix, Ouro, VT)
  [id]/verificar-mp/route.ts         → POST baixa com verificação Mercado Pago
  [id]/comunicacao/route.ts          → POST adicionar observação
  saldo/route.ts             → GET saldo do gerente
  aging-cron/route.ts        → POST/GET automação diária de cobrança
  route.ts                   → GET lista de contas (paginada)

src/app/(dashboard)/crediario/
  page.tsx                   → SSR — pré-carrega dados
  CrediarioClient.tsx        → Client — lista, filtros, drawer de detalhe + baixa

src/lib/
  saldo-credito.ts           → Gerenciamento saldo rotativo (SELECT FOR UPDATE)
  vendas-credito-aprovar.ts  → Aprovação em cascata (gerente → diretor)

src/app/api/vendas/[id]/pagamentos/[pagId]/confirmar/route.ts  → Confirmação inline na venda
src/app/api/storage/[bucket]/[...path]/route.ts                 → Proxy de fotos (ouro)
```

## Regras de ouro (NÃO QUEBRAR)

### 1. Toda baixa de "A Receber" DEVE devolver o saldo ao gerente
Se `credito_gerente_usado > 0` na venda, a baixa precisa:
- Chamar `creditarSaldo()` com o valor pago
- Dar `UPDATE vendas_erp SET credito_gerente_usado = GREATEST(credito_gerente_usado - valor, 0)`
- Registrar em `saldo_credito_loja`

### 2. NUNCA confirmar pagamento "A Receber" sem tocar em contas_receber
O endpoint `confirmar/route.ts` e `registrar-pagamento/route.ts` SEMPRE devem:
- Marcar `contas_receber.situacao = 'pago'`
- Se pagamento parcial: criar nova `contas_receber` com o restante
- Registrar em `comunicacoes_crediario` com a forma de recebimento

### 3. Sempre popular o campo `gateway` do pagamento com a forma de recebimento
O frontend (`VendaDetalheClient.tsx:2573`) renderiza `via {gateway}`. Se o campo ficar nulo, o card de pagamento "A Receber" não mostra como foi pago.
Formas válidas (mesmas de `FORMAS_PAGAMENTO_BASE` em `PagamentoForm.tsx`):
- `"Dinheiro"`, `"Cartão de Crédito"`, `"Pix"`, `"Ouro"`, `"Vale-Troca"`, `"Manual (MP)"`

### 4. Fotos de ouro são obrigatórias e devem ser visíveis
- Upload via `pagamento-fotos` bucket (Supabase Storage)
- Path: `pagamentos/{venda_id}/{timestamp}.{ext}` (venda) ou `crediario/{conta_id}/{timestamp}.{ext}` (crediário)
- Exibição usa `getPublicUrl("pagamento-fotos", path)` → proxy `/api/storage/pagamento-fotos/...`
- Proxy usa `NEXT_PUBLIC_SUPABASE_ANON_KEY` (NÃO `SUPABASE_SERVICE_ROLE_KEY` — está quebrada)
- `pagamento-fotos` NÃO está em `BUCKETS_FULL_ACCESS` — qualquer autenticado vê a foto

### 5. Ouro no pagamento: campos obrigatórios
Quando `forma_recebimento === "Ouro"`:
- `ouro_peso` (numeric, > 0)
- `ouro_valor_grama` (numeric, > 0)
- `ouro_foto_path` (string, path no bucket)
- Valor pago = `ouro_peso * ouro_valor_grama` (calculado, não digitado)

### 6. Fluxo de split (pagamento parcial)
Se `valor_pago < valor_total`:
1. Atualiza `contas_receber` original: `valor = valor_pago, situacao = 'pago'`
2. Cria nova `contas_receber`: `valor = valor_restante, situacao = 'pendente'`
3. Atualiza `pagamentos_venda` original: `valor = valor_pago, status = 'confirmado'`
4. Cria novo `pagamentos_venda`: `forma = 'A Receber', valor = valor_restante, status = 'pendente'`
5. Devolve saldo proporcional ao gerente (`Math.min(valor_pago, credito_gerente_usado)`)

### 7. A view `vw_crediario` é a fonte única para listagem
Qualquer alteração em `contas_receber` ou `pagamentos_venda` que afete o crediário precisa manter compatibilidade com esta view.

## O que NUNCA fazer

- ❌ Remover `contas_receber` sem cancelar (usar `UPDATE situacao = 'cancelado'`)
- ❌ Dar baixa manual sem devolver saldo ao gerente
- ❌ Alterar a lista de `FORMAS_PAGAMENTO_BASE` em `PagamentoForm.tsx` sem sincronizar com `CrediarioClient.tsx` e `VendaDetalheClient.tsx`
- ❌ Mudar o formato do path de upload de fotos sem atualizar o proxy de storage
- ❌ Alterar `gateway` do pagamento "A Receber" após confirmação — a UI depende dele
- ❌ Usar `SUPABASE_SERVICE_ROLE_KEY` no proxy de storage — está quebrada, usar `NEXT_PUBLIC_SUPABASE_ANON_KEY`

# Pre-Push Hook Automático

O repositório usa um **pre-push hook versionado** em `.githooks/pre-push`.

## O que faz

Antes de todo `git push`, executa automaticamente:
1. `git fetch origin main`
2. `git merge origin/main --ff-only`

Se falhar (commits locais divergentes), o push aborta.

## Setup para cada dev (necessário uma vez)

```bash
git config core.hooksPath .githooks
```

Isso já está configurado neste ambiente. Em máquinas novas ou novos clones, precisa rodar esse comando.
