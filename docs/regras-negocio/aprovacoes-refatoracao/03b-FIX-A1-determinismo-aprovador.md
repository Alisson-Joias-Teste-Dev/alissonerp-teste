# FIX A1 — Determinismo na escolha do aprovador por cargo

> **Executor: Sonnet (operacional).** Arquiteto/revisor: Opus. Pacote auto-contido — você não herda nenhum chat.
> Leia `00-README.md` e `03-FASE-1-camada-central.md` antes. **Pré-requisito da Fase 2** (sem isso os golden tests ficam instáveis).
> Branch: `feat/centralizar-aprovacoes` (worktree `alissonerp-wt-centralizar-aprovacoes`).

## O problema (achado da revisão da Fase 1)

Quando não há aprovador configurado e a camada cai no fallback por cargo, a escolha é **aleatória**:

- `buscarCandidatosPorRole` (`src/lib/aprovacoes/autoridade.ts:130-136`) faz
  `SELECT id FROM usuarios WHERE role = ANY(${roles}) AND ativo` — **sem `ORDER BY`**.
- `escolherAprovador` (`autoridade.ts:43-59`) pega `candidatosRole[0]`.

Consequências:
1. **Fura a precedência da lista `rolesFallback`.** Ex.: `credito_gerente` tem `rolesFallback = ["gerente_loja", ...ACESSO_PLENO]` (gerente_loja **primeiro**), mas sem ordenação o Postgres pode devolver um `admin` antes — um crédito que era pra um gerente vai pra um diretor.
2. **Não é determinístico** — duas execuções podem escolher pessoas diferentes. Isso quebra os golden tests da Fase 2.

O sistema atual (`aprovacao-regras.ts` → `encontrarAprovador`) usa `ORDER BY CASE...` com precedência explícita. A camada nova perdeu isso.

## O fix — concentrar a ordenação na função PURA (testável sem banco)

A precedência passa a ser decidida em `escolherAprovador` (pura), não no SQL. Para isso, os candidatos de cargo carregam a `role` junto.

### Escopo — LEIA

**É deste fix (só `src/lib/aprovacoes/`):**
- `autoridade.ts`: nova assinatura de `escolherAprovador`, `buscarCandidatosPorRole` retornando `{id, role}`, `resolverAprovador` repassando.
- `tipos.ts`: se houver um tipo pros candidatos, ajustar (senão, inline).
- `__tests__/autoridade.test.ts`: ajustar as chamadas existentes + **2 testes novos** que provam o fix.

**NÃO é deste fix:** não plugar nada, não tocar em endpoint/banco/front/`roles.ts`. Continua Strangler Fig.

### 1. `escolherAprovador` — nova versão (cole exatamente)

```ts
/**
 * REGRA DE NEGÓCIO: escolhe o aprovador. Ordem: config > auto-aprovador (conferência
 * da própria consultora) > fallback por cargo. O fallback por cargo respeita a
 * PRECEDÊNCIA da lista `regra.rolesFallback` (posição na lista) e, no empate de cargo,
 * desempata pelo `id` — DETERMINÍSTICO (dois runs = mesmo aprovador). Sem isso, os
 * golden tests da Fase 2 ficam instáveis e o fallback pode furar a prioridade de cargo
 * (ex.: crédito de gerente indo pra um admin).
 */
export function escolherAprovador(
  regra: RegraAutoridade,
  configUUIDs: string[],
  candidatosRole: { id: string; role: string }[],
  solicitanteId?: string,
  autoAprovadorId?: string,
): AprovadorResolvido | null {
  const excluiSolicitante = !regra.solicitantePodeAprovar && solicitanteId != null;

  // 1) config vence
  const config = excluiSolicitante ? configUUIDs.filter((id) => id !== solicitanteId) : configUUIDs;
  if (config.length > 0) return { aprovadorId: config[0], origem: "config" };

  // 2) auto-aprovador (ex.: conferência da própria consultora) vem antes do fallback por cargo
  if (autoAprovadorId) return { aprovadorId: autoAprovadorId, origem: "role_fallback" };

  // 3) fallback por cargo — precedência pela posição na lista, desempate estável por id
  const cands = excluiSolicitante ? candidatosRole.filter((c) => c.id !== solicitanteId) : candidatosRole;
  if (cands.length > 0) {
    const posicao = (role: string) => {
      const i = regra.rolesFallback.indexOf(role);
      return i === -1 ? Number.MAX_SAFE_INTEGER : i;
    };
    const ordenados = [...cands].sort((a, b) => {
      const pa = posicao(a.role);
      const pb = posicao(b.role);
      if (pa !== pb) return pa - pb;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    return { aprovadorId: ordenados[0].id, origem: "role_fallback" };
  }

  return null;
}
```

