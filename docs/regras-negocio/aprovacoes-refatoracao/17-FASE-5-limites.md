# FASE 5 — Unificar limites/threshold de desconto

> **Executor: Sonnet (operacional).** Arquiteto/revisor: Opus. Pacote auto-contido — você não herda
> chat. Leia `00-README.md`, `03b-config-first-estrito.md` e `12-FASE-3g-venda-plano.md` (seção
> "Fronteira 3g / Fase 4 / Fase 5") antes. Branch: `feat/centralizar-aprovacoes` (worktree
> `alissonerp-wt-centralizar-aprovacoes`). Fases 1–4 estão FECHADAS — esta fase NÃO mexe na camada
> `src/lib/aprovacoes/` (autoridade — quem aprova), só no VALOR do limite (quanto pode sem aprovar).

## O problema (mapeado e decidido pelo Jonathan em 15/07)

Hoje existem **~4 cópias divergentes** do "até quanto de desconto não precisa de aprovação":

1. `getDescontoThreshold()` (`src/lib/aprovacao-regras.ts:237-253`) — o gate REAL que trava a aprovação
   da venda (`approveVenda`, `solicitar-aprovacao`, PATCH de item, pagamentos, crédito — 9+ chamadores).
   Fallback quando `mx_desconto_permitido` está vazio: `gerente_fabrica/financeiro=30, gerente_loja=50,
   resto=15`. **BUG**: admin/desenvolvedor não têm exceção nessa CASE — caem no `resto=15`, divergindo
   do front (que dá 100% pra eles).
2. Fronts de venda (`vendas/nova/page.tsx:11-38`, `vendas/[id]/page.tsx:17-40`) — duplicam a MESMA lógica
   acima (15/30/50, admin/dev=100) só que hardcoded localmente, 2x.
3. Fronts de orçamento (`orcamento/page.tsx:61`, `orcamento/detalhe/[id]/page.tsx:104`) — **sem fallback
   de cargo nenhum**: `mx_desconto_permitido ?? 0`. Admin sem cadastro trava em 0% no slider (o backend
   de `/api/orcamento` já bypassa certo via `isFullAccess`, mas a UI não deixa nem tentar).
4. `tarefas_regras_aprovacao.condicao_json.percentual` (banco) — usado por `avaliarRegras()`
   (`aprovacao-regras.ts:31-61`) pra decidir se existe "regra aplicável" e criar a tarefa de aprovação.
   **Divergência de dado real** (conferida no banco homolog): 2 linhas ATIVAS pra `desconto_acima` —
   id=1 (`condicao_json` é uma STRING malformada `"{\"percentual\":30}"` em vez de objeto — cai no
   fallback 30 do código por acidente) e id=3 (`{"percentual":20}`, objeto correto). `cartao_desconto`
   tem 1 linha só, `{"percentual":20}`.
5. Limite de cartão (20%) hardcoded **literal** (`> 20` na query SQL) em 4 lugares:
   `vendas-aprovar.ts:553`, `solicitar-aprovacao/route.ts:186` e `:215`, `pagamentos/route.ts:178`,
   `pagamentos/[pagId]/confirmar/route.ts` (conferir na hora — mesma família).

Já existe uma calculadora pronta e testada (22/22) desde 23/06, **nunca ligada** em nenhum gate real:
`src/lib/desconto/precificar-item.ts` — `calcularTetoDesconto()` (linhas 166-175) e as constantes
`FULL_ACCESS_ROLES_DESCONTO`, `FALLBACK_TETO_DESCONTO_PCT`, `LIMITE_DESCONTO_CARTAO_PADRAO`
(linhas 122-133). Só `precificar-item.ts` e seu teste usam essas constantes — os 4 gates reais de
cartão hardcodam `20` direto.

## Decisões do Jonathan (15/07) — a regra desta fase

