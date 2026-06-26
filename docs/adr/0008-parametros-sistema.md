# ADR 0008 — Parâmetros de Sistema (Eliminar IDs Hardcoded)

**Status:** Accepted  
**Data:** 2026-04-29  
**Story:** 3.5 (renomeada de "Guard Duplicação" — ver CLAUDE.md §3 Pitfalls)  

## Contexto

42 constantes de domínio estavam hardcoded em 29 rotas da API: `deposito_id = 1`, `insumo_id = 1`, `categoria_id = 1`, `local_estoque_id = 1`, entre outros. Estes IDs são restrições de negócio (o Almoxarifado Central é sempre o ID 1, o Ouro 18k é sempre o insumo ID 1), mas sua presença literal no código cria três problemas:

1. **Fragilidade:** qualquer migração de banco que reatribuísse IDs (ex: seed em ambiente de teste) quebraria silenciosamente toda a lógica de negócio sem erro de compilação
2. **Rastreabilidade zero:** grep por `= 1` retorna centenas de falsos positivos; não há como saber quais `1` são o Almoxarifado e quais são coincidência
3. **Configurabilidade:** impossível ter ambientes de teste com IDs diferentes sem alterar código

Alternativas avaliadas:
- **Constantes TypeScript** (`const ALMOXARIFADO_ID = 1`): melhora rastreabilidade mas mantém valor em código — requer deploy para mudar
- **Tabela de parâmetros com cache**: desacopla completamente; mudança de ID via UPDATE no banco, sem deploy

## Decisão

Tabela `alissonerp.parametros_sistema` com colunas `(chave TEXT PK, valor TEXT, tipo TEXT, descricao TEXT)`. Helper `getParametroNumber(chave)` em `src/lib/parametros.ts` com cache de 5 minutos:

```typescript
export const PARAM = {
  ALMOXARIFADO_DEPOSITO_ID: "ALMOXARIFADO_DEPOSITO_ID",
  OURO_18K_INSUMO_ID:       "OURO_18K_INSUMO_ID",
  METAL_CATEGORIA_ID:       "METAL_CATEGORIA_ID",
  PEDRA_CATEGORIA_ID:       "PEDRA_CATEGORIA_ID",
  LOCAL_ESTOQUE_DEFAULT_ID: "LOCAL_ESTOQUE_DEFAULT_ID",
  OURO_24K_LIGA_INSUMO_ID:  "OURO_24K_LIGA_INSUMO_ID",
} as const;

const id = await getParametroNumber(PARAM.ALMOXARIFADO_DEPOSITO_ID);
```

O objeto `PARAM` fornece autocomplete e evita typos nas chaves. `invalidarCacheParametros()` disponível para forçar reload após edição administrativa.

## Consequências

**Positivas:**
- IDs configuráveis via banco sem deploy — ambiente de teste pode ter IDs diferentes
- `PARAM.X` é rastreável por grep/IDE; substituição explícita de literais `= 1` por chaves nomeadas
- Cache de 5 minutos mitiga custo de query extra por request
- `invalidarCacheParametros()` permite mudança de ID em produção com efeito imediato

**Negativas:**
- Query ao banco na primeira requisição após TTL expirar (cache miss) — para rotas de alto volume, o miss pode ser perceptível
- Rotas legadas que ainda usam literais coexistem durante migração gradual
- `getParametroNumber` é async — rotas síncronas precisam ser tornadas async para adotá-lo

**Neutras:**
- Tipos disponíveis: `integer`, `decimal`, `text`, `boolean` (coluna `tipo` é informativa; `getParametroNumber` sempre converte via `Number()`)
- Parâmetros ausentes lançam `Error` explícito em vez de retornar `undefined` — falha rápida e rastreável

## Arquivos

- `src/lib/parametros.ts` — `getParametro`, `getParametroNumber`, `invalidarCacheParametros`, `PARAM`
- `alissonerp.parametros_sistema` — tabela de configuração (chave, valor, tipo, descricao)
