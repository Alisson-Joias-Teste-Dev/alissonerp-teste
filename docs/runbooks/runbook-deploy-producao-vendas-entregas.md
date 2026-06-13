# Runbook: Deploy Produção — Refatoração Vendas/Entregas (v2.61 → v2.66.9)

**Módulo:** Vendas / Entregas / Estoque / Financeiro
**Severidade:** Alta (primeira ida da refatoração inteira pra produção)
**Tempo estimado:** 30–60 min
**Data do plano:** 13/06/2026

---

## O que vai subir

Toda a refatoração de vendas/entregas que está no `homolog` e **nunca foi pra produção**:
43 commits (v2.61.0 → v2.66.9) + **10 migrations de banco (293 → 302)**.

Produção ainda roda a versão antiga. Este deploy promove tudo de uma vez.

- **Código:** `homolog` → `main` → Vercel faz build automático.
- **Banco:** aplicar as migrations 293→302 no banco de produção (`72.60.55.140:5543`).

---

## Princípios de segurança (por que dá pra confiar)

1. **Backup completo ANTES de tocar em nada** (Fase 1). Rede de segurança: no pior caso, restaura e fica como estava.
2. **As 10 migrations não apagam dado:** zero `DROP TABLE/COLUMN`, zero `DELETE`, zero `TRUNCATE` (verificado 13/06). As únicas mudanças estruturais (293/294) só *afrouxam* uma regra (campo passa a aceitar vazio).
3. **São idempotentes e não travam em dado velho:** colunas com `IF NOT EXISTS`, funções com `CREATE OR REPLACE`, constraints novas com `NOT VALID` (não checam o histórico).
4. **Ordem correta:** BANCO primeiro, CÓDIGO depois. O código novo espera o schema novo — se o código subir antes do banco, dá erro 500.
5. **Nada em produção sem aprovação explícita do Jonathan** a cada fase.

> ⚠️ **Janela curta:** entre aplicar as migrations e subir o código, a produção fica com o banco NOVO + código VELHO por alguns minutos. As migrations foram feitas pra serem compatíveis, mas faça as Fases 3 e 4 em sequência, sem pausa longa, e de preferência em horário de pouco movimento.

> ⚠️ **WhatsApp:** no homolog os 9 gatilhos de notificação (http_post) estão DESLIGADOS; na produção estão LIGADOS. Então, ao usar o fluxo novo em produção, mensagens de WhatsApp reais vão ser disparadas (status de venda, entrega). Isso é esperado — só não foi exercido no homolog.

---

## FASE 0 — Pré-voo (no WSL, pasta do projeto)

- [ ] **0.1** Branch e árvore limpa
  ```bash
  cd /home/jonathan_arajo/projetos/alissonerp
  git status            # deve estar limpo (tudo commitado)
  git branch --show-current   # homolog
  ```
- [ ] **0.2** TypeScript sem erro
  ```bash
  npx tsc --noEmit      # zero erros — não avançar se houver erro
  ```
- [ ] **0.3** Confirmar que homolog está no GitHub
  ```bash
  git log --oneline origin/homolog..HEAD   # deve estar VAZIO (nada local sem subir)
  ```

---

## FASE 1 — Backup de produção (rede de segurança) 🔒

> Sem isso, NÃO seguir. É o seguro contra qualquer imprevisto.

- [ ] **1.1** Backup completo do schema `alissonerp` (formato custom, restaurável)
  ```bash
  pg_dump -h 72.60.55.140 -p 5543 -U postgres -d postgres \
    -n alissonerp -Fc \
    -f /tmp/backup_prod_pre_deploy_$(date +%Y%m%d_%H%M).dump
  ```
  *(senha do `.env.production.local` — não colar em chat/commit)*

- [ ] **1.2** Conferir que o arquivo existe e tem tamanho
  ```bash
  ls -lh /tmp/backup_prod_pre_deploy_*.dump | tail -1
  ```
- [ ] **1.3** Guardar uma cópia fora do servidor (baixar pro PC/OneDrive). Backup só serve se sobreviver ao incidente.

---

## FASE 2 — Inventário do banco de produção (SÓ LEITURA) 👀

Descobrir quais das 10 migrations a produção JÁ tem (frete avulso 293/294 podem já estar lá). Aplicar uma migration que já existe pode dar erro de "constraint já existe" — por isso conferimos antes.

- [ ] **2.1** Rodar o checklist de presença (uma consulta read-only) — ver Anexo B.
  Resultado: lista do que FALTA aplicar. Só essas serão aplicadas na Fase 3.

---

## FASE 3 — Aplicar migrations no banco de produção 🗄️

