# Crediário / Contas a Receber — Regras de Negócio

> **LER antes de mexer no módulo.** Fonte de verdade da regra de negócio do crediário.
> Desenho alinhado com Jonathan em 19/06/2026 (sessão de planejamento). Status: APROVADO o desenho; implementação por fases em `homolog`.
> Ver também `comercial.md` (estoque/reserva/entrega, vale-troca, comissão).

---

## 0. Bug raiz que motivou o redesenho (diagnóstico em produção, 19/06)

Existem **duas portas** para baixar um pagamento "A Receber":
1. Tela do crediário — `POST /api/crediario/[id]/registrar-pagamento` (opera pela conta a receber).
2. Dentro do PDV/venda — `POST /api/vendas/[id]/pagamentos/[pagId]/confirmar` (opera pelo pagamento da venda).

A conta a receber **só nasce** quando a venda vira `confirmado/entregue/concluido` (trigger `fn_venda_gerar_conta_receber`). Se confirmam o pagamento pela porta do PDV **antes** da conta nascer, o pagamento vira `confirmado`, não há conta a receber para baixar, e na entrega o saldo dá zero → a conta **nunca é criada** = **recebimento fantasma** (some do controle do crediário).

**Números reais (produção, 19/06):** 89 contas pendentes (R$ 406 mil), **77 vencidas (R$ 337 mil)**, 70 das 89 "soltas" (sem vínculo com o pagamento da venda). Permissão de baixa NÃO é o problema.

**O que o redesenho conserta:** porta ÚNICA de baixa + conta a receber rastreável desde o momento certo.

---

## 1. As 4 situações de uma venda

### ① Pago e leva (à vista)
Cliente paga tudo e leva a joia. Sem conta a receber. É a maioria.

### ② Levou devendo (venda a prazo / crediário)
Cliente leva a joia **sem pagar tudo**. **Qualquer entrega sem o pagamento TOTAL — parcial OU nada — exige aprovação do dono** (separada da aprovação de saldo da gerente).
- Tem **plano de pagamento**: com ou sem entrada.
  - **"Em dias"** = 1 pagamento único futuro (ex.: daqui a 3, 15 dias).
  - **"Em meses"** = N parcelas no mesmo dia do mês; a **1ª parcela só no mês seguinte** (venda 20/06, 3x → 20/07, 20/08, 20/09).
- Cada parcela é uma **conta a receber** com vencimento próprio.
- **Inadimplência (a joia já saiu): COBRANÇA, não vira vale.**

### ③ Sinal para segurar (reserva)
Cliente paga uma **entrada (sinal)**. A joia fica **reservada** (não sai, não vende duas vezes).
- **Prazo: 7 dias úteis, firme.** Pode esticar só com aprovação do dono.
- **Não pagou no prazo:** o que pagou (mesmo 90%) vira **vale VC-** (proporcional ao pago) + a venda expira + a joia volta ao estoque (ver §3).

### ④ Pagou e não buscou
Cliente **pagou tudo** mas não veio retirar. **A joia é dele** — fica reservada para ele **sem prazo**, independente dos dias. **NÃO vira vale, NÃO volta ao estoque.** Único tratamento: a cada ~20-30 dias (a definir), um lembrete para a consultora chamar o cliente para retirar.
> Corrige/derruba a antiga "Task 10" do backlog (que dizia virar vale após 7 dias).

---

## 2. Gatilho do prazo de 7 dias úteis (③)

- **Fabricação / serviço / reposição:** conta a partir do **protocolo de volta concluído** (`protocolos.etapas='concluido'` + `data_conclusao`) = "peça pronta em loja".
- **Peça de estoque (pronta entrega):** conta a partir da **data do sinal**.
- **Venda mista (estoque + fabricação):** manda a regra da **ordem** (espera o protocolo de volta). A entrega pode ser **parcial** (cliente leva a parte pronta) ou tudo junto — já previsto no módulo de entregas.

