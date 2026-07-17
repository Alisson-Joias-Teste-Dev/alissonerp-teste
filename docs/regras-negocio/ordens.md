# Regras de Negócio — Ordens

> **Escopo deste arquivo (leia antes de confiar nele):** só o subtipo **GARANTIA**
> está capturado, com as regras aprovadas pelo Jonathan em **17/07/2026**.
> Os outros 8 tipos de ordem (`fabricacao`, `servico_venda`, `servico_loja`,
> `servico_interno`, `reposicao_venda`, `reposicao_loja`, `compra_fornecedor`,
> `conversao*`) **ainda não têm regra documentada** — se for mexer neles, vale o
> protocolo do `README.md` deste diretório: **para e captura a regra primeiro**.

---

## 1. O que é uma ordem de garantia

A peça de um pedido já entregue voltou com defeito. A loja abre uma **ordem de
garantia** vinculada à **venda** e aos **itens** daquela venda, escolhe os
**tipos de serviço** necessários, pesa a peça (com foto da balança validada por
IA) e a ordem entra na fila do **Protocolo** para ir à fábrica.

Uma ordem de garantia é `alissonerp.ordens` com `tipo_ordem = 'garantia'`. Ela
nasce `situacao='criado'`, `status='aguardando'`, `rota='protocolo'` (garantia
está em `SERVICO_TIPOS`, `src/app/api/ordens/route.ts:46`).

Vínculo com a venda (migration 108):
- `ordens.venda_id` → FK `alissonerp.vendas_erp(id)`
- `ordens.venda_item_ids` → array de ids de `alissonerp.itens_venda_erp`
- `ordens.numero_pedido` ← cópia de `vendas_erp.numero_venda`, **só para exibição**

## 2. As regras (aprovadas em 17/07/2026)

### 2.1 Só de venda ENTREGUE — ao pé da letra

**Só abre garantia se `vendas_erp.situacao = 'entregue'`.** Exatamente esse valor.

`aprovado`, `concluido`, `em_rota`, `rascunho`, `cancelado` e `virou_credito`
**não** liberam — inclusive `concluido`, que no fluxo vem *depois* de entregue
(decisão explícita do Jonathan, 17/07: "só `entregue`, ao pé da letra").

**Não há saída por aprovação para esta trava.** A aprovação de garantia trata
**prazo**, não entrega. Venda não entregue = barrado; o caminho é marcar a venda
como entregue e então abrir.

> **Custo assumido, com o número à vista.** No levantamento de 17/07, **136 das
> ~200 garantias dos últimos 60 dias** saíam de venda em `aprovado` — cerca de
> **68% do movimento** passa a ser barrado. Não é que a peça não tenha sido
> entregue: é que o fluxo não fecha em `entregue` (em junho, só 160 de 319 vendas
> chegaram lá). O Jonathan decidiu assim mesmo, ciente do número. **Se alguém
> reclamar que "a garantia parou", é aqui que se olha primeiro.**

### 2.2 Vitalícia: só "Acabamento e polimento"

Serviço vitalício = **sem prazo**, desde que a venda esteja entregue.

Hoje, só o tipo **`Acabamento e polimento`** (id 3) é vitalício. Todos os outros
(`Solda Laser`, `Cravação Manual`, `Ajuste Manual`, `Solda e Limpeza`, `Outros`)
têm prazo.

**Não é cravado no código.** A marcação vive em
`alissonerp.tipos_servico.garantia_vitalicia` (BOOLEAN, default `false`) e é
editável pelo admin na tela de tipos de serviço. Mudar de ideia é um clique, não
é deploy.

Pontos que ficaram de fora de propósito (decisão B1, 17/07):
- **`Solda e Limpeza`** (100 usos) **não** é vitalício — o tipo mistura limpeza
  (que seria vitalícia) com solda (que não é). Quem quiser só a limpeza cai nos 7
  dias. Se incomodar, o caminho é separar o tipo em dois.
- **`Outros`** (166 usos, o tipo mais usado) **não** é vitalício — é texto livre,
  não dá para saber o que é. O default seguro é ter prazo.

### 2.3 Os outros serviços: 7 dias úteis

`PRAZO_GARANTIA_DIAS_UTEIS = 7`, contados **em dias úteis** desde a entrega,
excluindo sábado, domingo e feriados de Fortaleza/CE.

