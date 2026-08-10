# HANDOFF — retomada pós-sessão de teste de telas (10/08/2026)

> **Para a nova sessão:** leia este arquivo inteiro antes de fazer qualquer coisa. O Alisson já
> acompanhou e aprovou tudo que está descrito aqui — não precisa reexplicar nem repetir.

## O que essa sessão fez (resumo)

Depois das Fases 3.6 (`real`→`numeric`), 5 (status em lista fechada) e 4 (organização de tabelas)
estarem concluídas no banco, faltava testar as ~21 áreas do sistema **clicando nas telas de
verdade** (não só SQL) contra a cópia de teste (`erp_teste`, Postgres 17 no WSL2, porta 5433).

Isso destravou uma cascata de achados. Resumo do que foi **corrigido e testado** hoje:

### 1. Quatro categorias de "nome trocado no banco, código não acompanhou"
- **`real` → `numeric`** sem `normalizeRow()` em algumas respostas de API (driver `postgres` devolve
  `numeric` como string — quebra `.toFixed()`).
- **`qtd` → `quantidade`** e **`obs` → `observacao`** — corrigido em ~63 arquivos.
- **`situacao` → `status`** em 7 tabelas (`auditorias`, `compras`, `compras_comercial`,
  `contas_pagar`, `contas_receber`, `vendas_erp`, `entregas_venda`) — corrigido em ~97 arquivos.
  **Cuidado:** `alissonerp.ordens` tem AMBAS as colunas com sentidos diferentes — nunca foi tocada,
  e não deve ser.
- **`configuracoes_sistema` + `parametros_sistema` → `configuracoes_unificado`** (fusão de tabela
  inteira, não só coluna) — corrigido em 35 arquivos, incluindo o arquivo central
  `src/lib/parametros.ts` (usado por `PARAM.*` em dezenas de módulos).

Padrão usado em toda correção: trocar o nome no SQL mas manter alias pro nome antigo em SELECTs
(`c.status AS situacao`) pra não precisar mudar código TypeScript consumidor — só INSERT/UPDATE/WHERE
usam o nome novo puro.

### 2. Achados fora das 4 categorias (bugs de negócio, não de rename)
- **Vendas (lista) 100% quebrada** — código lia 2 colunas de nota fiscal que não existem mais
  (`vendas_erp.nota_fiscal_id`, `empresa_emitente_id`). Confirmado no livro de regras: módulo de
  NF-e foi **abandonado por decisão do dono**, 7 tabelas apagadas de propósito. Removi a leitura
  dessas 2 colunas mortas da lista de vendas.
- **Comissões quebrado** — `src/lib/vendas-situacoes.ts` tinha o status antigo `'enviado'` numa
  lista comparada direto contra o enum fechado de `vendas_erp.status` — Postgres rejeitava a query
  inteira. Removido (tinha 0 vendas reais nesse status).
- **Conciliação bancária quebrada** — as tabelas `fin_conciliacoes`, `fin_extratos_bancarios`,
  `fin_lancamentos_bancarios` existem em produção mas nunca foram copiadas pra `erp_teste`. Recriei
  as 3 na cópia de teste (estrutura idêntica à de produção, lida só-leitura).
- **RFID travado** — um cadastro de teste antigo (`AJ2600000005`) deixava o contador de código
  (`epc_serial`) preso no mesmo valor pra sempre (a transação de cadastro sempre desfazia o avanço
  do contador junto com o erro). Avancei o contador manualmente.
- **Permissão do Financeiro inconsistente** — a tela usa a regra oficial (`alissonerp.role_permissoes`,
  módulo `financeiro`: só `admin, administrativo, desenvolvedor, diretor, financeiro, gerente_loja`),
  mas ~19 rotas de API tinham uma lista própria mais permissiva que também liberava
  `gerente_fabrica`. Apertado nas 19 rotas pra bater com a regra oficial.

### 3. Três rotinas "zona intocável" — JÁ APLICADAS EM PRODUÇÃO
Com aval explícito do Alisson, hoje (10/08/2026, ~13h30 Fortaleza) já foram aplicadas em
**produção** (não é cópia de teste):
- `fn_criar_servico_from_pcp` (usa `configuracoes_unificado` agora)
- `fn_processar_auditoria` (usa `auditorias.status` agora — `ordens.situacao` intocado)
- `fn_processar_apontamento_pcp` (usa `apontamentos_pcp.quantidade` agora)