Cálculo de dias úteis reusa `src/lib/dias-uteis.ts` (feriados nacionais + CE + Fortaleza + móveis). A função SQL `fn_adicionar_dias_uteis` NÃO considera feriados — usar o JS.

---

## 3. Estouro do prazo do sinal (③) — 3 passos

1. O sinal vira **vale VC-** (automático, proporcional ao pago).
2. O sistema **notifica o responsável do estoque**: "esta peça precisa voltar ao estoque".
3. A joia volta ao **saldo disponível** (volta a poder ser vendida) **somente depois** que o estoque **confirma a recolocação física** (aprovação do estoque).

Um **robô diário** checa os vencimentos (mesmo padrão do aging-cron já existente).

---

## 4. Alertas — SEMPRE NA TELA

**Regra transversal (Jonathan 19/06): toda notificação aparece NA TELA** (faixa/banner visível que some com um "ok"), **nunca só no sino** — as consultoras não olham o sino.

- **③** 2-3 dias antes do prazo → consultora: "esta venda vai virar crédito" (todas as vendas com prazo).
- **②** no vencimento de cada parcela → lembrete para a consultora + **mensagem pronta de cobrança** (WhatsApp, 1 clique pra enviar; automático 100% = fase 2 configurável).
- **②** inadimplência a cada **15 dias** → faixa que some com "ok"; passou de **1 mês e meio** → avisa também o dono.
- **④** a cada **20-30 dias** → lembrar a consultora de chamar o cliente para retirar (não é cobrança, já pagou).

---

## 5. Comissão (NÃO mexer no cálculo)

Já está correta e é **regime de caixa**: a comissão é proporcional ao valor **pago no mês** (`comissoes/elegiveis` filtra `data_confirmacao` e rateia `comissao × pago/total`). "A Receber" e "Vale-Troca" não comissionam (`forma NOT IN (...)`).
- **Estorno = MANUAL** (decisão do Jonathan: mais seguro), via ajuste em `fechamento_comissao_itens` (`tipo_item='estorno'`).
- **Melhoria:** no relatório de comissões, mostrar o **motivo do desconto** + o **número da venda clicável** (abre a venda).

---

## 6. Quem registra e como

- **A consultora** registra o pagamento (todas as formas permitidas) e **acompanha seus próprios pendentes**.
- Segue o **fluxo de pagamento atual da venda**: dinheiro entra no cofre com o número da venda + nome da consultora; ela se responsabiliza na conferência.

---

## 7. Aprovações (reuso de Config › Aprovadores)

Três aprovações, todas no padrão de aprovador configurável já existente:
- **Entrega sem pagamento total** (②) → aprovação do dono.
- **Esticar o prazo do sinal** (③) → aprovação do dono.
- **Devolver a joia ao estoque** após estouro (③) → aprovação do estoque.

---

## 8. Vale de inadimplência (VC-)

Reusa `gerarValeTroca` (aceita `devolucao_id` nulo), com:
- **Prefixo VC-** (diferencia do VT- de devolução).
- **Origem rastreável**: veio de "venda não paga no prazo" (número da venda, data da conversão).
- Proporcional ao pago. **Sem validade** por enquanto (campo preparado para o futuro).

---

## 9. Infra existente reusada (NÃO duplicar)

- Dias úteis/feriados: `src/lib/dias-uteis.ts`, `src/lib/prazo-devolucao.ts`.
- Vale-troca: `gerarValeTroca`, `aplicarValeTroca`, `reverterAplicacaoVale`.
- Reserva de estoque: `reservas_estoque_comercial` (ativo/efetivado/cancelado).
- Protocolo de volta: `protocolos` + `fn_concluir_protocolo`.
- Notificações + push + WhatsApp (Evolution API); faixa/comentários: `ComentariosOrdem.tsx`.
- Aprovadores configuráveis: Config › Aprovadores.
