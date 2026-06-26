# ADR 0004 — Estratégia de Audit Log

**Status:** Accepted  
**Data:** 2026-04-29  
**Story:** 3.3  

## Contexto

Zero rastreabilidade de mutations críticas: quem aprovou uma venda, quem alterou um pagamento, quem cancelou uma ordem. A tabela `alissonerp.audit_log` existia no schema mas ficou vazia desde sua criação — nenhum código a populava.

Duas abordagens foram consideradas:

1. **Trigger no PostgreSQL** — audit automático em todas as tabelas, sem alteração de código aplicação. Desvantagem: não captura `usuario_id` do usuário da aplicação (a conexão usa service_role); require `SET LOCAL` por request para injetar o usuário.
2. **Helper em aplicação** — chamado explicitamente nas rotas, captura o usuário autenticado naturalmente. Desvantagem: cobertura depende de disciplina dos devs; não é retroativa.

A abordagem via trigger foi descartada porque a conexão atual usa service_role e o plano de migração para `sqlAsUser` (ADR 0012) ainda está em andamento. Um trigger com `current_user` capturaria o service role em vez do usuário real.

## Decisão

Helper `logAudit(txOrSql, params)` em `src/lib/audit.ts`, chamado explicitamente dentro das rotas críticas, **preferencialmente dentro da mesma transação** da operação principal.

```typescript
await logAudit(tx, {
  tabela: "vendas_erp",
  operacao: "UPDATE",
  registro_id: vendaId,
  usuario_id: user.id,
  dados_antes: vendaAntes,
  dados_depois: vendaDepois,
});
```

Regra central: **o helper nunca lança exceção** — o `try/catch` interno loga o erro no console e permite que a operação principal conclua. Uma falha de audit não deve reverter uma venda ou pagamento.

Cobertura é incremental: começa nas 5 rotas de maior risco (vendas PATCH, pagamentos, aprovações) e expande a cada sprint.

## Consequências

**Positivas:**
- `usuario_id` capturado com precisão — vem do token de auth da request, não de variável de sessão DB
- Falha de audit não bloqueia operação de negócio (try/catch interno)
- Dentro da mesma `sql.begin()`, audit reverte junto se a transação principal fizer rollback — garantia de consistência
- `dados_antes` e `dados_depois` permitem diff preciso do que mudou

**Negativas:**
- Cobertura manual e incremental — rotas não migradas ficam sem audit indefinidamente
- Devs podem esquecer de chamar `logAudit` em novas rotas (sem gate automático)
- Registrar `dados_antes` exige SELECT antes do UPDATE — custo extra de query por operação auditada

**Neutras:**
- `dados_antes` e `dados_depois` são campos opcionais — rotas simples podem passar apenas `tabela + operacao + registro_id`

## Arquivos

- `src/lib/audit.ts` — implementação do `logAudit`
- `alissonerp.audit_log` — tabela destino (colunas: tabela, operacao, registro_id, usuario_id, dados_antes, dados_depois, created_at)
