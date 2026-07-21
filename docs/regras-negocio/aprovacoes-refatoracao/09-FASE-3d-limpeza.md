# FASE 3d — Migrar o fluxo de LIMPEZA DE OURO para a camada config-first

> Arquiteto/revisor: Opus. Executor: Sonnet **ou** o próprio Opus (mudança mínima). Pacote auto-contido.
> Leia `00-README.md`, `03b-config-first-estrito.md` e `06-FASE-3a-metal.md` antes.
> Branch: `feat/centralizar-aprovacoes`.

## Contexto — a limpeza JÁ é config-first (só falta usar a camada)

A limpeza de ouro **já** valida "só o UUID de `aprovador_limpeza` decide" — feito à mão em
`src/lib/limpeza-ouro-aprovacao.ts:34-39`. Essa função (`processarAprovacaoQuebraLimpeza`) é a **fonte
única**: tanto o endpoint dedicado `src/app/api/purificacao/limpeza/aprovacao/route.ts` quanto o
despachante `src/app/api/tarefas/[id]/aprovacao/route.ts` (bloco quebra-limpeza) a chamam. Então a
migração é **um ponto só**, e não muda comportamento (só ganha suporte a vários aprovadores).

A chave `aprovador_limpeza` **já existe** em `configuracoes_sistema` e já está exposta na tela de
Configurações — **não** precisa criar chave nem mexer no config route/UI.

## A mudança (única) — `src/lib/limpeza-ouro-aprovacao.ts`

Hoje (linhas 34-39):
```ts
const [config] = await sql`
  SELECT valor FROM alissonerp.configuracoes_sistema WHERE chave = 'aprovador_limpeza'
`;
const aprovadorId = String(config?.valor ?? "").trim();
if (!aprovadorId) return { ok: false, status: 409, error: "Aprovador de limpeza não configurado" };
if (userId !== aprovadorId) return { ok: false, status: 403, error: "Apenas o aprovador configurado pode aprovar/reprovar limpeza" };
```
Trocar por (usando a camada, **preservando os 2 erros e mensagens** — contrato idêntico):
```ts
const resol = await resolverAprovadores("limpeza_ouro");
if (resol.status === "nao_configurado") {
  return { ok: false, status: 409, error: "Aprovador de limpeza não configurado" };
}
if (!resol.aprovadores.includes(userId)) {
  return { ok: false, status: 403, error: "Apenas o aprovador configurado pode aprovar/reprovar limpeza" };
}
```
Importar `resolverAprovadores` de `@/lib/aprovacoes`. **Não** passar `ctx.solicitanteId` (limpeza não
exclui ninguém). A função recebe `userId: string` — mantenha a assinatura; `resolverAprovadores` não
precisa do `role` (config-first não usa cargo).

**Único ganho de comportamento:** antes era 1 UUID exato (`===`); agora é a lista (`includes`), então se
`aprovador_limpeza` tiver vários UUIDs separados por vírgula, qualquer um decide (política config-first,
`configMulti`). Com 1 UUID, é idêntico ao de hoje.

## Escopo
- **Só** `src/lib/limpeza-ouro-aprovacao.ts`. Nada mais (nem endpoint, nem despachante, nem front, nem
  config route — tudo já chama a função). `git status` deve listar 1 arquivo.

## Verificar
1. `npx tsc --noEmit` 0 erros; `npx vitest run src/lib/aprovacoes` tudo passando (nada de teste muda).
2. Contrato: as 2 mensagens de erro (409/403) idênticas às de hoje.

## Cenário que o Opus testa em homolog
Com `aprovador_limpeza` = UUID de X (já configurado em homolog, ou o Opus preenche):
- X aprova/reprova uma baixa de limpeza → passa o gate; Y (≠ X, mesmo admin/dev) → 403 mesma mensagem.
- `aprovador_limpeza` vazio → 409 "Aprovador de limpeza não configurado".

## Critérios de aceite
1. tsc 0; 1 arquivo tocado; contrato idêntico (2 erros preservados). Commit:
   `refactor(aprovacoes): limpeza de ouro decidida pela camada config-first (fonte única) — contrato idêntico`.
2. Atualizar `00-README.md` (Fase 3d) e reportar pro Opus testar em homolog.
