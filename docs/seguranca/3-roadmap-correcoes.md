# Roadmap — Correções no Fluxo de Baixa

> **Para quem:** Dev (backlog técnico).
> **Premissa:** roadmap pode ser AJUSTADO depois das queries de `2-auditoria-sql.md` rodarem. Se aparecer divergência grave, ela vira Sprint 0.

---

## Princípios de execução

1. **Nada vai pra produção sem teste manual no fluxo real**. Esse fluxo move dinheiro/peça.
2. **Toda mudança de trigger/função tem migration nova** — `CREATE OR REPLACE FUNCTION`, nunca `DROP`. Versionar no `supabase/migrations/`.
3. **Toda nova validação de entrada** retorna erro 400 com mensagem clara — operador entende o que precisa corrigir.
4. **Nenhuma migração apaga ou desativa função existente** sem que o substituto esteja testado primeiro.
5. **Backup antes de qualquer ALTER em tabela em produção** (Supabase faz snapshot diário, mas confirmar).
6. **Cada Sprint termina com run das queries de `2-auditoria-sql.md` em staging** — pra confirmar que a correção fechou o buraco e não abriu outro.

---

## Sprint 0 — Reativo (depende do que as queries acharem)

**Quando rodar:** assim que dono executar as queries de `2-auditoria-sql.md` e classificar o resultado.

**Possíveis tarefas (entram aqui se aparecerem):**

- [ ] **S0.1** Limpar reservas órfãs identificadas na Q3 (UPDATE `status='cancelado'` com justificativa em campo de obs ou via insert em audit_log)
- [ ] **S0.2** Investigar e corrigir saldos negativos da Q4 (cada caso individual — pode envolver estorno manual, recálculo de movimentos, etc.)
- [ ] **S0.3** Corrigir totais inconsistentes da Q5 (recalcular `total_produtos = SUM(itens.total_item)` por venda)
- [ ] **S0.4** Investigar estornos quebrados da Q7 (criar par bidirecional manualmente ou estorno legitimo de estorno)

**Critério de aceitação Sprint 0:** Q3, Q4, Q5, Q7 voltam a retornar 0 linhas após as correções.

---

## Sprint 1 — Validação de saldo na criação de venda (Risco R1)

**Tarefas:**

### S1.1 — Helper `validarSaldoDisponivel()`

**Arquivo novo:** `src/lib/validar-saldo-disponivel.ts`

```ts
// pseudo-assinatura
export async function validarSaldoDisponivel(
  produto_id: number,
  quantidade: number,
  local_estoque_id: number,
  excludeReservaId?: number  // pra não contar a própria reserva ao editar
): Promise<{ valido: boolean; disponivel: number; faltam: number }>
```

- Usa `vw_saldo_estoque_comercial_v2` filtrando por produto+local
- Se `excludeReservaId` informado, soma de volta a quantidade dessa reserva (pra editar item da própria venda)
- Retorna estrutura clara pra endpoint usar

### S1.2 — Chamar validação no POST de item

**Arquivo:** `src/app/api/vendas/[id]/itens/route.ts:57`

Antes do INSERT em `itens_venda_erp`, chamar `validarSaldoDisponivel`. Se inválido, retornar 422 com:

```json
{
  "erro": "saldo_insuficiente",
  "mensagem": "Produto X tem 5 unidades disponíveis em VITRINE. Você tentou reservar 10.",
  "produto_id": 123,
  "local_estoque_id": 3,
  "disponivel": 5,
  "solicitado": 10
}
```

### S1.3 — Chamar validação no PATCH de item (qtd)

**Arquivo:** `src/app/api/vendas/[id]/itens/[itemId]/route.ts`

Mesma lógica. Aceitar apenas se nova qtd ≤ (disponível + qtd_atual_da_propria_reserva).

### S1.4 — Trigger DB como rede de segurança

**Migration nova:** `supabase/migrations/2XX_validar_saldo_reserva.sql`

Trigger BEFORE INSERT em `reservas_estoque_comercial`:

```sql
-- pseudo-código
IF NEW.quantidade > (SELECT disponivel FROM vw_saldo_estoque_comercial_v2 WHERE ...)
THEN RAISE EXCEPTION 'Saldo insuficiente: produto X tem N disponível em local Y'
```

Por que trigger ALÉM do endpoint: defesa em camadas. Se uma rota futura criar reserva direto (script, integração, console), o banco protege.

