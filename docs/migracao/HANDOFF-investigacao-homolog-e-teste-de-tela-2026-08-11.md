# HANDOFF — investigação da quebra do homolog + robô de teste de tela (11/08/2026)

> **Para a nova sessão:** leia este arquivo inteiro antes de fazer qualquer coisa. O Alisson já
> acompanhou tudo que está descrito aqui — não precisa reexplicar nem repetir. Ele pediu `/clear`
> depois de uma sessão longa; isto é a continuação.

## Como isso começou

O Alisson relatou que uma versão "que ele nem sabia que existia" quebrou tudo ao subir pro banco
de nuvem chamado "homolog" (`cloud.alisson.api.br:5435/postgres-homolog`). Investigação completa
feita — ver seção 1.

## 1. Causa raiz da quebra do homolog — RESOLVIDO/EXPLICADO

- O banco de nuvem "homolog" é **compartilhado** com o sistema novo (`erp_back`/`erp_front`,
  reescrita em Express/Prisma) e está numa geração ANTES da limpeza deste ERP (sem os renomes
  `situacao→status`, `obs→observacao`, `qtd→quantidade`, sem `configuracoes_unificado`).
- Documento já existente `docs/migracao/HANDOFF-pos-teste-telas-10-08-2026.md` já registrava isso
  no dia 10/08 e a decisão do Alisson: **"não publicar nada em homolog por enquanto."**
