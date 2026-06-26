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
- **Diferença para ③:** aqui a peça **SAIU da loja** (entregue), por isso é sempre cobrança — **nunca vira VC**. Se a peça **não saiu** (reservada), cai em ③ (vira VC no estouro).

### ③ A Receber com peça reservada (não entregue)
> **REGRA NOVA — desenho aprovado 20/06/2026.** Substitui a antiga "Sinal pra segurar". A aba **"Sinal" foi removida**: o que decide **VC × cobrança é SE A PEÇA SAIU DA LOJA**, não uma opção que o usuário escolhe.

Cliente fica devendo um saldo **"A Receber"** e **NÃO leva a peça** (fica reservada, não vende duas vezes). A reserva tem prazo:
- O relógio dos **7 dias corridos** só **começa** quando a **data de entrega da venda passou** **E** **não há ordem (fabricação/serviço) aberta** ligada à venda.
  - Ainda há ordem aberta → **espera a ordem fechar**; conta os 7 dias **a partir do fechamento da ordem** (peça pronta na loja).
- Ao começar: **notifica a consultora** ("o cliente tem 7 dias pra finalizar o pagamento").
- **Faltando 3 dias:** avisa **todo dia** até o fim. No último dia: *"amanhã esse pedido vira VC se o pagamento não for constatado"*.
- **Não quitou 100% no prazo** (pagamento **parcial NÃO para nem reinicia** o relógio — só finalizar 100%) → o que pagou vira **vale VC-** (proporcional) + a venda expira + a joia **volta ao estoque** (ver §3).
- **Parcelou (Mensal/Em X dias) mas não levou:** enquanto a peça está reservada vale a regra dos 7 dias acima; o **parcelamento só "ativa" quando a peça é entregue** (aí vira ②, cobrança).
- **Corte:** esta regra vale **só para vendas criadas a partir do deploy na main**. Vendas anteriores seguem a regra antiga (motor `sinal`/`sinal-cron`, legado).

> ❌ ~~REGRA VELHA (descontinuada): "Sinal pra segurar — paga entrada, peça reservada, **7 dias úteis** a partir do sinal."~~ Foi mal entendida; não usar mais.

### ④ Pagou e não buscou
Cliente **pagou tudo** mas não veio retirar. **A joia é dele** — fica reservada para ele **sem prazo**, independente dos dias. **NÃO vira vale, NÃO volta ao estoque.** Único tratamento: a cada ~20-30 dias (a definir), um lembrete para a consultora chamar o cliente para retirar.
> Corrige/derruba a antiga "Task 10" do backlog (que dizia virar vale após 7 dias).

---

## 2. Quando o relógio dos 7 dias começa (③ — peça reservada)

> **Regra nova (20/06).** Base = **data de entrega da venda** + **ordens abertas**. (Antes era "a partir do sinal/protocolo, em dias úteis" — descontinuado.)

1. A venda tem **A Receber** pendente e a peça **não foi entregue** (reservada).
2. **A data de entrega já passou?** Não → não conta (espera a data chegar).
3. **Tem ordem (fabricação/serviço) aberta na venda?** Sim → espera a ordem fechar; o relógio conta a partir do **fechamento da ordem** (peça pronta). Não → começa agora.
4. São **7 dias corridos** (NÃO úteis) a partir desse início.

A checagem roda no **robô diário** (novo motor de reserva; o `sinal-cron` vira legado, só p/ vendas antigas).

> ⚠️ Esta regra usa **dias corridos**. O `src/lib/dias-uteis.ts` (feriados CE/nacional) continua valendo para OUTROS cálculos do sistema, mas **não** para o prazo de ③.

---

## 3. Estouro do prazo da reserva (③) — 3 passos

(Quando passam os **7 dias corridos** sem o pagamento **TOTAL** ser constatado.)
1. O que foi pago vira **vale VC-** (automático, proporcional ao pago).
2. O sistema **notifica o responsável do estoque**: "esta peça precisa voltar ao estoque".
3. A joia volta ao **saldo disponível** (volta a poder ser vendida) **somente depois** que o estoque **confirma a recolocação física** (aprovação do estoque).

Um **robô diário** checa os prazos (novo motor de reserva; mesmo padrão do aging-cron).

> ✅ **IMPLEMENTADO (v2.72.0, homolog — migration 328 + status novo `virou_credito`):** no estouro o `reserva-cron` gera o VC-, cancela as contas a receber pendentes e marca a venda como **`virou_credito`** (status terminal, NÃO `cancelado`) — assim a peça **fica segurada** (a reserva continua ativa, não devolve sozinha) e a **comissão do que foi pago é preservada** (o pagamento fica `confirmado`; o status entra nas listas de comissão via `SITUACOES_VENDA_ATIVAS`). O passo 3 (peça volta ao saldo) é a **aprovação do estoque**: `POST /api/crediario/reserva/[vendaId]/devolver-peca` cancela a reserva ativa (não mexe na venda/pagamento/VC). Faturamento: a venda `virou_credito` conta na dashboard **só o valor pago** (vw_dash_vendas_todas, mig 328). Ver `docs/plano-status-virou-credito.md`.

---

## 4. Alertas — SEMPRE NA TELA

**Regra transversal (Jonathan 19/06): toda notificação aparece NA TELA** (faixa/banner visível que some com um "ok"), **nunca só no sino** — as consultoras não olham o sino.

- **③** 2-3 dias antes do prazo → consultora: "esta venda vai virar crédito" (todas as vendas com prazo).
  - **Implementado (v2.71.0): faixa global `ReservaAlarme`** (montada no `DashboardShell`, aparece em qualquer tela da consultora dona da venda). Busca ao vivo `GET /api/crediario/reserva-alertas` (recalcula a janela dos 7 dias por consultora — NÃO depende da cron). Âmbar = vencendo; vermelho + bip = último dia ("amanhã vira VC"). Some com "ok" por hoje (localStorage por data) e volta no dia seguinte. Chip da venda abre o drawer do crediário (`/crediario?venda=<id>`).
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

**Onde o plano (parcelamento/sinal) é escolhido:** ao selecionar a forma **"A Receber"**, o painel "Pagamento a prazo (crediário)" (Mensal / Em X dias / Sinal) aparece em DOIS lugares — no **wizard de Nova Venda** (passos Pagamento e Revisão) e na **tela de detalhe da venda enquanto ela é rascunho**. Componente único: `src/components/vendas/PainelCrediario.tsx`; preview em `src/lib/credi-preview.ts` (espelha o gatilho). O plano vai gravado em `pagamentos_venda.credi_tipo`/`credi_param` (o detalhe usa `POST /api/vendas/[id]/pagamentos`); o gatilho `fn_venda_gerar_conta_receber` lê na aprovação. Venda **já aprovada** não mostra o painel — baixa só pela porta única do Crediário.

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
