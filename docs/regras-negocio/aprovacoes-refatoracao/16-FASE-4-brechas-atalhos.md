# FASE 4 — Fechar brechas e atalhos

> **Executor: Sonnet (operacional).** Arquiteto/revisor: Opus. Pacote auto-contido — você não herda chat.
> Leia `00-README.md`, `03b-config-first-estrito.md` e `11-FASE-3f-compra-comercial.md` (nota final,
> menciona a brecha do concluir e o R4) antes. Branch: `feat/centralizar-aprovacoes`
> (worktree `alissonerp-wt-centralizar-aprovacoes`).

## Escopo desta fase — 4 itens independentes, sem dependência entre si

1. Corrigir bug de estado no concluir de compra comercial (**sem** gate de aprovador — decisão do
   Jonathan: concluir é ação operacional, liberada pra qualquer autenticado, só precisa aceitar o
   estado certo).
2. Fechar o backdoor do `PATCH /api/tarefas/[id]` (pular a decisão formal marcando status direto).
3. Unificar as 3 portas de desconto num evento central único (config-first), comissão idêntica,
   canônico do lock de venda corrigido.
4. Blindar contra duplicação de `contas_pagar`/estoque no handler de aprovação de compra comercial (R4).

**Fora de escopo — NÃO TOCAR** (decisão do Jonathan): auditoria (`auditoria/[auditoriaId]/route.ts`).
Ele tem um plano futuro próprio pra esse módulo (padronizar pra IA fazer a auditoria) — hoje não há
aprovador definido pra fábrica, então travar agora bloquearia o fluxo. Deixe exatamente como está.

---

## Item 1 — Bug de estado: compra aprovada não pode ser concluída

**Arquivo:** `src/app/api/compras-comercial/[id]/concluir/route.ts`

Hoje (linha ~27):
```ts
const situacoesPermitidas = ["recebida", "rascunho", "pendente"];
```
Isso **não inclui `"aprovado"`**, mas a trigger do banco (`fn_concluir_compra_comercial`, migration 331)
explicitamente permite concluir a partir de `rascunho`, `recebida`, `recebido_pendente_cadastro` **ou
`aprovado`**. Resultado: uma compra que teve peso divergente, foi aprovada formalmente, e agora não
consegue ser concluída — trava 409 "não pode ser concluída" sem motivo real.

**Fix:**
```ts
const situacoesPermitidas = ["recebida", "rascunho", "pendente", "aprovado", "recebido_pendente_cadastro"];
```
(inclua `recebido_pendente_cadastro` também — é o terceiro estado que a trigger aceita e que também
está faltando na lista atual; confirme no banco/schema que o valor exato do enum é esse antes de
aplicar, igual ao passo 3 do CLAUDE.md).

**Não mexer em mais nada nesse arquivo** — `void user;` continua (decisão do Jonathan: concluir não
tem gate de aprovador, é liberado pra qualquer autenticado uma vez que o estado permite).

---

## Item 2 — Backdoor: `PATCH /api/tarefas/[id]` pulando a aprovação formal

**Arquivo:** `src/app/api/tarefas/[id]/route.ts`

Hoje, dono da tarefa OU `isFullAccess` pode fazer `PATCH` com `status: "aprovada"` (ou `"rejeitada"`)
diretamente — sem passar pelo despachante `tarefas/[id]/aprovacao`, que é quem de fato roda os efeitos
(comissão, estoque, crédito, contas a pagar, etc. — ver os handlers `processarAprovacao*`). Isso deixa a
tarefa marcada como decidida **sem nenhum efeito colateral ter rodado** — dado inconsistente.

**Fix:** no `PATCH` (função que começa ~linha 75), logo após buscar `tarefaPatch` e **antes** do bloco
de permissão (`isOwner`/`isFullAccess`, ~linha 96), adicionar uma checagem: se `body.status` for
`"aprovada"` ou `"rejeitada"` **e** a tarefa tiver uma linha em `aprovacoes_tarefa` (ou seja, é uma
tarefa de aprovação formal, não uma tarefa comum), bloquear:

```ts
if (body.status === "aprovada" || body.status === "rejeitada") {
  const [temAprovacaoFormal] = await sql`
    SELECT 1 FROM alissonerp.aprovacoes_tarefa WHERE tarefa_id = ${tarefaId} LIMIT 1
  `;
  if (temAprovacaoFormal) {
    return NextResponse.json(
      { error: "Esta tarefa é uma aprovação formal — decida por /api/tarefas/[id]/aprovacao" },
      { status: 409 },
    );
  }
}
```
Coloque essa checagem antes do `TarefaPatchSchema.safeParse` (não precisa do body validado pra isso,
só do `raw.status` — ou rode depois do parse, tanto faz, mas **antes** do `UPDATE`). Tarefas comuns
(sem `aprovacoes_tarefa`) continuam podendo ser marcadas `concluida` normalmente por esse endpoint —
só `aprovada`/`rejeitada` em tarefa de aprovação formal ficam bloqueadas aqui.

