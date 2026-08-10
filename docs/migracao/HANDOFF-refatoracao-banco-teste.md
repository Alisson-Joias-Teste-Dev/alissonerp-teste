# HANDOFF — Continuar a refatoração completa do banco (cópia de teste)

> **Para a nova sessão de Claude Code:** leia este arquivo inteiro antes de fazer qualquer coisa.
> Ele contém TODO o contexto necessário para continuar o trabalho sem precisar perguntar nada ao
> Alisson — ele foi dormir e autorizou trabalho autônomo até o banco estar 100% refatorado.

## Missão

Terminar a refatoração completa do banco de dados do ERP, **inteiramente numa cópia isolada de
teste** (nunca em produção). Trabalhe metodicamente, fase por fase, verificando a cada passo. **Se
algo quebrar, volte e refaça até dar certo — não pare até completar as 5 fases abaixo.** Nas
decisões de design subjetivas (como dividir uma tabela grande, nome final de um campo), use seu
melhor julgamento e **documente o porquê** — está tudo autorizado pelo Alisson.

**Regra de ouro: nada disso toca produção nem o repositório `erp_back` dos devs.** Trabalhe só na
cópia isolada. No final, escreva um relatório e atualize a documentação — não abra PR sozinho no
`erp_back` (decisão explícita do Alisson: "só documentar, não abrir PR sozinho").

---

## Como acessar a cópia de teste (ambiente: Git Bash no Windows chamando WSL2)

O banco de teste é um **Postgres 17 dentro do WSL2 (Ubuntu)**, banco `erp_teste`, porta **5433**
(existe também um Postgres 16 na porta 5432, não usar — foi a primeira tentativa, ficou obsoleta).

**Padrão de comando** (sempre prefixar com `MSYS_NO_PATHCONV=1` para o Git Bash não bagunçar
caminhos Unix; sempre usuário `postgres`, senha local `teste_local_123` — senha de sandbox
descartável, não é segredo real):

```bash
MSYS_NO_PATHCONV=1 wsl.exe -d Ubuntu -u postgres -- bash -lc "psql -p 5433 -d erp_teste -c \"SUA QUERY;\""
```

**Para SQL longo/com aspas complicadas:** escreva um arquivo `.sql` no seu scratchpad (path informado
no seu próprio system prompt) e rode com `-f`, referenciando o caminho traduzido pro WSL
(`C:\Users\...\X` vira `/mnt/c/Users/.../X`):

```bash
MSYS_NO_PATHCONV=1 wsl.exe -d Ubuntu -u postgres -- bash -lc "psql -p 5433 -d erp_teste -f '/mnt/c/Users/aliss/AppData/Local/Temp/claude/.../seu_arquivo.sql' 2>&1"
```

**Checagem de saúde (rode depois de CADA mudança estrutural)** — nenhuma view pode quebrar:

```sql
DO $$
DECLARE v record; bad int := 0;
BEGIN
  FOR v IN SELECT table_name FROM information_schema.views WHERE table_schema='alissonerp' LOOP
    BEGIN
      EXECUTE format('EXPLAIN SELECT * FROM alissonerp.%I', v.table_name);
    EXCEPTION WHEN others THEN
      bad := bad + 1;
      RAISE NOTICE 'QUEBRADA: %', v.table_name;
    END;
  END LOOP;
  RAISE NOTICE 'total de views quebradas: %', bad;
END $$;
```

Antes de qualquer `ALTER TABLE ... TYPE` ou `DROP`/`RENAME` de coluna usada por view: descubra as
views dependentes (`pg_depend`/`pg_rewrite`), guarde a definição com `pg_get_viewdef(oid, true)`,
`DROP VIEW`, faça a mudança, `CREATE VIEW ... AS <definição guardada>`. Padrão testado e validado
nesta sessão.

Sempre que remover algo, confira antes se há dependência viva:
```sql
-- funcoes que citam a tabela/coluna
SELECT proname FROM pg_proc WHERE prosrc ILIKE '%nome_da_tabela%';
-- FKs de fora apontando pra ela
SELECT conrelid::regclass FROM pg_constraint WHERE confrelid = 'alissonerp.NOME'::regclass;
-- views dependentes
SELECT DISTINCT dv.relname FROM pg_depend d JOIN pg_rewrite r ON r.oid=d.objid
  JOIN pg_class dv ON dv.oid=r.ev_class AND dv.relkind='v'
  WHERE d.refobjid = 'alissonerp.NOME'::regclass;
```

---

## Estado atual da cópia de teste (o que já foi feito)

