# Handoff para o dev — Produtos: bug dos 295 sumidos + terreno pra refatoração

> **Data:** 01/07/2026
> **De:** sessão Claude Code (Alisson) · **Para:** dev (Jonathan)
> **Estado:** correção da pedra JÁ EM PRODUÇÃO. Investigação da "vitrine única" ABORTADA por bug grave. **Backfill dos 295 órfãos + trigger de espelho JÁ APLICADOS (01/07) — problema dos produtos sumidos RESOLVIDO** (ver §4.1). Refatoração da tabela única fica pra você.

---

## 1. O que JÁ ESTÁ EM PRODUÇÃO (v2.79.2)

### 1.1 Correção do cadastro de pedra avulsa
`src/app/api/produtos/peca-avulsa/route.ts` — o cadastro dava "erro ao cadastrar":
- **Causa:** dois `INSERT` no mesmo `produto_id` (o 2º violava o índice UNIQUE de `produto_id`).
- **Fix:** 1 INSERT único com todas as colunas; `tem_pedra_preciosa=false` (pedra solta ≠ joia com pedra); `tipo_de_pedra` = etiqueta; `produto_tipo_item='insumo'` (sem isso some da `vw_pedras_preco` / vitrine / orçamento).
- **SKU:** geração passou a ignorar SKUs `>= 90000000` (placeholders "(saldo inicial)" da migração) — antes o próximo SKU saía gigante (ex.: 90000056) em vez da sequência real (~1846).
- **Preço:** `vw_pedras_preco` ganhou fallback `preco_tiny` quando não casa regra (pedra avulsa sem regra). SQL aplicado; SKU da Mossanite corrigido 90000056→1845 manualmente.

### 1.2 Repositório de deploy (importante!)
- **Produção (EasyPanel `cloud.alisson.api.br`) puxa de `github.com/alissonjoias/alissonerp` branch `main`** — NÃO de `jonathanaraujo-489/alissonerp`. Deploy é **manual** (botão "Implantar"), não automático.
- Duas contas GitHub fáceis de confundir: `allissonjoias` (2 "L", conta principal) vs `alissonjoias` (1 "L", dona do repo de produção).
- Os dois repos divergiram (base comum `667a1199`): produção tinha 26 commits que o do Jonathan não tinha (auditoria estoque, crediário, comissão, redesign de componentes). A correção da pedra foi feita no repo do Jonathan e re-encaixada (cherry-pick) sobre `alissonjoias/main`.
- **Cuidado EOL:** repo de produção usa CRLF nos blobs; o do Jonathan usa LF (`autocrlf=true`, sem `.gitattributes`). Merge de 3 vias com `git merge-file` normalizando EOL evitou poluir o diff.

---

## 2. BUG DESCOBERTO — 295 produtos invisíveis nas telas

### 2.1 Sintoma
Produtos criados no sistema novo (pedra avulsa, joias recentes) **não aparecem** na maioria das telas de produto.

### 2.2 Causa
As telas leem `public.produtos` (cópia legada). Produtos são criados em `alissonerp.erp_produtos` (exposto pela view `alissonerp.produtos_compat`, que é `SELECT * FROM erp_produtos`). Sem espelhamento, ficam órfãos em `public.produtos`.

### 2.3 Números (medidos no banco)
| Métrica | Valor |
|---|---|
| Produtos ativos em erp/produtos_compat SEM correspondência em public (os "sumidos") | **295** |
| Produtos ativos só em public (legados: variações antigas de anel/aliança) | **106** (532 contando inativos) |
| Ativos nos dois (comuns) | 15.692 |

### 2.4 Causa RAIZ
A trigger de espelho `erp_produtos → public.produtos` (**referida como migration 250** em `docs/levantamento-produtos.md §1.3` e no header de `src/app/api/produtos/sync-erp-to-public/route.ts`) **NÃO EXISTE no banco** — confirmado varrendo `pg_trigger` de `alissonerp.erp_produtos` (triggers presentes: arredondar_peso, atualizar_preco, diferenca_percentual, on_erp_produtos_update, on_erp_produto_update_obs, on_erp_produto_update_notify_situacao, notifica_estoque — **nenhuma espelha para public**). A sincronização depende dos endpoints manuais `sync-erp-to-public` / `sync-public-to-erp`, que não rodaram para os 295.

### 2.5 Telas afetadas (leem `public.produtos` como base)
`GET /api/produtos` (Produtos), `src/lib/gestao-estoque/service.ts` (Gestão de Estoque), `GET /api/vendas/produtos/busca` (Nova Venda), `GET /api/orcamento/produtos-pedras` (Orçamento-pedras), `GET /api/rfid/categorias-disponiveis` (RFID), `GET /api/site/produtos` (Site). **Site deixado fora de escopo** (público — regra de publicação própria).

---

## 3. Tentativa "vitrine única" (view UNION) — **ABORTADA, NÃO APLICAR**

### 3.1 Ideia
Criar `alissonerp.vw_produtos_todos = produtos_compat UNION ALL (public.produtos só-legado, WHERE NOT EXISTS em erp)` e apontar as 5 telas internas pra ela. SQL desenhado em `docs/seguranca/RODAR-vitrine-unica-produtos-2026-07-01.sql`.