**Não mexer**: o resto do endpoint (edição de título, descrição, responsável, prioridade, etc.) e o
`GET` continuam iguais.

---

## Item 3 — Unificar as 3 portas de desconto

**Contexto (decisão do Jonathan):** mesma aprovação, mesmo componente central, não importa a tela que
chama. Isso já era o alvo documentado em `05-divergencias-alvo-x-atual.md` (linha "desconto" — 🔵 FIX
INTENCIONAL) e no fechamento da Fase 3g.3 (`00-README.md`), só ainda não executado.

### 3a) Aposentar o atalho `POST /api/vendas/[id]/aprovar-desconto`

Confirmado por grep: **nenhum componente do front chama essa rota** (`grep -rn "aprovar-desconto" src`
só acha o próprio arquivo da rota). É código morto — apaga o arquivo inteiro
(`src/app/api/vendas/[id]/aprovar-desconto/route.ts`). Se algum teste referenciar esse arquivo, remova
o teste também (confirme com grep antes de apagar).

### 3b) Migrar `PATCH /api/vendas/solicitacoes-desconto/[id]` pro config-first

**Arquivo:** `src/app/api/vendas/solicitacoes-desconto/[id]/route.ts`

Hoje (linha 7 e 44):
```ts
const FULL_ROLES = ["desenvolvedor", "admin"];
// ...
if (!u || !FULL_ROLES.includes(u.role as string)) {
  return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
}
```
Trocar por `podeDecidir(user, "desconto")` — **mesma chave** `aprovador_desconto_padrao` que a porta
oficial (tarefa) já usa (evento `desconto` já existe no catálogo desde a Fase 1b — não precisa criar
nada novo). Sem `ctx.solicitanteId` (desconto não exclui quem solicitou — confirme contra o padrão da
porta oficial, que também não exclui).

```ts
import { podeDecidir } from "@/lib/aprovacoes";
// ...
const [u] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
const dec = await podeDecidir({ id: user.id, role: u?.role ?? null }, "desconto");
if (!dec.pode) {
  return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
}
```

**Comissão** — hoje (bloco "Se aprovado e item já existe", ~linha 80) força `pct_comissao = 0` sempre.
Trocar pela MESMA regra da porta oficial (`tarefas/[id]/aprovacao/route.ts`, bloco `desconto_acima`,
~linha 526-543): comissão pela tabela `faixas_comissao` pelo desconto real do item, com o teto de 0,5%
só acima de 30%:
```ts
const pctComissao = pct > 30
  ? 0.5
  : Number((await sql`
      SELECT comissao_pct FROM alissonerp.faixas_comissao
      WHERE desconto_pct = ${Math.round(pct)} AND ativo = true
    `)[0]?.comissao_pct ?? 0);
```
(ou reaproveite a mesma query com `JOIN`/subselect igual à porta oficial, se ficar mais simples —
o resultado numérico é o que importa, não a forma exata da query).

**Canônico da venda (fix do R3 do dossiê)** — hoje esse PATCH nunca grava
`vendas_erp.desconto_aprovado_por`, então o portão do crédito (`vendas-aprovar.ts:653`,
`baixa-credito.ts:338`) continua vendo a venda como travada mesmo depois de aprovado aqui. Se
`solicitacao.venda_id` existir, ao aprovar, adicionar:
```ts
if (body.status === "aprovado" && solicitacao.venda_id) {
  await sql`
    UPDATE alissonerp.vendas_erp
    SET desconto_aprovado_por = ${user.id}::uuid,
        desconto_aprovado_em  = NOW(),
        updated_at = NOW()
    WHERE id = ${solicitacao.venda_id}
  `;
}
```
Isso é **além** do que já grava hoje em `itens_venda_erp.desconto_autorizado_por` (mantém — é o
registro de qual item teve o desconto autorizado; os dois campos coexistem, um é por item, outro é o
lock da venda, ver `01-dossie-dependencias.md:588`).

**Não mexer**: a tabela `solicitacoes_desconto` em si, o `GET` (polling), o fluxo de criação
(`solicitar-desconto/route.ts`), a exclusão do backdoor genérico de tarefas (item 2, não tem relação).

---

## Item 4 — R4: duplicação de `contas_pagar` e estoque na aprovação de compra comercial

**Arquivo:** `src/app/api/tarefas/[id]/aprovacao/route.ts`, função `processarAprovacaoCompraComercial`
(~linha 40).

