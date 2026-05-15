# Segurança Patrimonial — Auditoria de Baixa de Produto

> **Escopo desta versão:** APENAS validação do fluxo de baixa de **estoque comercial** (joias prontas vendidas na loja).
> Fora do escopo agora: ouro/insumos da fábrica, PCP, financeiro, RFID, cofre. Voltaremos a esses depois — uma frente por vez.

---

## Por que existe essa documentação

- Migração Tiny → ERP custom em **22/04/2026** sem reconciliação completa
- **R$ 8,5M em estoque** físico de produtos sem fonte da verdade
- Dono (Alisson) precisa garantir que **toda venda dá baixa correta no estoque** — sem baixa duplicada, sem baixa perdida, sem reserva órfã, sem estorno errado
- Documento serve pra ele apresentar pro **dev** (que está em outra frente — EPIC-001 "fonte da verdade") com diagnóstico claro e roadmap de correções

---

## Para quem é cada documento

| Arquivo | Quem lê | Propósito |
|---|---|---|
| **`README.md`** (este) | Dono | Visão geral, escopo, status, decisões pendentes |
| **`1-diagnostico-fluxo-baixa.md`** | Dev (principalmente) + Dono | Como o fluxo de baixa funciona HOJE no código + onde pode quebrar |
| **`2-auditoria-sql.md`** | Dono executa, Dev valida | 10 queries SQL **read-only** pra rodar AGORA e descobrir se algo já está errado |
| **`3-roadmap-correcoes.md`** | Dev | Backlog técnico das correções, em ordem, com critério de aceitação |

**Sequência recomendada de leitura:**
1. Dono lê este `README.md` (5 min)
2. Dono **executa as queries** de `2-auditoria-sql.md` (15-30 min) — descobre se há buraco real
3. Dono apresenta os arquivos `1-` e `3-` pro dev (30 min de conversa)
4. Dev valida o diagnóstico e ajusta o roadmap conforme conhecimento dele

---

## O que JÁ é sabido sobre o fluxo (resumo executivo)

O ERP tem um modelo de **reserva** bem desenhado:

1. Criar venda (rascunho) → nada acontece com estoque
2. Adicionar item à venda → cria **RESERVA** (bloqueia "disponível", não deduz "físico")
3. Aprovar venda → reserva vira **MOVIMENTO DE SAÍDA efetivado** (deduz físico)
4. Cancelar venda → cancela reservas + cria estornos
5. Transferência reposição → loja é em 2 etapas (saída na hora, entrada ao concluir)

**O que está bom no design:**
- `created_by` sempre vem do `getUser()`, nunca do body
- Estorno SEMPRE cria movimento reverso, NUNCA deleta original (rastreável)
- View `vw_saldo_estoque_comercial_v2` calcula `disponível = físico − reservado` por local
- 8 triggers cobrem todas as transições principais

**O que precisa investigar (suspeita, não confirmada):**
- Criação de venda **NÃO valida saldo disponível** — pode reservar 100 de um produto que tem 5
- Ordem de reposição automática **fora da transação** da venda — venda pode ficar sem ordem
- Validação de desconto só roda **ao aprovar**, não em rascunho
- **Fluxo de devolução do cliente** (entrada de volta no estoque) não tem trigger — hoje como o operador faz?
- Race condition em aprovação simultânea de 2 vendas pelo mesmo SKU
- Status `enviado` e `concluido` da venda — existem mas não vimos trigger

Tudo isso vira lista de verificação no `2-auditoria-sql.md`.

---

## Status atual (atualizar conforme evolui)

| Item | Status | Próximo |
|---|---|---|
| Mapeamento técnico do fluxo | ✅ Concluído (`1-diagnostico-fluxo-baixa.md`) | Dev validar |
| Queries de auditoria | ✅ Prontas (`2-auditoria-sql.md`) | Dono executar |
| Roadmap de correções | ✅ Pronto (`3-roadmap-correcoes.md`) | Apresentar pro dev |
| Execução das queries | ⏳ Aguarda dono | Após apresentar pro dev |
| Sprint 0 (devolução + validação saldo) | ⏳ Aguarda dev | Após Sprint 0 |
| Auditoria das 80+ rotas sem auth | ⏳ Fora do escopo desta versão | Próxima frente |
| RFID Auditoria | ⏳ Fora do escopo desta versão | Próxima frente |

---

## Decisões pendentes

### 1. Quem é o dev e qual a banda dele esta semana?

EPIC-001 (fonte da verdade) está em curso. Sprint 0 deste roadmap (correções de baixa) **deve entrar antes de qualquer feature nova**? Negociar prioridade.

### 2. Quando o dono executa as queries de auditoria?

Idealmente HOJE ou amanhã, **antes** de apresentar pro dev — porque o resultado pode mudar a prioridade do que o dev faz primeiro. Se as queries acharem 50 reservas órfãs e 12 saldos negativos, isso vira a primeira tarefa.

### 3. Quem vai responder o que aparecer nas queries?

Cada query devolve uma lista de "casos suspeitos". Para cada caso, alguém precisa olhar:
- Foi erro de operação? (ex: vendedor cancelou venda errada e fez nova)
- Foi bug do sistema? (vai pro `3-roadmap-correcoes.md`)
- Foi tentativa de fraude? (auditoria criminal)

Recomendo: **dono olha a lista**, classifica em "operacional / bug / suspeito", e o que for "bug" vira issue pro dev.

---

## Quem faz o quê (matriz)

| Ação | Dono | Dev | Claude (eu) |
|---|---|---|---|
| Ler diagnóstico técnico (`1-`) | ✅ | ✅ | — |
| Executar queries de auditoria (`2-`) | ✅ | Pode ajudar | Refino se algo der erro |
| Classificar resultado das queries | ✅ | Pode ajudar | Posso analisar listas longas |
| Aprovar prioridade do roadmap (`3-`) | ✅ | Negocia prazo | — |
| Implementar correções | — | ✅ | Reviso código antes do commit |
| Atualizar este README com status | ✅ ou eu | ✅ ao concluir tarefa | ✅ a pedido |

---

## Como atualizar essa documentação

Esses arquivos são **vivos**. Conforme correções forem entregues:

- Marcar tarefas como concluídas em `3-roadmap-correcoes.md`
- Atualizar tabela "Status atual" deste README
- Anotar achados das queries em `2-auditoria-sql.md` (seção "resultados encontrados")

Versionar via git (`docs/seguranca/` está no repo). Commit message: `docs: seguranca/baixa-produto — <o que mudou>`.

---

## O que NÃO está aqui (escopo intencionalmente fechado)

Para evitar virar documento de tudo e nada ser executado:

- ❌ Auditoria das 80+ rotas API sem autenticação (frente separada — relatório existe na conversa)
- ❌ Trigger anti-`lancamentos_avulso` (insumos da fábrica)
- ❌ Inventário físico Loja/Fábrica (Fase 1 e 2 do plano-blindagem original — virá depois)
- ❌ RFID Auditoria (caminho A+G do TSL 1128)
- ❌ Reconciliação Tiny → ERP comercial
- ❌ Conciliação financeira / contas a pagar
- ❌ Cofre / SGS Intergard

Cada um desses vira **um pacote próprio de documentação** quando voltarmos a ele. Por enquanto, foco total em: **a baixa de venda está sendo feita corretamente?**
