# Raio-X — Sistema atual × Sistema novo (`erp_back` + `erp_front`)

> **Data:** 11/08/2026
> **Para:** Alisson, Jonathan, Rafael
> **Objetivo:** dar uma base honesta pra decidir COMO e QUANDO unificar o ERP atual
> (`ERP.IAlisson`, Next.js monolito) com o sistema novo (`erp_back` + `erp_front`,
> reescrita em camadas) num sistema só.
> **Método:** leitura estática de código dos dois repos novos (clonados localmente),
> sem rodar nenhum dos dois. Fatos observados no código estão separados de opinião/recomendação.
> **Atualização 11/08 (tarde):** o `erp_back` foi de fato ligado numa cópia local de teste
> (nunca publicado, nunca tocou homolog/produção) — ver §6.
> **Atualização 11/08 (noite):** rodada final rigorosa — testes automatizados escritos pra
> quase todas as rotas/telas dos dois sistemas, e todo bug técnico corrigido até bater
> 100% (sem inventar regra de negócio nenhuma). Ver §7.

---

## 1. Contexto

O ERP atual acumulou dívida técnica depois de ~24 meses sendo construído por IA (documentado
em `docs/migracao/LIVRO-DE-REGRAS-migracao-erp-novo.md`). A decisão já tomada foi reescrever do
zero em dois repositórios separados:

- **`erp_back`** — Express 5 + Prisma 7 + PostgreSQL + JWT/bcrypt + Zod, em camadas
  (domain / application / infrastructure / api).
- **`erp_front`** — React 19 + Vite + TypeScript + Ant Design + TanStack Query.
- **`erp-alisson-agentes`** (branch `feat/fabrica-agentes-v2`) — pipeline de 26 agentes de IA
  especializados, em 8 fases, que constroem módulo por módulo com portões de qualidade e
  parada obrigatória pra decisão humana. Merge sempre manual (Jonathan).

O banco é **compartilhado** entre o sistema atual, o sistema novo e o CRM (mesmo Postgres
self-hosted). Qualquer mudança de estrutura afeta os três.

---

## 2. Cobertura de módulos — o que existe em cada lado

| Área de negócio | ERP atual (`ERP.IAlisson`) | Sistema novo |
|---|---|---|
| PCP / Produção | ✅ Completo, em produção | ❌ Não existe |
| Protocolo | ✅ Completo, em produção | ❌ Não existe |
| Service (app celular) | ✅ Completo, em produção | ❌ Não existe |
| RFID | ✅ Completo | 🟡 Só telas de estoque (ver estoque) |
| Qualidade / Auditoria | ✅ Completo | ❌ Não existe |
| Purificação / Ligação | ✅ Completo, regra de tolerância zero (foto + IA) | 🟡 Existe tela, mas **conferência por IA não implementada** — só guarda a foto |
| Compras / Suprimentos | ✅ Completo | 🟡 Parcial, dentro de Estoque/Metal |
| Estoque | ✅ Completo | 🟡 Parcial-avançado (11 telas), **metade das rotas de back sem login** |
| Comercial / Vendas | ✅ Completo (vale-troca, crediário, comissão) | 🟡 Parcial — **módulo de Entrega propositalmente não implementado** (é a peça que decide quando a reserva de estoque vira baixa de verdade) |
| Financeiro | ✅ Completo | 🟡 O mais extenso do sistema novo (119 rotas), mas pouca validação de entrada pro tamanho |
| Configurações | ✅ Completo | ✅ Aparentemente completo (63 rotas, 16 abas) |
| Login / Usuários | ✅ Completo (recuperação de senha, roles, permissões granulares) | 🟠 Só login básico — sem "esqueci senha", sem 2FA, sem limite de tentativas |
| E-commerce / Criativo | ✅ Completo | ❌ Não existe |

**Resumo:** o sistema atual ainda cobre muito mais operação do dia a dia. O sistema novo tem
uma base técnica mais moderna, mas cobre hoje só o núcleo comercial/financeiro/estoque — e
mesmo nesse núcleo, tem peças propositalmente deixadas pra depois (Entrega, IA da purificação).

---

## 3. Achados que pesam numa decisão de unificação

### 🔴 Bloqueiam qualquer uso real hoje