Aplicar **somente as que faltam** (resultado da Fase 2), **em ordem crescente** (293, 294, … 302). Cada uma roda numa transação só: se falhar, ela inteira desfaz sozinha e a gente para.

- [ ] **3.1** Para cada migration que falta (exemplo com a 302):
  ```bash
  psql -h 72.60.55.140 -p 5543 -U postgres -d postgres \
    -v ON_ERROR_STOP=1 --single-transaction \
    -f supabase/migrations/302_reposicao_entrada_estoque.sql
  ```
  Repetir, **na ordem**, para cada arquivo pendente.

- [ ] **3.2** Se qualquer uma der erro: **PARAR**. A transação dela já desfez. Ler o erro, me chamar. Não continuar pras próximas.

- [ ] **3.3** Conferência pós-migration (Anexo C): confirmar que as funções/colunas/constraints novas existem.

---

## FASE 4 — Subir o código (Vercel) 🚀

Só depois das migrations aplicadas e conferidas.

- [ ] **4.1** Merge homolog → main e push
  ```bash
  git checkout main
  git merge homolog        # fast-forward (main está atrás, sem conflito esperado)
  git push origin main
  git checkout homolog
  ```
- [ ] **4.2** Acompanhar o build no **Vercel** (projeto fabricaAJ, branch `main`) — ~2–4 min. Build tem que concluir sem erro.

---

## FASE 5 — Smoke test em produção ✅

- [ ] **5.1** Abrir a URL de produção, sem erro 500 / tela branca.
- [ ] **5.2** Testar o fluxo crítico do que subiu:
  - Abrir uma venda → status novo aparece
  - Montar uma entrega → não quebra
  - (Opcional, com cliente fictício) confirmar um pagamento na entrega
- [ ] **5.3** Conferir no banco que uma operação real gravou certo (Anexo C).

---

## FASE 6 — Se der errado (rollback)

**Código:** Vercel Dashboard → Deployments → o deploy anterior → **Promote to Production** (volta na hora). Ou `git revert HEAD` no main.

**Banco:** as migrations são aditivas e não apagam dado, então normalmente NÃO precisa reverter o banco — o código velho convive com as colunas novas. Se mesmo assim precisar, restaurar do backup da Fase 1 (ver `runbook-restaurar-backup.md`). Só restaurar com o sistema fora do ar pra não perder vendas feitas no meio.

---

## Anexo A — Ordem e o que cada migration faz

| Ordem | Arquivo | O que faz | Tipo |
|------|---------|-----------|------|
| 1 | 293_frete_avulso | colunas de frete avulso + constraint de origem | aditivo |
| 2 | 294_frete_avulso_nullable_codigos | deixa códigos opcionais (avulso) — constraint NOT VALID | afrouxa |
| 3 | 295_blindagem_codigos_entrega | colunas de tentativas/bloqueio de código | aditivo |
| 4 | 296_novo_fluxo_status_venda | novo fluxo de status da venda | função/dados |
| 5 | 297_trava_status_e_baixa_pagamento | trava de status + baixa automática no pagamento | gatilho |
| 6 | 298_fix_chk_codigos_retirada | corrige regra de códigos na retirada (NOT VALID) | constraint |
| 7 | 299_baixa_cr_na_aprovacao | baixa de conta a receber na aprovação | gatilho |
| 8 | 300_cr_saldo_em_aberto | conta a receber = saldo em aberto | função |
| 9 | 301_repos_bloqueio_por_status | bloqueio de reposição por status da ordem | gatilho |
| 10 | 302_reposicao_entrada_estoque | reposição concluída dá entrada no estoque (nosso) | função/gatilho |

## Anexo B — Inventário (Fase 2, SÓ LEITURA)

Consulta que diz, pra cada migration, se a marca dela já existe em produção
(coluna/função/constraint característica). Será montada e rodada na hora da Fase 2.

## Anexo C — Conferência pós-deploy

```sql
-- funções novas existem?
SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='alissonerp' AND proname IN
  ('fn_reposicao_entrada_estoque','fn_reposicao_entrada_volta');
-- gatilho da volta existe?
SELECT tgname FROM pg_trigger WHERE tgname='trg_reposicao_entrada_volta';
-- colunas novas de entrega existem?
SELECT column_name FROM information_schema.columns
WHERE table_schema='alissonerp' AND table_name='entregas_venda'
  AND column_name IN ('is_avulso','tentativas_codigo','codigo_bloqueado_em');
```

---

## Quem faz o quê

- **Claude (eu):** executo os comandos no WSL (backup, inventário, migrations, merge/push) — mas **paro e te mostro** antes de cada Fase que escreve em produção (3 e 4).
- **Jonathan:** autoriza cada fase, acompanha o Vercel, faz o smoke test, guarda o backup fora do servidor.