1. **O gate de "precisa aprovação" é 100% o `mx_desconto_permitido` pessoal do vendedor** (cadastro em
   Configurações › Usuários). Não existe mais um percentual global (item 4 acima) decidindo isso pra
   desconto normal — `tarefas_regras_aprovacao.condicao_json.percentual` de `desconto_acima` e
   `cartao_desconto` **deixa de ser lido**. `avaliarRegras()` passa a responder só "existe regra ativa
   pra esse evento" (`true`), igual já faz pra `devolucao`. A checagem "o desconto passou do limite?"
   continua ANTES, no endpoint, comparando contra o threshold pessoal (que já é o que `tem_desconto_alto`
   faz hoje — só falta o mesmo raciocínio explícito antes de chamar `avaliarRegras`).
2. **Fallback sem cadastro = 0%** (mantém a decisão de 23/06 — `FALLBACK_TETO_DESCONTO_PCT`). Sem
   `mx_desconto_permitido` cadastrado, qualquer desconto pede aprovação. **Exceção**: admin/desenvolvedor
   continuam com 100% — via checagem de ROLE (`FULL_ACCESS_ROLES_DESCONTO`), não via essa chave de
   config (a exceção de cargo não muda, só o fallback de quem não tem cadastro e não é admin/dev).
3. **O fallback (item 2) vira configurável** em `configuracoes_sistema` — chave nova
   `desconto_fallback_sem_cadastro_pct` (valor inicial `'0'`), em vez do `FALLBACK_TETO_DESCONTO_PCT`
   hardcoded em `precificar-item.ts`. A constante do arquivo vira só o valor de SEED/fallback-do-fallback
   (se a chave não existir no banco ainda).
4. **Cartão tem limite PRÓPRIO, separado do desconto normal** — não usa `mx_desconto_permitido`. Vira
   chave nova `limite_desconto_cartao_pct` em `configuracoes_sistema` (valor inicial `'20'`), lida nos
   4 gates em vez do literal `20`.
5. **Limpeza do banco** (não é deste pacote — é ação do Opus via `/dba`, DEPOIS do código revisado):
   desativar a linha duplicada/corrompida de `desconto_acima` em `tarefas_regras_aprovacao` (fica só
   uma, `ativo=true`, já que o `percentual` não é mais lido pra esse evento — mas duas linhas ativas
   confundem quem olhar a tabela depois). **Não faça DDL/DML — só código.**
6. **`encontrarAprovador()` está morto** desde a Fase 3g.3 (confirmado: `grep -rn "encontrarAprovador("
   src` só acha a própria definição em `aprovacao-regras.ts:75`). **Deletar** nesta fase, já que
   `avaliarRegras()` no mesmo arquivo está sendo tocado.

## Escopo — ARQUIVOS a mudar (nenhum outro)

### 1. `src/lib/desconto/precificar-item.ts`
- Nenhuma mudança de lógica pura — `calcularTetoDesconto()` já está correto (fallback via parâmetro,
  admin/dev=100 via `fullAccessRoles`). Só ajustar o comentário de `FALLBACK_TETO_DESCONTO_PCT` e
  `LIMITE_DESCONTO_CARTAO_PADRAO` explicando que agora são o *seed* — o valor real vem de
  `configuracoes_sistema` (`desconto_fallback_sem_cadastro_pct` / `limite_desconto_cartao_pct`), lido
  pelos callers antes de chamar `calcularTetoDesconto(tetoUsuario, role, fullAccessRoles, valorDaConfig)`.

