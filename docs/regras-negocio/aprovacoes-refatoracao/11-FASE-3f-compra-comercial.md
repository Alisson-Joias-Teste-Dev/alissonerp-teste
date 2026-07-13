# FASE 3f — Migrar o fluxo de COMPRA COMERCIAL para a camada config-first

> **Executor: Sonnet (operacional).** Arquiteto/revisor: Opus. Pacote auto-contido — você não herda chat.
> Leia `00-README.md`, `03b-config-first-estrito.md`, `05-divergencias-alvo-x-atual.md`,
> `06-FASE-3a-metal.md` e `10-FASE-3e-devolucao.md` (padrão do gate no despachante) antes.
> Branch: `feat/centralizar-aprovacoes`.

## Objetivo

Trocar a autorização de compra comercial (conferência de peso na chegada) pela camada config-first: só
quem estiver em `aprovador_compra_comercial` decide. Sem mudar contrato. **Modelo = metal/devolução**
(decidida pela tela de Tarefas via o despachante `tarefas/[id]/aprovacao`).

**Simplicíssima — 2 arquivos:** a chave `aprovador_compra_comercial` **já existe** e já está exposta na
tela; a criação já é config-only (sem fallback por cargo). Só falta: (a) o gate `podeDecidir` na decisão;
(b) trocar a leitura crua da config por `resolverAprovadores` na criação.

## Passo a passo

### A) Gate na decisão — despachante `src/app/api/tarefas/[id]/aprovacao/route.ts`
No bloco `if (tarefaInfo?.tipo === "compra_comercial" || tags.includes("aprovacao_compra_comercial"))`
(~L637), **antes** do `try`, adicionar (espelha `recebimento_metal` ~L650 e `devolucao` ~L606):
```ts
const dec = await podeDecidir({ id: user.id, role: usuarioLogado?.role ?? null }, "compra_comercial");
if (!dec.pode) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
```
`podeDecidir` já está importado (L28); `usuarioLogado.role` já existe (L337). **Sem `ctx.solicitanteId`**
(compra comercial não exclui o solicitante). **Não** altere a assinatura de `processarAprovacaoCompraComercial`
(continua recebendo `user.id` como `aprovadorId`). **Não** toque na checagem genérica do topo do PATCH (L342).

### B) Criação — `src/app/api/compras-comercial/[id]/solicitar-aprovacao/route.ts`
Hoje (~L62-68) lê a config direto:
```ts
const [cfg] = await sql`SELECT valor FROM alissonerp.configuracoes_sistema WHERE chave = 'aprovador_compra_comercial'`;
const aprovadorId = String(cfg?.valor ?? "");
if (!aprovadorId) return NextResponse.json({ error: "Nenhum aprovador configurado" }, { status: 409 });
// ... valida usuário ativo ...
```
Trocar por `resolverAprovadores` (que já valida ativo e trata multi), **preservando o 409 e a mensagem**:
```ts
const resol = await resolverAprovadores("compra_comercial");
if (resol.status === "nao_configurado") {
  return NextResponse.json({ error: "Nenhum aprovador configurado" }, { status: 409 });
}
const aprovadorId = resol.aprovadores[0]; // colunas aprovacoes_tarefa.aprovador_id / compras_comercial.aprovador_id são UUID único
```
Importar `resolverAprovadores` de `@/lib/aprovacoes`. Mantenha o resto da criação igual (tarefa, tags,
`aprovacoes_tarefa`, `compras_comercial`, notificação). Se a validação "usuário ativo" (L74-82) ficar
redundante (a camada já filtra ativos), pode remover — mas mantenha a resposta 409 do caso inválido se
preferir não mexer. Contrato de resposta (`{ ok, tarefa_id, aprovador_id }`) inalterado.

## Escopo — LEIA
- **Só 2 arquivos:** `tarefas/[id]/aprovacao/route.ts` (o gate) e
  `compras-comercial/[id]/solicitar-aprovacao/route.ts` (a criação).
- **Sem** chave nova (já existe), **sem** mexer na config route/UI, **sem** front, **sem** camada
  (`src/lib/aprovacoes/` intocado — nenhum teste da camada muda).
- **NÃO mexer** (é Fase 4, só registrado): a brecha do `[id]/concluir/route.ts` (`void user`, L15 — qualquer
  autenticado conclui) e o risco R4 de duplicação de `contas_pagar` no handler `processarAprovacaoCompraComercial`
  (loop sem guard `EXISTS`, enquanto o trigger da chegada tem). Deixe como está.

## Verificar
1. `npx tsc --noEmit` 0 erros; `npx vitest run src/lib/aprovacoes` tudo passando (nada da camada muda).
2. `git status`: exatamente os 2 arquivos.
3. Contrato: gate só adiciona um 403 `{ error: "Sem permissão" }`; o 409 da criação mantém a mensagem
   "Nenhum aprovador configurado"; respostas de sucesso inalteradas.

## Cenários que o Opus testa em homolog
Config `aprovador_compra_comercial` = X:
- X aprova/rejeita uma compra comercial (via tarefa) → passa; Y (≠X, mesmo admin/dev) → 403.
- Sem `aprovador_compra_comercial` → solicitar aprovação → 409 "Nenhum aprovador configurado".

## Critérios de aceite
1. tsc 0; contrato idêntico; gate `podeDecidir` na decisão; criação por `resolverAprovadores`.
2. Escopo: 2 arquivos; camada/front/config-UI intocados; brecha do concluir e R4 **não** tocados.
   Commit: `refactor(aprovacoes): compra comercial decidida pela camada config-first — contrato idêntico`.
3. Atualizar `00-README.md` (Fase 3f) e reportar pro Opus testar em homolog.
