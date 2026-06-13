# Análise Completa — Módulo de Vendas e Entregas

> **Data:** 11/06/2026 (America/Fortaleza) · **Versão do sistema:** v2.60.2 · **Branch:** homolog
> **Tipo:** Análise pente fino (leitura apenas — NENHUMA alteração de código ou banco foi feita)
> **Autor:** Claude (Fable 5), sob aprovação de plano do Jonathan
> **Método:** exploração por 3 agentes + verificação manual de cada achado na cópia ativa (WSL). Todo problema listado tem evidência `arquivo:linha` confirmada. Achados não confirmados estão na seção 6 (descartados).

---

## 1. Resumo executivo (sem jargão)

O módulo de vendas e entregas é o coração comercial do sistema: registra a venda, separa o estoque, controla pagamento, aprova descontos e crédito, e entrega a joia ao cliente com código de segurança.

**O que está bem feito:**
- A venda nova é criada de forma segura (tudo ou nada — se algo falha no meio, nada fica pela metade).
- O estoque é **reservado** quando o item entra na venda e só **sai de verdade** quando a entrega é confirmada — e isso está protegido contra baixa duplicada.
- O fluxo novo de entregas (códigos A/B, motoboy, WhatsApp) é o pedaço mais bem construído do módulo: transação atômica, trava contra concorrência e auditoria completa.
- Vendas fechadas são blindadas contra edição; descontos acima do limite passam por aprovação.

**O que precisa de atenção (resumo dos problemas):**
1. **Porta aberta nas entregas:** qualquer usuário logado (até motoboy ou ourives) consegue criar, confirmar e concluir entregas de qualquer venda — não há checagem de cargo nem de dono da venda nessas rotas.
2. **Entrega sem pagamento, por dois caminhos com regras diferentes:** mudar a venda para "entregue" pela tela de detalhe exige pagamento completo (ou aprovação formal de exceção). Mas o fluxo de entregas marca a venda como "entregue" **sem olhar o pagamento**. Ou seja: a regra de "só entrega quem pagou" pode ser contornada usando o outro caminho.
3. **Confirmar pagamento não é "tudo ou nada":** são vários passos soltos no banco (confirmar pagamento, devolver crédito do gerente, baixar conta a receber, aprovar/concluir venda). Se o sistema cair no meio, fica meio confirmado, meio não — e os erros do meio são engolidos silenciosamente.
4. **Falta rastreabilidade (quem/por quê/quando):** as operações mais sensíveis de venda — editar, cancelar, aprovar desconto, confirmar pagamento, mexer em itens — **não gravam registro de auditoria**. A regra do projeto exige isso.
5. **Código duplicado perigoso:** a integração com o Tiny e a aprovação de venda existem **duas vezes** (uma na rota, outra na lib). Quando alguém corrigir um lado e esquecer o outro, nasce um bug difícil de achar.
6. Itens menores: telas de análise sem o filtro de período padrão (chips Hoje/Ontem/7d/30d/Mês), dois arquivos de tela antigos mortos, números fixos no código que deviam vir de parâmetros.

**Nada foi corrigido nesta análise.** Cada correção deve virar uma task própria, com plano aprovado (regra §0 do CLAUDE.md). A seção 7 sugere a ordem de ataque.

---

## 2. Como o módulo funciona hoje (fluxo ponta-a-ponta)

### 2.1 Máquina de estados da venda

```
rascunho ──► aprovado ──► enviado ──► entregue ──► concluido
    │                                                  
    └──────────────► cancelado (com cascata nas ordens)
```
- Transições registradas em `vendas_transicoes` por `fn_registrar_transicao_venda` (migration 267).
- Vendas `confirmado/concluido` são blindadas contra edição de itens (migration 114, `fn_proteger_itens_venda_fechada`).
- Campo `bloqueado` trava a venda inteira.

### 2.2 Ciclo de vida completo