### 2. `src/lib/aprovacao-regras.ts`
- **`getDescontoThreshold(vendaId)`** (linhas 237-253): trocar a `CASE` hardcoded (30/50/15) por:
  1. Buscar `mx_desconto_permitido` e `role` do vendedor (query já existe, só remover a CASE de dentro
     do SQL).
  2. Buscar a chave `desconto_fallback_sem_cadastro_pct` em `configuracoes_sistema` (uma query extra ou
     `LEFT JOIN LATERAL` — como preferir, mantendo simples). Se a chave não existir/não for número
     válido, usar `FALLBACK_TETO_DESCONTO_PCT` (importado de `precificar-item.ts`) como último recurso.
  3. Chamar `calcularTetoDesconto(mxDesconto, role, FULL_ACCESS_ROLES_DESCONTO, fallbackDaConfig)`
     (importar de `@/lib/desconto/precificar-item`) e retornar o resultado.
  - Assinatura e retorno (`Promise<number>`) **não mudam** — todos os 9+ chamadores continuam
    funcionando sem alteração.
- **`avaliarRegras()`** (linhas 31-61): no `switch`, trocar:
  ```ts
  case "desconto_acima":
    return true; // gate real é o threshold pessoal (getDescontoThreshold), checado ANTES pelo caller
  case "cartao_desconto":
    return true; // idem — gate real é limite_desconto_cartao_pct, checado ANTES pelo caller
  ```
  (mesma forma que `case "devolucao": return true;` já usa hoje). O restante do switch (`valor_venda_acima`,
  `credito_loja`, `orcamento_acima`) **não muda**.
- **Deletar `encontrarAprovador()`** inteira (função + o comentário de bloco acima dela, linhas ~63-131
  aprox. — conferir intervalo exato no arquivo atual) e o `import { getMasterAdminId } from
  "@/lib/master-admin"` do topo (fica sem uso depois de remover a função). Tirar `encontrarAprovador`
  do `export { ... }` final.
- Adicionar import: `import { calcularTetoDesconto, FULL_ACCESS_ROLES_DESCONTO, FALLBACK_TETO_DESCONTO_PCT }
  from "@/lib/desconto/precificar-item";`.

### 3. `src/app/api/vendas/[id]/solicitar-aprovacao/route.ts`
- Bloco `tipo === "desconto"` (linhas ~92-120): a checagem "o desconto passou do limite?" precisa
  acontecer EXPLICITAMENTE antes de chamar `avaliarRegras`/`criarTarefaAprovacao`, já que `avaliarRegras`
  não filtra mais por percentual. `maiorDesconto` e `descontoThreshold` (já calculado no topo da função,
  linha ~57) já dão o suficiente:
  ```ts
  if (maiorDesconto <= descontoThreshold) {
    return NextResponse.json({ ok: true, aguardando_aprovacao_desconto: false, message: "Nenhuma regra de aprovação aplicável" });
  }
  ```
  Colocar ANTES da chamada a `avaliarRegras` (mesma mensagem que já existia pro caso `regras.length===0`,
  pra não mudar o contrato que o front lê).
- Bloco `tipo === "cartao_desconto"` (linhas ~180-215): os 2 `WHERE ... pct_desconto > 20` viram
  `WHERE ... pct_desconto > ${limiteCartao}`, onde `limiteCartao` é lido de `configuracoes_sistema`
  (`limite_desconto_cartao_pct`, fallback `LIMITE_DESCONTO_CARTAO_PADRAO` se ausente/inválido) **uma
  vez**, no topo do bloco. Mesma ideia do desconto: se `itensDesconto.length === 0` já existe como guard
  (mensagem "Nenhum item com desconto acima de X%" — atualizar a mensagem pra usar o valor dinâmico, não
  o literal "20%").

### 4. `src/lib/vendas-aprovar.ts` (linha 553)
- `pct_desconto > 20` → `pct_desconto > ${limiteCartao}`, lendo a mesma chave `limite_desconto_cartao_pct`
  (com fallback). Confirmar se há uma função helper já compartilhada pra ler config simples (ex.: algo
  como `buscarConfigNumerica(chave, fallback)`) antes de escrever uma nova — se não houver, criar uma
  pequena e **reusar nos 4 lugares** (não duplicar a leitura 4x).

### 5. `src/app/api/vendas/[id]/pagamentos/route.ts` (linha ~178) e
   `src/app/api/vendas/[id]/pagamentos/[pagId]/confirmar/route.ts`
