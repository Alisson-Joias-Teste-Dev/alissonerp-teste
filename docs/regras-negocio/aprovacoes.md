# Regras de Negócio — Aprovações (camada central, config-first)

> **Retrato da `main` em 17/07/2026** (inclui a PR #97). Descreve o que está
> **rodando em produção agora** — bugs conhecidos inclusos, marcados com 🔴.
> A PR #98 corrige 3 deles; enquanto não for mergeada, o que vale é o que está aqui.
>
> Histórico de como chegamos aqui: `docs/regras-negocio/aprovacoes-refatoracao/`
> (diário de obra por fase — não é regra, é processo).

---

## 1. A regra de ferro: config-first estrito

**Só decide quem está configurado. Ponto.**

- Sem fallback por cargo. Sem "master". **Sem override de admin** — nem admin
  decide se não estiver na configuração.
- **Config vazia = ninguém decide** (`nao_configurado`). O endpoint trava e
  devolve 409 com uma mensagem que diz onde resolver. A camada **nunca** escolhe
  um aprovador por conta própria.
- Autoridade é a **config de agora**, não um retrato de quando a tarefa nasceu:
  `podeDecidir` re-resolve a lista no momento da decisão. Tirar alguém da config
  tira o poder dele sobre tarefas que já existem.

**Por que assim:** antes, a autoridade estava espalhada (cargo, UUID cravado,
bypass de admin) e ninguém sabia quem podia o quê. Existia um bug de
não-determinismo no fallback por cargo. A decisão foi cortar todos os atalhos —
custo aceito: **esquecer de configurar trava o fluxo** (falha explícita e
recuperável, em vez de alguém errado aprovando calado).

Detalhe da política: `aprovacoes-refatoracao/03b-config-first-estrito.md`.

## 2. Onde a regra mora (mapa técnico)

| Peça | Arquivo | Papel |
|---|---|---|
| `CATALOGO` | `src/lib/aprovacoes/catalogo.ts` | Os 19 eventos e a chave de config de cada um. Fonte única. |
| `resolverAprovadores(evento)` | `src/lib/aprovacoes/autoridade.ts` | Lê a config → devolve a lista, ou `nao_configurado`. |
| `podeDecidir(user, evento)` | `src/lib/aprovacoes/autoridade.ts` | Re-resolve e checa se o usuário está na lista. |
| `multiAprovadorCond` | `src/app/api/tarefas/route.ts` | Faz a tarefa **aparecer na fila** de todos os aprovadores configurados. |
| Handlers por tipo | `src/app/api/tarefas/[id]/aprovacao/route.ts` | Executam o efeito de negócio de cada aprovação. |
| Config | `alissonerp.configuracoes_sistema` | Tabela chave/valor. Valor = UUIDs **separados por vírgula**. |

**Onde a config é editada:** tela **Configurações › Aprovadores**. Não precisa de SQL.

## 3. Múltiplos aprovadores

Toda chave aceita **vários** UUIDs, separados por vírgula.

- **Todos** os configurados veem a tarefa na fila.
- **Basta um** decidir. Ao decidir, a tarefa sai da fila dos outros.
- Não há ordem nem hierarquia entre eles — o primeiro que chegar resolve.

> 🔴 **BUG (main hoje):** só a **listagem** respeita isso. A **decisão** passa por
> um portão que compara com `aprovacoes_tarefa.aprovador_id` — que é **um UUID
> só**, o primeiro da lista. Um 2º aprovador configurado que **não seja
> admin/desenvolvedor** vê a tarefa e toma **403** ao clicar. Corrigido na PR #98.

## 4. Os 19 eventos e suas chaves

| Evento | Chave de config | Situação em PROD (17/07) |
|---|---|---|
| `desconto` | `aprovador_desconto_padrao` | ✅ Alisson |
| `cartao_desconto` | `aprovador_cartao_desconto_padrao` | ✅ Alisson |
| `credito_gerente` | `aprovadora_credito_gerente` | ✅ Germana |
| `credito_diretor` | `aprovador_credito_diretor` | ✅ Alisson |
| `entrega_sem_pagamento` | `aprovador_entrega_sem_pagamento` | ✅ Alisson |
| `devolucao` (etapa 1) | `aprovador_devolucao` | 🔴 **não existe** |
| `devolucao_estoque` (etapa 2) | `aprovador_devolucao_estoque` | ✅ Geovana |
| `devolver_peca` | `aprovadores_devolver_peca` | ✅ Geovana |
| `compra_comercial` | `aprovador_compra_comercial` | ✅ Alisson |
| `compra_metal` | `metal_aprovador_id` | ✅ Alisson |
| `recebimento_metal` | `metal_aprovador_id` (a mesma) | ✅ Alisson |
| `conversao` | `aprovador_conversao` | ✅ Alisson |
| `conversao_sku` | `aprovador_conversao` (a mesma) | ✅ Alisson |
| `conversao_reversa` | `aprovadores_conversao_reversa` | ✅ Alisson |
| `limpeza_ouro` | `aprovador_limpeza` | ✅ Alisson |
| `precificacao` | `aprovador_precificacao` | 🔴 **não existe** |
| `alteracao_venda` | `aprovador_alteracao_venda` | 🔴 **não existe** |
| `auditoria` | `aprovador_auditoria` | ⬜ não verificado |
| `conferencia_consultora` | *(sem chave — automático)* | — |

**Chaves compartilhadas de propósito** (decisões do Jonathan): `conversao` e
`conversao_sku` usam a mesma; `compra_metal` e `recebimento_metal` usam a mesma.
Quem aprova um, aprova o outro.

**As 3 chaves que faltam em prod travam fluxo vivo.** A mais séria é
`aprovador_devolucao` (56 tarefas, uso diário): quem solicitar devolução toma
409 — *"Aprovador de devolução não configurado. Defina em Configurações ›
Aprovadores"*. Falha **limpa**: nada é gravado pela metade, a pessoa tenta de
novo depois de configurar.

## 5. O `tipo` da tarefa não é o nome do evento

Armadilha real. A tarefa nasce com um `tipo` (ou tags) que **não bate** com o
nome do evento. Mapa conferido no `INSERT` de cada criação:

| `tarefas.tipo` / tags | Evento | Pegadinha |
|---|---|---|
| `desconto_acima` | `desconto` | nome diferente |
| `cartao_desconto` | `cartao_desconto` | — |
| `entrega_sem_pagamento_total` | `entrega_sem_pagamento` | nome diferente |
| **`aprovacao_quebra_metal`** | **`limpeza_ouro`** | ⚠️ **não existe tipo `limpeza_ouro`.** É assim de propósito: o aprovador valida a **quebra**, não o recebimento |
| `compra_comercial` | `compra_comercial` | — |
| `compra_metal` | `compra_metal` | — |
| `recebimento_metal` | `recebimento_metal` | — |
| `conversao`, `conversao_sku`, `conversao_reversa` | idem | não passam pelo PATCH genérico — têm endpoint próprio |
| **tipo NULL** + tags `credito_loja` + `gerente`\|`diretor` | `credito_gerente`\|`credito_diretor` | ⚠️ roteado por **tags**, não por tipo |
| **tipo NULL** + tag `devolucao` (sem `devolucao_estoque`) | `devolucao` | ⚠️ idem |
| **tipo NULL** + tag `devolucao_estoque` | `devolucao_estoque` | ⚠️ tem **precedência** sobre `devolucao` |

**Cuidado com SQL:** `tipo` é NULL em vários fluxos. `NULL <> 'x'` **não é
TRUE**, é NULL — a linha some do filtro. Isso já deixou aprovações **invisíveis
pra todo mundo** em produção (2 presas, R$ 3.950). Sempre `COALESCE(tipo, '')`.

**`precificacao` está no CATALOGO mas não cria tarefa.** Ela vive em
`markup_alteracoes` e tem fila própria (`/api/precificacao/pendentes`). Não
procure tarefa dela.

## 6. Regras por fluxo

### Desconto e cartão

- **Teto sem aprovação** = `calcularTetoDesconto` (`src/lib/desconto/precificar-item.ts`),
  fonte única: admin/desenvolvedor → 100%; senão o `mx_desconto_permitido` do
  cadastro; sem cadastro → `desconto_fallback_sem_cadastro_pct` (default **0** —
  decisão do Jonathan: sem cadastro, nenhum desconto sem aprovação).
- **Passou do teto da pessoa → pede aprovação.** Não é um número fixo: se a
  consultora tem 15%, passa de 15; se tem 30, passa de 30.
- **Cartão:** acima de `limite_desconto_cartao_pct` (default **20%**), a venda só
  passa no cartão com aprovação. Enquanto não aprovado, **as 3 formas de cartão
  ficam bloqueadas** — `Cartão de Crédito`, `Manual (MP)`, `Manual (PagBank)`.
  As outras formas seguem livres (Pix, dinheiro): o que não pode é **pagar no
  cartão** sem aprovação. Depois de aprovado, não pede de novo.
- **Cascata:** reprovar o desconto reprova **junto** a aprovação de cartão da
  mesma venda (o cartão foi pedido pra um % que foi recusado). **Aprovar o
  desconto NÃO aprova o cartão** — cada uma tem sua decisão.
- As duas podem ser pedidas **de uma vez** ("Solicitar todas"), e aprovadas
  juntas ("Aprovar todas") — mas continuam independentes.

### Crédito (A Receber)

- Roteado por `aprovacao_credito_tipo` na venda (gerente ou diretor), gravado na
  solicitação pela regra de saldo. **Diretor zera a comissão.**
- Crédito espera o desconto: o "A Receber" é derivado do desconto — aprovar antes
  seria aprovar um número que ainda vai mudar.
- **Aprovar o crédito e a venda ser aprovada são 2 passos.** O 2º (`approveVenda`)
  pode falhar por motivo **operacional** (clássico: cliente sem celular — o
  código de entrega vai por WhatsApp).
  - Falhou → a **aprovação do crédito continua valendo**. A tarefa **não** volta
    pra fila (decisão do Jonathan 17/07: a decisão do aprovador é válida; a falha
    é de cadastro. "Pedir aprovação é chato"). Alguém corrige o cadastro e
    **aprova a venda na mão**.
  - A venda **não trava**: o guard só bloqueia com a tarefa em
    `aguardando_aprovacao`. Com ela `aprovada`, o caminho manual está livre.
  - A consultora **é notificada** com o motivo real (`vendas-credito-aprovar.ts`).
  - Quando a venda aprova de fato, o `aprovacao_credito_tarefa_id` é **limpo**.
    É esse o sinal que separa "aprovou" de "não aprovou".
  - Espera legítima por pagamento (`venda_aprovada=false` **sem**
    `erro_aprovacao`) **não é falha** — o crédito segue aprovado.

  > 🔴 **BUG (main hoje):** quando o `approveVenda` falha, a rota devolve **200
  > mudo**. Quem aprovou vê "sucesso" e não fica sabendo que falta aprovar a
  > venda. O `erro_aprovacao` existe e **ninguém lê**. Corrigido na PR #98
  > (aviso pra quem aprova + faixa na tela da venda).

### Devolução

Duas etapas, aprovadores **diferentes**: etapa 1 (`aprovador_devolucao`) e etapa
2, do estoque (`aprovador_devolucao_estoque`). A etapa 2 **só nasce depois** da
etapa 1 aprovada. A autoridade **não** depende mais de estar dentro ou fora do
prazo de 7 dias úteis — o prazo virou só um aviso "⚠️ FORA DO PRAZO" no texto da
tarefa.

### Conversões

`conversao`, `conversao_sku` e `conversao_reversa` **não passam pelo PATCH
genérico** — têm endpoints próprios e **não criam linha em `aprovacoes_tarefa`**.
A decisão fica gravada na tabela da própria conversão (`aprovado_por`).

A reversa é a mais sensível: aprovar **baixa o metal do cofre e dá entrada na
peça no estoque**, tudo em **transação única**. Rejeitar não movimenta nada.

## 7. Divergências conhecidas (o documento não esconde)

| O quê | Impacto |
|---|---|
| 🔴 **2º aprovador leva 403** se não for admin | Multi-aprovador só funciona de fato entre admins. PR #98. |
| 🔴 **PATCH grava antes de checar permissão** | Admin fora da config → tarefa fica `aprovada` sem o negócio rodar → tarefa órfã, venda travada. PR #98. |
| 🔴 **Crédito devolve 200 mudo** quando `approveVenda` falha | Ninguém sabe que falta aprovar a venda. PR #98. |
| **Auditoria em 2 padrões** | Conversões gravam só na tabela própria; desconto/cartão/compra também em `aprovacoes_tarefa`. Um relatório de "o que fulano aprovou" teria que ler de 2 lugares. |
| **Notificação só pro 1º** | Todos **veem** a fila, mas só o primeiro da lista **recebe** a notificação. Diverge do `03b` §5 ("notifica todos"). |
| **`getDescontoThreshold` sem `ORDER BY`** | `JOIN usuarios ON vendedor_id` sem desempate: se 2 usuários tiverem o mesmo `vendedor_id`, o teto vira aleatório. Pré-existente. |

## 8. Se você vai mexer aqui

- **Não crie tabela nem tela nova de aprovação.** O fluxo "solicitar → aprovar"
  já existe: chave `aprovador_*` em Configurações › Aprovadores + tarefa no
  módulo Tarefas. Ver `reference_aprovadores_e_tarefas` na memória.
- **Evento novo** → entra no `CATALOGO` com sua chave. Se ele cria tarefa,
  **precisa** entrar no `multiAprovadorCond` (`/api/tarefas`), senão só o
  `responsavel_id` enxerga — e se ele não estiver na config, a tarefa **trava sem
  saída** (quem pode decidir não vê; quem vê não pode decidir). Foi o que
  aconteceu com `conversao_sku`.
- **Nunca adivinhe o `tipo` pelo nome do evento** — veja a §5. Confira no
  `INSERT` de quem cria a tarefa.
- **Chave nova precisa ser criada em PROD** (via `/dba`, assinado) **antes** do
  deploy. Não há migration pra config: se o código sobe e a chave não existe, o
  fluxo trava.