**Critério de aceitação Sprint 1:**
- Q10 (overbooking) retorna 0 linhas em staging após criar 100 vendas de teste
- Tentar criar venda com mais qtd que saldo retorna 422 com mensagem clara
- Tentar editar item pra qtd > disponível retorna 422
- INSERT manual em `reservas_estoque_comercial` via SQL com qtd > disponível levanta exception
- Nenhuma venda existente quebra

---

## Sprint 2 — Fluxo de devolução do cliente (Risco R2)

**Tarefas:**

### S2.1 — Confirmar comportamento atual com dev/operador

Antes de implementar, perguntar:
- Como o operador hoje registra "cliente devolveu peça X da venda Y"?
- Existe rota `POST /api/vendas/[id]/devolucao` ou só ajuste manual?
- Vale-troca é gerado automático nessa devolução?

### S2.2 — Criar (ou completar) fluxo de devolução

Premissa: após S2.1, definir se vai criar do zero ou complementar o existente.

Estrutura sugerida:

- Endpoint `POST /api/vendas/[id]/devolucao` — valida que venda está aprovada/concluída
- Body: `{ itens: [{ item_venda_id, quantidade, motivo, gera_vale_troca: boolean }] }`
- Cria registro em `devolucoes_venda` (se não existir, criar tabela)
- Trigger `fn_processar_devolucao_venda` cria movimento ENTRADA com `motivo='devolucao'`, `referencia_tipo='devolucoes_venda'`, `referencia_id=devolucao.id`
- Se `gera_vale_troca=true`, dispara fluxo já existente de `vale_troca` com `vale_origem_id=venda.id`

### S2.3 — UI da devolução

- Tela em `/vendas/[id]/devolver` com seleção de itens da venda + qtd parcial
- Validação client-side: qtd devolvida ≤ qtd vendida (descontar devoluções anteriores)

**Critério de aceitação Sprint 2:**
- Devolução total ou parcial gera entrada automática em `movimentacoes_estoque_comercial`
- Q11 (devoluções sem entrada) retorna 0 linhas
- Vale-troca opcional funciona corretamente
- Não é possível devolver mais qtd do que foi vendida

---

## Sprint 3 — Validação de desconto no PATCH de item (Risco R4)

**Tarefas:**

### S3.1 — Mover `validarDescontos()` pra todo PATCH de item

**Arquivo:** `src/app/api/vendas/[id]/itens/[itemId]/route.ts`

Hoje validação só roda quando venda passa pra `aprovado` (em `/api/vendas/route.ts:150-168`). Replicar pra:
- POST item (já roda em alguns paths, confirmar)
- PATCH item (qualquer mudança de `pct_desconto` ou `preco_unitario`)
- Independente de `situacao` da venda

### S3.2 — Trigger DB como rede de segurança

**Migration nova:** `supabase/migrations/2XX_validar_desconto_item.sql`

Trigger BEFORE INSERT/UPDATE em `itens_venda_erp` valida `pct_desconto` contra `mx_desconto_permitido` do vendedor (`vendas_erp.vendedor_id` → `vendedores.usuario_id` → `usuarios.mx_desconto_permitido`).

**Critério de aceitação Sprint 3:**
- Tentar criar item com desconto > permitido em rascunho retorna 422
- Tentar editar `pct_desconto` em rascunho pra valor maior retorna 422
- Tentar fazer PATCH direto via SQL com desconto > permitido levanta exception
- Vendedor com `mx_desconto_permitido=10` não consegue aplicar 15%

---

## Sprint 4 — Ordem de reposição na transação da venda (Risco R3)

**Tarefas:**

### S4.1 — Mover criação da ordem para dentro da `sql.begin`

**Arquivo:** `src/app/api/vendas/route.ts:401-468`

Hoje a venda é criada em transação, depois (fora) chama criação de ordem. Refatorar pra mover tudo pra dentro do `sql.begin()`. Se ordem falhar, venda também falha (rollback).

### S4.2 — Tratar conflito de versões (`updated_at`)

Como a transação maior pode demorar mais e gerar mais conflito, garantir que o `updated_at` lock funcione (commit `4eab92f` "Fix false-positive version conflict" já tocou nisso — verificar).

### S4.3 — Alternativa: fila de retry