- Mesma troca do item 4 — `pct_desconto > 20` → `pct_desconto > ${limiteCartao}` via o mesmo helper.
  Confirmar o número exato de ocorrências com `grep -n "pct_desconto > 20" src -r` ANTES de mexer (pode
  haver mais de uma no `confirmar/route.ts` — verificar).

### 6. Fronts — `vendas/nova/page.tsx`, `vendas/[id]/page.tsx`
- Trocar o bloco:
  ```ts
  const SUPER = ["desenvolvedor", "admin"];
  if (SUPER.includes(role)) { maxDesconto = 100; }
  else if (u.mx_desconto_permitido != null && Number(u.mx_desconto_permitido) > 0) { maxDesconto = Number(u.mx_desconto_permitido); }
  else { const FULL = [...]; if (FULL.includes(role)) maxDesconto = 30; else if (role === "gerente_loja") maxDesconto = 50; else maxDesconto = 15; }
  ```
  por uma chamada a `calcularTetoDesconto(Number(u.mx_desconto_permitido ?? 0) || null, role, FULL_ACCESS_ROLES_DESCONTO, fallbackDaConfig)`
  (importado de `@/lib/desconto/precificar-item`), com `fallbackDaConfig` lido de `configuracoes_sistema`
  (mesma leitura do item 2, feita no server component — já é `async function`). **Isso remove a
  duplicação da CASE em 2 arquivos e alinha os 2 fronts com o gate real.**

### 7. Fronts — `orcamento/page.tsx` (linha 61), `orcamento/detalhe/[id]/page.tsx` (linha 104)
- Trocar `maxDesconto={Number(caller.mx_desconto_permitido ?? 0)}` pela MESMA chamada a
  `calcularTetoDesconto(...)` do item 6 (agora os 4 pontos de entrada usam a mesma função pura — só a
  fonte dos dados de entrada muda por página). Isso corrige o bug real: admin sem cadastro passa a ver
  100% no slider do orçamento (hoje vê 0%), igual ao resto do sistema.

### 8. Config — `configuracoes_sistema` (leitura só — sem migration/DDL neste pacote)
- As 2 chaves novas (`desconto_fallback_sem_cadastro_pct`, `limite_desconto_cartao_pct`) **ainda não
  existem no banco**. Todo lugar que lê essas chaves DEVE cair no fallback do código
  (`FALLBACK_TETO_DESCONTO_PCT=0` / `LIMITE_DESCONTO_CARTAO_PADRAO=20`) se a chave estiver ausente —
  **não pode quebrar** (nada de 409 tipo "não configurado" aqui — isso é autoridade, Fase 1b; aqui é só
  um número com default seguro). Deixe um comentário no código apontando que as chaves serão criadas
  via `/dba` (homolog primeiro) — é o Opus quem cria, não este pacote.
- **Não adicionar campo na tela de Configurações nesta fase** — é só leitura de banco por enquanto; UI
  fica para depois (o Jonathan decide onde encaixar — tela nova "Limites" ou dentro de "Aprovadores").

## Testes

- `src/__tests__/desconto-logica.test.ts` — os testes que hoje esperam fallback 15/30/50 por cargo
  (ex.: linhas 110-119 conferidas: "mx_desconto_permitido=45 não precisa aprovação para 31%") **têm que
  ser revistos** para refletir fallback=0 (exceto admin/dev=100). Não adivinhar — rodar `npx vitest run
  src/__tests__/desconto-logica.test.ts` ANTES de mexer pra ver o baseline, depois ajustar os testes que
  dependem do valor antigo.
- `src/__tests__/solicitar-aprovacao-desconto.test.ts`, `pagamento-ouro.test.ts`,
  `submeter-credito-celular.test.ts` — mockam `getDescontoThreshold` diretamente (`threshold: 30`) —
  como a assinatura/retorno não muda, esses mocks continuam válidos sem alteração.
