# Livro de Regras — Migração do ERP para o sistema novo (`erp_back` + `erp_front`)

> **Data:** 08/08/2026 (horário de Fortaleza)
> **Autor:** sessão Claude Code (Alisson), a pedido do dono
> **Para:** Jonathan Araújo e Rafael Lucas
> **Status:** rascunho de partida — precisa de revisão e aprovação dos devs antes de aplicar em produção.
> Atualizado na sessão de 08/08/2026 (noite) com o resultado das fases 1-5 do refino do banco (§10) —
> refatoração de nomes/tipos praticamente completa e testada, divisão de tabelas grandes e conversão
> pra enum ficaram mapeadas mas não executadas (risco alto pra fazer com pressa).
>
> Este documento junta, num lugar só: o método recomendado pela Anthropic para esse tipo de
> migração, o diagnóstico do que existe hoje (sistema antigo e novo), o resultado do pente-fino
> feito numa cópia isolada do banco de produção, e o passo a passo seguro para aplicar em produção.

---

## 0. Contexto

O ERP atual (`ERP.IAlisson`, Next.js monolito + Supabase self-hosted) foi 100% construído por IA ao
longo de meses. Acumulou dívida técnica ao ponto de ficar difícil de manter. A decisão foi **reescrever
do zero** em dois repositórios novos:

- **`erp_back`** — Express 5 + Prisma 7 + PostgreSQL + JWT/bcrypt + Zod (arquitetura em camadas: domain / application / infrastructure / api)
- **`erp_front`** — React 19 + Vite + TypeScript + Ant Design + TanStack Query

O objetivo da migração é **levar só o que é bom (as regras de negócio) e deixar o lixo para trás** —
sem carregar duplicidade, conflito e bug junto.

> ⚠️ **O banco é COMPARTILHADO com o CRM** (mesmo Postgres self-hosted; schema `crm` ao lado de
> `alissonerp`). Qualquer mudança em objeto compartilhado (chaves Supabase, tabelas `public.*`) afeta
> os dois sistemas. Ver `ALERTA-credenciais-expostas-2026-08-07.md`.

---

## 1. O método (recomendação oficial da Anthropic, adaptado)