```
1. CRIAÇÃO (POST /api/vendas — transação única)
   ├─ INSERT vendas_erp (situacao='rascunho', numero via sequence)
   ├─ INSERT itens_venda_erp
   │   └─ trigger fn_estoque_comercial_baixa_venda:
   │      rascunho/aprovado/enviado → cria RESERVA (reservas_estoque_comercial, status='ativo')
   │      entregue/concluido       → saída direta (caso raro)
   ├─ Verifica saldo em vw_saldo_estoque_comercial: se disponivel < qtd,
   │   NÃO bloqueia — cria ordem de reposicao_venda automaticamente
   ├─ INSERT pagamentos_venda (status='pendente')
   ├─ trigger fn_recalcular_totais_venda atualiza totais
   └─ logAudit ✔ (única rota de vendas com auditoria de app)

2. APROVAÇÕES (rascunho → aprovado)
   ├─ Desconto > limite do usuário (mx_desconto_permitido) → tarefa de aprovação
   ├─ Pagamento "A Receber" → aprovação de crédito do gerente
   ├─ Cartão com desconto >20% → tarefa própria
   └─ Dois caminhos de aprovação (⚠ ver problema C5):
      a) approveVenda() em src/lib/vendas-aprovar.ts (com lock FOR UPDATE)
      b) PATCH /api/vendas/[id] com situacao='aprovado' (lógica inline na rota,
         inclusive envio ao Tiny e registro de ouro upgrade no cofre)
   └─ Aprovação NÃO mexe em estoque (fn_estoque_comercial_aprovar_venda é NOP desde a 267)

3. PAGAMENTO
   ├─ Formas: Dinheiro, Cartão (MP/PagBank/Point), PIX, Ouro (foto+peso),
   │   Vale-Troca, A Receber (crediário)
   ├─ Confirmação: POST .../pagamentos/[pagId]/confirmar
   │   confirma pagamento → devolve crédito gerente → baixa contas_receber
   │   → auto-aprova/auto-conclui a venda (⚠ sem transação — problema C3)
   └─ Vale-troca: lock pessimista FOR UPDATE; vale > valor gera novo vale
      com troco encadeado por vale_origem_id (cada vale usado UMA vez)

4. ENTREGA — fluxo novo "Estoque 2.0" (entregas_venda, migration 285)
   ├─ POST /api/entregas-venda → criarEntrega() (src/lib/entrega-venda.ts)
   │   entrega total ou parcial, frete por região, código A (cliente)
   │   e código B (motoboy), WhatsApp automático
   ├─ POST .../[id]/confirmar (com código) → confirmarEntrega():
   │   TRANSAÇÃO ATÔMICA: efetiva reservas → movimentações de saída →
   │   RFID 'vendido' → marca venda 'entregue' quando tudo foi entregue
   │   └─ o trigger fn_estoque_comercial_entrega_venda não acha mais
   │      reservas ativas → SEM baixa dupla ✔
   └─ logAudit ✔ em criar/cancelar/confirmar (lib exemplar)

4b. ENTREGA — fluxo legado (preparacoes_entrega, tela /entrega)
   └─ PATCH /api/entrega/[entregaId] muda etapas e conclui a ordem
      (⚠ sem role, sem auditoria — problema C1)

4c. ENTREGA — caminho manual (PATCH /api/vendas/[id] situacao='entregue')
   ├─ Exige pagamento 100% confirmado OU exceção aprovada
   │   (entrega-sem-pagamento.ts cria tarefa de aprovação)
   ├─ Bloqueia se ordem de reposição pendente / sob-encomenda sem entrada SLE
   └─ Trigger converte as reservas ativas em saída

5. CONCLUSÃO (→ concluido)
   └─ concluirVenda() marca contas_receber pagas; venda travada

6. DEVOLUÇÃO / VALE-TROCA
   └─ devolucoes_venda (aprovação, retenção %, NFe) → gera vale_troca 'ativo'
```

### 2.3 Permissões (verificado no código)

