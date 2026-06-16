# Regras de Negócio — Orçamento

> Mantido à mão. Tela: `/orcamento` (lista+editor) e `/orcamento/detalhe/[id]`.
> Última atualização: 2026-06-16.

## O que é
Orçamentos (cotações) de **aliança** ou **peça**. Fluxo de status: `rascunho` → `enviado` → `aprovado`/`rejeitado` → `convertido`. **Aprovar cria uma VENDA pré-preenchida (rascunho) no PDV** (`POST`/`PATCH /api/orcamento/[id]` status=aprovado).

## Cliente (ponto sensível)
- O orçamento guarda **`nome_cliente`** (texto livre, pra cotar rápido) E **`cliente_id`** (FK → `public.contatos`).
- **`public.contatos` é READONLY** (vem do Tiny) — o ERP não cria cliente direto; cliente novo é cadastrado no Tiny.
- **Para APROVAR** (vira venda), o orçamento PRECISA de `cliente_id` vinculado a um contato real. Só `nome_cliente` (texto) não basta → backend barra com **422 "Vincule um cliente antes de aprovar"** (`api/orcamento/[id]/route.ts`).

## Regra do "Aprovar" sem cliente vinculado (decisão Jonathan 16/06/2026, v2.67.5)
Aprovar pela lista um orçamento que só tem nome (sem `cliente_id`) **NÃO dá mais beco sem saída**: o botão reage ao 422 e **abre um seletor** que faz uma de duas coisas:
1. **Buscar e vincular** um cliente **já cadastrado** (`/api/vendas/clientes/busca`) → aprova num PATCH único (`{cliente_id, status:'aprovado'}` — o route vincula e então aprova).
2. **Cadastrar um cliente novo** ali mesmo (`+ Cliente não cadastrado?`) — form com nome **pré-preenchido** do orçamento + CPF/Celular → `POST /api/contatos` (só nome obrigatório; sincroniza pro Tiny via `fila_sync_externo`) → já vincula e aprova. Cobre o caso do cliente que não existe no cadastro (ex.: ORC-0000157 "Victor").

Implementado em `OrcamentoClient.tsx` (`iniciarAprovacao`/`vincularEAprovar`/`cadastrarEVincular`), espelhando o modal de Rejeitar e reusando a busca/criação de cliente já existentes.

## Notas
- A tela de **detalhe** já tinha seletor de cliente (manda `cliente_id` ao aprovar); o furo era só aprovar **pela lista**.
- Conferido 16/06: 9 orçamentos com nome e sem `cliente_id` — 4 são cliente cadastrado (dá pra vincular), 1 cliente não cadastrado (Victor), 4 são lixo/teste (PENTEST/`DROP TABLE`/CPF solto). As queries são parametrizadas — o `DROP TABLE` ficou só como texto (não executou).