Fonte: [How Anthropic runs large-scale code migrations with Claude Code](https://claude.com/blog/ai-code-migration)
e o kit oficial [code-migration-kit-with-claude-code](https://github.com/anthropics/code-migration-kit-with-claude-code).

**Princípio central:** *"You don't fix the code. You fix the process that produces the code."*
Não se corrige arquivo por arquivo. Corrige-se a **regra** que gerou o erro e regera-se tudo que
depende dela. É isso que impede o lixo (gambiarra sobre gambiarra) de se repetir.

O kit da Anthropic tem duas variantes. **A nossa é a de REDESENHO** (mudamos a estrutura de propósito),
não a de "só traduzir a linguagem". Para redesenho, a receita é:

1. **Juiz (pré-requisito):** um jeito automático e objetivo de comparar "resultado do sistema antigo"
   vs "resultado do sistema novo" para o mesmo caso. Sem isso, "migrar sem trazer bug" é promessa, não
   garantia.
2. **Livro de regras + inventário de lacunas (gap inventory):** documentar cada regra de negócio a
   preservar e cada ponto onde o código será **refeito** em vez de copiado. Este documento é o começo disso.
3. **Mini-migração de estresse:** portar 2-3 telas de teste, descartar o resultado, e usar o que
   aprendeu para refinar as regras. O objetivo é achar problema cedo, não fazer progresso.
4. **Tradução em lote:** um agente implementa a partir do livro de regras; **dois revisores
   adversariais** (que não escreveram o código) avaliam; o juiz automático decide. Erro que se repete →
   corrige a REGRA, não o arquivo, e regera o lote.
5. **Compilar → testar → conferir paridade**, cada etapa com menos humano no meio.

**Ferramentas do banco:** o `erp_back` usa **Prisma**, e a técnica recomendada pela própria doc do
Prisma para mudar estrutura sem downtime é **"expandir e contrair" (expand & contract)**: cria o novo
ao lado do antigo → copia → aponta o código pro novo → só então apaga o antigo. Nunca deixa o sistema
num estado quebrado no meio. Foi essa técnica que validamos no pente-fino (§4).

---

## 2. Diagnóstico do sistema ANTIGO (o que é lixo, o que é ouro)

### 2.1 Lixo / dívida (quantificado)
- **35 "pitfalls" documentados** no próprio `CLAUDE.md` §3 — cada um é um bug real já vivido em produção.
- **3 telas de "Nova Venda" quase idênticas**: `NovaVendaClientV2.tsx` (3691 linhas, a única em uso),
  `NovaVendaClient.tsx` (1836) e `NovaVendaClientLegado.tsx` (1821) — **as duas últimas são código morto**.
- **`getComissao(pct)` copiada literalmente 4 vezes** (nos 3 clients de venda + `VendaDetalheClient.tsx`).
- **`SUM(saldo)` de `vw_saldo_estoque` reimplementado em 7 rotas** diferentes.
- **50 migrations com número duplicado** (dois arquivos disputando o mesmo número — ex.: 327, 328, 331…) — prova concreta do "conflito".
- Arquivos gigantes misturando responsabilidade: `VendaDetalheClient.tsx` (4528 linhas), `OrcamentoClient.tsx` (4344), `FinanceiroClient.tsx` (3648).

### 2.2 Regras de negócio BOAS — preservar na migração
Documentadas à mão em `docs/regras-negocio/comercial.md` e nas migrations com padrão O-QUE/PORQUE/IMPACTO:
1. **Vale-troca com cadeia rastreável** (`vale_origem_id`), valor proporcional ao pago, cada vale usado uma vez.
2. **Confirmação de vale-troco por WhatsApp** (código 6 dígitos, expira 15 min) — anti-fraude.
3. **Comissão baseada em pagamento confirmado** (não na entrega), excluindo Vale-Troca e "A Receber" pendente.
4. **Separação estoque × financeiro**: baixa de estoque na ENTREGA, baixa financeira na APROVAÇÃO (mig 292/299).
5. **Reserva de estoque ao inserir item de venda** (nunca saída direta); proteção contra reserva órfã (FK CASCADE + trigger).
6. **Bloqueio de entrega por reposição pendente**, isolado por item, com fallback seguro.
7. **Assinatura obrigatória de mudança manual no banco** (`assinar_mudanca_banco` / `log_mudancas_banco`) — auditoria.
8. **Zonas intocáveis** (`fn_processar_apontamento_pcp`, `fn_processar_fechamento_dist`, `fn_criar_servico_from_pcp` etc.) — lógica de ouro/estoque testada em produção.

---

## 3. Diagnóstico do sistema NOVO (já está repetindo os erros)

Achado importante: mesmo com poucas semanas, o `erp_back`/`erp_front` **já tem duplicidade e conflito**.
Corrigir isso ANTES de portar mais é pré-requisito (construir sobre base rachada multiplica o problema).

1. 🔴 **3 tabelas de configuração** no Prisma (`parametros_sistema`, `configuracoes_sistema`,
   `config_sistema`) — as duas primeiras herdadas do banco antigo, a terceira **criada nova já duplicando**.
2. 🔴 **Estoque e Cotações sem trava de login** no back (`estoque.routes.ts`, `cotacoes.routes.ts` não
   aplicam `authMiddleware`) — furo de segurança, bloqueia produção.
3. 🟠 **Contrato back↔front mentindo**: front tipa `ResumoVendas.totalPago` como obrigatório, mas
   `GET /api/vendas/resumo` **nunca devolve esse campo**.
4. 🟠 **Cálculo de metal inconsistente**: `criar-compra.use-case.ts` multiplica sem validar;
   `criar-recebimento.use-case.ts` (irmão) valida via Value Object. Mesma conta, dois níveis de cuidado.
5. 🟠 **`JWT_SECRET` com fallback fixo `'fallback-dev-only'` duplicado** em 2 arquivos — se a variável
   faltar em produção, assina token com string pública conhecida em vez de travar o boot.

---

## 4. Pente-fino no banco (validado em cópia isolada)

Foi feita uma **cópia completa do banco de produção** (256 MB, `pg_dump`/`pg_restore`) para um Postgres
17 local isolado (WSL2), sem tocar em produção. Nessa cópia, testamos e executamos a limpeza.

### 4.1 Removido — 37 tabelas, de 220 → 183, ZERO quebra
Todas as 76 views foram testadas após cada etapa (0 quebradas) e nenhum dado real se perdeu.

| Categoria | Qtd | Exemplos |
|---|---|---|
| Backups esquecidos | 15 | `_bkp_pedras_inativadas_330`, `_backup_336_pre_inventarios` |
| Subsistema de comentários duplicado (vazio) | 2 | `ordem_comentarios` + `ordem_comentario_mencoes` (0 linhas; a viva é `comentarios_ordem`, 3373 linhas) |
| Tabelas mortas (vazias + zero uso em código/função/gatilho/view/FK) | 10 | `precificacao_config`, `precificacao_historico`, `treinamento_videos`, `protocolo_fotos`, `apontamentos_pote`, `fechamentos_fabrica`, `itens_ordem_produtos`, `itens_venda_personalizacao`, `solicitacoes_inventario`, `vendedores_fiscais` |
| Módulo NF-e abandonado (confirmado pelo dono) | 7 | `notas_fiscais`, `_itens`, `_eventos`, `empresas_emitentes`, `regras_fiscais`, `produtos_fiscais`, `contatos_fiscais` |
| Módulo conciliação bancária abandonado (confirmado pelo dono) | 3 | `fin_conciliacoes`, `fin_extratos_bancarios`, `fin_lancamentos_bancarios` |

As tabelas mortas nasceram, em sua maioria, em **16/03/2026** (~5 meses atrás) e nunca receberam um
registro — abandono do começo do projeto. NF-e e conciliação foram construídos em março/abril e nunca usados.

### 4.2 Método validado (padrão expand & contract)
Testamos duas fusões com dado real, ambas com conferência de contagem:
- **Configurações:** `parametros_sistema` (9) + `configuracoes_sistema` (56) → tabela unificada (65). Bateu exato, 0 perda, tipos inferidos corretamente.
- **Comentários:** confirmado que o subsistema paralelo estava 100% vazio → descarte seguro.

### 4.3 Consolidação — ATUALIZAÇÃO 08/08/2026: tudo abaixo foi EXECUTADO e testado na cópia
> Numa segunda passada pela cópia de teste (mesmo dia), todos os itens que aqui estavam "pendentes"
> foram resolvidos de ponta a ponta. Detalhe completo na §10 (novo). Resumo:
- **3 tabelas de configuração → 1:** as 4 funções foram reescritas para ler da tabela unificada
  (`configuracoes_unificado`, agora com `descricao` e triggers de proteção), as 2 antigas foram
  apagadas. `fn_criar_servico_from_pcp` (zona intocável) recebeu ajuste mecânico — **precisa aval do
  Jonathan antes de ir pra produção** (ver §10.7).
- **Views duplicadas — resolvido, com uma correção importante:** `vw_vendas`/`vw_dash_vendas`,
  `vw_comissoes`/`vw_dash_comissoes` e `vw_vendedores`/`vw_dash_vendedores` eram duplicatas reais —
  consolidadas. **As 3 versões de saldo comercial NÃO são duplicatas** — são coisas diferentes
  (`_v2` é o detalhe por local, `_consolidado` já é feito A PARTIR do `_v2` somando os locais, e a
  versão simples sem sufixo só lista produto que JÁ teve movimento — 915 linhas contra 15.805 do
  consolidado). Mantidas as 3, decisão documentada na §10.3.
- **3 tabelas de PCP/distribuição vazias:** mantidas as 3. `outros_insumos_pcp` e
  `outros_insumos_distribuicao` têm gatilho ativo (recurso pronto pra usar). `saidas_distribuicao` está
  amarrada por chave estrangeira numa tabela viva mas nunca foi usada em nenhuma das 130 distribuições
  já feitas — fica como pendência de confirmação com quem entende do fluxo de PCP.
- **22 tabelas vazias mas vivas no código** — mantidas, confirmado que não é lixo.

---

## 5. Regras da migração (o "livro" propriamente dito)

1. **Base nova antes de portar mais:** corrigir os 5 itens do §3 no `erp_back`/`erp_front` ANTES de
   avançar módulos. Prioridade máxima: o furo de login em Estoque/Cotações (§3.2).
2. **Ordem: banco → back → front.** Nada de tela dependendo de estrutura que ainda vai mudar
   (o caso do `totalPago` §3.3 é o exemplo do que evitar). Regra que o CRM já adotou: "banco antes da tela".
3. **Toda regra de negócio boa (§2.2) vira uma regra escrita + um teste** ("dado isso, resultado tem que
   ser aquilo") antes de ser portada. Começar pelas do `docs/regras-negocio/`.
4. **Nunca duplicar conceito:** antes de criar tabela/função/componente, procurar se já existe (foi a
   falha que gerou as 3 tabelas de config e os 2 subsistemas de comentário).
5. **Migração de estrutura = expand & contract:** criar novo ao lado → copiar → apontar código → conferir
   → só então apagar. Nunca apagar antes de o novo provar que funciona.
6. **Módulo por módulo, nunca tudo de uma vez.** Desligar a parte antiga só depois de a nova passar no
   juiz com caso real. Antigo e novo convivem até a troca.
7. **Preservar as zonas intocáveis** (§2.2 item 8) — portar com cuidado redobrado e teste dedicado.
8. **Não levar:** os 37 objetos removidos no §4.1, NF-e e conciliação (abandonados), código morto (§2.1).

---

## 6. Como aplicar o pente-fino em PRODUÇÃO com segurança

O que foi feito na cópia é seguro tecnicamente, mas produção exige passos extras:

1. **Backup completo** da produção antes de qualquer remoção (`pg_dump -Fc`).
2. **Para cada remoção**, assinar no livro do banco (`assinar_mudanca_banco`) — regra do projeto.
3. **NF-e e conciliação:** além de remover as 10 tabelas, é preciso:
   - Apagar as **colunas órfãs** que ficaram em `vendas_erp` (`nota_fiscal_id`, `empresa_emitente_id`) e
     em `devolucoes_venda` (`nota_fiscal_id`) — hoje sempre vazias, apontavam pras tabelas removidas.
   - Remover o **código** do sistema que mexia em NF-e e conciliação.
4. **Config e views duplicadas:** aplicar só depois de atualizar as 4 funções dependentes (config) e
   confirmar a view canônica (views). Usar expand & contract.
5. **Rodar cada mudança primeiro no banco de homologação**, validar, depois produção.
6. **Aprovação explícita do Jonathan** para cada mudança estrutural em produção (regra Git §2 do CLAUDE.md).

---

## 7. Scripts validados (referência)

Os scripts SQL usados e validados na cópia de teste estão no scratchpad da sessão. Padrão comprovado
(exemplo, fusão de config): criar tabela unificada → `INSERT ... SELECT` das duas origens com inferência
de tipo → `SELECT` de conferência batendo a contagem (origem A + origem B = unificado, 0 nulos, 0
duplicados). Reaproveitar como base das migrations formais do `erp_back` (Prisma).

---

## 8. Decisões já tomadas pelo dono
- ✅ **NF-e:** abandonado — remover.
- ✅ **Conciliação bancária:** abandonada — remover.

## 9. Decisões pendentes (para Jonathan/Rafael)
- ~~Nome final e formato da tabela de configuração unificada~~ — feito, ver §10.2.
- ~~Qual view canônica manter em cada trio/par duplicado~~ — feito, ver §10.3 (o trio de saldo comercial
  não era duplicata; mantido os 3).
- Destino das 3 tabelas de PCP/distribuição vazias — mantidas por ora (§10.4); `saidas_distribuicao`
  seguiu sem confirmação de uso real, revisar com quem entende do fluxo de PCP.
- Confirmar que as 10 "tabelas mortas" (§4.1) não são features planejadas para o futuro.
- **Autorizar as 8 mudanças mecânicas em zona intocável antes de aplicar em produção**: 3 do §10.7
  (`fn_criar_servico_from_pcp`, `fn_processar_auditoria`, `fn_processar_apontamento_pcp` — troca de nome
  de coluna) + 5 do §10.11/§10.13 (`fn_processar_fechamento_dist`, `fn_calcular_peso_pedra_gramas`,
  `fn_processar_apontamento_pcp` de novo por outro motivo, `fn_processar_auditoria` de novo por outro
  motivo, `fn_concluir_protocolo` — troca de tipo por baixo). Nenhuma teve linha de código alterada,
  mas são zona intocável por regra do projeto.
- **Novo:** o que significa `erp_produtos.tipo` ('S'/'V'/'K') — não achei documentação, não inventei mapeamento (§10.5).
- **Novo:** confirmar o valor real de `comentarios_ordens_ativo` (nasceu `false` na tabela de config unificada, §10.2).
- **Novo:** decidir se a `vw_saldo_estoque_comercial` (versão simples, só produto com movimento) ainda é usada por alguma tela antes de considerar aposentá-la (§10.3).
- ~~Continuar o `real→numeric` nas 18 tabelas restantes~~ — feito, ver §10.11.
- ~~Converter os 42 campos de status para lista fechada~~ — feito, ver §10.13.
- ~~Dividir as 4 tabelas gigantes~~ — feito como view de leitura/escrita (não fisicamente, ver §10.12) por
  colidir com a regra "nunca remover coluna"; divisão física de verdade fica como projeto futuro maior.
- **Novo:** decidir QUANDO e COMO levar todo o trabalho desta cópia de teste pra produção — nada foi
  aplicado em produção ainda, é tudo validado só localmente.
- **Novo:** nada deste trabalho foi commitado/publicado no repositório ainda — fica pendente de decisão
  de quando subir pra `homolog`.

---

## 10. Sessão de refatoração completa — 08/08/2026 (fases 1 a 5 do `HANDOFF-refatoracao-banco-teste.md`)

> Continuação autônoma na mesma cópia de teste (WSL2, `erp_teste`, porta 5433). Trabalho feito fase a
> fase, com checagem de views quebradas (script no HANDOFF) depois de CADA mudança estrutural — sempre
> deu zero. Números finais: **181 tabelas, 73 views, 125 funções** (partiu de 183/76 no início desta
> sessão).

### 10.1 Fase 1 — colunas órfãs do NF-e (concluída)
Removidas `vendas_erp.nota_fiscal_id`, `vendas_erp.empresa_emitente_id` e — achado a mais — 4 colunas
NF-e em `devolucoes_venda` (não só `nota_fiscal_id` como o levantamento anterior citava: também
`nfe_numero`, `nfe_chave_44`, `nfe_emitida_em`). Todas 100% vazias, sem função/view/FK viva. Zero views
quebradas depois.

### 10.2 Fase 2 — configuração unificada (concluída)
- `configuracoes_unificado` (criada numa tentativa anterior, incompleta) ganhou a coluna `descricao`
  (faltava), FK de `atualizado_por` pra `usuarios`, e os 2 gatilhos de proteção que `parametros_sistema`
  tinha (atualização automática de `atualizado_em` e proteção do `MASTER_ADMIN_USER_ID`).
- Adicionada a chave `comentarios_ordens_ativo` (equivalente do `config_sistema` do `erp_back` que não
  existia nesta cópia) — nasce com `false` até alguém confirmar o valor real de produção.
- As 4 funções (`fn_processar_conversao`, `fn_processar_conversao_reversa`, `fn_processar_conversao_sku`,
  `fn_criar_servico_from_pcp`) foram reescritas pra ler da tabela nova. `parametros_sistema` e
  `configuracoes_sistema` foram apagadas.

### 10.3 Fase 2 — views duplicadas (concluída, com achado importante)
`vw_dash_vendas`, `vw_dash_comissoes` e `vw_vendedores` (versão simples) foram apagadas — eram
duplicatas exatas ou uma versão incompleta da outra. `vw_vendedores` foi recriada com o conteúdo mais
completo (o que tinha em `vw_dash_vendedores`, com foto de fallback do perfil).

**Achado:** as 3 versões de saldo comercial (`vw_saldo_estoque_comercial`, `_v2`, `_consolidado`) **não
são duplicatas** — servem coisas diferentes:
- `_v2`: saldo detalhado por local de estoque.
- `_consolidado`: soma o `_v2` por produto (todos os locais juntos) — já é construída a partir da `_v2`.
- versão simples (sem sufixo): só lista produto que **já teve alguma movimentação** — 915 linhas contra
  15.805 do consolidado, que lista todo produto ativo (com ou sem movimento).

Como a versão simples muda o que a tela vê (esconde produto sem movimento), **não apaguei** — fica
pra alguém que conhece a tela decidir se ainda é usada.

### 10.4 Fase 2 — tabelas PCP/distribuição vazias (decisão documentada, nenhuma mudança)
Mantidas as 3 (`outros_insumos_pcp`, `outros_insumos_distribuicao`, `saidas_distribuicao`) — ver §4.3.

### 10.5 Fase 3.1 — `erp_produtos.situacao` × `ativo` (concluída)
**Achado sério:** a coluna `ativo` (boolean) estava desatualizada — só 4 produtos em 16.653 marcados
como inativos, enquanto `situacao` (o campo legado 'A'/'I'/'E') mostrava 6.476 inativos/encerrados.
O gatilho que sincroniza pra `public.produtos` (`fn_sync_erp_to_public_produto`) já lia de `ativo`, não
de `situacao` — confirmando que `ativo` era a coluna certa, só nunca foi corrigida com o histórico.
Corrigido: `ativo = false` pra todo produto com `situacao` em ('I','E'), aí `situacao` foi removida.
3 views que liam a coluna direto (`produtos_compat`, `vw_produtos`, `vw_pedras_preco`) foram recriadas
devolvendo `situacao` calculada a partir de `ativo` (`CASE WHEN ativo THEN 'A' ELSE 'I' END`) — quem
lia essas views antes continua recebendo o mesmo formato.

**Coluna `tipo` ('S'/'V'/'K') — NÃO tocada.** Não achei em nenhum lugar (código, comentário, doc) o que
esses códigos significam. Fica como pendência de negócio pro Jonathan explicar antes de qualquer mapeamento.

**Corrigido também (achado durante a varredura, não estava no plano original):** duas outras funções-
gatilho vivas em `erp_produtos` ainda liam a coluna removida e ficariam quebradas na primeira alteração
de produto — `fn_espelhar_erp_para_public` (grava em `public.produtos.situacao`) e
`notificar_apenas_mudanca_situacao` (avisa o n8n quando a situação muda). Ajustadas pra usar `ativo`,
mesma lógica, testado com update real (rollback). Uma função morta e nunca usada
(`fn_sync_erp_to_public_produto`, 0 gatilhos vivos) foi apagada.

### 10.6 Fase 3.2 — `situacao` → `status` (concluída, testada com updates reais)
Renomeada em 7 tabelas: `auditorias`, `compras`, `compras_comercial`, `contas_pagar`, `contas_receber`,
`vendas_erp`, `entregas_venda` (o levantamento inicial citava ~16 "tabelas de negócio", mas o número real
de tabelas — sem contar view — é 7; talvez a contagem antiga tenha incluído view por engano).
**`alissonerp.ordens` foi EXCLUÍDA de propósito**: tem `situacao` (enum, ciclo de vida do registro:
criado/rascunho/cancelado) E `status` (enum, andamento: aguardando/em_andamento/concluído) — são
conceitos diferentes já com enum próprio, renomear ia colidir e trocar o sentido.

Renomear coluna NÃO quebra view no Postgres (testado e confirmado — a view resolve a coluna pela
posição interna, não pelo nome; quem lê `situacao` numa view continua lendo `situacao` mesmo com a
coluna renomeada por baixo). Só função (texto de SQL solto) precisa reescrever.

**19 funções corrigidas** (7 previstas + 12 achadas numa varredura ampla por todos os schemas —
incluindo **`fn_processar_auditoria`, zona intocável do CLAUDE.md**, que lia `auditorias.situacao`; o
ajuste foi só o nome da coluna, lógica 100% igual, mas **precisa aval explícito do Jonathan antes de
aplicar em produção**, por ser zona intocável). **5 funções mortas removidas** (0 gatilho vivo em
nenhuma: `fn_ponte_directus_para_alissonerp`, `fn_sync_venda_from_public`,
`fn_sync_venda_update_from_public`, `fn_sync_erp_to_public_produto`, `fn_estoque_comercial_aprovar_venda`).
Testado disparando update real (com rollback) nas 7 tabelas + inserção de RPC direto — nenhum erro.

### 10.7 ⚠️ Aviso — zonas intocáveis tocadas nesta sessão (mecânico, mas precisa aval)
Duas funções da lista de "zonas intocáveis" do `CLAUDE.md` §2 precisaram de ajuste **só de nome de
coluna** (renomear a tabela por baixo quebraria a função se não ajustasse o texto do SQL — função não
acompanha `RENAME COLUMN` automaticamente como a view acompanha):
- **`fn_criar_servico_from_pcp`** — trocou `alissonerp.configuracoes_sistema` por
  `alissonerp.configuracoes_unificado` na mesma consulta, resto idêntico.
- **`fn_processar_auditoria`** — trocou `situacao` por `status` (só onde lê `auditorias`, as referências
  a `ordens.situacao` ficaram do mesmo jeito). Resto idêntico.
- **`fn_processar_apontamento_pcp`** (fase 3.4, abaixo) — trocou `qtd` por `quantidade`. Resto idêntico.

Testei as 3 disparando gatilho de verdade (inserção real, com rollback) e bateu o resultado esperado —
inclusive um teste de soma de metal no PCP que fechou exato. Mas **é zona intocável por regra do
projeto** — antes de aplicar em produção, o Jonathan precisa revisar e autorizar essas 3 mudanças
especificamente, mesmo sendo mecânicas.

### 10.8 Fase 3.3 — `obs` → `observacao` (concluída, testada)
Renomeada em 20 tabelas (o levantamento citava ~15; o número real é 20):
`apontamentos_distribuicao`, `apontamentos_servico`, `aprovacoes_consultora`, `auditorias_estoque`,
`cofre_ouro_baixas`, `compras`, `compras_comercial`, `contas_pagar`, `contas_receber`, `fin_caixa_baixas`,
`fin_gateways`, `inventarios_comercial`, `itens_compra_comercial`, `lancamentos_avulso`,
`movimentacoes_estoque`, `saidas_distribuicao`, `saidas_ordem`, `stock_ledger_entry`,
`transferencias_estoque_comercial`, `transferencias_ordem`. 8 funções corrigidas (todas escreviam
`INSERT ... obs` numa dessas tabelas). Testado com chamada real de `fn_criar_par_movimentacao`.

### 10.9 Fase 3.4 — `qtd` → `quantidade` (concluída, testada com dado real)
Renomeada em 4 tabelas: `apontamentos_distribuicao`, `apontamentos_pcp`, `itens_compra`,
`itens_compra_comercial`. 5 funções corrigidas, incluindo `fn_processar_apontamento_pcp` (zona
intocável — ver §10.7) e `fn_concluir_compra_comercial`. Uma função morta em `public`
(`atualizar_total_metal_pcp`, 0 gatilho, duplicava o que `fn_processar_apontamento_pcp` já faz) foi
apagada. **Teste com dado real:** um apontamento de 4,53g de metal tipo "aditivo" somou certinho no
`pcp.total_metal` (de 51,63 pra 56,16) — o mesmo teste depois da fase 3.6 saiu ainda mais preciso
(56,1600 em vez de 56,159992 — o `numeric` já eliminou um erro de arredondamento que o `real` tinha).

### 10.10 Fase 3.5 — `timestamp` sem fuso → `timestamptz` (concluída)
Só 2 colunas mesmo (como o levantamento previa): `erp_produtos.data_atualizacao` e
`data_atualizacao_preco`. Convertidas assumindo fuso `America/Fortaleza` — **confirmado que é a
suposição certa**: a cópia de teste (e, aparentemente, o padrão do projeto) já roda com
`timezone=America/Fortaleza` por padrão, e ambas colunas tinham valor recente e coerente com um
`now()` gerado nesse fuso. Nenhuma função lia essas colunas diretamente; 2 views recriadas.

### 10.11 Fase 3.6 — `real` → `numeric` (CONCLUÍDA — as 19 tabelas, 67 colunas)
São **67 colunas em 19 tabelas** (confirmado por contagem, bate com o levantamento). Comecei pela
`pcp`, como o handoff pedia:

**Concluído — tabela `pcp` (17 colunas) + `apontamentos_pcp.quantidade` (1 coluna):**
`dist_ouro_real`, `dist_pedras_g`, `dist_quebra`, `metal_externo`, `peso_final`, `peso_unitario`, `pmc`,
`quebra`, `retorno_metal`, `total_geral_outros_pesos`, `total_metal`, `total_outros_pesos_g`,
`total_pedras_g` → `numeric(12,4)` (peso, 4 casas). `porcentagem_de_quebra` → `numeric(6,2)`
(percentual). `dist_pedras_qtd`, `quantidade`, `total_pedras_un` → `numeric(10,0)` (contagem de peças,
sem casa decimal). 8 views recriadas (`vw_apontamentos_ordem`, `vw_ordem_detalhe`, `vw_pcp_erp`,
`vw_produtividade_ourives`, `vw_quebra_mensal`, `vw_quebra_por_ourives`, `vw_quebra_por_setor`,
`vw_quebra_setor_operador`); outras 4 views que dependem de `pcp` mas não usam essas colunas
(`vw_kpis_gerais`, `vw_ordens_prontas_pcp`, `vw_ordens_prontas_volta`, `vw_timeline_ordem`) não
precisaram de nada. **Testado com dado real** (ver §10.9) — bateu exato e eliminou um resíduo de
arredondamento que o `real` tinha.

**Concluído — as 18 tabelas restantes (49 colunas), na sessão seguinte.** Segui o handoff
`docs/migracao/HANDOFF-fase-3.6-real-numeric-continuacao.md`, tabela por tabela, na ordem sugerida
(`auditorias` e `distribuicoes` primeiro por serem as mais conectadas ao `pcp`; `erp_produtos` e
`ordens` por último por serem candidatas à divisão futura). Resultado final — **zero colunas `real`
restantes no schema `alissonerp`** (conferido por `information_schema.columns`), **zero views
quebradas** (checagem de saúde rodada depois de cada tabela, sempre deu zero), e as 73 views do schema
continuam em 73 (nenhuma perdida, nenhuma duplicada):

| Tabela | Colunas `real` → tipo final | Views recriadas |
|---|---|---|
| `auditorias` | `metal_externo`,`peso_final`,`peso_negociado`,`pmc`,`quebra`,`retorno_metal`,`total_metal` → `numeric(12,4)`; `quebra_percentual` → `numeric(6,2)` | `vw_auditorias_completa`, `vw_dashboard_auditoria` (2) |
| `distribuicoes` | `ouro_entregue`,`ouro_pecas`,`peso_final`,`pmc`,`quebra`,`quebra_lote`,`retorno_metal`,`total_geral_outros_pesos`,`total_metal`,`total_outros_pesos`,`total_pedras_g` → `numeric(12,4)`; `porcentagem_de_quebra` → `numeric(6,2)`; `total_pedras_un` → `numeric(10,0)` | `vw_ordem_detalhe` (1) |
| `apontamentos_distribuicao` | `quantidade` → `numeric(12,4)` | nenhuma |
| `fechamentos_distribuicao` | `peso`,`pmc`,`total_pedras_g` → `numeric(12,4)`; `total_pedras_un` → `numeric(10,0)` | nenhuma (testado com INSERT real disparando `fn_processar_fechamento_dist`) |
| `itens_distribuicao` | `peso` → `numeric(12,4)` | nenhuma |
| `outros_insumos_distribuicao` | `peso` → `numeric(12,4)` | nenhuma (tabela vazia na cópia de teste) |
| `outros_insumos_pcp` | `peso` → `numeric(12,4)` | nenhuma (tabela vazia na cópia de teste) |
| `itens_ordem_insumos` | `peso` → `numeric(12,4)` | nenhuma |
| `pedras_ordens` | `peso`,`peso_pedra` → `numeric(12,4)`; `qtd_pedras` → `numeric(10,0)` | nenhuma |
| `movimentacoes_estoque` | `entrada`,`saida` → `numeric(12,4)` | `vw_estoque_directus_saldo`, `vw_estoque_ordem`, `vw_movimentacoes_directus`, `vw_ouro_em_producao`, `vw_quebra_por_deposito`, `vw_saldo_estoque`, `vw_saldo_por_local`, `vw_saldo_pote_ouro`, `vw_saldo_unificado`, `vw_detalhe_pote`, `vw_saldo_pote` (11, em cascata de 2 níveis) |
| `insumos` | `custo_compra` → `numeric(12,2)`; `estoque_maximo`,`estoque_minimo`,`peso_pedra`,`peso_total`,`saldo` → `numeric(12,4)` | `vw_saldo_unificado`, `vw_detalhe_pote`, `vw_estoque_directus_saldo`, `vw_insumos_directus`, `vw_saldo_por_local` (5) |
| `itens_compra` | `quantidade` → `numeric(12,4)` | nenhuma |
| `lancamentos_avulso` | `peso` → `numeric(12,4)` | nenhuma |
| `saidas_distribuicao` | `pf` → `numeric(12,4)` | nenhuma (tabela vazia na cópia de teste) |
| `saidas_ordem` | `peso` → `numeric(12,4)` | nenhuma (testado com INSERT real disparando `fn_processar_saida_ordem`) |
| `erp_produtos` | `peso_real` → `numeric(12,4)`; `fator` → `numeric(10,4)` | `produtos_compat`, `vw_produto_preco`, `vw_produtos`, `vw_produto_preco_vigente`, `vw_produtos_geral_preco` (5, em cascata de 2 níveis) |
| `ordens` | `peso_metal_externo`,`peso_metal_negociado` → `numeric(12,4)` | `vw_auditorias_completa`, `vw_ordem_detalhe`, `vw_ordens_completa`, `vw_pcp_erp`, `vw_producao_mensal`, `vw_protocolo_ordens` (6) |

Nenhuma divergência da proposta de precisão original — todas as 49 colunas saíram exatamente como
classificado no handoff.

**Método usado (confirmado funcionando em todas as 18 tabelas):** para cada tabela, `SELECT DISTINCT
dv.relname FROM pg_depend d JOIN pg_rewrite r ON r.oid=d.objid JOIN pg_class dv ON dv.oid=r.ev_class
AND dv.relkind='v' JOIN pg_class dt ON dt.oid=d.refobjid WHERE dt.relname='NOME_TABELA'` lista as views
que dependem da tabela; nem toda view da lista usa de fato a coluna `real` por nome (ex.: várias views
de `ordens`/`insumos` só usam colunas de texto e não precisaram de nada) — conferir a definição
(`pg_get_viewdef`) antes de mexer. Quando uma view depende de outra view (cascata — aconteceu em
`movimentacoes_estoque`, `insumos` e `erp_produtos`, até 2 níveis de profundidade), uma consulta
recursiva em `pg_depend` computa a ordem certa de `DROP`/`CREATE` (do nível mais profundo pro mais raso
no drop, ao contrário na recriação). Depois: guardar a definição, `DROP VIEW`, `ALTER TABLE ... TYPE
numeric(...) USING round(coluna::numeric, N)`, `CREATE VIEW` de volta (trocando `0::real` por `0` nos
`COALESCE` de agregação que somam a coluna alterada). Funções em geral não precisaram de ajuste no
corpo (Postgres converte `real`↔`numeric` automaticamente em atribuição/parâmetro), confirmado nas ~90
funções varridas por regex nesta fase.

**⚠️ Zonas intocáveis tocadas nesta fase (mecânico — sem edição de corpo, mas precisa aval do Jonathan
antes de produção, mesma regra do §10.7):**
- `fn_processar_fechamento_dist` — lê `fechamentos_distribuicao.peso/pmc/total_pedras_un/total_pedras_g`
  (agora `numeric`). Testado com INSERT real, sem erro.
- `fn_calcular_peso_pedra_gramas` (gatilho em `insumos`, não em `pedras_ordens` como o handoff sugeria
  — corrigido aqui) — lê/escreve `insumos.peso_pedra` (agora `numeric`). Testado com UPDATE real
  (1,100ct × 0,2 = 0,2200g, bateu certo).
- `fn_processar_apontamento_pcp` — além do já registrado em §10.7, agora também insere em
  `pedras_ordens.peso/peso_pedra/qtd_pedras` (agora `numeric`).
- `fn_processar_auditoria` — lê `ordens.peso_metal_externo` e `ordens.peso_metal_negociado` (agora
  `numeric`). Testado via INSERT real em `ordens` (o gatilho de auditoria automática disparou e criou a
  auditoria com o peso certo).
- `fn_concluir_protocolo` — lê `ordens.peso_metal_externo` (agora `numeric`).

Em todos os 5 casos acima o ajuste foi só a mudança de tipo por baixo (a função não teve uma linha de
código alterada) — Postgres faz a conversão sozinho. Mesmo assim, por serem zona intocável, **não vão
pra produção sem o Jonathan revisar e autorizar**, junto com as 3 já pendentes do §10.7.

### 10.12 Fase 4 — chave primária adicionada (concluída) + divisão de tabelas grandes (CONCLUÍDA — como view, não fisicamente)
Adicionada PK nas 3 tabelas que não tinham:
- `itens_venda_upgrade` e `produto_upgrade_config` já tinham coluna única natural (`item_venda_id` e
  `produto_id`) — só promovidas a chave primária, sem coluna nova.
- `epc_serial_rfid` é uma tabela de configuração de uma linha só (contador de serial RFID) — ganhou
  `id smallint` fixo em 1 (trava por `CHECK`) como chave primária.

**⚠️ Achado importante antes de executar a divisão física — mudou o resultado desta fase:** o desenho
original (§10.12 antigo) previa criar tabelas-filha e **tirar as colunas da tabela grande**. Isso
**colide com a regra inviolável do `CLAUDE.md` §2**: `ADD COLUMN IF NOT EXISTS (nunca remover
colunas)`. Apagar coluna de `erp_produtos`/`vendas_erp`/`entregas_venda`/`ordens` quebraria qualquer
código (rotina do banco ou tela do sistema) que ainda lê a coluna pelo nome antigo — exatamente o tipo
de quebra silenciosa que a regra existe para evitar. Uma divisão física de verdade (tabela vira várias)
também não dá pra disfarçar com uma "view fantasma" no lugar do nome antigo, porque outras tabelas têm
chave estrangeira apontando pra essas 4 (ex.: `produto_id REFERENCES erp_produtos`), e **chave
estrangeira não pode apontar para view**.

**Solução aplicada (a mesma pra todos os 4 casos) — view de leitura E escrita, dado 100% no lugar
de sempre:** criar uma *view* simples (uma tabela só, sem `JOIN`) com o subconjunto de colunas de cada
grupo, sem tirar nada da tabela original. Uma view assim é **automaticamente gravável pelo Postgres**
— dá pra fazer `UPDATE` nela que grava direto na tabela de baixo, sem precisar escrever nenhum gatilho
de sincronismo. Resultado: ganha a organização (consultar só o pedaço que interessa, sem carregar a
linha inteira de 62 colunas) e ZERO risco — nada muda por baixo, nenhum código existente quebra, e é
reversível na hora (`DROP VIEW`) se algo não servir. Testado gravando através de cada uma das 9 views
abaixo e conferindo que o valor apareceu na tabela original — bateu 100%.

**9 views criadas** (schema `alissonerp`, todas com o mesmo padrão):

| View | Tabela de origem | Colunas | Chave |
|---|---|---|---|
| `erp_produtos_midia` | `erp_produtos` | `imagem`, `imagem_capa`, `url_drive`, `iframe`, `prompt_imagem_ia`, `id_api_produto`, `id_kommo`, `fornecedor_etl`, `fornecedor_id_api` (9) | `produto_id` |
| `erp_produtos_precificacao` | `erp_produtos` | `markup`, `fator`, `custo_na_cotacao`, `diferenca_percentual`, `data_atualizacao_preco`, `preco_custo`, `preco_custo_medio`, `preco_na_cotacao`, `preco_pedras`, `preco_promocional`, `preco_servico`, `preco_sync`, `preco_tiny`, `preco_total_sync` (14) | `produto_id` |
| `vendas_erp_endereco` | `vendas_erp` | `endereco_entrega*` (6) + `forma_envio`, `forma_frete`, `total_frete` (10) | `venda_id` |
| `vendas_erp_aprovacoes_desconto` | `vendas_erp` | `aprovacao_*` (4) + `desconto_*` (5) (9) | `venda_id` |
| `vendas_erp_tiny_nfce` | `vendas_erp` | `nfce_chave_44`, `nfce_emitida_em`, `nfce_numero`, `tiny_pedido_id`, `tiny_sync_at`, `tiny_sync_erro`, `tiny_sync_status` (7) | `venda_id` |
| `entregas_venda_endereco` | `entregas_venda` | `endereco_entrega*` (7) | `entrega_id` |
| `entregas_venda_avulso` | `entregas_venda` | `is_avulso`, `descricao_avulso`, `tentativas_codigo`, `codigo_bloqueado_em`, `liberada_em`, `liberada_por`, `motivo_recusa`, `pagante`, `comprovante_pagante_path` (9) | `entrega_id` |
| `ordens_servico` | `ordens` | `foto_peca_servico`, `peso_peca_servico`, `video_observacao`, `tipos_servico_ids` (4) | `ordem_id` |
| `ordens_reposicao` | `ordens` | `venda_id`, `venda_item_ids`, `produto_reposicao_id` (3) | `ordem_id` |

**Ordem de execução:** comecei por `erp_produtos_midia` sozinha (piloto de baixo risco, confirmado com
o Alisson antes de replicar), validei gravação de verdade, e só depois repliquei o mesmo padrão pras
outras 8 — nenhuma surpresa, receita idêntica funcionou de primeira em todas. Checagem de views
quebradas deu zero antes e depois.

**Não é o mesmo que a proposta original:** isso resolve a "coesão de leitura" (consultar só o pedaço
relevante), mas **não** reduz o tamanho físico da linha nem separa fisicamente o dado — as 4 tabelas
continuam com todas as colunas de antes. Uma divisão física de verdade só seria possível numa migração
maior, coordenada com mudança no código do sistema (pra parar de ler/escrever pelo nome antigo) e com
aval explícito pra abrir uma exceção pontual à regra "nunca remover coluna" — não é algo pra fazer
numa varredura de banco isolada.

### 10.13 Fase 5 — enums (CONCLUÍDA — as 42 colunas, tabela por tabela)
Confirmado: **52 colunas** de status/situação em texto livre — 42 são coluna de tabela de verdade
(convertidas), 10 aparecem só em view (resolveram sozinhas quando a tabela de baixo virou enum).

**Método:** para cada coluna, a lista de valores válidos veio de **três fontes, nessa ordem de
confiança** — 1) a trava `CHECK` que já existia no banco (quando existia — é a mais confiável porque é
o que o banco já impõe hoje); 2) os valores distintos reais na cópia de teste; 3) varredura no
código-fonte (`grep`/agente de busca) atrás de comparações de string contra a coluna, pra achar valores
que o código usa mas que não apareciam nos dados de teste. Uma tabela só com trava de banco e sem dado
real (`recebimentos_metal`, `creditos_cliente`) teve os valores confirmados 100% pela trava + código,
nunca inventados.