| Operação | Quem pode |
|---|---|
| Criar venda | desenvolvedor, admin, gerente_fabrica, gerente_loja, consultora |
| Ver/editar venda | consultora só as próprias (`requireVendaOwnership`, Onda 1D/1G) |
| Confirmar pagamento | desenvolvedor, admin, diretor, gerente_fabrica, gerente_loja |
| Cancelar venda | gerentes+; consultora só a própria em rascunho; com apontamento de fábrica, só master |
| Aprovar desconto | admin, desenvolvedor |
| Campos financeiros (cliente, vendedor, data) | admin/dev/diretor; demais abrem solicitação (v2.60.0) |
| **Criar/confirmar entrega (Estoque 2.0)** | **qualquer autenticado** ⚠ |
| **Concluir preparação de entrega (legado)** | **qualquer autenticado** ⚠ |

---

## 3. Mapa do módulo

### 3.1 Banco (schema `alissonerp`)

| Objeto | Papel |
|---|---|
| `vendas_erp`, `itens_venda_erp`, `pagamentos_venda` | núcleo da venda (migration 104) |
| `reservas_estoque_comercial` | reserva pré-entrega (205) |
| `movimentacoes_estoque_comercial` | entradas/saídas efetivadas (107) |
| `entregas_venda`, `entregas_venda_itens` | fluxo novo de entregas (285) |
| `preparacoes_entrega` | fluxo legado de entregas (ligado a ordens) |
| `vale_troca`, `devolucoes_venda` | devoluções e vales (142) |
| `contas_receber`, `comunicacoes_crediario` | financeiro automático (113) |
| `solicitacoes_alteracao` | fluxo de alteração pós-bloqueio (262, v2.60.0) |
| `vendas_transicoes` | log da máquina de estados (267) |
| `vw_saldo_estoque_comercial*`, `vw_entregas_pendentes`, `vw_vendas_erp_completa` | views de leitura |
| Triggers-chave | `fn_estoque_comercial_baixa_venda` (reserva), `fn_estoque_comercial_entrega_venda` (saída na entrega), `fn_venda_gerar_conta_receber`, `fn_proteger_itens_venda_fechada`, `fn_registrar_transicao_venda` |

### 3.2 Backend

| Área | Arquivos |
|---|---|
| Vendas (44 rotas) | `src/app/api/vendas/**` — CRUD, itens, pagamentos, MP/PagBank, aprovações, análises |
| Entregas novas (18 rotas) | `src/app/api/entregas-venda/**` — criar, confirmar, cancelar, motoboy, frete avulso, Correios |
| Entregas legado | `src/app/api/entrega/[entregaId]/route.ts` |
| Libs centrais | `vendas-aprovar.ts` (approveVenda/concluirVenda/sendToTiny), `entrega-venda.ts` (1.9k linhas, exemplar), `vale-troca.ts`, `devolucoes.ts`, `auth-vendas.ts` (ownership), `entrega-sem-pagamento.ts`, `saldo-credito.ts`, `aprovacao-regras.ts`, `audit.ts` |

### 3.3 Frontend

| Tela | Arquivos principais |
|---|---|
| /vendas (lista, com chips de período ✔) | `VendasClient.tsx` (~680 l) |
| /vendas/nova | `NovaVendaClientV2.tsx` (~3.4k l) — **V1 e Legado são código morto** |
| /vendas/[id] | `VendaDetalheClient.tsx` (~4.1k l) |
| /vendas/autorizacoes, /solicitacoes-alteracao | aprovações de desconto/alteração |
| /vendas/analise-comissoes, -frete, -resultado | análises (sem chips de período ⚠) |
| /vendas/ranking, /metas | mês/ano (adequado a metas mensais) |
| /entregas-venda (+ /motoboy) | `EntregasVendaClient.tsx`, `EntregaDetalheDrawer.tsx`, `MarcarEntregaModal.tsx` (~1.9k l) |
| /entrega (legado) | `EntregaClient.tsx` (LIMIT 500 ⚠) |
| /vale-troca | `ValeTrocaClient.tsx` (sem filtro de período ⚠) |
| Pagamento | `src/components/vendas/` — `PagamentoForm`, `CartaoInline`, `MercadoPagoCobranca`, `PagBankCobranca`, PIX, `UpgradeItemFields` |