Reusa `diasUteisDecorridos()` de `src/lib/dias-uteis.ts` — o mesmo cálculo já em
produção na devolução. O dia da entrega é o dia 0 e não conta.

> A constante da garantia é **própria** (não é a `PRAZO_DEVOLUCAO_DIAS_UTEIS`),
> mesmo valendo 7 nas duas. São regras de negócio diferentes que hoje coincidem —
> compartilhar a constante faria um prazo mudar junto com o outro sem querer.

Passou dos 7 dias úteis → **bloqueia e oferece solicitar aprovação** (§3).

### 2.4 Serviços misturados: o mais restritivo vence

Se a garantia tem vários tipos de serviço, e **qualquer um** deles não for
vitalício, vale o prazo de 7 dias úteis (decisão C1, 17/07).

**Por quê:** senão o polimento vira carona — bastava marcar "Acabamento e
polimento" junto para colar uma solda de graça três anos depois.

Só passa sem prazo a garantia em que **todos** os serviços escolhidos são
vitalícios.

### 2.5 De onde vem a data da entrega

Ordem de prioridade (a primeira que existir vence):

1. **Entrega real** — `entregas_venda.data_entrega_realizada` (motoboy) ou
   `data_retirada` (loja); a entrega confirmada **mais recente**.
2. **Transição para entregue** — `vendas_transicoes.para_situacao = 'entregue'`
   (a mais recente).
3. **`vendas_erp.data_entrega`** (PDV/pedidos antigos) — **só se for sã**: não
   pode ser futura nem anterior a 2020.

> ⚠️ A sanidade do item 3 não é firula. Em 17/07, das 754 `data_entrega`
> preenchidas, **12 estavam no futuro e 1 no ano 0005**. Sem o filtro, essas
> vendas dariam "milhares de dias úteis de atraso" ou prazo eterno.

Cobertura medida em 17/07: das 373 vendas em `entregue`, as três fontes juntas
cobrem **95%** (só 20 ficam sem nenhuma data).

**Sem nenhuma data confiável → NÃO bloqueia por prazo.** Segue o precedente já em
produção na devolução (`src/lib/prazo-devolucao.ts`): só bloqueia quando dá para
**provar** que passou do prazo. A trava de `entregue` (§2.1) continua valendo — o
que se abre mão aqui é só da contagem de dias.

### 2.6 Cada garantia fora do prazo tem a sua aprovação (uso único)

Uma aprovação vale para **uma** garantia. A próxima garantia da mesma venda, se
também estiver fora do prazo, **pede outra aprovação** (decisão E, 17/07).

**Por quê:** passada a janela de 7 dias úteis, a venda está fora **para sempre** —
liberar "a venda" seria dar um passe vitalício, e a garantia seguinte pode vir
meses depois, por outra peça e outro defeito. E repetição é comum: das 352 vendas
com garantia, **65 (18%) tiveram mais de uma** (50 com 2, dez com 3, quatro com 4,
uma com 6; intervalo médio de 16 dias, até 85). A peça que volta pela 3ª vez é
justamente a que o aprovador precisa ver — por qualidade ou por abuso.

Custo aceito: a venda com 6 garantias gera 6 pedidos de aprovação.

### 2.7 A ordem de decisão (o resumo executável)

```
venda.situacao <> 'entregue'        → BLOQUEIA (sem saída por aprovação)
todos os serviços vitalícios        → LIBERA (sem prazo)
sem data de entrega confiável       → LIBERA (não dá pra provar)
dias úteis desde a entrega <= 7     → LIBERA
senão                               → BLOQUEIA, oferece solicitar aprovação
```

## 3. A aprovação de fora do prazo

Segue a camada central de aprovações — **leia `aprovacoes.md` antes de mexer**.
Não há tabela nem tela nova.

| Peça | Onde |
|---|---|
| Evento | `garantia_fora_prazo` em `src/lib/aprovacoes/catalogo.ts` |
| Chave de config | `aprovadores_garantia_fora_prazo` (MULTI, UUIDs por vírgula) |
| Tela | Configurações › Aprovadores (`TabAprovadores.tsx`) |
| Visibilidade na fila | `multiAprovadorCond` em `src/app/api/tarefas/route.ts` |
| Tarefa | `tarefas.tipo = 'garantia_fora_prazo'` |