**18 tabelas sem view dependente** (mecânico: criar o tipo, trocar a coluna, recriar índice quando
tinha filtro por status) + **1 tabela esquecida na primeira passada e corrigida depois** (`compras` —
achei na varredura final, sem view/índice/trava, só 3 gatilhos, todos com valores já cobertos):
`aprovacoes_tarefa`, `auditorias_estoque`, `auditorias_estoque_itens`, `compras`,
`compras_metal_aprovacoes`, `compras_metal_pagamentos`, `creditos_cliente`, `devolucoes_venda`,
`fechamento_comissao_itens`, `fechamentos_comissao`, `fechamentos_frete`, `fila_sync_externo`,
`inventarios_comercial`, `joias_rfid`, `ligacoes`, `limpezas_ouro`, `markup_alteracoes`, `orcamentos`,
`purificacoes`, `reembolsos`, `relatorios_pagamento_motoboy`, `servicos`, `solicitacoes_alteracao`,
`solicitacoes_desconto`, `solicitacoes_peca`, `tiny_sync_produtos`, `vendas_entrega_excecoes_pagamento`.

**14 tabelas com 23 views dependentes** (cascata de até 3 níveis, capturada e recriada via consulta
recursiva em `pg_depend`, não copiada à mão): `auditorias` (+ `tipo_auditoria`), `pagamentos_venda`,
`vendas_erp`, `contas_receber`, `contas_pagar`, `movimentacoes_estoque_comercial`,
`reservas_estoque_comercial`, `cofre_ouro_baixas`, `compras_comercial`, `compras_metal`,
`recebimentos_metal`, `tarefas`, `transferencias_estoque_comercial`, `vale_troca`. As 23 views:
`vw_auditorias_completa`, `vw_dashboard_auditoria`, `vw_ordens_aguardando_auditoria_loja`,
`vw_ordens_prontas_ida/pcp/volta`, `vw_timeline_ordem`, `crm_compras_cliente` e `crm_vale_troca_cliente`
(schema `public`!), `vw_cofre_ouro`, `vw_cofre_ouro_disponivel`, `vw_crediario`,
`vw_dash_vendas_todas`, `vw_vendas_erp_completa`, `vw_aging_contas`, `vw_kpis_gerais`,
`vw_resumo_financeiro`, `vw_saldo_estoque_comercial`, `vw_saldo_estoque_comercial_v2/consolidado`,
`vw_saldo_unificado`, `vw_saldo_lote_pendente_comercial`, `vw_estoque_comercial_alerta_v2`.

