# HANDOFF — Continuar a Fase 3.6 (real → numeric) nas 18 tabelas restantes

> **Para a nova sessão de Claude Code:** leia este arquivo inteiro antes de fazer qualquer coisa.
> O Alisson já autorizou este trabalho especificamente (pediu pra continuar "numa nova janela") —
> não precisa perguntar de novo pra começar. Trabalhe metodicamente, tabela por tabela, testando a
> cada passo. Só trabalhe na cópia de teste, nunca em produção nem no repositório `erp_back`.

## Contexto

Isto é a continuação da Fase 3.6 do `HANDOFF-refatoracao-banco-teste.md` (já concluído — ver
`docs/migracao/LIVRO-DE-REGRAS-migracao-erp-novo.md` seção 10 para o resultado completo das fases 1 a 5
anteriores). A Fase 3.6 troca colunas do tipo `real` (tem erro de arredondamento) por `numeric`
(preciso). São **67 colunas em 19 tabelas**. A tabela `pcp` (17 colunas) já foi feita e testada — falta
**18 tabelas (49 colunas)**, já mapeadas e classificadas, só falta executar.

## Como acessar a cópia de teste

Mesmo ambiente da sessão anterior: Postgres 17 dentro do WSL2 (Ubuntu), banco `erp_teste`, porta
**5433** (existe um Postgres 16 na 5432, não usar — obsoleto).

```bash
MSYS_NO_PATHCONV=1 wsl.exe -d Ubuntu -u postgres -- bash -lc "psql -p 5433 -d erp_teste -c \"SUA QUERY;\""
```

Para SQL longo, escreva um `.sql` no seu scratchpad e rode com `-f`, traduzindo o caminho pra
`/mnt/c/Users/...`.

**Checagem de saúde (rodar depois de CADA tabela concluída)** — tem que dar zero:
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

## O método (o mesmo usado em `pcp`, testado e validado)

Para cada tabela da lista abaixo:

1. Descobrir as views dependentes:
   ```sql
   SELECT DISTINCT dv.relname
   FROM pg_depend d JOIN pg_rewrite r ON r.oid=d.objid
   JOIN pg_class dv ON dv.oid=r.ev_class AND dv.relkind='v'
   JOIN pg_class dt ON dt.oid=d.refobjid
   WHERE dt.relname='NOME_DA_TABELA';
   ```
2. Pra cada view encontrada, olhar a definição (`pg_get_viewdef('alissonerp.NOME'::regclass, true)`) e
   confirmar se ela de fato usa a(s) coluna(s) `real` por nome (às vezes a view depende da tabela mas
   usa só outras colunas — não precisa tocar nela). Guardar a definição de quem usa.
3. Verificar se alguma FUNÇÃO faz referência direta à coluna (raro quebrar — Postgres converte
   `real`↔`numeric` sozinho na maioria dos casos, mas vale conferir):
   ```sql
   SELECT n.nspname, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE p.prosrc ~* '[^a-z_]NOME_DA_COLUNA[^a-z_]';
   ```
4. `DROP VIEW` nas views que usam a coluna (ordem: se uma view depende de outra view, apagar a de
   cima primeiro).
5. `ALTER TABLE alissonerp.TABELA ALTER COLUMN coluna TYPE numeric(P,S) USING round(coluna::numeric, S);`
   — P e S conforme a tabela de classificação abaixo.
6. `CREATE VIEW` de volta com a definição guardada. Nas views que fazem `COALESCE(sum(x), 0::real)`,
   trocar `0::real` por `0` (deixa o Postgres inferir `numeric` sozinho).
7. Rodar a checagem de views quebradas (tem que dar zero).
8. Testar com um UPDATE real e rollback (ex.: `BEGIN; UPDATE alissonerp.TABELA SET coluna=coluna WHERE
   id=(SELECT id FROM alissonerp.TABELA LIMIT 1); ROLLBACK;`) pra garantir que os gatilhos disparam sem erro.
9. Seguir pra próxima tabela.

## As 18 tabelas e a classificação de precisão já decidida