**Config vazia = ninguém aprova** (409 com mensagem dizendo onde resolver) — nem
admin. É a política config-first estrita do projeto (`aprovacoes.md` §1).

### 3.1 A aprovação libera a VENDA, não a ordem

A tarefa autoriza *"esta venda pode abrir garantia fora do prazo"*. A ordem
**só nasce depois de aprovada**.

**Por que assim:** se a ordem nascesse antes, ela precisaria existir bloqueada
esperando decisão — e qualquer lugar que lê `ordens` (Protocolo, PCP, o trigger
`trg_criar_servico_from_pcp`, as views) viraria um furo em potencial. Com este
desenho, **nada existe até a aprovação**, então não há o que vazar. De quebra, a
consultora não perde tempo subindo foto, peso e vídeo antes de saber se pode.

Fluxo:

1. Consultora escolhe a venda → sistema avisa "fora do prazo" → botão **Solicitar
   aprovação** (ela só escreve o motivo).
2. Nasce a tarefa `tipo='garantia_fora_prazo'`, com `venda_id` preenchido e
   `ordem_id` **NULL**.
3. Aprovada → a consultora é notificada e abre a garantia normalmente.
4. Ao criar a ordem, o servidor procura tarefa **aprovada**, **dessa venda**, com
   `ordem_id IS NULL`. Achou → cria a ordem e, **na mesma transação**:
   `UPDATE tarefas SET ordem_id = <nova> WHERE id = <tarefa> AND ordem_id IS NULL`.
   Atualizou **0 linhas** → **aborta** (alguém consumiu antes).

**O `ordem_id` da tarefa é o que garante o uso único** (§2.6). Não é um campo
decorativo: é o registro de que aquela liberação já foi gasta, e o `WHERE ordem_id
IS NULL` no UPDATE é o que fecha a corrida entre duas abas abertas. **Remover isso
transforma uma aprovação em passe infinito.**

### 3.2 Armadilha do `tipo` NULL

`tarefas.tipo` é **NULL** em vários fluxos, e `NULL <> 'x'` **não é TRUE** — é
NULL, e a linha some do filtro. Isso já deixou aprovações **invisíveis para todo
mundo** em produção (2 presas, R$ 3.950). **Todo SQL sobre `tarefas.tipo` usa
`COALESCE(tipo, '')`.** Ver `aprovacoes.md` §5.

## 4. Onde a regra mora (mapa técnico)

| Peça | Arquivo | Papel |
|---|---|---|
| `avaliarGarantia()` | `src/lib/garantia/prazo-garantia.ts` | **Fonte única** da decisão: entrega + prazo + vitalício |
| Dias úteis + feriados | `src/lib/dias-uteis.ts` | Reuso da devolução — **não duplicar** |
| **A trava** | `src/app/api/ordens/route.ts` | Dentro da transação, junto do `assertVendaForaDeRascunho` |
| Lista de vendas | `src/app/api/vendas/por-cliente/[clienteId]/route.ts` | Devolve `entregue` + dias úteis para o modal avisar |
| Modal (ramo garantia) | `src/components/ordens/NovaOrdemServicoBaseModal.tsx` | **Só avisa** — nunca é a trava |
| Vitalício | `alissonerp.tipos_servico.garantia_vitalicia` | Config, não código |

**A trava mora no servidor.** Toda garantia nasce em `POST /api/ordens` — é a
porta única. O modal antecipa o aviso para a pessoa não perder trabalho, mas
**nunca** decide: quem chamar a API direto encontra a mesma regra.

## 5. O que este plano NÃO mudou (17/07)

- Os outros 8 tipos de ordem — só o ramo `garantia` foi tocado.
- Protocolo, PCP e módulo de entrega.
- O fluxo que deixa metade das vendas sem chegar em `entregue` (causa raiz de
  §2.1 — **não foi corrigida**).
- As 629 garantias já existentes — a regra vale daqui para frente.
- **Garantia legada sem venda:** 191 das 629 (30%) não têm `venda_id`, todas até
  março/2026 (legado Directus). De abril em diante, 100% têm venda — a exigência
  de venda já valia na prática antes desta regra.