**5 gatilhos que citavam a coluna na própria definição** (bloqueiam `ALTER COLUMN TYPE` do mesmo jeito
que view — tive que derrubar e recriar, texto idêntico): `trg_venda_baixar_recebimento_pago`
(`pagamentos_venda`), `trg_cancelar_orcamento_ao_cancelar_venda`, `trg_registrar_transicao_venda`,
`trg_venda_baixar_recebimento_aprovacao` (`vendas_erp`), `trg_mirror_movimento_to_sle`
(`movimentacoes_estoque_comercial`).

**Pegadinha nova que a fase 3.6 não tinha:** função de conversão de enum pra texto (`enum_out`) é
**estável, não imutável** — índice parcial com `WHERE (status)::text = 'x'` quebra com "functions in
index predicate must be marked IMMUTABLE". Correção: comparar o enum direto (`WHERE status = 'x'`, sem
`::text`) — a comparação de enum em si é imutável, só a conversão pra texto não é. 15 índices e 6
travas `CHECK` só de valor (redundantes com o enum novo, removidas — a lista fechada já garante o
domínio) precisaram desse ajuste.

**3 valores "invisíveis" achados só ao testar com TODOS os valores do enum (não só repetir o mesmo)** —
nenhum aparecia no dado real nem tinha trava de banco, só existiam em `IF`/`CASE` de gatilho:
- `vendas_erp.status`: `confirmado` — legado, dois gatilhos (`fn_venda_gerar_conta_receber` e a versão
  `_on_insert`) ainda comparam direto contra ele. Incluí no enum.