### 3.2 Testes de estrutura — PASSARAM
- 16.594 linhas, **0 duplicatas** de `id_produto`.
- As 63 colunas encaixam sem erro de tipo (única coluna só-public é `id_produto`, que `produtos_compat` já expõe via alias).

### 3.3 BLOQUEIO que matou a abordagem — **divergência de `situacao`**
Medido no banco:
| | |
|---|---|
| Ativos hoje (lendo `public.produtos`) | **15.798** |
| Ativos lendo a vitrine (situacao vem do ramo erp p/ os comuns) | **9.690** |
| **Produtos ativos que SUMIRIAM** | **6.108** |
| Produtos com `situacao='A'` em public mas `!= 'A'` em erp | **6.403** |

**`public.produtos` é a fonte-de-verdade VIVA de `situacao`** (Tiny/site sincronizam nela). `erp_produtos` está desatualizada nesse campo. Uma view UNION cujos produtos comuns trazem `situacao` do ramo erp esconde 6.108 produtos ativos. **Trocar a fonte de leitura sem resolver a divergência de situacao quebra a produção.**

### 3.4 Outros riscos levantados na auditoria (pra você considerar na refatoração)
- Query de `/api/produtos` faz `FROM public.produtos p LEFT JOIN erp_produtos ep ON ep.produto_id=p.id_produto`. Se `p` virar a UNION que já inclui erp, cria self-join e muda a semântica de `eh_pai/eh_variacao/parent`.
- Muitos dos 295 são `eh_variacao=true` com `categoria=NULL`; com `?agrupar=false` viram itens de topo e inflam a contagem de pendência "sem_categoria".
- `ORDER BY p.qtd_estoque` (SortHeader "Estoque" clicável em `ProdutosClient.tsx`) exige a coluna na fonte.
- `/api/gestao-estoque/oportunidades-fabricacao` faz `LEFT JOIN public.estoque e ON e.sku=p.sku` (saldo legado por SKU) — regra de refabricação depende disso.
- `/api/vendas/produtos/busca` usa `p.id_produto` como chave de ~11 LEFT JOINs.

---

## 4. Recomendações

### 4.1 Curto prazo — resolver os 295 SEM risco (não trocar fonte) — ✅ FEITO (01/07)
1. **Backfill completo** `erp_produtos → public.produtos` dos 295 órfãos, copiando TODOS os campos comuns (não só os 6 que `sync-erp-to-public` copia hoje — id/sku/nome/situacao/tipo/unidade; sem categoria/peso/preço os 295 apareceriam "pelados"). `WHERE NOT EXISTS em public`, `ON CONFLICT (id_produto) DO NOTHING`. Não toca nos 15.798 → situação viva preservada.
2. **Recriar a trigger de espelho** `erp_produtos → public.produtos` (a migration 250 sumida) pra novos produtos não ficarem órfãos.
3. Zero mudança de código de tela. Resolve o sumiço, não esconde ninguém.

> **✅ APLICADO em 01/07** via `docs/seguranca/RODAR-backfill-produtos-orfaos-2026-07-01.sql`.
> Criou `alissonerp.fn_espelhar_erp_para_public()` + trigger `trg_espelhar_erp_para_public`
> (AFTER INSERT ON erp_produtos, **só INSERT / ON CONFLICT DO NOTHING — nunca UPDATE**, pra
> não sobrescrever a situacao viva de public). Conferência pós: `ainda_sumidos=0`;
> `public.produtos` ativos 15.798→**16.093** (exatamente +295, nenhum existente sumiu);
> Brinco AJ5283 e pedra Moissanita 1846 confirmados na tela.
> **Atenção pro dev na refatoração:** essa trigger espelha SÓ inserts. `situacao`/preço em
> updates continuam divergindo (as 6.403) — a matriz de fonte-de-verdade (§4.2) segue pendente.

### 4.2 Médio/longo — a refatoração da tabela única
Seguir `docs/levantamento-produtos.md` (§3-4: `alissonerp.produtos` como fonte única). **Pré-requisito crítico não resolvido:** definir a **matriz de fonte-de-verdade por coluna** — hoje `situacao` (e provavelmente preço) vivem em `public.produtos` (Tiny/site), enquanto cadastro/variação/medidas vivem em `erp_produtos`. Qualquer unificação tem que reconciliar as 6.403 divergências de `situacao` antes, senão produto some. Enquanto public for alvo de sync do Tiny/site, `situacao`/preço devem sair dele.

### 4.3 Artefatos desta sessão
- `docs/seguranca/RODAR-backfill-produtos-orfaos-2026-07-01.sql` — ✅ **APLICADO** (backfill 295 + trigger de espelho). Solução do curto prazo (§4.1).
- `docs/seguranca/RODAR-vitrine-unica-produtos-2026-07-01.sql` — ❌ **NÃO APLICAR** (a view UNION esconde 6.108 ativos por causa da divergência de situacao). Guardado só como referência da abordagem descartada.
- `docs/seguranca/RODAR-pedra-avulsa-preco-e-sku-2026-06-30.sql` — já aplicado (fallback preço + SKU).