- Novo teste (ou extensão de `desconto-precificar-item.test.ts`): `getDescontoThreshold` com
  `mx_desconto_permitido=NULL`, role=`admin` → 100; role=`consultora` → 0 (fallback sem chave de config);
  com a chave `desconto_fallback_sem_cadastro_pct` mockada/injetada → usa o valor da chave.
- `npx vitest run src/lib/aprovacoes` deve continuar 121/121 (camada de autoridade **intocada**).

## O que NÃO mexer

- `src/lib/aprovacoes/` (Fases 1-4, autoridade — quem decide) — zero mudanças.
- `resolverAprovadores`/`podeDecidir`/`criarTarefaAprovacao` (origem do `aprovadorId`) — intocados,
  já usam config-first desde a Fase 3g.3/4.
- `approveVenda`/trava R3, `mx_desconto_permitido` como coluna (schema) — não mexe no cadastro em si,
  só em quem LÊ e no fallback quando está vazio.
- Comissão (`faixas_comissao`, 0,5% acima de 30%) — Fase 4, já fechada, não repetir aqui.
- Nenhuma migration/DDL/DML — as 2 chaves de config são criadas DEPOIS, pelo Opus via `/dba`, em
  homolog primeiro.

## Critérios de aceite

1. `npx tsc --noEmit` → 0 erros.
2. `npx vitest run src/lib/aprovacoes` → 121/121 (intocado).
3. `npx vitest run src/__tests__/desconto-logica.test.ts src/__tests__/solicitar-aprovacao-desconto.test.ts` →
   passando (ajustados pro fallback novo, sem regressão nos que não dependem do fallback).
4. `grep -rn "encontrarAprovador" src` → só doc/comentário (se sobrar), zero chamada.
5. `grep -rn "pct_desconto > 20\b" src --include='*.ts'` → zero (todos usando a variável/config).
6. `grep -rn "maxDesconto = 15\|maxDesconto = 30\|maxDesconto = 50" src` → zero nos 4 arquivos de página
   (a lógica virou `calcularTetoDesconto`).
7. `git status` lista só os arquivos dos itens 1-7 acima (mais os docs). Nenhum arquivo de
   `src/lib/aprovacoes/`, `src/components/`, `roles.ts`, `permissoes.ts` tocado.
8. Commit: `refactor(desconto): unifica os ~4 tetos de desconto em calcularTetoDesconto + config
   (Fase 5)`.
9. Atualizar `00-README.md` (status da Fase 5 — marcar como código pronto, aguardando Opus criar as
   2 chaves em homolog e testar) e reportar pro Opus revisar antes da Fase 6.

## Cenários pra Opus validar em homolog (depois do código pronto)

- Vendedora com `mx_desconto_permitido=20` → item a 21% pede aprovação; a 20% não pede.
- Vendedora SEM cadastro (`NULL`/`0`), role `consultora` → item a 1% JÁ pede aprovação (fallback 0,
  antes de criar a chave de config — usa o `FALLBACK_TETO_DESCONTO_PCT` do código).
- Depois de criar `desconto_fallback_sem_cadastro_pct='10'` em homolog → a mesma vendedora sem cadastro
  passa a ter 10% livre (confirma que a chave de config é lida e vence o hardcoded).
- Admin/dev como vendedor da venda (sem cadastro) → 100%, nunca pede aprovação por desconto (confirma o
  fix do bug — antes caía em 15%).
- Cartão: item a 21% com a venda ainda sem `desconto_cartao_aprovado_por` → pagamento em cartão de
  crédito bloqueado (409); depois de criar `limite_desconto_cartao_pct='25'` em homolog → o mesmo item
  a 21% NÃO bloqueia mais (confirma a config vencendo o `20` hardcoded).
- Front: orçamento aliança/peça pro admin sem cadastro → slider vai até 100% (antes travava em 0%).