Hoje ela insere `movimentacoes_estoque_comercial` (loop de itens, ~linha 102) e `contas_pagar` (loop de
parcelas, ~linha 130) **sem checar se já existem** — mas a "chegada" (trigger 331,
`fn_gerar_conta_pagar_chegada_comercial`) já pode ter gerado as `contas_pagar` antes (ela tem guard
`EXISTS`, então não duplica sozinha; o problema é só o handler TS que não verifica). Da mesma forma, se
a compra for concluída depois de aprovada, a trigger `fn_concluir_compra_comercial` insere estoque de
novo — duplicando a entrada.

**Fix — guard antes de cada INSERT, dentro da mesma transação (`tx`):**

Antes do loop de `movimentacoes_estoque_comercial` (~linha 96-100, antes do `for (const item of itens)`):
```ts
const [jaTemEstoque] = await tx`
  SELECT 1 FROM alissonerp.movimentacoes_estoque_comercial
  WHERE motivo = 'compra_comercial_aprovada' AND observacao LIKE ${`%compra comercial #${compra.id}%`}
  LIMIT 1
`;
```
Prefira, se existir, uma coluna própria (`compra_comercial_id`) em `movimentacoes_estoque_comercial`
pra esse `WHERE` — confira o schema antes (`SELECT column_name FROM information_schema.columns WHERE
table_name='movimentacoes_estoque_comercial'`, regra do CLAUDE.md). Se a coluna existir, use-a em vez
do `LIKE` na observação (mais confiável). Se `jaTemEstoque`, pule o loop de INSERT de estoque.

Antes do loop de `contas_pagar` (~linha 125, antes do `for (let i = 1; i <= parcelas; i++)`), mesmo
padrão que a trigger 331 já usa:
```ts
const [jaTemContaPagar] = await tx`
  SELECT 1 FROM alissonerp.contas_pagar WHERE compra_comercial_id = ${compra.id} LIMIT 1
`;
```
Se `jaTemContaPagar`, pule o loop de INSERT de `contas_pagar` (a compra já tem as parcelas geradas na
chegada — a aprovação só libera o status, não duplica o financeiro).

**Não mexer**: o resto da função (situação `rejeitado`, atualização final de `compras_comercial` pro
status `aprovado`) — só os dois loops de INSERT ganham o guard.

---

## Verificar (todos os itens)

1. `npx tsc --noEmit` → 0 erros.
2. `npx vitest run src/lib/aprovacoes` → tudo passando (nenhum teste da camada muda — só o item 3 usa
   `podeDecidir`, que já existe e já é testado).
3. `git status` — arquivos esperados: `compras-comercial/[id]/concluir/route.ts` (item 1),
   `tarefas/[id]/route.ts` (item 2), `vendas/[id]/aprovar-desconto/route.ts` **deletado** +
   `vendas/solicitacoes-desconto/[id]/route.ts` (item 3), `tarefas/[id]/aprovacao/route.ts` (item 4).
4. Reportar qualquer desvio do pacote (nome de coluna diferente do esperado, enum com valor diferente,
   etc.) — não adivinhar, parar e descrever antes de aplicar workaround.

## Cenários que o Opus testa em homolog

- **Item 1**: compra comercial com peso divergente → aprovada → concluir → agora funciona (antes dava 409).
- **Item 2**: `PATCH /api/tarefas/[id]` com `status:"aprovada"` numa tarefa de aprovação formal (com
  `aprovacoes_tarefa`) → 409, mesmo sendo admin/dono; numa tarefa comum (sem `aprovacoes_tarefa`) →
  continua funcionando normal.
- **Item 3**: `aprovar-desconto` não existe mais (404); `solicitacoes-desconto/[id]` — X (configurado
  em `aprovador_desconto_padrao`) aprova → item ganha comissão pela tabela de faixas (não mais 0%), e
  se tinha `venda_id`, a venda destrava pro crédito; Y (≠X) → 403.
- **Item 4**: compra que passou pela chegada (já tem `contas_pagar`) → aprovar → NÃO duplica parcelas
  nem estoque; compra sem chegada prévia → aprovar → gera normalmente (comportamento de hoje, sem
  regressão).

## Critérios de aceite

1. tsc 0; contrato das rotas tocadas inalterado (só o atalho morto muda de existir pra 404, esperado).
2. Escopo: exatamente os arquivos listados acima; nenhuma migration nova (não mexe em banco além de
   ler `information_schema` pra confirmar nomes de coluna).
3. Commit(s) — pode ser um por item ou um só, a critério do Sonnet, mas mensagens claras, ex.:
   `fix(aprovacoes): fase 4 — concluir compra comercial, backdoor de tarefas, unificação de desconto, guard R4`
4. Atualizar `00-README.md` (novo item "Fase 4" no status) e reportar pro Opus revisar e testar em homolog.