### 2. `buscarCandidatosPorRole` — retornar `{id, role}`

```ts
async function buscarCandidatosPorRole(roles: readonly string[]): Promise<{ id: string; role: string }[]> {
  if (roles.length === 0) return [];
  const rows = await sql<{ id: string; role: string }[]>`
    SELECT id, role FROM alissonerp.usuarios
    WHERE role = ANY(${[...roles]}) AND ativo = true
    ORDER BY id
  `;
  return rows.map((r) => ({ id: String(r.id), role: String(r.role) }));
}
```

### 3. `resolverAprovador` — passar o auto-aprovador separado (não mais prepend na lista)

```ts
export async function resolverAprovador(
  evento: EventoAprovacao,
  ctx?: ContextoAprovacao,
): Promise<AprovadorResolvido> {
  const regra = CATALOGO[evento];

  const configUUIDs = await buscarUUIDsDaConfig(regra, ctx);
  const autoAprovadorId = await candidatoAutoAprovacao(regra, ctx);
  const candidatosRole = await buscarCandidatosPorRole(regra.rolesFallback);

  const escolhido = escolherAprovador(
    regra, configUUIDs, candidatosRole, ctx?.solicitanteId, autoAprovadorId ?? undefined,
  );
  if (escolhido) return escolhido;

  const masterId = await getMasterAdminId();
  return { aprovadorId: masterId, origem: "master" };
}
```

> Motivo de passar `autoAprovadorId` separado: com a ordenação por precedência de cargo, a role
> `consultora` (auto-aprovação) não está em `rolesFallback` de `conferencia_consultora` e iria pro
> fim. Passando separado, ela mantém a prioridade que tem hoje (config > auto > cargo).

### 4. Ajustar os testes existentes + adicionar 2

Os testes atuais passam `candidatosRole` como `string[]` — troque por `{ id, role }[]`. Ex.:
`["uuid-role-2"]` → `[{ id: "uuid-role-2", role: "admin" }]`. O caso `conferencia_consultora` pode
passar via `candidatosRole` (com `role: "consultora"`) **ou** via o novo param `autoAprovadorId`.

Adicione estes 2, que provam o fix:

```ts
it("fallback por cargo respeita a PRECEDÊNCIA de rolesFallback (gerente_loja antes de admin)", () => {
  const regra = CATALOGO.credito_gerente; // ["gerente_loja", "admin", "desenvolvedor", "diretor"]
  const cands = [
    { id: "uuid-admin", role: "admin" },
    { id: "uuid-gerente", role: "gerente_loja" },
  ];
  expect(escolherAprovador(regra, [], cands, "uuid-sol")).toEqual({
    aprovadorId: "uuid-gerente", origem: "role_fallback",
  });
});

it("empate de cargo → desempata por id de forma estável (determinístico)", () => {
  const regra = CATALOGO.desconto; // ACESSO_PLENO
  const cands = [
    { id: "uuid-bbb", role: "admin" },
    { id: "uuid-aaa", role: "admin" },
  ];
  expect(escolherAprovador(regra, [], cands, "uuid-sol")?.aprovadorId).toBe("uuid-aaa");
});
```

## Critérios de aceite

1. `npx tsc --noEmit` → **zero erros**.
2. `npx vitest run src/lib/aprovacoes` → **todos passando**, incluindo os 2 novos.
3. `git status` limpo fora de `src/lib/aprovacoes/`. Nenhum `import '@/lib/aprovacoes'` em `src/app`/`src/components`.
4. Commit: `fix(aprovacoes): escolha do aprovador por cargo determinística (precedência + desempate por id)`.
5. Atualizar `00-README.md` (marcar A1 como aplicado) e reportar pro Opus revisar antes da Fase 2.
