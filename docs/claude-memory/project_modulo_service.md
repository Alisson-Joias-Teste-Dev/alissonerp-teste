---
name: Módulo Service v2.15.0
description: Tabela servicos, flag is_operador_service, bucket service-fotos, 10 API routes /api/service/*, 3 componentes mobile dark-theme + Transferência Service (peça de produção → operador externo)
type: project
---

Implementado em 26/03/2026 (base) — v2.15.0 adicionou Transferência Service em 31/03/2026.

**Why:** Operadores (ourives/banca) precisam de app mobile dedicado para receber, concluir e transferir serviços de joalheria sem acessar o ERP desktop. Transferência Service permite enviar peça de produção (PCP) para operador externo e devolver ao pote.

**How to apply:** Ao trabalhar com serviços, usar tabela `alissonerp.servicos`. Acesso controlado por flag `is_operador_service` (independente do role). Serviços com `transferencia_service_id NOT NULL` = vieram de transferência de fábrica → botão Devolver, não Concluir.

---

## Tabela alissonerp.servicos

Colunas principais:
```
id, ordem_id, pcp_id, operador_id (deposito_id), tentativa
peso_entrada, peso_saida (NUMERIC)
usou_solda (BOOLEAN), peso_fio_antes, peso_fio_depois, consumo_solda (NUMERIC)
colocou_pedra (BOOLEAN), pedras_colocadas (JSONB)
status VARCHAR: 'aguardando' | 'em_servico' | 'concluido' | 'reprovado' | 'devolvido'
foto_recebimento, foto_conclusao, foto_fio_solda (TEXT, URLs Storage)
recebido_em, concluido_em (TIMESTAMPTZ), concluido_por (UUID)
transferencia_service_id INTEGER FK → transferencias_ordem  ← NOVO v2.15.0
created_at
```

**Trigger:** `trg_criar_servico_from_pcp` — AFTER INSERT on `alissonerp.pcp` para ordens tipo serviço → cria linha em servicos com status='aguardando'. NÃO dispara para tipo 'fabricacao'.

---

## Tabela alissonerp.transferencias_ordem — Novas colunas v2.15.0

```
tipo_transferencia VARCHAR(20) DEFAULT 'interna'  -- 'interna' | 'service'
protocolo_id INTEGER FK → protocolos               -- protocolo ida associado
deposito_origem_id INTEGER FK → depositos          -- quem enviou a peça
```

Trigger `fn_processar_transferencia` (migration 019): guard `IF setor_id IS NULL THEN RETURN NEW` — inserir com `setor_id=NULL` bypassa o trigger (usado em transferências service e internas de service).

---

## Flag is_operador_service

```sql
ALTER TABLE alissonerp.usuarios ADD COLUMN IF NOT EXISTS is_operador_service BOOLEAN DEFAULT false;
```

- Independente do role — qualquer usuário pode ser marcado como operador service
- Exposto em `/api/user/permissoes` como `is_operador_service`
- Disponível em `useAuth()` como `isOperadorService: boolean`
- Toggle na UI: `UserEditDrawer.tsx` (admin-only)
- PATCH via `/api/user/[id]` (admin-only)

---

## Bucket Storage

`service-fotos` — público

Paths usados:
- `service/{servicoId}/conclusao-{timestamp}.jpg` — foto da peça na conclusão
- `service/{servicoId}/fio-solda-{timestamp}.jpg` — foto do fio de solda
- `service/{servicoId}/devolucao-{timestamp}.jpg` — foto devolução service
- `service/{servicoId}/fio-devolucao-{timestamp}.jpg` — foto fio na devolução
- `service/{protocoloId}/recebimento-transf-{timestamp}.jpg` — recebimento transferência

---

## API Routes /api/service/*

```
GET  /api/service/pendentes        — protocolos pendentes c/ ordens serviço (operador ou fullAccess)
POST /api/service/receber          — conclui protocolo ida via SQL direto (bypassa role check)
GET  /api/service/meus             — serviços em_servico/aguardando do operador logado (+transferencia_service_id, deposito_origem_nome)
POST /api/service/[id]/concluir    — conclui serviço: IA peso + upload fotos + movimentos estoque + tx
POST /api/service/[id]/transferir  — transfere para outro operador (UPDATE servicos+pcp+ordens)
POST /api/service/[id]/devolver    — NOVO: operador service devolve peça ao Pote (dep=1) + protocolo volta
GET  /api/service/solda-saldo      — saldo fio ouro (insumo_id=1) do depósito do operador
GET  /api/service/painel           — visão gerencial com filtros (ROLES_SERVICE_PANEL ou fullAccess)
GET  /api/service/operadores       — lista operadores service (is_operador_service=true) + qtd_servicos
```

### Detalhes críticos

**devolver — fluxo da transação:**
1. SM movement (Saída Metal) — consumo_solda se usou_solda
2. TED dupla: saída do operador → entrada no Pote (dep=1) — NUNCA volta para deposito_origem
3. registrarQuebra(tipo='devolucao_service')
4. QUEBRA_PCP CE para residual (ouroRecebido − ouroDevolver)
5. INSERT protocolos volta (direcao='volta') + protocolo_ordens
6. UPDATE servicos (status='devolvido', foto_conclusao, concluido_em)

**REGRA buscarOuroRecebido:** sempre chamar ANTES de criar novas CEs. Retorna saldo líquido (entradas−saídas).

---

## API Routes /api/pcp/transferir-service/* (NOVO v2.15.0)

```
POST /api/pcp/transferir-service         — gerente_fabrica/pcp inicia transf. para operador service
POST /api/pcp/transferir-service/receber — operador service recebe peça via protocolo
```

### transferir-service — fluxo:
1. Valida PCP em etapas permitidas (novas_ordens, em_andamento, aguardando)
2. Valida destino tem `is_operador_service=true`
3. Calcula saldo ouro via `buscarOuroRecebido` (ANTES das CEs)
4. Transação: INSERT transferencias_ordem (tipo='service', deposito_origem_id), CEs TED (se ouro>0), INSERT protocolos (ida, pendente, tipo='fabrica'), INSERT protocolo_ordens, UPDATE transferencia SET protocolo_id, UPDATE pcp (deposito_id+etapas), UPDATE ordens (local_atual)

### receber — fluxo (lida com trigger fn_concluir_protocolo):
1. Valida protocolo: direcao='ida', etapas='pendente'
2. Valida transferencias com tipo='service' para este protocolo
3. Captura PCPs originais ANTES de concluir protocolo
4. Transação: UPDATE protocolos etapas='concluido' (dispara fn_concluir_protocolo → cria PCP duplicado)
5. Para cada ordem: encontra PCP duplicado (novas_ordens, mais recente, id != original) → DELETE servicos do dup → DELETE pcp dup → DELETE saida_ordem dup
6. INSERT servicos (pcp_id=original, operador_id=caller.deposito_id, status='em_servico', transferencia_service_id)

---

## Front-end — Componentes

### src/components/service/ServiceApp.tsx
- Views: meus (default), receber, concluir, transferir, **devolver** (NOVO), + camera
- ServicoMeu interface inclui `transferencia_service_id`, `deposito_origem_nome`
- Card: badge "Da fabrica (nome)" quando `transferencia_service_id != null`
- Botão Devolver (gold) para serviços com transferencia_service_id; Transferir para demais
- View devolver: peso saida + foto IA + usou_solda + fio → `handleDevolver()` → POST /api/service/[id]/devolver

### src/components/forms/TransferenciaPCPModal.tsx
- Toggle pills "Interna / Service" no início do formulário
- Modo Service: select de operadores service (/api/service/operadores) + info sobre protocolo automático
- Modo Interna: comportamento inalterado (depositos, setor, insumos, foto)
- Submit bifurca: service → POST /api/pcp/transferir-service; interna → POST /api/pcp/transferir

### src/components/KanbanClient.tsx
- Badge "Na service" (laranja) em cards com `pcp.na_service=true`
- `pcp.na_service` vem via EXISTS subquery em pcp/page.tsx

### src/components/forms/PCPDetalheModal.tsx
- Seção "Na service externa" (laranja) quando `detalhe.service_servico_id != null`
- Mostra: operador, status (em_servico/aguardando/devolvido), data recebimento
- Campos da API: `service_servico_id`, `service_status`, `service_operador_nome`, `service_recebido_em`

---

## DashboardShell.tsx — detecção Service

```typescript
// Ordem de detecção:
// 1. loading → spinner
// 2. pathname === '/service' && isOperadorService → ServiceLayout + ServiceApp
// 3. demais → layout ERP normal
```

Rota: `src/app/(dashboard)/service/page.tsx` — retorna null (DashboardShell faz o render real)

---

## Permissões

```typescript
// src/lib/roles.ts
export const ROLES_SERVICE_PANEL = ["admin", "desenvolvedor", "gerente_fabrica", "gerente_loja"];
```

- `/api/service/operadores`: is_operador_service || fullAccess || gerente_fabrica || pcp || gerente_loja
- `/api/pcp/transferir-service`: ROLES_PERMITIDOS = ["admin", "desenvolvedor", "gerente_fabrica", "pcp"]
- `/api/pcp/transferir-service/receber`: is_operador_service || fullAccess
- `/api/service/[id]/devolver`: is_operador_service || fullAccess
