# Livro de Regras — Migração do ERP para o sistema novo (`erp_back` + `erp_front`)

> **Data:** 08/08/2026 (horário de Fortaleza)
> **Autor:** sessão Claude Code (Alisson), a pedido do dono
> **Para:** Jonathan Araújo e Rafael Lucas
> **Status:** rascunho de partida — precisa de revisão e aprovação dos devs antes de aplicar em produção
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

### 4.3 Consolidação PENDENTE (não executada — precisa decisão/código dos devs)
- **3 tabelas de configuração:** a fusão funciona, MAS **4 funções dependem delas**
  (`fn_criar_servico_from_pcp` [zona intocável], `fn_processar_conversao`, `fn_processar_conversao_reversa`,
  `fn_processar_conversao_sku`). Unir exige atualizar essas funções ANTES de apagar as tabelas.
- **~7 views duplicadas:** `vw_vendas` = `vw_dash_vendas`, `vw_vendedores` = `vw_dash_vendedores`,
  `vw_comissoes` = `vw_dash_comissoes`, e **3 versões de saldo comercial**
  (`vw_saldo_estoque_comercial`, `_v2`, `_consolidado`). Escolher a canônica exige saber qual o app usa.
- **3 tabelas de PCP/distribuição vazias mas amarradas** (`outros_insumos_pcp`, `outros_insumos_distribuicao`,
  `saidas_distribuicao`) — têm gatilho/função (zona intocável). Revisar junto com os donos do PCP.
- **22 tabelas vazias mas VIVAS no código** (features prontas sem dado ainda) — **manter**, não é lixo.

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
- Nome final e formato da tabela de configuração unificada.
- Qual view canônica manter em cada trio/par duplicado.
- Destino das 3 tabelas de PCP/distribuição vazias (revisar com donos do PCP).
- Confirmar que as 10 "tabelas mortas" (§4.1) não são features planejadas para o futuro.

---

## 10. Referências
- Método: https://claude.com/blog/ai-code-migration
- Kit oficial: https://github.com/anthropics/code-migration-kit-with-claude-code
- Expand & contract (Prisma): doc oficial de migrations do Prisma
- `docs/regras-negocio/comercial.md` — regras de negócio mantidas à mão
- `docs/seguranca/ALERTA-credenciais-expostas-2026-08-07.md` — credenciais a rotacionar
- `CLAUDE.md` §2 (regras invioláveis), §3 (pitfalls), zonas intocáveis