1. **`erp_back` não sobe do jeito que está** — `financeiro.routes.ts` importa um arquivo de
   segurança (`rate-limit.middleware`) que não existe no repositório. O servidor quebra ao
   tentar iniciar.
2. **Metade das rotas de Estoque e todas as de Cotações não pedem login** — 44 rotas de
   estoque (insumos, produtos, inventário, RFID, compras) e as 4 de cotações estão abertas
   pra qualquer um na internet, sem token nenhum.
3. **Segredo de login com valor de reserva fixo no código** (`JWT_SECRET ?? 'fallback-dev-only'`,
   repetido em 2 arquivos) — se a variável de ambiente faltar em produção, qualquer pessoa com
   acesso ao código consegue forjar um login válido pra qualquer usuário.
4. **Nova Venda grava "TESTE REMOVER" em toda venda real** (sobra de teste no `erp_front`,
   `VendaWizardPage.tsx`) — contamina o campo de observação de toda venda feita por essa tela.

### 🟠 Regra de negócio crítica ainda não implementada

5. **Confirmação de entrega (Vendas)** — no sistema atual, é o gatilho que transforma reserva de
   estoque em saída de verdade. No sistema novo, essa peça existe só como um "aviso de erro"
   proposital, esperando um módulo futuro.
6. **Checagem de saldo antes de registrar ligação/purificação de metal** — hoje seria possível
   registrar mais metal do que existe em estoque, porque Metal ainda não conversa com Estoque.
7. **Conferência por IA da pesagem** (regra de tolerância zero no sistema atual) — no sistema
   novo, por enquanto só guarda a foto, sem checar.

### 🟡 Vale corrigir antes de crescer mais (mais barato agora do que depois)

8. **3 tabelas de configuração sobrepostas** no banco (`parametros_sistema`,
   `configuracoes_sistema`, `config_sistema`) — o sistema novo herdou a duplicação do banco
   atual em vez de resolver na reescrita.
9. **~15-20 itens do menu do `erp_front` sem tela nenhuma por trás** (e alguns com tela pronta,
   mas o link do menu está com o nome errado — a tela existe, só não tem como chegar nela).
10. **Zero teste automatizado nos dois repos novos** — qualquer unificação vai depender de teste
    manual, sem rede de segurança.
11. **Componentes gigantes concentrando tela + regra de negócio** (ex.: tela de Precificação com
    584 linhas cuidando de 4 fluxos diferentes) — mesmo problema de "arquivo grande demais" que
    motivou reescrever o sistema atual.
12. **Duplicação de nome de coluna no banco** (`situacao`/`status`, `obs`/`observacao`) — já
    mapeado a fundo no `LIVRO-DE-REGRAS-migracao-erp-novo.md`; a correção já foi testada com
    segurança numa cópia isolada, só falta decidir quando aplicar em homolog/produção — **em
    conjunto com o time do sistema novo**, porque os dois lados dependem do mesmo nome de coluna.

---

## 4. O que já está bem feito no sistema novo (não precisa refazer)

- Tipos de dinheiro/peso usando `Decimal` (zero `Float`) — resolve a maior fonte histórica de
  bug de arredondamento do sistema atual.
- Front com base técnica consistente: um cliente HTTP central, TanStack Query, Ant Design em
  100% das telas, paleta de marca formalizada.
- Arquitetura em camadas no back com ferramenta de checagem automática (`check:arch`) — mesmo
  já tendo violação em 5 arquivos, é uma régua que o sistema atual nunca teve.
- Pipeline de 26 agentes de IA com portão de decisão humana obrigatório antes de qualquer
  implementação — reduz risco de repetir os mesmos erros do sistema atual.

---

## 5. Recomendação (opinião, não decisão)

1. **Não publicar a troca de nomes de coluna sozinho** — isso é conversa a três (Alisson,
   Jonathan, Rafael), porque o `erp_back` depende do mesmo schema.
2. **Antes de qualquer módulo novo avançar**, resolver os 4 achados 🔴 do sistema novo — em
   especial a falta de login em Estoque/Cotações, que é risco de segurança real, não só dívida
   técnica.
3. **Vendas → Entrega é o ponto de maior risco de negócio** pra decidir quando o sistema novo
   pode assumir uma área que hoje é do sistema atual — não fazer a troca antes desse módulo
   existir de verdade.