Começou como cópia completa e real da produção (via `pg_dump`/`pg_restore`, schemas `alissonerp`,
`auth`, `public`), 220 tabelas base + 76 views. Hoje está em **183 tabelas**, depois de remover 37
sem quebrar nenhuma view:
- 15 tabelas de backup esquecidas (`_bkp_*`, `_backup_*`)
- Subsistema de comentários duplicado e vazio (`ordem_comentarios` + `ordem_comentario_mencoes`) — o vivo é `comentarios_ordem` (3373 linhas)
- 10 tabelas mortas (vazias + zero uso em código/função/gatilho/view/FK)
- 7 tabelas do módulo NF-e (abandonado, confirmado pelo Alisson)
- 3 tabelas de conciliação bancária (abandonado, confirmado pelo Alisson)

Ao remover o NF-e, ficaram **colunas órfãs** em `vendas_erp` (`nota_fiscal_id`, `empresa_emitente_id`)
e `devolucoes_venda` (`nota_fiscal_id`) — as FKs já foram soltas via CASCADE, as colunas em si ainda
existem (sempre NULL agora). Considere remover essas colunas também nesta rodada.

Existe uma tabela de teste solta `alissonerp.configuracoes_unificado` (criada num teste anterior,
com dado copiado de `parametros_sistema`+`configuracoes_sistema`, 65 linhas) — foi só uma prova de
conceito, **incompleta** (não atualizou as 4 funções que dependem das tabelas antigas, não apagou as
antigas). Pode reaproveitar ou refazer do zero, mas complete o ciclo desta vez (ver Fase 2 abaixo).

Testei (e desfiz, `ROLLBACK`) converter `pcp.total_metal` de `real` para `numeric` — confirmei que
funciona, mas depende de derrubar/recriar pelo menos 3 views (`vw_ordem_detalhe`, `vw_pcp_erp`, e
mais alguma — confirme a lista completa antes de aplicar em todas as 67 colunas `real` do banco).