- **Achado novo, confirmado no livro de mudanças do banco (`alissonerp.log_mudancas_banco`,
  produção):** essa MESMA troca de nomes já foi tentada em produção uma vez, dia 10/08 às 16h30
  Fortaleza (logs #410-413) — e teve que ser **revertida às pressas às 17h50** (logs #414-416)
  porque travou a criação de toda ordem nova pra fábrica, todo apontamento do PCP e toda aprovação
  de auditoria por ~1h20. Prova concreta de que código com nome novo + banco com nome antigo =
  quebra total. **Não aplicar a troca de nomes em produção sem trocar código E banco na MESMA
  janela.**
- Confirmado (via checkout real da EasyPanel no servidor, `/etc/easypanel/projects/alisson/alissonerp/code/.git`):
  produção está rodando exatamente o commit `7d6d5807` = topo atual de `origin/main`. Não há
  atraso de deploy.

## 2. Sistema novo (`erp_back`/`erp_front`) — testado numa cópia conjunta isolada

Repositórios reais: `github.com/alissonjoias/erp_back` e `erp_front` (branch `homolog` dos dois).
Peguei a estrutura real deles direto do banco de nuvem (só leitura) e montei uma cópia local
juntando: limpeza deste ERP + estrutura real do sistema novo. Script/receita completa em
`C:\Users\aliss\AppData\Local\Temp\claude\...\scratchpad\teste-conjunto-sistema-novo\` (pasta de
sessão — pode já ter sido apagada; se precisar refazer, o script `montar-copia-completa.mjs` tinha
a receita: dump schema-only de `precificacao` + tabelas novas de `alissonerp` do banco de nuvem,
aplicar por cima de uma cópia de `erp_teste`).

**Resultado dos testes automatizados do erp_back:** foi de 180/290 falhando pra 97/290 falhando.

**Achados reais (não corrigidos, fora do meu alcance sem decisão de negócio):**
- `erp_back` ainda lê a tabela antiga `configuracoes_sistema` em 2 pontos — já apagada neste ERP.
- 4 nomes trocados: `erp_back` espera `alissonerp.produtos` (real: `erp_produtos`),
  `alissonerp.categorias` (real: `public.categorias`), `alissonerp.orcamento` singular (real:
  `orcamentos` plural), e uma tabela de auditoria de cliente com nome diferente.
- `erp_front`: 2 bugs de sobra de merge malfeito **corrigidos só na cópia isolada** (não
  publicados): `CaixaBaixa.tsx` (variável duplicada) e `CobrancasPage.tsx` (caminho de import
  errado, `../../` devia ser `../`).
- `erp_front`: depende do pacote `asaas-js`, que **não existe no NPM** (404) — Financeiro do
  sistema novo não builda até isso ser resolvido pelo time de lá.
- Documento completo já existia antes desta sessão: `docs/migracao/RAIO-X-erp-novo-vs-atual-2026-08-11.md`
  (ainda não commitado — está como `??` no `git status`; decidir se commita).

## 3. Validação da limpeza deste ERP contra estado atual — CONTINUA 100%

- `npx tsc --noEmit`: zero erros.
- `npx vitest run --exclude "**/.claude/**" --exclude "**/node_modules/**" src/`: **1299 de 1300
  passando, 0 falhando** (1 skip). ⚠️ **Rodar SEMPRE com esse `--exclude`** — sem ele, o comando
  varre `.claude/worktrees/*` (outras sessões/branches soltas dentro do repo) e conta ~5900 testes
  de projetos que não são este.
- Comparei a estrutura de `erp_teste` (banco de teste local, porta 5433) contra produção real
  (só leitura): a única diferença é exatamente a limpeza já documentada — nenhuma surpresa. A
  migration 371 (peso de pedra) foi só lógica, sem mudança de schema.

## 4. Dois bugs visuais reais achados e CORRIGIDOS — ainda não commitados

O Alisson testou a cópia local (`localhost:3010`, apontando pra `erp_teste`) e achou 2 bugs reais,
sem relação com a limpeza:

1. **Faixa vermelha de aviso cobrindo o cabeçalho** — `src/components/VencidosAlarme.tsx`,
   `ReservaAlarme.tsx`, `MencaoAlarme.tsx`: todas tinham `md:top-0` (deveria ser a altura real do
   cabeçalho). Corrigido pra `md:top-[77px]` (77px = altura real medida ao vivo do cabeçalho nessa
   versão nova do `DashboardShell`). Confirmado que o CSS já vinha assim em produção também, mas o
   `DashboardShell` foi refeito nesta limpeza com outra altura de cabeçalho, e isso expôs o bug que
   antes não aparecia.
2. **Painel de Orçamento (par de alianças) escondia campos ao adicionar pedra + nome de gravação**
   — `src/app/(dashboard)/orcamento/OrcamentoClient.tsx` linha ~3394: painel esquerdo tinha
   `overflowY: "hidden"` com altura fixa (calculada ao vivo, `orcDesignRowHeight`, pedido do
   Jonathan pra ver o 3D sem rolar a tela toda). Quando o conteúdo (pedras + gravação) passava da
   altura, ficava escondido SEM rolagem nenhuma. O próprio comentário do código já dizia "360px
   fixo, **scroll**" — corrigido pra `overflowY: "auto"`, batendo com o que o comentário já previa.

**Estes 2 arquivos estão MODIFICADOS SEM COMMIT.** Rodar `git diff` neles antes de decidir
commitar — são mudanças pequenas e seguras (confirmadas rodando de novo no navegador), mas seguem
a regra do CLAUDE.md §2 Git (fix pequeno = pode commitar/publicar direto pra homolog depois do
`tsc` passar).

## 5. Robô de teste de tela (Playwright) — NOVO, criado nesta sessão

Este ERP não tinha teste de tela (só o `vitest` de lógica). Construído do zero:

- `playwright.config.ts` (raiz) — aponta pra `http://localhost:3010` por padrão.
- `e2e/helpers.ts` — 3 funções de login: `loginComoGerenteFabrica` (usuário real, `gerente@alisson.com`/
  `Gerente@123`), `loginComoAdminTeste`, `loginComoVendedoraTeste` (as 2 últimas lêem
  `.env.e2e-credentials`, gitignored).
- `e2e/_infra-login.spec.ts` — confirma que os 3 logins funcionam.
- `e2e/smoke-todas-paginas.spec.ts` — entra nas 34 telas principais e confirma que carregam sem
  erro. **42/42 passando** rodando como admin de teste.
- `e2e/permissoes-por-cargo.spec.ts` — confirma que a vendedora NÃO acessa Financeiro/Configurações/
  Insumos, e que o gerente de fábrica não acessa Financeiro. **5/6 passando** — o 1 que "falhou"
  (vendedora consegue abrir `/pcp`) é uma limitação JÁ DOCUMENTADA no próprio código
  (`src/app/(dashboard)/pcp/page.tsx`: "Filtros por role/depósito... serão portados pra API quando
  necessário — hoje todos veem tudo"), não é bug novo.
- `scripts/criar-usuarios-teste-e2e.mjs` — script que criou 2 usuários SÓ-DE-TESTE:
  `e2e-admin-teste@alisson.local` e `e2e-vendedora-teste@alisson.local`. **Login de verdade
  (`auth.users`/`auth.identities`) teve que ser criado em PRODUÇÃO** (é o único GoTrue real —
  homolog não tem auth próprio). Perfil de negócio (`alissonerp.usuarios`) só existe em
  `erp_teste` (local). Assinado no livro de mudanças de produção com autor `alisson`. Credenciais
  em `.env.e2e-credentials` (gitignored, não commitado, não exibido no chat).
  ⚠️ **Pegadinha do GoTrue:** `auth.users.confirmation_token`/`recovery_token`/
  `email_change_token_new`/`email_change` precisam ser string vazia `''`, NUNCA `NULL` — senão dá
  "E-mail ou senha inválidos" mesmo com a senha certa. O script já corrige isso.

**Achado real pelo robô, já corrigido:** `/protocolo` quebrava com "Application error" em
`erp_teste` (`column p.local_origem_id does not exist`) — faltava a migration 369
(`supabase/migrations/369_protocolo_transferencia_estoque.sql`) na cópia de teste local, que a
produção já tinha. Migration é aditiva/segura — já apliquei em `erp_teste` (só lá, não em
produção). Reconfirmado passando depois.

## 6. Regra de negócio duplicada — ACHADA, NÃO CORRIGIDA (decisão pendente)

A regra "desconto acima de 30% → comissão cai pro piso de 0,5%" existe em DOIS lugares:
1. `src/lib/comissao.ts` (`getComissao`) — usada ao criar/ver venda.
2. `src/app/api/tarefas/[id]/aprovacao/route.ts` linha ~948 — a MESMA regra em SQL puro, usada ao
   **aprovar um desconto pedido** (recalcula comissão de todos os itens da venda em lote).

Risco: mudar a regra num lugar não muda o outro — pode divergir silenciosamente. **Não mexi** —
juntar de verdade exige repensar como a rota de aprovação busca a tabela de faixas (hoje é tudo
dentro do SQL). Perguntei ao Alisson se quer que eu una agora ou só registre — **ele ainda não
respondeu quando esta sessão foi encerrada.**

## 7. Pendências pra próxima sessão, em ordem de prioridade

1. **Perguntar ao Alisson** o que decidiu sobre unificar a regra de comissão duplicada (seção 6).
2. Decidir se commita os 2 bugs visuais corrigidos (seção 4) — são fix pequeno, tsc limpo, já
   testado ao vivo — pela regra do CLAUDE.md pode ir direto pra homolog sem esperar aprovação
   extra, mas confirmar com o Alisson primeiro já que ele não confirmou explicitamente ainda.
3. Decidir se commita a infraestrutura de teste de tela (seção 5 — `playwright.config.ts`, `e2e/`,
   `scripts/criar-usuarios-teste-e2e.mjs`) — não tem risco (só ferramenta de teste), mas nunca foi
   commitada ainda.
4. Continuar rodando o robô de teste de tela pra mais cargos/regras se o Alisson quiser mais
   cobertura (hoje só cobre "tela abre" + 1 exemplo de permissão — falta testar fluxos completos
   tipo criar uma venda de ponta a ponta).
5. Os 4 arquivos `src/app/api/produtos/*.ts` modificados sem commit **já estavam assim ANTES desta
   sessão começar** (não fui eu) — não sei o que é, perguntar ao Alisson ou investigar antes de
   mexer.
6. `docs/migracao/RAIO-X-erp-novo-vs-atual-2026-08-11.md` está sem commit — decidir se publica
   (tem achado de segurança do sistema novo: 44 rotas de estoque sem login).
7. O servidor de teste (`localhost:3010`, `alissonerp-teste`) pode não estar mais rodando depois
   do `/clear` — se precisar, `npm run dev` com `.env.local` já apontado pra `erp_teste` (porta
   5433, senha `testelocal123`), ou usar o preview do Claude Code com config `alissonerp-teste`
   do `.claude/launch.json` (porta 3010).

## Referências
- `docs/migracao/HANDOFF-pos-teste-telas-10-08-2026.md` — origem da explicação da geração antiga
  do homolog.
- `docs/migracao/LIVRO-DE-REGRAS-migracao-erp-novo.md` — histórico completo da migração de banco.
- `docs/migracao/RAIO-X-erp-novo-vs-atual-2026-08-11.md` — comparação código-a-código com o
  sistema novo (não commitado).
- `alissonerp.log_mudancas_banco` (produção) — ids #410 a #420 cobrem tudo desta sessão e da
  sessão de 10/08 relacionada.
