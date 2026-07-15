# Regras de Negócio — Entregas (Módulo de Entrega de Venda + Frete Avulso)

> Documento **mantido à mão** (NÃO é auto-gerado como `docs/schema/`). Toda vez que mexermos no módulo de entregas, atualizar aqui: regra nova → acrescenta; regra mudou → corrige.
> Fonte de schema (colunas/tabelas) = `docs/schema/` (auto-gerado). Aqui é o **porquê** e o **como** do negócio.
> ⚠️ Existe uma nota mais antiga e parcial sobre frete avulso registrado pelo motoboy em `docs/regras-negocio/comercial.md` §8 (PR#75). Este arquivo é o documento completo do módulo — considerar migrar/mesclar aquele trecho para cá numa limpeza futura.

Última atualização: 2026-07-15 (fase de blindagem final do frete avulso com solicitação/pool — branch `feat/frete-avulso-solicitacao`).

---

## 1. Estados da entrega (`enum_entrega_situacao`)

Ciclo de vida: **solicitada → pendente → em_rota → confirmada** (+ **cancelada**, que pode acontecer a partir de `solicitada` ou `pendente`).

| Estado | O que significa | Quem transiciona |
|---|---|---|
| `solicitada` | Frete avulso pedido pela consultora, aguardando liberação. Não lançou saldo, não tem dono. **Só existe para avulso** — entrega normal (vinculada a itens de venda) nunca passa por aqui, nasce direto `pendente`. | Consultora cria (`POST /api/entregas-venda/frete-avulso`). |
| `pendente` | Entrega normal recém-criada (itens prontos para saída) OU avulso já liberado/criado direto, aguardando saída física. | Sistema (entrega normal), ou liberador do pool / criação direta (avulso). |
| `em_rota` | Motoboy retirou/aceitou e está a caminho. | Motoboy (retirada normal ou aceite de pool). |
| `confirmada` | Entregue/confirmado. Entra no acerto financeiro do motoboy. | Motoboy ou admin/gerente (código de verificação para entrega normal; botão simples para avulso). |
| `cancelada` | Cancelada (entrega normal pendente) ou recusada (avulso solicitado). Não é apagada — fica para auditoria. | Quem tem permissão de cancelar/recusar. |

Ordem do enum: `solicitada` foi inserida **antes** de `pendente` (migration 346, `ALTER TYPE ... ADD VALUE ... BEFORE 'pendente'`).

---

## 2. Fluxo do frete avulso com solicitação (modelo POOL)

Frete avulso = corrida de motoboy **sem venda vinculada** para fins de entrega física (`entregas_venda.is_avulso=true`), mas que **pode referenciar uma venda** (`venda_id`) só para herdar cliente/endereço quando é uma solicitação.

1. **Consultora solicita** (`POST /api/entregas-venda/frete-avulso`, role `consultora`): informa a **venda própria** (`requireVendaOwnership` — mesma trava de IDOR usada em `/api/vendas`), o **endereço de entrega confirmado** (texto livre, gravado **na entrega**, não altera o cadastro do cliente) e o valor cobrado do cliente. **Não escolhe motoboy nem responsável.** A entrega nasce `solicitada`, **sem lançar saldo** (`criarFreteAvulso` com `modoSolicitacao=true`).
2. **Liberador do pool decide** — qualquer usuário ativo em `alissonerp.frete_avulso_liberadores` OU admin/dev/diretor (`podeGerenciarSolicitacoesAvulso`):
   - **Libera** (`POST /[id]/liberar-avulso` → `liberarFreteAvulso`): `solicitada → pendente`. É **aqui** que o custo é assumido — `lancarSaldoFreteAvulsoNoTx` lança a diferença cobrado×motoboy no saldo da gerente da região. `FOR UPDATE` na transação evita lançamento dobrado em cliques concorrentes.
   - **Recusa** (`POST /[id]/recusar-avulso` → `recusarFreteAvulso`): `solicitada → cancelada`, exige **motivo** (mín. 3 caracteres, rastreabilidade para a consultora). **Nunca** lança saldo — a corrida não aconteceu.
3. **Corrida cai no pool sem dono** (`motoboy_id IS NULL`) assim que liberada (ou quando criada direto sem motoboy escolhido).
4. **Qualquer entregador ativo aceita** (`POST /[id]/aceitar-avulso` → `aceitarFreteAvulso`): `pendente → em_rota`, carimba `motoboy_id`, `data_saida`, `confirmado_por_motoboy_retirada`. O **claim é atômico**: um único `UPDATE` com `WHERE situacao='pendente' AND (motoboy_id IS NULL OR motoboy_id = <ele>)` — se `res.count === 0`, outro motoboy já pegou primeiro (ver §7, race de dois motoboys).
5. **Finaliza** (`POST /[id]/confirmar-avulso` → `confirmarFreteAvulso`): `em_rota → confirmada`, sem código de verificação (avulso não usa código A/B). Entra no acerto do motoboy (`vw_motoboy_entregas`, pagamento em lote).

---

## 3. Criação direta (estoquista/admin/gerente/dev)

Estes papéis continuam criando o avulso **já liberado** — não passam pela solicitação:

- Nasce **`pendente`** direto (não `solicitada`).
- Lança saldo **na criação** (`lancarSaldoFreteAvulsoNoTx` chamado dentro de `criarFreteAvulso` quando `modoSolicitacao` é falso).
- **Com motoboy escolhido** → a corrida já nasce com dono. **Sem motoboy** → cai no pool sem dono (mesmo mecanismo do passo 3 acima), qualquer entregador aceita.

## 4. Auto-registro do entregador (PR#75)

O próprio motoboy registra a própria corrida pelo app (`MotoboyAppClient` → "Nova corrida"):

- Só escolhe **descrição + região** (Fortaleza/Fora de Fortaleza); valor é **fixo pela tabela** (`calcularValorMotoboy`), não digitado.
- `motoboy_id` forçado como ele mesmo; `frete_cobrado = frete_motoboy` (não cobra do cliente → **não mexe** no saldo da gerente).
- Nasce **`pendente`** com dono (ele mesmo) — não é pool.
- **Anti-fraude:** ele **não confirma o próprio lançamento**. `confirmar-avulso` bloqueia (403) quando `created_by === motoboy_id` para role motoboy/entregador — a loja (admin/gerente/dev) confirma. `GET /motoboy/minhas` expõe `auto_criado` para o app mostrar "Aguardando confirmação da loja" sem botão de confirmar.
- A lib (`confirmarFreteAvulso`) permite confirmar a partir de `pendente` **somente** quando `autoRegistrada` (senão exige `em_rota`, ou seja, aceite prévio) — é o que possibilita a loja confirmar direto sem que a corrida passe por aceite.

## 5. Lista configurável de liberadores (pool)

- Tabela `alissonerp.frete_avulso_liberadores` (migration 346): `user_id` (PK, FK `auth.users`), `ativo`, `created_at`, `created_by`.
- Gerida em **Configurações** (`TabFreteAvulsoLiberadores.tsx` + `GET/POST/DELETE /api/configuracoes/frete-avulso-liberadores`, restrito a `isFullAccess`). Lista **aberta**: qualquer usuário ativo do ERP pode virar liberador (mesmo padrão de outras configs de aprovador, ex. `aprovador_devolucao_fora_prazo`). `DELETE` é soft (`ativo=false`), preserva histórico.
- Helper único de permissão: `podeGerenciarSolicitacoesAvulso(userId, role)` — `true` se `isFullAccess(role)` OU se está ativo na tabela. Usado em **todas** as pontas: rota de liberar, recusar, SSR da tela (`entregas-venda/page.tsx`, controla quem vê a aba "Solicitações" e quem pode usar `?situacao=solicitada`), e a própria API de configuração dos liberadores referencia esse helper no comentário para não divergir.

## 6. ⚠️ Pool aberto sem gating de região/loja (decisão do Jonathan)

**Qualquer** liberador ativo enxerga e decide **qualquer** solicitação, de qualquer região/loja — não há filtro por região do liberador nem por loja de origem. Da mesma forma, **qualquer** entregador ativo enxerga e pode aceitar **qualquer** corrida liberada, independente de região. Essa é uma decisão de produto explícita (modelo POOL, sem responsável designado, para não gerar gargalo quando um responsável fixo está ausente) — registrado aqui para não ser confundido com uma falha de escopo/permissão.

## 7. Constraints

- **`chk_entrega_origem`** (recriada na migration 346): entrega normal (`is_avulso=false`) continua exigindo `venda_id IS NOT NULL`; avulso (`is_avulso=true`) aceita `venda_id` preenchido (solicitação, para herdar cliente/endereço) **ou** nulo (avulso sem venda).
- **`chk_codigos_obrigatorios`** (migration 294, ajustada na 298): avulso dispensa `codigo_cliente`/`codigo_motoboy` (não usa o fluxo de dois códigos da entrega normal).
- **Saldo lançado UMA vez, nunca duas**: `lancarSaldoFreteAvulsoNoTx` é a **única** função que grava em `saldo_frete_gratis` para avulso — chamada em exatamente um dos dois pontos por corrida: criação direta (`criarFreteAvulso` quando `!modoSolicitacao`) **ou** liberação (`liberarFreteAvulso`), nunca os dois para a mesma entrega (mutuamente exclusivos pela própria lógica: solicitação nasce sem lançar, criação direta lança na hora).

---

## 8. Débitos técnicos conhecidos (registrados, não bloqueiam)

- **Pool sem gating de região/loja** — ver §6 (decisão explícita, não é bug).
- **Admin não "aceita" corrida do pool** — só entregador (`role in ('entregador','motoboy')`) pode chamar `aceitar-avulso`; admin/gerente gerenciam e liberam solicitações mas não tomam o lugar de um motoboy na corrida.
- **Card "Pendentes" da tela de entregas não conta separadamente o pool** — o subcontador `pendente` conta qualquer `situacao='pendente'`, incluindo avulso em pool sem dono; não há um contador dedicado "aguardando aceite de motoboy".
- **Cancelar entrega de um avulso liberado NÃO estorna o saldo lançado** — `cancelarEntrega()` (genérica, usada também para entrega normal) só exige `situacao='pendente'` e atualiza `situacao='cancelada'`; não toca `saldo_frete_gratis`. Se um avulso foi liberado (saldo já lançado) e depois cancelado antes do aceite, o crédito/débito no saldo da gerente **permanece**, mesmo a corrida não tendo acontecido. Registrado como débito técnico conhecido — não bloqueado nesta fase.
- **Entregador aceita/registra corrida sem exigir cadastro prévio em `alissonerp.motoboys`** — `aceitarFreteAvulso`/auto-registro carimbam `motoboy_id` a partir do usuário autenticado (`role in ('entregador','motoboy')`), sem checar se existe linha correspondente em `motoboys`. Isso pode deixar `vw_motoboy_entregas`/pagamento sem o `JOIN` de nome resolvido (nome nulo) se o usuário nunca foi cadastrado como motoboy. Baixo risco — só registrado.

---

## 9. Matriz de permissão (roteiro de teste em homolog)

Para o Jonathan validar em homolog depois que a migration 346 rodar:

| Perfil | Solicitar avulso | Liberar/Recusar | Criar avulso direto | Aceitar corrida do pool | Confirmar avulso | Ver aba "Solicitações" |
|---|---|---|---|---|---|---|
| **Consultora** | Sim, só de venda própria (`requireVendaOwnership`) | Não | Não | Não | Não | Não (a menos que também esteja na lista de liberadores) |
| **Liberador do pool** (cadastrado em `frete_avulso_liberadores`, role qualquer, ex. estoquista) | Depende do role (não é exclusivo de consultora) | Sim, qualquer solicitação de qualquer região/loja (§6) | Depende do role | Depende do role (só se também for `entregador`/`motoboy`) | Depende do role | Sim |
| **Admin/dev/diretor** (`isFullAccess`) | Sim (rota aceita `ROLES_LOJA`) | Sim, sempre (bypassa a lista) | Sim, com ou sem motoboy escolhido | Não (não é `entregador`/`motoboy`) | Sim, qualquer corrida | Sim, sempre |
| **Estoquista** (criação direta) | Não é o caso de uso — cria já liberado | Só se também estiver na lista de liberadores | Sim, nasce `pendente` já liberado (com ou sem motoboy = pool) | Não (a menos que role seja também entregador) | Não (a menos que admin) | Só se também liberador |
| **Motoboy/entregador** | Não (usa `FreteAvulsoMotoboySchema` — registra a própria corrida, fluxo diferente do de solicitação) | Não | Não | Sim — primeiro que aceitar vence (claim atômico) | Só a própria corrida, e só se `created_by != motoboy_id` (corrida atribuída pela loja); corrida auto-registrada por ele aguarda confirmação da loja | Não |
| **Dois motoboys em race** (aceitar a mesma corrida do pool quase ao mesmo tempo) | — | — | — | Só um vence; o segundo recebe erro "Corrida já foi aceita por outro motoboy" (UPDATE condicional atômico, `res.count === 0`) | — | — |

Pontos a confirmar manualmente em homolog: (1) consultora vendo só as próprias solicitações e não conseguindo liberar; (2) liberador cadastrado vendo a aba mesmo com role fora da lista padrão de acesso à tela; (3) recusa exigindo motivo e não lançando saldo; (4) liberação lançando saldo uma única vez mesmo em duplo-clique; (5) dois motoboys tentando aceitar a mesma corrida — só um vence; (6) lista principal de entregas (`/entregas-venda` sem filtro) não mostrando nenhuma `solicitada` nem inflando o card "Total".

## 10. Referência

- Migration base do módulo: `285_modulo_entrega.sql` (tabelas `entregas_venda`, `entregas_venda_itens`, `saldo_frete_gratis`, `fechamentos_frete`, `motoboys`; views `vw_entregas_pendentes` e `vw_motoboy_entregas`).
- Migration do frete avulso original: `293_frete_avulso.sql` (+ `294`/`295`/`298` para nullable de códigos e blindagem).
- Migration da solicitação/liberação/pool: **`346_frete_avulso_solicitacao.sql`** — enum `solicitada`, colunas `endereco_entrega`/`liberada_por`/`liberada_em`/`motivo_recusa`, constraint `chk_entrega_origem` recriada, tabela `frete_avulso_liberadores`. **Nunca rodou em homolog/prod** até a data deste documento.
- Lib principal: `src/lib/entrega-venda.ts` (`criarFreteAvulso`, `liberarFreteAvulso`, `recusarFreteAvulso`, `aceitarFreteAvulso`, `confirmarFreteAvulso`, `podeGerenciarSolicitacoesAvulso`, `lancarSaldoFreteAvulsoNoTx`).
- Rotas: `src/app/api/entregas-venda/frete-avulso/route.ts` (criação), `[id]/liberar-avulso`, `[id]/recusar-avulso`, `[id]/aceitar-avulso`, `[id]/confirmar-avulso`, `src/app/api/configuracoes/frete-avulso-liberadores/route.ts` (config da lista de liberadores).
- Tela: `src/app/(dashboard)/entregas-venda/page.tsx` (SSR + aba "Solicitações"), `EntregasVendaClient.tsx`, `src/components/entregas/FreteAvulsoModal.tsx` (criação/solicitação), `src/components/configuracoes/TabFreteAvulsoLiberadores.tsx` (config), `MotoboyAppClient.tsx` (app do entregador).
