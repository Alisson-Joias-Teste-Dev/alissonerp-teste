# 🏗️ TASK LIST — Conversão de Estoque Comercial

## 📋 Status Geral

| Fase | Tasks | Status |
|------|-------|--------|
| 🔷 FASE 1 — Migration SQL | 1 | ⏳ Pendente |
| 🔷 FASE 2 — APIs | 4 | ⏳ Pendente |
| 🔷 FASE 3 — Frontend | 2 | ⏳ Pendente |
| 🔷 FASE 4 — Parâmetro Global | 1 | ⏳ Pendente |

---

## 🔷 FASE 1 — Migration SQL

### TASK 1: Migration `conversao_estoque.sql` ⏳
- [ ] `ALTER TYPE ... ADD VALUE 'conversao'`
- [ ] Criar tabela `alissonerp.conversoes_estoque`
- [ ] Criar tabela `alissonerp.conversao_itens`
- [ ] Criar função `fn_processar_conversao` (trigger: cria tarefa + movimentações)
- [ ] Criar trigger `trg_criar_tarefa_conversao`
- [ ] Criar função `fn_concluir_protocolo_conversao` (trigger: baixa EC + entrada metal)
- [ ] Criar trigger `trg_concluir_conversao` (roda após fn_concluir_protocolo)
- [ ] Atualizar `vw_ordens_prontas_ida` (UNION ALL para conversao)
- [ ] Atualizar `vw_ordens_completa` (CASE 'conversao')
- [ ] Atualizar `vw_ordens_por_tipo` (CASE 'conversao')
- [ ] Atualizar `vw_ordem_detalhe` (CASE 'conversao')
- [ ] Grants das novas tabelas

---

## 🔷 FASE 2 — API Routes

### TASK 2: API `POST /api/estoque-comercial/converter` ⏳
- [ ] Validar role: `estoquista_loja`, `gerente_loja`, `admin`, `desenvolvedor`
- [ ] Validar payload: array de `{ produto_id, peso_individual, quantidade }`, foto base64
- [ ] Verificar saldo disponível de cada produto
- [ ] Criar ordem tipo 'conversao' (rota='protocolo', situacao='criado', status='aguardando')
- [ ] Criar `conversao_itens` com dados de cada produto
- [ ] Criar movimentações de saída motivo='reservado_conversao' por produto
- [ ] Calcular peso_total = SUM(peso_individual * quantidade)
- [ ] Upload da foto de abertura
- [ ] Criar tarefa de aprovação para Alisson com descrição dos itens
- [ ] Retornar `{ ordem_id, numero_ordem, conversao_id }`

### TASK 3: APIs de Aprovação ⏳
- [ ] `POST /api/tarefas/[id]/conversao/aprovar` — Alisson aprova
  - Atualizar tarefa status='aprovada'
  - Atualizar `conversoes_estoque.status_conversao='aprovado'`
  - Ordem permanece `status='aguardando'` (liberada para protocolo via view)
- [ ] `POST /api/tarefas/[id]/conversao/recusar` — Alisson recusa
  - Atualizar tarefa status='rejeitada'
  - Atualizar `conversoes_estoque.status_conversao='recusado'`
  - Criar movimentações de entrada motivo='recusado_conversao' (devolver ao estoque)
  - Atualizar ordem status='cancelado'
  - Upload da foto de recusa (obrigatória)

### TASK 4: Atualizar APIs Existentes ⏳
- [ ] `POST /api/ordens` — Adicionar 'conversao' em `ALL_TIPOS` + lógica de rota 'protocolo'
- [ ] `GET /api/protocolo/ordens` — Adicionar 'conversao' no filtro fabrica
- [ ] `PATCH /api/protocolo/[protocoloId]` — Aceitar `ordens_detalhes` com foto por ordem conversao
  - Para cada ordem conversao: salvar foto no storage + atualizar `conversao_itens.foto_item`

---

## 🔷 FASE 3 — Frontend

### TASK 5: Componente `ConversaoModal` ⏳
- [ ] Modal de abertura de conversão
- [ ] Seletor de produtos (busca / digita SKU)
- [ ] Inputs dinâmicos: para cada produto → peso_individual + quantidade
- [ ] Exibir peso total calculado automaticamente
- [ ] Campo de foto obrigatória (1 foto geral)
- [ ] Botão "Confirmar Conversão"
- [ ] Tratamento de loading/erro/sucesso

### TASK 6: Botão "Converter" + Alterar `ConcluirProtocoloModal` ⏳
- [ ] Adicionar botão "Converter" no `EstoqueComercialDetalheClient`
- [ ] Alterar `ConcluirProtocoloModal`:
  - Detectar se protocolo contém ordens do tipo 'conversao'
  - Para cada ordem conversao: exibir campos de foto (obrigatória)
  - Enviar `ordens_detalhes: [{ ordem_id, foto_item }]` no PATCH

---

## 🔷 FASE 4 — Parâmetro Global

### TASK 7: Parâmetro `insumo_conversao_padrao` ⏳
- [ ] Criar/configurar parâmetro nos parâmetros do sistema
- [ ] Usar na trigger `fn_concluir_protocolo_conversao` como fallback
- [ ] Usar na API `POST /api/estoque-comercial/converter` como valor padrão

---

## 🟢 Legenda

| Símbolo | Significado |
|---------|-------------|
| ⏳ Pendente | Aguardando implementação |
| 🔄 Em andamento | Sendo implementado agora |
| ✅ Concluído | Task finalizada |
| ❌ Bloqueado | Task depende de outra |
