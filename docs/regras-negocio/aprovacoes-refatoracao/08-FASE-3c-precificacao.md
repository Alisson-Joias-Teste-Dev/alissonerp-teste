# FASE 3c — Migrar o fluxo de PRECIFICAÇÃO (markup) para a camada config-first

> **Executor: Sonnet (operacional).** Arquiteto/revisor: Opus. Pacote auto-contido — você não herda chat.
> Leia `00-README.md`, `03b-config-first-estrito.md`, `05-divergencias-alvo-x-atual.md` (linha de precificação),
> `06-FASE-3a-metal.md` e `07-FASE-3b-conversao.md` (os padrões já aplicados) antes.
> Branch: `feat/centralizar-aprovacoes` (worktree `alissonerp-wt-centralizar-aprovacoes`).

## Objetivo

Trocar a autorização de precificação — hoje `isFullAccess` (admin/dev/diretor) — pela camada config-first:
só quem estiver em `aprovador_precificacao` decide. Sem mudar contrato.

**Modelo = METAL** (confirmado no mapa): precificação **não gera tarefa**, **não passa pelo despachante**
`tarefas/[id]/aprovacao`, e a fila é a própria tabela `markup_alteracoes`. Decisão só nos endpoints
dedicados `/api/precificacao/{aprovar,rejeitar}`. **Não** adicione handler no despachante.

Chave nova: `aprovador_precificacao` (`configMulti:true`), ainda não existe — o Opus cria em homolog pra
testar; em prod é via `/dba`.

## Regras (as mesmas de metal/conversão)
1. **Contrato idêntico**: rotas/payload/respostas/**mensagens de erro**/status **não mudam**. As msgs 403
   atuais de aprovar/rejeitar são literalmente `"Sem permissão — apenas admin e desenvolvedor podem aprovar"`
   e `"...podem rejeitar"` — **mantenha as strings exatas** (mesmo imprecisas; ajuste de texto é Fase 4/5).
2. **Não nasce sem config**: sem `aprovador_precificacao`, a SOLICITAÇÃO de markup não é criada (409).
3. **Sem `solicitanteId`** no ctx (precificação não exclui quem solicitou).
4. `configMulti`: 1 ou vários UUIDs (vírgula), como `aprovador_conversao`.

## Passo a passo

### A) Decisão — `aprovar` e `rejeitar`
- `src/app/api/precificacao/aprovar/route.ts:29`: trocar `if (!isFullAccess(user.role))` por
  ```ts
  const decisao = await podeDecidir({ id: user.id, role: user.role }, "precificacao");
  if (!decisao.pode) {
    return NextResponse.json({ error: "Sem permissão — apenas admin e desenvolvedor podem aprovar" }, { status: 403 });
  }
  ```
  (mantendo a MESMA string e status). Importar `podeDecidir` de `@/lib/aprovacoes`; remover `isFullAccess` se ficar sem uso.
- `src/app/api/precificacao/rejeitar/route.ts:25`: idem, mantendo a string `"...podem rejeitar"`.

### B) Criação — não solicita sem aprovador
Em `src/app/api/precificacao/solicitar-aprovacao/route.ts`, ANTES do `INSERT INTO markup_alteracoes` (~L43):
```ts
const resol = await resolverAprovadores("precificacao");
if (resol.status === "nao_configurado") {
  return NextResponse.json(
    { error: "Aprovador de precificação não configurado. Defina em Configurações › Aprovadores." },
    { status: 409 },
  );
}
```
(mantém `isPrecificacaoAccess` como está — quem PODE solicitar não muda; só adiciona o guard de config.)

### C) Chave nova em Configurações › Aprovadores
Em `src/app/api/configuracoes/aprovadores/route.ts` (endpoint tem **GET + PUT**, não PATCH), adicionar
`"aprovador_precificacao"` seguindo EXATAMENTE o padrão que a Fase 3b usou pra `aprovador_conversao`:
1. no array `CHAVES`;
2. no objeto de retorno do `GET` (`aprovador_precificacao: configMap.get("aprovador_precificacao") ?? ""`)
   e na lista de usuários elegíveis (reusar `admins_devs` como a conversão fez, ou a lista adequada);
3. no `PUT`, o bloco `if (body.aprovador_precificacao !== undefined) updates.push({...})`.
Também o campo na UI de Configurações (os componentes `TabAprovadores`/`ListaAprovadores`/`FormularioAprovador`
que a 3b tocou) — seguir o mesmo padrão do `aprovador_conversao`.

### D) Front — o botão Aprovar tem que refletir a config (evitar regressão de UX)
Hoje `src/app/(dashboard)/precificacao/PrecificacaoClient.tsx:2205` faz
`const canAprovar = currentUserRole === "desenvolvedor" || currentUserRole === "admin";` — esconde o botão
por cargo fixo. Com config-first, quem aprova é o UUID configurado (pode não ser admin/dev). Se deixar por
cargo, um aprovador configurado que não seja admin/dev **não vê o botão** (regressão).
- No **server component pai** (localize: provavelmente `src/app/(dashboard)/precificacao/page.tsx` — o que
  renderiza `PrecificacaoClient` e passa `currentUserRole`): computar
  `const podeAprovarPrecificacao = (await podeDecidir({ id: user.id, role: user.role }, "precificacao")).pode;`
  e passar como prop pro client.
- No client: trocar a linha 2205 por `const canAprovar = podeAprovarPrecificacao;` (nova prop). Manter todo
  o resto (os botões nas linhas ~867-885 e o cabeçalho ~787-788 já dependem de `canAprovar`).
- **Se o server component tiver uma estrutura que dificulte isso, PARE e reporte** o arquivo/estrutura pro
  Opus decidir — não force. (Mitigação temporária: configurar o aprovador como admin/dev, que o front já mostra.)

## Verificar antes de "pronto"
1. `npx tsc --noEmit` 0 erros; `npx vitest run src/lib/aprovacoes` tudo passando (o catálogo já tem
   `precificacao`/`aprovador_precificacao` desde a Fase 1b — não deve precisar mudar teste, confirme).
2. `git status`: precificação (aprovar/rejeitar/solicitar) + config route + config UI + a tela de
   precificação (server + client). **Sem** tocar o despachante. `pendentes/route.ts` (listagem) intocado.
3. Contrato: as 2 strings de 403 de aprovar/rejeitar idênticas; solicitar ganha só o 409 novo.

## Cenários que o Opus testa em homolog
Config `aprovador_precificacao` = UUID de X:
- X aprova alteração de markup → 200 (aplica o markup); Y (≠ X, mesmo admin/diretor) → 403.
- X rejeita → 200; Y → 403.
- `aprovador_precificacao` vazio → solicitar markup → 409 (não cria a alteração).

## Critérios de aceite
1. tsc 0; contrato idêntico; `aprovar`/`rejeitar` por `podeDecidir`; solicitar bloqueia sem config;
   chave exposta na config; botão da tela reflete `podeDecidir` (ou reportado se complexo).
2. Escopo: sem despachante, sem `pendentes`. Commit:
   `refactor(aprovacoes): precificacao decidida pela camada config-first — contrato idêntico`.
3. Atualizar `00-README.md` (Fase 3c — aguardando teste homolog do Opus) e reportar.

**Não marque como concluído** — depois do commit, o Opus cria a chave `aprovador_precificacao` em homolog,
testa end-to-end (como no metal/conversão) e só então fecha a 3c.