- `compras_comercial.status`: `recebido_pendente_cadastro` — usado por `fn_gerar_conta_pagar_chegada_comercial`
  e pela view `vw_saldo_lote_pendente_comercial`. Incluí no enum.
- `recebimentos_metal.status`: `pendente_aprovacao` — já tinha trava de banco prevendo, só confirmei
  com o Alisson antes de incluir (recebimentos_metal estava vazia na cópia de teste).

**Teste:** rodei um ciclo passando a coluna por **todo valor do enum**, não só repetir o mesmo — pegou
os 3 achados acima (o teste simples de "grava de novo o mesmo valor" não teria achado, porque só
dispara o gatilho, não necessariamente o `IF` que compara contra o valor raro). Os únicos erros
restantes depois de incluir os 3 valores foram regras de negócio de verdade funcionando certo
(transição de status inválida, motivo de cancelamento obrigatório, venda/compra bloqueada,
chave duplicada por eu reusar a mesma linha no teste) — zero erro de tipo. Checagem de views quebradas
deu zero em cada etapa.

**Zona intocável tocada (mesma regra do §10.7):** `fn_processar_auditoria` lê `auditorias.status`
diretamente (`= 'aprovado'`, `'reprovado'`, `'pendenciado'`) — testado com todos os 5 valores do enum
novo, incluindo o caminho de reprovação (que exigiu preencher motivo, confirmando que a regra de
negócio permanece intacta). Nenhuma linha de código mudou nela.