Se mover pra transação for inviável (performance), criar `fila_criar_ordem_reposicao` com retry exponencial. Mesmo padrão da `fila_sync_externo` (Tiny) que já existe (migration 193).

**Critério de aceitação Sprint 4:**
- Criar 100 vendas que precisem de reposição em paralelo → todas têm ordem associada (zero órfãs)
- Simular falha (matar conexão DB no meio da criação da ordem) → venda também é revertida (consistência)

---

## Sprint 5 — Race condition em aprovação simultânea (Risco R5)

**Investigação primeiro:**

### S5.1 — Mapear o que existe hoje

- Função `fn_estoque_comercial_aprovar_venda` usa `SELECT FOR UPDATE`?
- Tem advisory lock (`pg_advisory_xact_lock`)?
- Confiamos só em versão otimista (`updated_at` check)?

### S5.2 — Implementar lock pessimista por SKU+local

Sugestão: no início de `fn_estoque_comercial_aprovar_venda`, para cada produto da venda:

```sql
PERFORM pg_advisory_xact_lock(produto_id, local_estoque_id);
```

Garante que duas aprovações simultâneas pelo mesmo SKU+local serializam.

### S5.3 — Teste de concorrência

Script de teste:
- Cria 2 vendas com mesmo produto, ambas em rascunho, qtd que somadas excedem disponível
- Aprova ambas em paralelo via 2 conexões
- Esperado: 1 aprovada com sucesso, 1 falha com mensagem clara

**Critério de aceitação Sprint 5:**
- Teste de concorrência passa
- Saldo nunca fica negativo após race
- Mensagem clara pro vendedor que perdeu o race ("alguém aprovou venda do mesmo SKU primeiro, recarregue o estoque")

---

## Sprint 6 — Confirmar status `enviado` e `concluido` (Risco R6)

**Tarefas:**

### S6.1 — Mapear regras de negócio

- Quando venda passa de `aprovado` → `enviado`?
- Quando passa de `enviado` → `concluido`?
- Alguma dessas transições deve mexer em estoque? (provavelmente não — a saída de estoque ocorre na **entrega**, não nessas transições)
- Devem virar `bloqueado=true`?

### S6.2 — Documentar e/ou implementar

Se hoje as transições são manuais e silenciosas:
- Documentar no `1-diagnostico-fluxo-baixa.md`
- Adicionar trigger se necessário (ex: `enviado` → cria registro em `entregas`)

### S6.3 — Confirmar que `concluido` bloqueia edição

Trigger `proteger_campos_pdv` pode precisar ser estendido pra bloquear mudanças quando `situacao='concluido'`.

**Critério de aceitação Sprint 6:**
- Documentação atualizada
- Tentar editar venda concluída retorna 403/422 com mensagem clara

---

## Sprint 7 — Audit log nas tabelas de venda (gap conhecido)

**Contexto:** auditoria de segurança identificou que `vendas_erp`, `itens_venda_erp`, `pagamentos_venda`, `vale_troca`, `devolucoes_venda` **não têm** trigger `fn_audit_log()`. Toda fraude potencial nessas tabelas é invisível.

**Tarefa:**

### S7.1 — Migration de audit log abrangente para venda

```sql
-- supabase/migrations/2XX_audit_log_vendas.sql
CREATE TRIGGER trg_audit_vendas_erp
  AFTER INSERT OR UPDATE OR DELETE ON alissonerp.vendas_erp
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_audit_log();

CREATE TRIGGER trg_audit_itens_venda_erp
  AFTER INSERT OR UPDATE OR DELETE ON alissonerp.itens_venda_erp
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_audit_log();

CREATE TRIGGER trg_audit_pagamentos_venda
  AFTER INSERT OR UPDATE OR DELETE ON alissonerp.pagamentos_venda
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_audit_log();

CREATE TRIGGER trg_audit_vale_troca
  AFTER INSERT OR UPDATE OR DELETE ON alissonerp.vale_troca
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_audit_log();

CREATE TRIGGER trg_audit_devolucoes_venda
  AFTER INSERT OR UPDATE OR DELETE ON alissonerp.devolucoes_venda
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_audit_log();

CREATE TRIGGER trg_audit_movimentacoes_estoque_comercial
  AFTER INSERT OR UPDATE ON alissonerp.movimentacoes_estoque_comercial
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_audit_log();

CREATE TRIGGER trg_audit_reservas_estoque_comercial
  AFTER INSERT OR UPDATE ON alissonerp.reservas_estoque_comercial
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_audit_log();
```