---

## 4. Problemas confirmados

> Todos verificados na cópia WSL. "Impacto" em linguagem simples.

### 🔴 Críticos

**C1 — Rotas de entrega sem controle de acesso**
- `src/app/api/entrega/[entregaId]/route.ts:16-18` — só `authOr401`, `void user`: **qualquer autenticado** conclui a entrega e marca a **ordem como concluída** (linhas 39-47). Sem role, sem ownership, sem auditoria.
- `src/app/api/entregas-venda/route.ts:229-233` — POST criar entrega: comentário explícito *"qualquer role pode criar entrega"*; sem checagem de dono da venda.
- `src/app/api/entregas-venda/[id]/confirmar/route.ts:60-64` — idem (*"qualquer role autenticada pode confirmar"*). O código A/B mitiga, mas o código fica exposto na resposta do POST de criação para qualquer um que crie a entrega.
- **Impacto:** um ourives/motoboy/consultora pode criar e confirmar entrega de qualquer venda, dando baixa de estoque e fechando ordem. Mínimo privilégio (§0.1) violado.
- **Recomendação:** lista de roles nas 3 rotas + ownership de consultora, padrão `defineRoute`.

**C2 — Entrega sem pagamento total: dois caminhos com políticas diferentes**
- Caminho manual: `src/app/api/vendas/[id]/route.ts:523-583` — mudar para `entregue` exige pagamento 100% confirmado, senão abre tarefa de exceção (`entrega-sem-pagamento.ts`).
- Caminho Estoque 2.0: `src/lib/entrega-venda.ts:14-15` (*"A entrega NÃO depende de pagamento integral"*) e `marcarVendaEntregueSeCompleta` (`entrega-venda.ts:294-330`) — marca `situacao='entregue'` **sem nenhuma checagem financeira nem de exceção aprovada** (zero menções a pagamento/exceção na lib).
- **Impacto:** a regra "só entrega quem pagou" (e todo o fluxo de aprovação de exceção criado na v2.60) é contornável simplesmente usando o fluxo de entregas. O selo "entregue com pendência financeira" do GET da venda (`[id]/route.ts:162-171`) ameniza a visibilidade, mas não impede.
- **Recomendação:** decidir a política única (Jonathan): ou `criarEntrega`/`confirmarEntrega` validam pagamento/exceção, ou o PATCH abandona o guard. Hoje convivem as duas regras.

**C3 — Confirmação de pagamento sem transação**
- `src/app/api/vendas/[id]/pagamentos/[pagId]/confirmar/route.ts:100-309` — 7+ escritas independentes (confirmar pagamento, split parcial, devolver crédito do gerente, baixar/split de `contas_receber`, comunicações, auto-aprovar, auto-concluir), **sem `sql.begin()`**; cada bloco com `try/catch` que só faz `console.error` (linhas 161-163, 218-220, 239-241, 291-293, 306-308).
- **Impacto:** queda/erro no meio deixa estado inconsistente (ex.: pagamento confirmado mas conta a receber em aberto, crédito do gerente não devolvido) e ninguém fica sabendo. Dinheiro = ouro: deveria ser tudo-ou-nada.
- **Recomendação:** envolver os passos 1-3 numa transação; auto-aprovação/conclusão podem ficar fora, mas com erro reportado ao usuário, não engolido.

**C4 — Operações críticas de venda sem `logAudit` (rastreabilidade §0.1)**
- `logAudit` em `src/app/api/vendas/**` existe só em: `route.ts` (POST criar), `solicitacoes-alteracao/[id]`, `legado`.
- Sem auditoria de app: **PATCH `/api/vendas/[id]`** (1.221 linhas — muda situação, cancela ordens em cascata, registra ouro no cofre), **cancelar**, **aprovar-desconto**, **confirmar pagamento**, **itens** (POST/PATCH/DELETE), **PATCH `/api/entrega/[entregaId]`**.
- Mitigações existentes: `vendas_transicoes` loga mudanças de situação; ordens têm `trg_audit_ordens` no banco. Mas alterações de campos, cancelamento de venda, aprovação de desconto e confirmação de pagamento ficam **sem quem/por quê/quando**.
- **Recomendação:** adicionar `logAudit(tx, ...)` nessas rotas (helper já existe e nunca derruba a operação — `src/lib/audit.ts:35-38`).