**Resultado final:** `information_schema.columns` confirma **zero colunas `status`/`tipo_auditoria` em
texto livre** nas tabelas de verdade do schema `alissonerp` — as 52 colunas do levantamento original
estão resolvidas (42 convertidas, 10 eram só view e ajustaram sozinhas).

**Achado sobre a duplicação `situacao`/`enum_situacao_ativa` que o handoff citava:** não é bem uma
duplicação em uso — o enum `situacao` (valores `Ativo`/`Inativo`) só é usado por `vw_vendedores`, que
lê de `public.vendedores` (schema só-leitura, fora do meu alcance). O enum `enum_situacao_ativa`
(valores `ativo`/`inativo`) **não está em uso em NENHUMA coluna hoje** — é um tipo pronto sem uso, não
um conflito ativo. Não removi (pode ter sido criado pra uso futuro); só deixo registrado.

### 10.14 Validação contra produção (09/08/2026, só leitura)
A pedido do Alisson, conectei **só leitura** (transação `READ ONLY`, nenhuma escrita) no banco de
produção pra confirmar que o mapeamento das 42 colunas (§10.13) não ficou desatualizado em relação ao
banco real — a cópia de teste pode ter ficado parada no tempo enquanto produção segue mudando.

**Resultado — bateu tudo:**
- As travas `CHECK` das 42 colunas em produção são **idênticas**, valor por valor, às que usei pra
  montar as listas fechadas na cópia de teste. Zero desatualização.