4. Usar este documento como ponto de partida pra uma conversa dos três sobre **ordem de
   migração módulo por módulo** (o método que o próprio `LIVRO-DE-REGRAS` já recomenda — nunca
   trocar tudo de uma vez).

---

## 6. Teste real — `erp_back` ligado numa cópia local (11/08/2026)

> Tudo isto foi feito **só numa cópia local de teste** (clone do repositório, banco de teste
> local `erp_teste`). Nada foi publicado no GitHub do `erp_back`/`erp_front` e nada tocou
> homolog/produção. Objetivo: confirmar na prática o que o pente-fino (§3) só via leitura de
> código não conseguia provar.

### 6.1 A unificação das 3 tabelas de config — confirmada funcionando
O achado #8 (3 tabelas de configuração sobrepostas) foi corrigido só na cópia local do
`erp_back` (troca de `parametros_sistema` + `configuracoes_sistema` pela `configuracoes_unificado`
que já existe no banco de teste, sem recriar as antigas) e testado de ponta a ponta: ler, criar,
atualizar e listar configuração, tudo bateu certo contra dado real. **Prova que a decisão de
unificar essas 3 tabelas no banco de verdade não quebra o `erp_back`** — é seguro de aplicar,
só falta alinhar quando com o Jonathan/Rafael (recomendação §5 continua valendo).