**C5 — Aprovação de venda e integração Tiny duplicadas (rota × lib)**
- `src/app/api/vendas/[id]/route.ts:585-881` reimplementa inline: token Tiny + `refreshTinyToken` (717-768) + montagem do pedido + envio — duplicando `ensureTinyToken`/`sendToTiny` de `src/lib/vendas-aprovar.ts`.
- O próprio código admite o desvio: `route.ts:1030-1031` — *"Esta rota PATCH aprova venda direto pela tela de detalhe e **não passa pelo helper approveVenda**"*. Criação de ordem de orçamento também existe nos dois lugares (rota 1081-1207 × lib).
- **Impacto:** duas fontes de verdade para a MESMA regra de negócio. Corrigiu uma, esqueceu a outra → comportamento diferente conforme o botão usado. Viola "NUNCA duplicar código" (§0).
- **Recomendação:** PATCH com `situacao='aprovado'` deve delegar para `approveVenda()`.

### 🟡 Médios

**M1 — Catches silenciosos no backend de vendas**
- `aprovar-desconto/route.ts:53, 58, 62, 72, 83` — concluir tarefa, aprovar em `aprovacoes_tarefa`, limpar tarefa, buscar solicitante e notificar: tudo `.catch(() => {})`. Aprovação "dá certo" na tela mas a tarefa pode ficar órfã no painel.
- Mesma família: `vendas-credito-aprovar.ts` (6×), `devolucoes.ts:322, 363, 383, 481`, `vendas-aprovar.ts:636`, `aprovacao-regras.ts:199`.
- **Recomendação:** logar (console.error no mínimo) e, quando afetar o fluxo, retornar aviso.

**M2 — PATCH de vendas devolve qualquer erro como 409**
- `[id]/route.ts:1214-1219` — catch-all converte QUALQUER exceção (inclusive erro interno real) em HTTP 409 com a mensagem crua do banco. Mascara falhas e vaza detalhes internos.
- **Recomendação:** mapear erros conhecidos (STOCK_NEGATIVE, ENTREGA_BLOCKED) para 409 e o resto para `internalError` (helper já existe).

**M3 — Telas fora do padrão de filtro de período** (regra de UX do Jonathan: chips Hoje/Ontem/7d/30d/Mês/Personalizado)
- `analise-comissoes/AnaliseComissoesClient.tsx:56-85,181` — só dois `<input type="date">`; `analise-frete` e `analise-resultado` idem.
- `vale-troca/ValeTrocaClient.tsx` — **nenhum** filtro de data.
- `entrega/page.tsx:26` — sem filtro e com `LIMIT 500` fixo: a partir do registro 501, preparações somem da tela sem aviso.
- Obs.: o componente pronto `src/components/ui/PeriodoFiltro.tsx` só é usado pelo Financeiro; Vendas/Entregas reimplementam chips localmente (`VendasClient`, `EntregasVendaClient`) — duplicação leve.

**M4 — Hardcodes que deviam ser parâmetros (§3 — PARAM.X)**
- `local_estoque_id = 2` fixo: migration `267_fluxo_status_venda.sql:144` e fallback `COALESCE(...,2)` em `entrega-venda.ts:233` e `[id]/route.ts:901,916`.
- Limites de desconto default fixos em `vendas/nova/page.tsx:31-41` (100/30/50/15) e produto genérico Tiny `746056974` em `[id]/route.ts:673`.

**M5 — Sincronização Tiny sem fila/retry para vendas**
- Vendas: HTTP direto best-effort (na rota e em `sendToTiny`); falhou → fica `tiny_sync_status='erro'` dependendo de resync manual. Contatos: `fila_sync_externo` com retry automático (worker pronto em `fila-sync-worker.ts`).
- **Recomendação:** enfileirar vendas na mesma fila para retry automático.