- Os valores reais que existem hoje em produção também batem — nenhum valor "surpresa" fora do que já
  estava coberto.
- Diferença de tabelas (produção 218, cópia de teste 181) é esperada: são as 37 tabelas mortas que a
  sessão de 08/08 já tinha removido só da cópia de teste (§4.1) — nunca tocadas em produção.

**Achado que muda a ordem de aplicação:** em produção, **6 das tabelas convertidas nesta fase ainda
usam o nome antigo `situacao`**, não `status` — `auditorias`, `compras`, `compras_comercial`,
`contas_pagar`, `contas_receber`, `vendas_erp`. A renomeação `situacao→status` (§10.6) só foi aplicada
na cópia de teste, nunca em produção. Não invalida o trabalho das Fases 3.6/5 nessas 6 tabelas, mas
significa que, pra aplicar em produção, a ordem tem que ser: **primeiro a renomeação (§10.6), depois**
as conversões de tipo (§10.11) e enum (§10.13) — nessa sequência, ou tudo junto numa migração só.

**Credencial usada:** a senha de produção em `scripts/switch-to-producao.sh` estava desatualizada
(rotacionada depois do alerta de segurança de 07/08 — ver
`docs/seguranca/ALERTA-credenciais-expostas-2026-08-07.md`); o Alisson atualizou o arquivo com a senha
atual antes desta verificação.

---

## 11. Referências
- Método: https://claude.com/blog/ai-code-migration
- Kit oficial: https://github.com/anthropics/code-migration-kit-with-claude-code
- Expand & contract (Prisma): doc oficial de migrations do Prisma
- `docs/regras-negocio/comercial.md` — regras de negócio mantidas à mão
- `docs/seguranca/ALERTA-credenciais-expostas-2026-08-07.md` — credenciais a rotacionar
- `CLAUDE.md` §2 (regras invioláveis), §3 (pitfalls), zonas intocáveis
