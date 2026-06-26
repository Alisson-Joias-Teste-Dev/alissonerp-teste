# Runbooks Operacionais — Alisson ERP

Guias de diagnóstico e resolução de incidentes comuns. Cada runbook descreve sintomas, comandos de diagnóstico e procedimento de resolução.

## Índice

| Runbook | Cenário de Uso | Quando Acionar |
|---------|---------------|----------------|
| [runbook-fila-sync-falha.md](./runbook-fila-sync-falha.md) | Contato ou venda não sincronizou com o Tiny ERP | `fila_sync_externo.status = 'falha_definitiva'` ou `vendas_erp.tiny_sync_status = 'erro'` |
| [runbook-pcp-totais-divergentes.md](./runbook-pcp-totais-divergentes.md) | Totais de metal no PCP divergem dos apontamentos reais | `dist_ouro_real`, `pmc_ouro` ou `dist_ouro_retornou` fora do esperado |
| [runbook-deploy-homolog.md](./runbook-deploy-homolog.md) | Checklist completo de deploy para homolog e promoção para main | Antes de qualquer push para produção |
| [runbook-rollback-migration.md](./runbook-rollback-migration.md) | Reverter uma migration recente que causou problema | Migration aplicada com erro ou comportamento inesperado após ALTER/CREATE |
| [runbook-restaurar-backup.md](./runbook-restaurar-backup.md) | Dados corrompidos ou necessidade de restaurar estado anterior | Dados incorretos no banco após operação crítica |
| [runbook-rotacao-secrets.md](./runbook-rotacao-secrets.md) | Rotação de credenciais e segredos da aplicação | Token comprometido, expirado ou troca periódica de segurança |
| [runbook-drift-directus.md](./runbook-drift-directus.md) | Dado no `directus.ordens` diferente de `alissonerp.ordens` | Discrepâncias entre o legado Directus e o ERP atual |
| [runbook-onboarding-dev.md](./runbook-onboarding-dev.md) | Configurar ambiente de desenvolvimento para novo dev | Integração de novo desenvolvedor ao projeto |

## Regras Gerais

- **Banco de dados:** PostgreSQL 15 em `72.60.55.140:5543` (schema `alissonerp`)
- **Schemas somente-leitura:** `public.*` e `directus.*` — nunca fazer INSERT/UPDATE/DELETE
- **Antes de qualquer ALTER TABLE ou DELETE:** tirar backup (`pg_dump`)
- **Dúvidas críticas:** escalonar para Jonathan

## Contato de Escalonamento

- **Jonathan Araújo** — acesso direto ao servidor, Vercel e Supabase Dashboard
- **E-mail:** jonathan@alissonjoias.com.br