### 🟢 Menores

**P1 — Código morto:** `NovaVendaClient.tsx` e `NovaVendaClientLegado.tsx` não são importados por ninguém (`nova/page.tsx:3` usa só V2). ~2 arquivos grandes confundindo manutenção.

**P2 — `vale_troca.vale_origem_id` sem proteção de ciclo** — `142_devolucoes_vale_troca.sql:89` é só FK; sem `CHECK (vale_origem_id != id)`. O app gera a cadeia corretamente; risco só via UPDATE manual no banco.

**P3 — Guard `client_updated_at` é opcional** (`[id]/route.ts:414-422`): só protege se o front enviar o campo. Clientes que não enviam continuam sujeitos a perder atualização concorrente.

**P4 — Componentes/rotas gigantes:** `VendaDetalheClient.tsx` ~4.1k linhas, `NovaVendaClientV2.tsx` ~3.4k, `MarcarEntregaModal.tsx` ~1.9k, PATCH vendas 1.2k. Não é bug, mas dificulta manutenção e revisão.

**P5 — Catches silenciosos no front sem `useErrorStore`** (pitfall §3): `NovaVendaClientV2.tsx:644,703`, `VendaDetalheClient.tsx:591`, `MarcarEntregaModal.tsx:982`, `FreteAvulsoModal.tsx:85`, `NovaOrdemReposicaoVendaModal.tsx:90,119,130`.

---

## 5. Pontos fortes (manter como referência de padrão)

- `src/lib/entrega-venda.ts` — transação atômica completa, `FOR UPDATE`, `logAudit`, comentários de regra de negócio exemplares, split de reservas em entrega parcial, RFID integrado.
- `src/lib/vale-troca.ts` — lock pessimista; vale nunca usado 2×; troco encadeado.
- `POST /api/vendas` — transação única + auditoria + reposição automática de estoque.
- Blindagens: vendas fechadas (114), máquina de estados (267), gate de desconto front+back, ownership de consultora (Onda 1D/1G), guard de versão (Onda 1K), solicitações de alteração (v2.60.0).

## 6. Achados preliminares DESCARTADOS (verificação refutou)

| Suspeita | Veredito |
|---|---|
| "CLAUDE.md com contagens desatualizadas (~60 tabelas)" | **Refutado** — CLAUDE.md atual já traz 139 tabelas/71 views/55 triggers e a nota do `fn_processar_transferencia` (linha 285). |
| "`fn_estoque_comercial_entrega_venda` não checa reservas ativas" | **Refutado** — itera `WHERE status='ativo'` (267:194-211) e bloqueia reposições pendentes; o PATCH ainda valida saldo SLE para sob-encomenda (`[id]/route.ts:894-943`). |
| "Risco de baixa dupla entre lib de entregas e trigger" | **Refutado** — a lib efetiva as reservas na MESMA transação antes de setar `entregue`; o trigger não encontra reservas ativas. |
| "Ranking tem chips de período" | Impreciso — usa navegação mês/ano, adequada a metas mensais. |

## 7. Priorização sugerida (cada item = task própria com plano aprovado)

1. **C1** — fechar as 3 rotas de entrega (roles + ownership). Pequeno e de maior risco de segurança.
2. **C2** — decisão de negócio do Jonathan: política única de "entrega × pagamento" e alinhar os dois caminhos.
3. **C3** — transação na confirmação de pagamento (dinheiro = ouro).
4. **C4** — `logAudit` nas rotas críticas (rastreabilidade §0.1).
5. **C5** — PATCH aprovar → delegar para `approveVenda()` (mata a duplicação Tiny).
6. **M1/M2/M5** — saneamento de erros e fila Tiny.
7. **M3/M4/P1** — filtros de período padrão, parâmetros, remoção de código morto.

---
*Documento gerado por análise estática (leitura de código, migrations e docs). Banco de produção não foi acessado. Nenhuma correção foi aplicada.*