### S7.2 — Garantir que `usuario_id` aparece nos logs

A função `fn_audit_log()` lê `current_setting('request.jwt.claims', true)::jsonb->>'sub'`. Quando o app conecta via `postgres` direto (`src/lib/db.ts`), JWT claims é NULL — `usuario_id` fica null em audit_log.

**Solução:** helper `withUser(userId, fn)` em `db.ts` que faz `SET LOCAL app.user_id = ${userId}` no início da transação. Modificar `fn_audit_log()` pra ler `current_setting('app.user_id', true)` se JWT claims for null.

**Critério de aceitação Sprint 7:**
- Toda mudança em venda gera linha em `audit_log` com `usuario_id` preenchido
- DELETE não é permitido em `audit_log` (policy INSERT-only)
- Query "quem alterou esta venda?" retorna histórico completo

---

## Sprint 8 — Testes automatizados (prevenção de regressão)

**Tarefa:**

### S8.1 — Suite de testes do fluxo de baixa

Diretório novo: `tests/vendas-baixa/`

Casos a cobrir:
- ✅ Criar venda em rascunho não mexe em estoque
- ✅ Adicionar item cria reserva ativa
- ✅ Aprovar venda converte reserva em saída
- ✅ Cancelar venda aprovada cria estorno
- ✅ Remover item em rascunho cancela reserva
- ✅ Remover item em venda aprovada cria estorno
- ✅ Editar qtd em rascunho ajusta reserva
- ✅ Editar qtd em venda aprovada cria delta
- ✅ Não pode reservar mais que disponível (após Sprint 1)
- ✅ Não pode aplicar desconto > permitido (após Sprint 3)
- ✅ Devolução cria entrada (após Sprint 2)
- ✅ Race de aprovação serializa (após Sprint 5)
- ✅ Estorno mantém par bidirecional (`estorno_de_id` ↔ `estornado_por_id`)

### S8.2 — Rodar suite no CI

GitHub Actions ou Vercel CI roda em todo PR.

**Critério de aceitação Sprint 8:** suite com 100% de pass; quebrar a suite quebra o merge.

---

## Resumo de prioridade

| Sprint | Risco | Esforço estimado | Bloqueia o quê |
|---|---|---|---|
| Sprint 0 | Reativo (depende das queries) | 0-2 dias | Próximos sprints se grave |
| Sprint 1 | R1 - saldo não validado | 2 dias | Tudo (overbooking gera divergência cumulativa) |
| Sprint 2 | R2 - devolução manual | 3 dias | Inventário (peças que voltam não aparecem) |
| Sprint 7 | Audit log | 1 dia | Investigação de fraude futura |
| Sprint 3 | R4 - desconto sem validação | 1 dia | Desvio de margem |
| Sprint 5 | R5 - race de aprovação | 2 dias | Saldo negativo em pico de venda |
| Sprint 4 | R3 - ordem fora da tx | 1-2 dias | Reposição perdida |
| Sprint 6 | R6 - status enviado/concluido | 1 dia (mais doc que código) | — |
| Sprint 8 | Testes automatizados | 2-3 dias | Prevenção de regressão |

**Recomendação de ordem:** Sprint 0 → 1 → 7 → 2 → 3 → 5 → 4 → 6 → 8.

Por que 7 (audit log) sobe na lista: depois das correções, é a primeira camada de detecção pra qualquer coisa que escapar. Investimento baixo (1 dia) e payoff alto.

---

## Quando voltar pro dono

Depois de cada sprint:

- [ ] Executar todas as queries de `2-auditoria-sql.md` em staging com dados de teste
- [ ] Atualizar tabela "Status atual" no `README.md`
- [ ] Commit message: `feat(vendas): sprint N — <título da sprint>`
- [ ] Avisar dono pra validar comportamento no ambiente real

---

## Observações finais

- Sprints 1-7 são **fechamento de gaps** identificados. Não inventam fluxo novo.
- Sprint 8 protege contra regressão futura.
- Tempo total estimado: **12-16 dias de dev** (sem contar Sprint 0 que depende do que aparecer).
- Recomendado fatiar entrega: pode ir pra produção após Sprint 1 + Sprint 7 (já cobre 60% do risco), continuar resto em paralelo.