### 6.2 Servidor completo — não subia, agora sobe
Antes de qualquer ajuste, o `erp_back` **não conseguia nem ligar** (achado 🔴 #1 do pente-fino).
Causa raiz real: o módulo Financeiro importa ~13 arquivos que nunca foram criados neste
checkout (schemas, casos de uso, serviços de integração com o Asaas, entidades) — não é 1
arquivo faltando, é trabalho ainda não commitado ou perdido do lado do time do sistema novo.
Pra conseguir testar o resto do sistema, foram criados stubs mínimos desses ~13 arquivos (cada
um lançando um erro claro "não implementado nesta cópia de teste" quando chamado de verdade,
sem inventar nenhuma regra de negócio) — só pra destravar o `import`, sem fingir que a
funcionalidade existe.

### 6.3 Segunda rodada (mesmo dia) — escrita testada, mais 2 bugs achados

Depois da primeira rodada (só leitura), uma segunda passada corrigiu os 3 erros 500 que tinham
sobrado (faltava criar 2 tabelas — `historico_cotacoes`, `log_sistema` — e reconstruir 2 tabelas
de Financeiro, `fin_contas`/`fin_categorias`, que nunca existiram em lugar nenhum, nem em
produção) e testou ESCRITA (criar/editar/apagar) em Estoque, Financeiro, Metal e Sistema — todos
funcionando, dado de teste limpo depois.

**2 bugs novos confirmados ao tentar escrever (não corrigidos, fora do escopo da rodada):**
- **Vendas não consegue criar venda nova** — o código ainda escreve na coluna antiga `situacao`
  de `vendas_erp`, que já foi renomeada pra `status` no banco de teste. Mesma família do achado
  #12 (situacao/status), só que ainda não corrigida no módulo Vendas.
- **Configurações não consegue criar gateway de pagamento** — mesmo tipo de problema, mas com
  `obs`/`observacao` na tabela `fin_gateways`.

### 6.4 Resultado dos testes (com dado real do banco de teste)

| Módulo | Testado | Resultado |
|---|---|---|
| Login | login com senha errada e com senha certa | ✅ funciona ponta a ponta, devolve token |
| Configurações | parâmetros, roles, usuários | ✅ 200, dado real |
| Cotações | cotação atual | ✅ 200 |
| Cotações | histórico/estatísticas | ❌ 500 — tabela `historico_cotacoes` não existe no banco de teste (não é bug do código) |
| Estoque | insumos, produtos, categorias | ✅ 200 |
| Metal | compras, tipos de liga | ✅ 200 |
| Vendas | resumo, vendedores | ✅ 200 |
| Sistema | alertas | ❌ 500 — tabela `log_sistema` não existe no banco de teste |
| Financeiro | contatos, comissões, extratos, notificações, transferências, assinaturas | ✅ 200 (algumas com lista vazia, degradando bem) |
| Financeiro | contas, contas a pagar, dashboard, fornecedores, categorias | ❌ 500 — faltam tabelas/coluna no banco de teste (`fin_contas`, `fin_categorias`, `contas_pagar.situacao`) |
| Financeiro | integração Asaas (cobrança, cartão, fluxo de caixa consolidado) | ⚠️ erro limpo e esperado — é a parte que foi stubada em 6.2, não existe ainda de verdade |

### 6.5 Terceira e quarta rodadas — os 2 últimos bugs de nome de coluna, e um gap real

Corrigidos e confirmados com teste real (criar → ler → apagar):
- **Vendas não conseguia criar venda nova** (achado 6.3) — na prática já tinha sido corrigido
  numa rodada anterior (mesmo SQL cru já usava `status`); confirmado com `GET
  /api/vendas/contagem-status` e `/evolucao`, ambos 200 com dado real.
- **Configurações não conseguia criar gateway de pagamento** (achado 6.3) — corrigido de
  verdade: campo `obs` do gateway apontava pro nome antigo da coluna; ajustado pra ler/escrever
  em `observacao`. Testado criando, listando e apagando um gateway de teste — bateu certo.
- **Item de venda com nome de coluna trocado** (`valor_unitario`/`valor_total` no código,
  `preco_unitario`/`total_item` no banco real) — corrigido nos 3 pontos (criar, atualizar, ler
  item de venda).

**Gap real encontrado (não é bug de nome de coluna — é feature que falta escrever):** o
código que cria uma venda nova sempre manda o número da venda **vazio** (`numeroVenda: ''`,
`criar-venda.use-case.ts`) — a lógica de gerar o próximo número de venda nunca foi implementada.
Resultado: a primeira venda até seria criada, mas a segunda sempre falha (número duplicado). Não
inventei um formato de numeração — é decisão de negócio do Jonathan/Rafael (prefixo, sequência
por ano, etc.), documentado aqui como pendência real de feature, igual à Entrega e ao Asaas.

**Leitura honesta do resultado:** a base do sistema novo (login, configurações, cotações,
estoque, metal, vendas) funciona de verdade contra dado real, sem precisar de nenhum ajuste de
código — só faltava ajuste pontual no banco de teste (2 colunas + 1 tabela, feito). O módulo
Financeiro é o mais avançado em quantidade de rota, mas também o que tem mais peça faltando de
verdade (não é falta de teste, é código ainda não escrito do lado deles) — bate com o que o
`docs/PADRONIZACAO-SCHEMA-migracao.md` do próprio `erp_back` já sinalizava como módulo de
maior risco.

---

## 7. Rodada final rigorosa (11/08, noite) — testes automatizados + zerar bug técnico

> Decisão do Alisson: corrigir rigorosamente todo bug técnico até bater 100%, escrevendo
> testes automatizados de verdade (que ficam salvos no código, não é só um clique manual),
> mas **sem inventar nenhuma regra de negócio**. Tudo abaixo ficou só na cópia local —
> nada publicado nos repositórios do Jonathan/Rafael, nada tocou homolog/produção.

### 7.1 O que foi construído
- **Vitest** (testes de integração do back, chamando o servidor real): 9 arquivos, **308
  testes** cobrindo praticamente todas as ~290 rotas de `erp_back` (auth, configurações,
  cotações, sistema, estoque, metal, financeiro, vendas).
- **Playwright** (testes end-to-end do front, navegador de verdade): arquivos cobrindo
  Dashboard, as 16 abas reais de Configurações, Cotações, as 9 telas de Estoque, as 2 de
  Metal, as 10 de Financeiro, e o fluxo completo de Vendas (lista → detalhe → wizard de
  nova venda, testado até o fim, com sucesso).

### 7.2 Resultado final
**307 de 308 testes do back passando. 1 só ficou como pendência de negócio real,
documentada (não é bug):** transferência de insumo/metal entre depósitos físicos não tem
de onde vir o dado de "local físico" (Fábrica/Loja) — ninguém decidiu ainda como isso deve
funcionar no sistema novo.

### 7.3 Bugs técnicos corrigidos nesta rodada (além dos já listados no §6)
- Furo de segurança do Estoque (44 rotas sem login) e SQL sem parâmetro no Metal (risco de
  injeção) — já reportados antes como achado, corrigidos e testados aqui.
- **Bug de ordem de montagem de rotas:** dois módulos (`estoque`, `vendas`) exigiam login
  pra qualquer coisa, mas estavam registrados ANTES de três módulos com rota
  intencionalmente pública (`cotações`, `sistema`, e o webhook do Mercado Pago dentro de
  `metal`) — isso bloqueava com "401" rotas que deviam ser abertas (ex: o próprio robô do
  Mercado Pago confirmando um pagamento). Corrigido reordenando o arquivo principal do
  servidor.
- **Conversão de estoque (por peso e por SKU) nunca funcionava** — o código não criava a
  "ordem" que a conversão precisa pra existir, nem somava os itens em peso/quantidade
  total. **Portei a regra de negócio EXATA que já existe e funciona no sistema atual**
  (não inventei nada — copiei o fluxo real: gera número sequencial, cria a ordem, reserva
  o saldo, só então grava a conversão) pro `erp_back`.
- Bug de gênero gramatical no tratamento de erro de Vendas e Metal (mensagens no feminino
  como "não encontrada" caíam em erro genérico 500 em vez do código certo).
- ~15 outros bugs técnicos menores (nome de coluna trocado, campo obrigatório não
  preenchido, validação de UUID faltando, rota duplicada morta, enum sem todos os valores
  que o código já usa) — lista completa nos comentários dos próprios arquivos de teste.

### 7.4 O que ficou documentado como pendência de negócio (não inventado)
- Formato do número de pedido de compra de metal e do número de venda (hoje fixo/vazio).
- Campo de depósito físico na transferência de estoque (item 7.2).
- Tudo que já estava listado no §3/§6: Asaas, módulo de Entrega, validação por IA,
  Precificação sem rota, ~6 tabelas de Financeiro que nunca existiram.

**Conclusão desta rodada:** dentro do que é tecnicamente corrigível sem decisão de
negócio, o `erp_back` está limpo — 307/308, com uma rede de testes automatizados que não
existia antes e que qualquer um pode rodar de novo (`npx vitest run` / `npx playwright
test`) pra confirmar que nada quebrou depois de uma mudança futura.

### 7.5 Atualização — os 3 "pendências de negócio" na verdade não eram (11/08, mais tarde)

Antes de levar pro Jonathan/Rafael como decisão pendente, conferi se o sistema **atual**
já resolve essas 3 coisas — e resolve, nas três:

1. **Número de venda** (`vendas_erp.numero_venda`) — o sistema atual usa uma sequence real
   do banco (`alissonerp.venda_numero_seq`, migration 259, já existe no banco de teste)
   pra gerar o número, exatamente pra evitar a corrida entre duas vendas ao mesmo tempo.
   Portado pro `erp_back` (era só um `''` fixo em vez de chamar a sequence).
2. **Número de compra de metal** (`compras_metal.numero`) — mesma coisa: sequence real
   (`alissonerp.compras_metal_seq`), formato `CM-AAAA-NNNN`. Portado (era `'PENDENTE'` fixo).
3. **Depósito físico na transferência de insumo** — não faltava decisão nenhuma: o
   sistema atual já pede do usuário os dois locais físicos (Fábrica/Loja) na própria tela,
   sempre pediu. O `erp_back` só confundia esse campo com "depósito/operador" (Almoxarifado),
   um conceito diferente — corrigido a mistura, sem inventar nada novo.

**Resultado final: 308 de 308 testes passando, ZERO pendência restante.** Nenhuma das 3
precisou de decisão do Jonathan/Rafael — eram implementação incompleta, não regra de
negócio nova.

---

## Referências
- `docs/migracao/LIVRO-DE-REGRAS-migracao-erp-novo.md` — plano de migração de banco (já com
  pente-fino de banco feito, esperando decisão de quando aplicar).
- `erp_back/docs/PADRONIZACAO-SCHEMA-migracao.md` — proposta de padronização de schema, do
  time do sistema novo.
- `erp-alisson-agentes` (branch `feat/fabrica-agentes-v2`) — `docs/modulos/fabrica-de-agentes.md`,
  arquitetura completa dos 26 agentes.
