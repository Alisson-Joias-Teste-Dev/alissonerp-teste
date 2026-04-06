---
name: Migração 360° — fabricaAJ como ERP master
description: Plano completo de migração de 8 sistemas (Admin Site, Tiny, n8n, Asana, WooCommerce, Kommo, Moura) para o fabricaAJ como sistema central. 79 workflows n8n analisados.
type: project
---

# Migração Total para fabricaAJ (v2.0)

**Data:** 2026-03-31 | **Autor:** JonJon | **Objetivo:** fabricaAJ vira ERP 360° master. Tiny vira espelho passivo até desligamento.

**Why:** 8 sistemas paralelos causam inconsistências, bugs e dependências frágeis. n8n é a "cola" que os une mas é ponto único de falha. fabricaAJ já tem a estrutura — basta absorver os fluxos.

**How to apply:** Todo novo módulo deve ser planejado dentro do roadmap de fases abaixo. Checar se substitui algum workflow n8n listado.

---

## 8 Sistemas — Decisão Final

| Sistema | Status | Decisão |
|---------|--------|---------|
| fabricaAJ | ✅ Ativo v2.14.x | MASTER — absorve tudo |
| Admin Site Evolury | ✅ Ativo | ELIMINAR → PDV no fabricaAJ (Fase 1) |
| Tiny ERP | ✅ Ativo | ESPELHO passivo → desligar no corte |
| n8n (79 workflows, 44 ativos) | ✅ Ativo | ABSORVER lógica por fase |
| Asana | ⚠️ Parcial | ELIMINAR → módulo tarefas interno (Fase 4) |
| WooCommerce | ✅ Ativo | MANTER com sync fabricaAJ→WooCommerce |
| Kommo CRM | ✅ Ativo | MANTER sync leve de leads |
| Moura RFID | ❌ Inativo | ELIMINAR — morto |

**Telegram:** ELIMINAR → notificações internas já existem na tabela notificacoes.

---

## Fases de Migração

| Fase | Escopo | Prioridade |
|------|--------|-----------|
| F0 | Preparação + análise ✅ | CONCLUÍDA |
| F1 | Módulo Comercial / PDV (substitui Admin Site) | 🔴 ALTA — começa agora |
| F2 | Estoque Comercial (inverte master Tiny→fabricaAJ) | 🔴 ALTA |
| F3 | Financeiro (contas pagar/receber, OFX) | 🟡 MÉDIA |
| F4 | Tarefas (substitui Asana) | 🟡 MÉDIA |
| F5 | Integrações diretas (WooCommerce, Kommo, cotações, Tiny sync) | 🟡 MÉDIA |
| F6 | Fiscal / NF-e | 🟡 MÉDIA |
| F7 | Relatórios consolidados | 🟢 BAIXA |
| F8 | Cutover — desliga tudo | 🔵 FUTURO |

---

## Fase 1 — Módulo Comercial/PDV (sprints)

| Sprint | Escopo |
|--------|--------|
| 1.1 | Migration: tabelas clientes, vendas, itens_venda, metas, comissoes, formas_pagamento |
| 1.2 | API + migração public.contatos → alissonerp.clientes |
| 1.3 | Página /vendas — listagem, filtros, tabs consultora/admin |
| 1.4 | Página /vendas/nova — form completo (cliente + produtos + pagamento + frete + ordens) |
| 1.5 | POST /api/vendas/processar — transação atômica (corrige bug admin site sem BEGIN/COMMIT) |
| 1.6 | POST /api/vendas/[id]/enviar-tiny — replica venda pro Tiny (substitui 3 workflows n8n) |
| 1.7 | Ficha técnica 13 tipos — replicar schemas Zod do admin site |
| 1.8 | Link público + PDF orçamento |
| 1.9 | Metas + Ranking + Dashboard comercial |
| 1.10 | Dual-run com consultoras |
| 1.11 | Cutover: desligar admin site |

---

## n8n — Workflows que PODEM ser desligados AGORA

1. **Auditoria Controle de produção** — webhook vazio, 1 node, sem lógica
2. **Importação de Estoque P/Moura** — Moura RFID inativo
3. **Sistema de Auditoria** — depende do Moura (inativo)
4. **35 workflows inativos** — todos podem ser deletados

---

## Decisões Pendentes do Jonathan (D1-D4)

| # | Decisão | Opções |
|---|---------|--------|
| D1 | NF-e | API externa (Focus/Nuvem Fiscal) ⭐ ou manter Tiny só pra NF |
| D2 | Financeiro OFX | Usa upload de extrato bancário? |
| D3 | EvoAPI → Bitrix24 | Usa WhatsApp Business + Bitrix24? |
| D4 | Funcionalidades Tiny | O que você REALMENTE abre no Tiny no dia a dia? |

---

## Técnicas do n8n a Replicar

### Deduplicação financeiro
Hash MD5 de campos-chave → compara com hash no DB → só faz upsert se hash mudou.

### Cotações (workflow "Cotação P/SUPABASSE")
```javascript
XAU_BRL_por_grama = (rates.BRL / rates.XAU) / 31.1034768  // onça troy → grama
USD_BRL = rates.BRL / rates.USD
```
Fonte: Fixer.io, 2x ao dia (11h e 17h). Já existe no fabricaAJ — confirmar mesma API key.

### SKU variação
```javascript
sku.replace(/\d+$/, (n) => (parseInt(n) + 1).toString().padStart(n.length, '0'))
// FP1037-001 → FP1037-002
```
Já existe parcialmente em erp_produtos.

### Formato venda → Tiny
```
POST https://api.tiny.com.br/public-api/v3/pedidos
Auth: OAuth2 (credencial "TINY ALISSON LOJA" — precisa renovar token)
```

---

## Riscos Críticos

| Risco | Severidade | Mitigação |
|-------|-----------|-----------|
| 57 workflows tocam Tiny — desligar n8n antes de ter substituto quebra operação | 🔴 | Desligar workflow por workflow, apenas após fase concluída |
| Admin site sem transação atômica nas vendas | 🔴 | Corrigir com BEGIN/COMMIT no fabricaAJ |
| OAuth2 Tiny pode expirar | 🟡 | Absorver token refresh na API route |
| WooCommerce depende de n8n — desligar antes de F5 quebra loja online | 🟡 | F5 antes de F8 |
| Dual-run estoque gera dois masters temporariamente | 🟡 | Inversão atômica: fabricaAJ vira master E começa a empurrar pro Tiny no mesmo deploy |