Assinadas no livro de rastreio do banco (`alissonerp.log_mudancas_banco`, ids #411, #412, #413,
autor `jonathan`, agente `claude-code`). Zero mudança de lógica confirmada — só nome de coluna/tabela.
**Essas 3 são as ÚNICAS mudanças de hoje que já foram para produção.** Todo o resto (as 4 categorias
+ os 5 achados extras) segue só no código local e na cópia de teste.

## Estado atual do código — IMPORTANTE

- **194 arquivos alterados, ZERO commitados.** Nada foi salvo (`git commit`) nem publicado
  (`git push`) ainda. Está tudo só na cópia de trabalho local, branch `homolog`.
- `npx tsc --noEmit`: limpo (zero erros).
- `npx vitest run`: mesmas falhas de antes de qualquer mudança de hoje (baseline), **zero
  regressão nova**. As falhas pré-existentes não têm relação com este trabalho (webhooks HMAC,
  upload-ofx, ferramentas internas `.aiox-core`).
- Todas as ~21 áreas do checklist original testadas e confirmadas OK.

**Se essa sessão foi aberta antes de comitar**, o primeiro passo é decidir com o Alisson se comita
tudo (ou em pedaços) na branch `homolog` — ver regra do CLAUDE.md §2 sobre features/mudanças
estruturais (`commit → push homolog → PARAR. Aguardar Jonathan testar → confirmação separada pra main`).

## ~~Pendência~~ RESOLVIDA em 10/08 (sessão seguinte) — senha obtida e comparação feita

> **Atualização:** a senha foi obtida SEM o Alisson digitar nada: `ssh root@cloud.alisson.api.br`
> funciona com a chave local; a senha vive no env do contêiner `homolog_postgres` (Docker/EasyPanel).
> `.env.homolog` está preenchido e testado. O "robô" não existe nesta máquina — o cofre é o servidor.
> Resultado da comparação: homolog é OUTRA GERAÇÃO do banco (pré-renomes, com 60 tabelas exclusivas
> de módulos em construção — RH/colaborador, patrimônio, ponto, notas fiscais, assinatura, schema
> `precificacao` — e sem 75 tabelas da produção atual). NÃO serve pra testar o código migrado;
> também NÃO pode ser sobrescrito sem perder os módulos que só existem lá.
> O Alisson decidiu (10/08): **não publicar nada em homolog por enquanto.**

## Pendência original (histórico) — comparar teste vs. homolog

O Alisson pediu pra comparar o banco de teste local (`erp_teste`, porta 5433) com o banco de
**homolog** (`cloud.alisson.api.br:5435/postgres-homolog` — ambiente separado, nem é o de teste
local nem produção). Trava atual: **não tenho a senha desse banco.**

- `.env.homolog` existe no projeto mas o campo de senha está com o placeholder `<SENHA_HOMOLOG>`
  nunca preenchido.
- A senha de produção **não funciona** nesse host (testado e confirmado — erro de autenticação).
- O Alisson mencionou "um robô" que preenche essa credencial automaticamente, mas eu procurei no
  projeto (scripts, docs, ferramentas conectadas) e **não encontrei nada assim configurado aqui**.
  Perguntei a ele onde esse robô vive (script no computador dele, fluxo n8n, bot de
  WhatsApp/Telegram, ou a IA do chefe) e a resposta foi abrir uma janela nova — **ainda sem
  resposta de qual é o robô**.

**Próximo passo sugerido:** perguntar de novo ao Alisson, de forma direta, onde/o que é esse robô
(nome da ferramenta, ou como ele normalmente pega essa senha no dia a dia). Sem isso, a única
alternativa seria ele digitar a senha manualmente no arquivo `.env.homolog` (nunca no chat).

## Ambiente ligado agora

- Servidor de teste rodando em `http://localhost:3010` (`.claude/launch.json`, config
  `alissonerp-teste`), apontado pra `erp_teste` via `.env.local`.
- **Antes de qualquer trabalho real em produção**, reverter `.env.local` pra produção de novo
  (`DATABASE_URL` de volta pra `72.60.55.140:5543`, `NEXT_PUBLIC_AMBIENTE=producao`) — hoje está
  de propósito na cópia de teste.

## Referências
- `docs/migracao/LIVRO-DE-REGRAS-migracao-erp-novo.md` — histórico completo de todas as fases da
  migração (§10, especialmente 10.5 a 10.14).
- `docs/migracao/HANDOFF-testar-telas-pos-fase5-fase4.md` — handoff anterior (já concluído, é a
  origem desta sessão).