| Tabela | Colunas `real` | Tipo final | Motivo |
|---|---|---|---|
| `apontamentos_distribuicao` | `quantidade` | `numeric(12,4)` | peso |
| `auditorias` | `metal_externo`, `peso_final`, `peso_negociado`, `pmc`, `quebra`, `retorno_metal`, `total_metal` | `numeric(12,4)` | peso |
| `auditorias` | `quebra_percentual` | `numeric(6,2)` | percentual |
| `distribuicoes` | `ouro_entregue`, `ouro_pecas`, `peso_final`, `pmc`, `quebra`, `quebra_lote`, `retorno_metal`, `total_geral_outros_pesos`, `total_metal`, `total_outros_pesos`, `total_pedras_g` | `numeric(12,4)` | peso |
| `distribuicoes` | `porcentagem_de_quebra` | `numeric(6,2)` | percentual |
| `distribuicoes` | `total_pedras_un` | `numeric(10,0)` | contagem de peças |
| `erp_produtos` | `peso_real` | `numeric(12,4)` | peso |
| `erp_produtos` | `fator` | `numeric(10,4)` | multiplicador de preço (não é peso nem dinheiro) |
| `fechamentos_distribuicao` | `peso`, `pmc`, `total_pedras_g` | `numeric(12,4)` | peso |
| `fechamentos_distribuicao` | `total_pedras_un` | `numeric(10,0)` | contagem |
| `insumos` | `custo_compra` | `numeric(12,2)` | dinheiro |
| `insumos` | `estoque_maximo`, `estoque_minimo`, `peso_pedra`, `peso_total`, `saldo` | `numeric(12,4)` | peso |
| `itens_compra` | `quantidade` | `numeric(12,4)` | peso (metal em grama ou pedra em ct) |
| `itens_distribuicao` | `peso` | `numeric(12,4)` | peso |
| `itens_ordem_insumos` | `peso` | `numeric(12,4)` | peso |
| `lancamentos_avulso` | `peso` | `numeric(12,4)` | peso |
| `movimentacoes_estoque` | `entrada`, `saida` | `numeric(12,4)` | peso |
| `ordens` | `peso_metal_externo`, `peso_metal_negociado` | `numeric(12,4)` | peso |
| `outros_insumos_distribuicao` | `peso` | `numeric(12,4)` | peso |
| `outros_insumos_pcp` | `peso` | `numeric(12,4)` | peso |
| `pedras_ordens` | `peso`, `peso_pedra` | `numeric(12,4)` | peso |
| `pedras_ordens` | `qtd_pedras` | `numeric(10,0)` | contagem |
| `saidas_distribuicao` | `pf` | `numeric(12,4)` | peso (provavelmente "peso final") |
| `saidas_ordem` | `peso` | `numeric(12,4)` | peso |

**Sugestão de ordem:** comece por `auditorias` e `distribuicoes` (são as mais conectadas a `pcp`,
que já foi feita, então há chance de já ter menos surpresa de view). Deixe `erp_produtos` e `ordens`
por último — são as 2 das "4 tabelas gigantes" candidatas a divisão futura (Fase 4), então qualquer
mudança nelas merece atenção redobrada.

## Cuidado especial — zonas intocáveis

Antes de alterar `pedras_ordens`, `itens_ordem_insumos`, `outros_insumos_pcp` ou `movimentacoes_estoque`,
confira se alguma das funções de zona intocável do `CLAUDE.md` §2 (`fn_processar_apontamento_pcp`,
`fn_processar_transferencia`, `fn_processar_fechamento_dist`, `fn_criar_servico_from_pcp`,
`fn_calcular_peso_pedra_gramas`) referencia a coluna por nome. Se sim, o ajuste é só mecânico (nome/tipo
igual ao que já fiz em `fn_processar_apontamento_pcp` na sessão anterior — ver LIVRO-DE-REGRAS §10.7),
mas **documente MUITO claramente** que aquela função foi tocada e precisa de aval do Jonathan antes de
ir pra produção. Não pule essa checagem.

## Ao terminar (ou se decidir parar antes, por bom senso)

1. Atualizar `docs/migracao/LIVRO-DE-REGRAS-migracao-erp-novo.md` seção 10.11 com o resultado: quais
   tabelas ficaram prontas, quantidade de views recriadas por tabela, qualquer decisão de precisão que
   divergiu da tabela acima (com o porquê).
2. Não commitar nem dar push em nada sem o Alisson ver primeiro.
3. Escrever um resumo curto em português simples do que foi feito, pro Alisson.
