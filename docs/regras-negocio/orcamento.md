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

## Peso da aliança Anatômica — volume real do molde 3D (decisão Alisson, 21/08/2026)

Até aqui, o peso de **qualquer** formato de aliança saía de um tubo reto
(aro + largura + espessura) multiplicado por um "fator de correção" fixo por
formato (`PROFILE_CORRECTION_FACTOR` em `orcamento/constants.ts`) — um número
herdado de sistema antigo, sem derivação, igual pra qualquer tamanho.

Uma peça real (Anatômica, aro 28, largura 8,20mm, espessura 1,64mm, ouro
amarelo 18k) pesou **12,5g** na balança; a fórmula antiga calculava **13,5g**
(~8% acima).

**O que mudou — só para o formato Anatômica:** o sistema já desenha um molde
3D real da curva da Anatômica para o visor (`AliancaViewport.tsx`) — reagindo
ao "Boleamento" (`domePercentage`) — mas o peso nunca olhava para ele. Agora
`computeWeight` (`orcamento/constants.ts`) mede o **volume real** desse
sólido (`anatomicaMeshVolume`, em `orcamento/ring-geometry.ts`): soma de
tetraedros assinados sobre a malha fechada do revolve 360° — o mesmo tipo de
cálculo que um programa de CAD (Rhino incluso) usa para volume de sólido
fechado — em vez do tubo × 88% chutado. Com a mesma peça (Boleamento 100%,
assumido — não registrado na ficha original), o cálculo novo fecha em
**13,0g**, contra os 13,5g de antes.

**Escopo travado de propósito:** os outros 6 formatos (Reta, Côncava, Bordas
Elevadas, Boleada, Boleada DF, Chanfrada) continuam exatamente na fórmula
antiga — nenhum deles foi tocado. Pedra cravada continua com o mesmo desconto
estimado de sempre (o molde não fura o metal onde a pedra entra). Friso,
quando a peça Anatômica tem, já sai cortado dentro do molde antes de medir o
volume — por isso não é descontado de novo.

**Trava nova:** o campo Boleamento da Anatômica, que antes aceitava qualquer
número (só afetava o desenho), agora trava entre 0% e 100% — fora disso o
cálculo de peso perderia o sentido.

**Antes de valer pra venda:** 1 peça real não é base segura para confiar no
número pra sempre — comparar com mais peças pesadas na balança, em aros
diferentes, antes de tirar da homolog.
