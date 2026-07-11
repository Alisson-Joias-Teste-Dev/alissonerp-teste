# Mapa de esbarros — autorização das aprovações

> Auditoria estática (só leitura) de 28 endpoints. Prova em `arquivo:linha`.
> Versão navegável: artifact `Mapa de esbarros — aprovações AlissonERP`.

## Causa raiz: 3 fontes de verdade que não conversam

Nenhum ponto único responde "para o evento X, quem aprova?". A resposta está em 3 lugares e cada
endpoint implementa a própria checagem — por isso a role quase sempre ganha da config.

- **Configurações › Aprovadores** → `configuracoes_sistema` (12 chaves)
- **Cargos fixos** → `roles.ts` (~10 listas)
- **Regras por evento** → `tarefas_regras_aprovacao`

Só 2 fluxos respeitam a config de verdade: **limpeza** (UUID exato, `limpeza-ouro-aprovacao.ts:39`)
e **devolver-peça** (lista de UUIDs). No resto a config é decorativa.

## A · Quatro definições divergentes de "acesso pleno"

| Constante | Conteúdo | Onde |
|---|---|---|
| `isFullAccess` | admin · desenvolvedor · **diretor** | `roles.ts:2` |
| `ROLES_FINANCEIRO` (alteração de venda) | admin · desenvolvedor · diretor (inline) | `solicitacoes-alteracao/[id]:26` |
| `ROLES_FINANCEIRO` (fechar comissão) | dev · admin · **gerente_fabrica · gerente_loja** | `fechamentos/[id]/fechar:15` — **mesmo nome, conteúdo diferente** |
| `FULL_ROLES` (desconto por item) | desenvolvedor · admin (**sem diretor**) | `solicitacoes-desconto/[id]:7` |
| override do despachante | admin · desenvolvedor (**sem diretor**) | `tarefas/[id]/aprovacao:329` |

Efeito: **diretor** aprova umas coisas e outras não, sem lógica.

## B · Config ignorada pela role

- **Compra/recebimento de metal**: `metal_aprovador_id` lido só na criação; na decisão só checa role → qualquer consultora/gerente aprova (`metal/aprovacoes/[id]/aprovar:19`)
- **Desconto (atalho)**: ignora `aprovador_desconto_padrao`, fixa admin/dev (`aprovar-desconto:24`)
- **Precificação, Conversão/SKU**: nem têm chave de config — só role
- **Despachante geral**: qualquer admin/dev responde no lugar do aprovador designado (`tarefas/[id]/aprovacao:331`)

## C · Brechas — aprovar sem checagem de cargo (crítico)

- **Auditoria**: `void user` — zero checagem (`auditoria/[auditoriaId]:19`)
- **Concluir compra comercial** (gera estoque + contas a pagar): `void user` (`compras-comercial/[id]/concluir:20`)
- **Solicitar aprovação de entrega**: sem checar dono da venda (`solicitar-aprovacao-entrega:24`)
- **Criar solicitação de aprovação**: qualquer autenticado escolhe o aprovador livremente (`tarefas/[id]/aprovacao:268`)

## D · Muitas portas para a mesma aprovação — efeitos diferentes (crítico)

- **Desconto, 3 portas → 3 comissões**: via tarefa **0,5%** (`tarefas/[id]/aprovacao:476`) · por item **0%** (`solicitacoes-desconto/[id]:88`) · atalho **não mexe** (`aprovar-desconto`)
- **Backdoor**: dono/full-access marca tarefa `status:'aprovada'` pulando comissão/estoque/crédito (`tarefas/[id]:132`)
- **approveVenda** alcançável por **8 call sites** (um sem checagem de cargo) — lista no dossiê fluxo C

## E · Campos de estado que travam (crítico)

- Desconto aprovado "por item" **não grava** `vendas_erp.desconto_aprovado_por`; o portão do crédito lê exatamente esse campo (`vendas-aprovar.ts:653` + `baixa-credito.ts:338`) → venda continua travada
- Atalho de desconto limpa o campo **errado** (`aprovacao_credito_tarefa_id`) (`aprovar-desconto:71`)
- Conversão aprovada pela via genérica fica **presa em pendente** (sem handler) → 409 depois

## F · Regras fantasma (config na tela, backend ignora)

`valor_venda_acima`, `orcamento_acima`, `credito_loja` existem no motor e no `ConfigTab.tsx`, mas
`avaliarRegras` só é chamado com `desconto_acima` e `cartao_desconto` (`aprovacao-regras.ts:45-52`).

## G · Aprovações automáticas (por desenho)

Concluir serviço cria auditoria já `aprovado` (`service/[id]/concluir:287`); venda com crédito
auto-aprova ao confirmar pagamento; conclusão-sistema (master) marca auditoria/consultora em lote.

## Matriz resumida (conflito por endpoint)

| Endpoint | Autorização real | Config? | Conflito |
|---|---|---|---|
| tarefas/[id]/aprovacao PATCH | aprovador_id OU admin/dev L329 | parcial | alto |
| tarefas/[id] PATCH | dono OU isFullAccess L96 (backdoor) | não | crítico |
| vendas/[id]/aprovar-desconto | [admin,desenvolvedor] L24 | não | alto |
| vendas/[id]/solicitar-aprovacao | ownership; ramo direto sem cargo L268 | parcial | alto |
| vendas/solicitacoes-desconto/[id] | FULL_ROLES [dev,admin] L44 → comissão 0% | não | crítico |
| vendas/solicitacoes-alteracao/[id] | ROLES_FINANCEIRO inline L26 | não | médio |
| vendas/[id]/solicitar-aprovacao-entrega | só auth, sem ownership L24 | sim | médio |
| crediario/…/devolver-peca | lista config OU full L41 | sim | consistente |
| metal/aprovacoes/[id]/aprovar·rejeitar | só role L19/L18 (ignora metal_aprovador_id) | ignora | alto |
| conversao/aprovar·recusar | [admin,desenvolvedor] L29/27 | não | alto |
| conversao-sku/aprovar·recusar | [admin,desenvolvedor] L22/24 | não | médio |
| precificacao/aprovar·rejeitar | isFullAccess L29/25 | não | médio |
| purificacao/limpeza/aprovacao | UUID exato aprovador_limpeza L39 | sim | consistente |
| purificacao/limpeza (iniciar/concluir) | só auth L96 | só existe | médio |
| compras-comercial/[id]/solicitar-aprovacao | só auth L20 | sim | médio |
| compras-comercial/[id]/concluir | void user L20 (tol. 0,3g) | sim | crítico |
| devolucoes/* | hasRole ROLES_DEVOLUCAO L22 | sim | consistente |
| financeiro/comissoes/…/fechar | ROLES_FINANCEIRO inline (≠ outro arq.) L15 | não | médio |
| auditoria/[auditoriaId] PATCH | void user — NENHUMA L19 | não | crítico |
| aprovacao/[aprovacaoId] | full/gerentes OU própria consultora L33 | não | médio |
| ordens/[id]/concluir-sistema | só master admin/dev L45 | não | consistente |
| orcamento/[id] PATCH | isFull OU ROLES_APROVACAO + dono L168 | não | médio |
| promocoes POST/PATCH | isFullAccess L51 | não | consistente |
| service/[id]/concluir | isFullAccess/operador L78 → auditoria 'aprovado' L287 | não | médio |
