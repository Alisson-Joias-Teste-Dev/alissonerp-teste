# Crediário — resumo do redesenho completo (20/06/2026)
> Resumo em linguagem simples pra validar e assinar. Regra detalhada: docs/regras-negocio/crediario.md.
> Tudo em HOMOLOG, testado, NADA em produção/main. 10 commits (19d3543e → 6f9731d5).

## O que foi resolvido (em uma frase)
O "não conseguem dar baixa" tinha raiz: a conta a receber só nascia na entrega e
havia duas portas de baixa, o que fazia o recebimento "sumir" do crediário. Agora
a conta nasce na aprovação, a baixa tem um lugar só, e as vendas a prazo têm
parcelamento, sinal e alertas.

## As 5 fases (todas com o núcleo pronto e testado)

### Fase 1 — Fundação
- A conta a receber **nasce quando a venda é aprovada** (não mais na entrega).
- A baixa do "A Receber" é **só pela tela do Crediário** (a tela da venda parou de
  baixar e avisa pra usar o Crediário). Acabou o "recebimento fantasma".

### Fase 2 — Parcelamento (venda a prazo)
- Na tela de nova venda, ao escolher "A Receber", abre o painel **Pagamento a
  prazo**: Mensal (N parcelas no mesmo dia, 1ª no mês seguinte) ou "Em X dias".
- Ao aprovar, cada parcela vira uma conta a receber com seu vencimento.
- Testado: venda 15475 → 3 parcelas de R$ 800 (10/07, 10/08, 10/09).

### Fase 3 — Sinal pra segurar peça
- Mesma tela tem a opção **"Sinal"**: a peça fica reservada, o cliente tem 7 dias
  úteis pra pagar o saldo.
- Um robô diário (`/api/crediario/sinal-cron`): se o prazo passou e não pagou, o que
  o cliente já pagou **vira um vale VC-** e o estoque é avisado pra recolocar a peça.
- Testado: venda 15475 → VC-00043 de R$ 600 + conta cancelada + aviso ao estoque.

### Fase 4 — Alertas
- **Faixa vermelha na tela** do Crediário ("Você tem N contas vencidas..."), some
  com "ok" e volta no dia seguinte.
- Botão **"Cobrar no WhatsApp"** no detalhe da conta: abre o WhatsApp com a mensagem
  pronta (nome + valor + vencimento) — a consultora revisa e envia.

### Fase 5 — Comissão (só exibição, sem mexer no cálculo)
- No relatório de comissão, o **número da venda virou link** (abre a venda).
- Estornos/ajustes aparecem **destacados** (vermelho/verde) pra ver os descontos.

## Como validar (sugestão)
1. Criar uma venda a prazo parcelada (3x) → aprovar → ver as 3 parcelas no Crediário.
2. Criar uma venda com "Sinal" → aprovar → ver a conta vencendo em 7 dias úteis.
3. Abrir o Crediário → ver a faixa de vencidos + o botão "Cobrar no WhatsApp".

## O que ainda falta (acabamentos — próxima rodada)
- Botão do **estoque** pra confirmar a volta física da peça (hoje o robô avisa, mas
  a peça volta ao saldo só com confirmação — falta a tela).
- Sinal **com entrada** numa tela dedicada (hoje a entrada vai por "Múltiplas").
- Alerta "vai virar crédito" 2-3 dias antes do sinal vencer.
- Motivo textual do estorno no relatório de comissão.
- **Agendar o robô do sinal** pra rodar sozinho todo dia (hoje funciona, mas manual).

## Observações
- Havia trabalho de outra pessoa não-commitado (autocura tiny-contatos); está
  guardado em `git stash` (recuperar com `git stash pop`).
- Dados de teste em homolog: vendas 15449, 15475, 15476.