**Já existe uma proposta aberta** (PR) no repositório `erp_back` (branch `proposta/padronizacao-schema`,
PR #17, arquivo `docs/PADRONIZACAO-SCHEMA-migracao.md`) com as decisões de nomenclatura já
recomendadas — **siga essas decisões** nesta refatoração, para ficar consistente:
- `status` vence `situacao` (16 tabelas de negócio a ajustar)
- `observacao` vence `obs`
- `ativo` (boolean) vence `situacao` de 1 letra (`erp_produtos`: `'A'`→true, `'I'/'E'`→false)
- `created_at`/`updated_at` vencem `criado_em`/`atualizado_em`
- `quantidade` vence `qtd`

---

## As 5 fases (o que falta — ~90% do trabalho)

### Fase 1 — Consolidar o que já foi removido (pequeno, baixo risco)
- Remover as colunas órfãs (`nota_fiscal_id`, `empresa_emitente_id`) de `vendas_erp` e `devolucoes_venda`.
- Conferir se sobrou mais algum resquício do NF-e/conciliação (índice, sequence, etc.) e limpar.

### Fase 2 — Unificar estrutura duplicada (médio risco)
- **Config:** completar o ciclo — atualizar as 4 funções que dependem de `parametros_sistema`/
  `configuracoes_sistema` (`fn_criar_servico_from_pcp` [zona intocável, cuidado redobrado],
  `fn_processar_conversao`, `fn_processar_conversao_reversa`, `fn_processar_conversao_sku`) para
  ler da tabela unificada, migrar o dado, só então apagar as duas antigas. Incluir também o campo
  equivalente de `config_sistema` (do `erp_back`, não existe nesta cópia — é só um booleano
  `comentarios_ordens_ativo`; adicione uma linha correspondente na tabela unificada pra já nascer completa).
- **Views duplicadas:** escolher a canônica e apagar as outras em cada grupo (ex.: `vw_vendas` vs
  `vw_dash_vendas`; as 3 versões de saldo comercial `vw_saldo_estoque_comercial`/`_v2`/`_consolidado`;
  `vw_comissoes` vs `vw_dash_comissoes`; `vw_vendedores` vs `vw_dash_vendedores`). Antes de apagar,
  confira se algo depende da que vai sair; se sim, redirecione a dependência pra canônica primeiro.
  Documente qual escolheu manter e por quê (ex.: a mais completa, a com nome mais claro).
- **PCP/distribuição vazias e amarradas** (`outros_insumos_pcp`, `outros_insumos_distribuicao`,
  `saidas_distribuicao`): decida com seu melhor julgamento se são recurso esperando uso (manter) ou
  duplicata morta (remover) — documente o raciocínio, já que não há dev disponível para confirmar agora.

### Fase 3 — Padronizar nomes e tipos (o maior volume)
Seguindo as decisões já documentadas no PR #17 do `erp_back` (acima):
1. `erp_produtos`: resolver a duplicação `situacao`(letra)/`ativo`(boolean) — `ativo` vence, mapear
   `'A'→true`, `'I'/'E'→false`. Mesma lógica para `tipo` = 'S'/'V'/'K' se houver equivalente legível
   (senão documentar como pendência de negócio, não inventar mapeamento sem base).
2. Renomear/unificar as ~16 tabelas com `situacao` de negócio → `status`.
3. Renomear os ~15 campos `obs` → `observacao`.
4. Renomear os ~4 campos `qtd` → `quantidade`.
5. As 2 colunas `timestamp without time zone` restantes (`erp_produtos.data_atualizacao`,
   `data_atualizacao_preco`) → `timestamptz` (assumir fuso `America/Fortaleza` ao converter, já que
   é onde a loja opera — confirme isso é consistente com as demais colunas de data da mesma tabela).
6. As 67 colunas `real` → `numeric` com precisão adequada (peso: 4 casas; dinheiro: 2 casas),
   arredondando o dado existente no `USING` da conversão. Trabalhe tabela por tabela, resolvendo as
   views dependentes de cada uma (padrão descrito na seção de comandos acima). Comece por `pcp` (já
   mapeado: precisa derrubar/recriar `vw_ordem_detalhe`, `vw_pcp_erp`, e o que mais aparecer).

### Fase 4 — Dividir as tabelas grandes (redesenho, mais judgment call)
Tabelas com mais colunas: `erp_produtos` (63), `vendas_erp` (54), `entregas_venda` (51), `ordens` (44).
- Analise a coesão das colunas de cada uma (o que muda junto, o que é consultado junto) e proponha
  uma divisão sensata (ex.: `vendas_erp` → dados centrais da venda + endereço/entrega + pagamento).
  **Não execute a divisão física ainda** (é redesenho grande, mexe em muito código de leitura) —
  documente a proposta de divisão com justificativa, para o Jonathan/Rafael avaliarem. Se preferir
  arriscar a divisão física na cópia de teste mesmo assim (é reversível), pode tentar e documentar o
  resultado — mas isso é a parte de maior risco de erro, então capriche na verificação de paridade
  de dado (contagem antes/depois, nenhuma coluna perdida).
- Adicionar chave primária nas 3 tabelas que não têm (`epc_serial_rfid`, `itens_venda_upgrade`,
  `produto_upgrade_config`) — verifique se têm alguma coluna natural única antes de criar um `id`
  serial novo.

### Fase 5 — Enums (contrato de valores)
- Os ~52 campos de status/situação em texto livre → converter para `enum` (o banco já tem 24 enums
  como padrão a seguir — reaproveitar o estilo, ex. `enum_situacao_ordem`).
- Remover a duplicação `situacao` (enum: Ativo,Inativo) vs `enum_situacao_ativa` (ativo,inativo) —
  escolher um, ajustar quem usa o outro.

---

## Verificação obrigatória a cada fase concluída

1. Rodar a checagem de views quebradas (script na seção de comandos) — tem que dar **zero**.
2. Conferir contagem de linhas antes/depois em qualquer tabela alterada (não pode perder dado).
3. Anotar no relatório final: o que mudou, por quê, e qualquer decisão de julgamento tomada.

## Ao terminar (ou se decidir parar por bom senso antes da Fase 4/5 completas)

1. Atualize `docs/migracao/LIVRO-DE-REGRAS-migracao-erp-novo.md` (mesma pasta deste arquivo) com o
   resultado final: o que foi feito, números finais (tabelas/colunas antes e depois), decisões de
   design tomadas e por quê, e o que ficou como recomendação para os devs aplicarem em produção.
2. **Não** commite nem dê push em nada do `erp_back` nem do `ERP.IAlisson` sem que o Alisson veja
   primeiro — deixe pronto para ele revisar de manhã. Pode atualizar o `LIVRO-DE-REGRAS` localmente
   (é só documentação, dentro do repo `ERP.IAlisson`) mas não dar `git push`.
3. Escreva um resumo curto, em português simples (sem jargão), pro Alisson ler ao acordar: o que foi
   feito, em número, e o que precisa da decisão dele.
