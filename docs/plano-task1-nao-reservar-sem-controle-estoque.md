# Plano — Task 1 (B8, na causa-raiz): produto sem controle de estoque não reserva nem baixa

> **Status:** plano (análise). Nada será executado sem o "ok" do Jonathan e seguindo o fluxo do
> CLAUDE.md (resumo → aprovação → plano → execução; backup + assinatura + homolog antes da prod).
> Verificado na produção em 2026-06-17.

---

## Regra de negócio (capturada com o Jonathan — 17/06/2026)
- `estoque_comercial_config.controla_estoque = false` = **produto que NÃO controla estoque no período em que estiver marcado**. Pode ser:
  - um **serviço** (cadastrado só pra cobrar o valor certo na venda), ou
  - um **produto que já teve movimentações** e hoje o Jonathan **decidiu não controlar** o estoque dele.
- Enquanto marcado assim: **não reserva e não dá baixa**.
- É **temporal** — pode ser religado (volta a controlar).
- **Pode ser desligado do front** (sumir da tela de estoque comercial).
- ⚠️ **Nunca perder dados.** Movimentações e reservas antigas são preservadas — **nunca deletar**, no máximo mudar o status.

> A capturar formalmente em `docs/regras-negocio/estoque.md` (módulo ainda "a documentar") quando entrarmos em execução.

---

## O problema (confirmado na produção)
- A reserva nasce checando **só o `ativo`**, **nunca o `controla_estoque`**. Confirmado na função viva
  `fn_estoque_comercial_baixa_venda` (gatilho no item da venda).
- A reserva é criada em **3 caminhos**, não 1:
  1. gatilho `trg_estoque_comercial_baixa_venda` (item entra na venda);
  2. rota `src/app/api/estoque-comercial/converter/route.ts`;
  3. rota `src/app/api/conversao-sku/route.ts`.
  Nenhum dos 3 checa `controla_estoque`.
- Hoje: **25 produtos** com `controla_estoque=false` estão **`ativo=true`** → reservam. Há **38 reservas
  ativas** nesses produtos agora (ex.: serviço "Soldagem" com 21 ativas).
- O B8 do chefe (filtro na **baixa**, presente na branch `main`) trata o **sintoma**. A **causa** é a
  **reserva** nascer onde não devia.

---

## Conserto proposto (a fazer — processo: backup + `assinar_mudanca_banco` + homolog antes da prod)

**1. Trava única no banco (cobre os 3 caminhos):** na criação da reserva, **pular** quando o produto
   tem `controla_estoque=false`.
   - Tem que ser **pular**, não **dar erro** — senão quebra uma venda que tenha uma linha de serviço.
   - ⚠️ Cuidado de implementação: as 2 rotas de conversão usam o `id` da reserva criada
     (`RETURNING id`). Uma trava que simplesmente cancela o INSERT deixaria esse `id` vazio e
     quebraria a rota. Definir o ponto exato (gatilho na tabela `reservas_estoque_comercial` que
     trata todos, vs guarda em cada caminho) na fase técnica — **decisão técnica a fechar antes de codar**.

**2. Alinhar a `main` (o B8 original):** remover o filtro `controla_estoque` de `baixarEstoqueDaEntrega`
   pra deixar igual à `homolog`. Vira redundante depois da trava, mas tira a **bomba latente** da `main`
   e mantém as duas branches iguais.

**3. Front:** permitir **desligar** o produto (`ativo=false`) sem apagar nada — só esconder da tela.

---

## Limpeza dos 38 (SÓ depois do conserto no ar — regra do projeto; **preservar dados**)
- Gerar a lista **ao vivo** (nunca usar números/IDs deste doc).
- **Caso a caso, NUNCA deletar — só mudar status:**
  - Reserva "fantasma" de serviço → **cancelar** (status `cancelado`).
  - Reserva de **produto real com venda ainda pendente** → resolver de forma que a venda **ainda
    consiga entregar** (efetivar / manter conforme o caso) — levar ao Jonathan os que tiverem dúvida.
- **Movimentações antigas: intocadas.**

---

## Como conferir (verificação)
- Venda nova com uma linha de **serviço** → **não** gera reserva.
- **Conversão** de produto `controla_estoque=false` → **não** gera reserva.
- Sentinela (tem que dar **zero** depois da limpeza): "reservas `ativo` em produto `controla_estoque=false`".
- **Contagem antes/depois**: nenhuma movimentação nem reserva **apagada** (só status alterado).

---

## Pendências / decisões antes de codar
- **Técnica:** local exato da trava (tabela de reservas vs cada caminho), resolvendo a interação com as rotas de conversão.
- **Negócio (caso a caso):** os produtos reais com venda pendente entre os 38 precisam da palavra do Jonathan na limpeza.
- Capturar a regra em `docs/regras-negocio/estoque.md`.
