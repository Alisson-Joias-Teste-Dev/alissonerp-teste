# ALERTA — Credenciais reais de produção expostas em texto puro no repositório

**Data:** 07/08/2026
**Achado por:** sessão Claude Code (Alisson), ao configurar um ambiente local do ERP
**Status:** NÃO CORRIGIDO — aguardando decisão do Jonathan sobre ordem/momento da rotação

---

## O que foi encontrado

O arquivo [`scripts/switch-to-producao.sh`](../../scripts/switch-to-producao.sh) contém, em texto puro,
dentro de um heredoc que escreve `.env.local`:

- `DATABASE_URL` — senha real do usuário `postgres` no banco de produção (`72.60.55.140:5543`)
- `SUPABASE_SERVICE_ROLE_KEY` — chave de serviço do projeto Supabase self-hosted de produção
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — chave anônima do mesmo projeto
- `MERCADOPAGO_ACCESS_TOKEN`
- `TINY_CLIENT_ID` / `TINY_CLIENT_SECRET`

Esse arquivo está **versionado e commitado** no GitHub (`alissonjoias/alissonerp`, repositório
**privado**), com histórico em múltiplos commits — não é novo, não foi este que introduziu.
Confirmado via `git ls-files` + `git log -- scripts/switch-to-producao.sh`.

Não foi encontrado nenhum outro arquivo com o mesmo problema numa varredura pontual, mas não foi
feita uma auditoria completa do histórico do repo — pode haver outras versões antigas do mesmo
arquivo, ou outros arquivos, com o mesmo padrão.

## Mapa de impacto de cada credencial (antes de rotacionar)

Levantamento feito em modo leitura, sem expor nenhum valor (detalhes completos disponíveis na sessão
que gerou este alerta, se precisar do raciocínio completo):

| Credencial | Usada via env var no código? | Quem quebra se trocar sem sincronizar |
|---|---|---|
| `DATABASE_URL` (senha Postgres) | Sim, `src/lib/db.ts` e praticamente toda API do ERP | Todo o ERP para. Não confirmado se o Supabase self-hosted (GoTrue/PostgREST/Realtime, fora deste repo) usa a mesma senha — se usar, login/Storage também quebram |
| `SUPABASE_SERVICE_ROLE_KEY` | Sim — upload/Storage no ERP | **Compartilhada com o CRM** (`web/src/lib/supabase/admin.ts`, gestão de contas de equipe) — quebra os dois sistemas |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` + `URL` | Sim — login, sessão, Realtime, Storage no ERP | **Maior raio de impacto.** Compartilhada com o CRM (login + toda consulta via PostgREST). Não confirmado se trocar implica também trocar o JWT secret do GoTrue — se sim, desloga todo mundo logado nos dois sistemas |
| `MERCADOPAGO_ACCESS_TOKEN` | **Não** — código usa `alissonerp.configuracoes_secrets.mp_access_token`, configurado pela tela Configurações > Integrações | Nenhum. O valor no script é vestigial/morto |
| `TINY_CLIENT_ID` / `TINY_CLIENT_SECRET` | **Não** — código usa `alissonerp.configuracoes_secrets` (tiny_client_id/secret) | Nenhum ao trocar o arquivo. Risco só existe se revogar no painel do Tiny sem atualizar o valor no banco (exige reconexão manual) |

## O que já existe pronto

- `docs/runbooks/runbook-rotacao-secrets.md` já descreve um procedimento seguro de 5 passos
  (gerar novo sem revogar o antigo → atualizar `.env.local` → atualizar Vercel → testar em
  Preview/homolog → só então revogar o antigo), incluindo comandos `vercel env` e uma seção de
  escalonamento pro Jonathan em caso de troca urgente do `DATABASE_URL`.
- **Duas lacunas nesse runbook** identificadas nesta sessão: (a) ele trata Mercado Pago e Tiny como
  se fossem env var + Vercel, mas o código real lê do banco — está desalinhado com a implementação
  atual pra esses dois; (b) não menciona em nenhum momento que o CRM compartilha as mesmas chaves
  Supabase — seguir o runbook isolado no ERP rotacionaria as chaves sem avisar que o CRM quebra junto.

## Recomendação (não executada ainda)

1. Mercado Pago e Tiny: pode rotacionar quando quiser, sem risco funcional (só lembrar de atualizar
   o valor em `alissonerp.configuracoes_secrets` antes de revogar o antigo no painel de cada serviço).
2. `DATABASE_URL` e as chaves Supabase: risco alto e efeito nos dois sistemas (ERP + CRM). Recomenda-se
   coordenar com quem tem acesso à infraestrutura do Hostinger (pra confirmar se o Supabase self-hosted
   usa a mesma senha do Postgres) antes de trocar, e avisar o time do CRM antes de rotacionar as chaves
   Supabase.
3. Depois de rotacionar tudo, limpar o histórico do Git que ainda contém os valores antigos (`git
   filter-repo` ou BFG) — isso exige coordenar force-push com todo mundo que tem uma cópia local do
   repositório (Jonathan, a outra IA, este ambiente).

Assinado: sessão Claude Code de Alisson, 07/08/2026 (horário de Fortaleza).
