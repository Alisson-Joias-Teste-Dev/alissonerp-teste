# Plano técnico — Status `virou_credito` (reserva do crediário → vale-crédito)

> Planejado 21/06/2026 com Jonathan. **APROVAR antes de implementar.** Nada implementado ainda.
> Contexto: redesenho do crediário, situação ③ (peça reservada não retirada). Ver `docs/regras-negocio/crediario.md` §3.

## 1. Problema que resolve

Quando uma reserva (③) estoura os 7 dias corridos, hoje o robô `reserva-cron` gera o VC- mas **deixa a venda `aprovado`** — ela continua aparecendo como "Pagamento pendente" pra sempre. O caminho óbvio (cancelar a venda) tem 2 efeitos ruins:
- **Devolve a peça ao estoque na hora** (gatilho `fn_estoque_comercial_cancelamento_venda`) — mas a regra §3 exige que a peça **fique segurada até a estoquista aprovar fisicamente** (senão "some").
- **Tira a comissão** da consultora sobre o valor JÁ pago (o cálculo exclui `cancelado` e pagamento `estornado`) — injusto, pois o dinheiro entrou no caixa.

**Solução:** um status NOVO e terminal `virou_credito`, distinto de `cancelado`, com efeitos controlados.

## 2. Decisões de negócio (fechadas com Jonathan)

- Estouro 7 dias → venda vai pra **`virou_credito`** (NÃO `cancelado`).
- **Peça fica SEGURADA:** como NÃO cancelamos a venda, a `reservas_estoque_comercial` continua `ativo` automaticamente (a peça não volta ao saldo). Só volta quando a **estoquista aprovar** (endpoint novo, §8).
- **Pagamento do que foi pago fica `confirmado`** (não estorna) → **comissão preservada**.
- **VC-** gerado do valor pago (proporcional). Contas a receber **pendentes canceladas** (acaba cobrança); a parte paga continua `pago`.
- **Comissão do pago é mantida** — `virou_credito` entra nas listas de "situações que comissionam".
- **Cancelar MANUAL fica idêntico.** `virou_credito` é **terminal** e **não-cancelável** pelo fluxo normal.
- **Corte:** só vendas criadas após `crediario_reserva_corte`. Antigas seguem `sinal-cron` (legado).

## 3. Faturamento — DECISÃO FECHADA (Jonathan 21/06) + nuance técnica

**`virou_credito` conta no faturamento APENAS o que foi PAGO em dinheiro** (vale-troca e vale-crédito nunca contam pra faturamento). Comissão: **SIM** (do pago).

⚠️ **NUANCE TÉCNICA (achada na varredura):** a view vigente `vw_dash_vendas_todas` (mig 304) soma faturamento pelo **`total_venda`** (total da venda), não pelos pagamentos. Se a gente só adicionar `virou_credito` na lista, ela contaria o **total** (ex.: R$1.880) em vez do **pago** (ex.: R$1.300) — INFLA. Então pra `virou_credito` o faturamento tem que ser calculado **pela soma dos pagamentos confirmados em formas que faturam** (exclui `Vale-Troca`, `Vale-Credito`/VC, `A Receber`), NÃO pelo `total_venda`.
- **Regra:** `faturamento(virou_credito) = SUM(pagamentos_venda.valor WHERE status='confirmado' AND forma NOT IN ('Vale-Troca','Vale-Credito','A Receber'))`.
- **Implicação na migration da view:** ou (a) a view trata a linha `virou_credito` com o valor pago no lugar de `total_venda`; ou (b) `virou_credito` fica FORA da view padrão e entra por uma parcela separada = pago. Decidir na hora de escrever a migration; o efeito final (contar só o pago) é o que vale.
- **Comissão:** já é por pagamento/regime de caixa (rateia pago/total) e exclui Vale-Troca/A Receber — então só precisa do status nas 6 listas; o valor já sai certo (proporcional ao pago).

## 4. Técnico — `situacao` é VARCHAR (não ENUM)

Não precisa `ALTER TYPE`. A trava de transição está na função `fn_registrar_transicao_venda` (mig 296). Valores atuais: rascunho, aprovado, em_rota, enviado, entregue, concluido, cancelado.

## 5. Mapa de impacto (varredura feita 21/06 — onde o status entra)

### 5.1 Banco — 1 migration nova (CREATE OR REPLACE, assinada em prod)
- **`fn_registrar_transicao_venda`** (mig 296): permitir `aprovado → virou_credito`; marcar `virou_credito` como **terminal** (não sai pra nada, salvo regra de admin a definir).
- **`fn_proteger_itens_venda_fechada`** (mig 296/114): adicionar `virou_credito` (itens imutáveis).
- **View `vw_dash_vendas_todas`** (versão vigente = mig 304): incluir `virou_credito` **SE** contar como faturamento (ver §3). Se NÃO contar, deixar de fora de propósito (e documentar).
- Só a versão VIGENTE de cada função/view importa (as migrations históricas 176/246/290 não precisam ser tocadas).

### 5.2 Comissão — 6 rotas (CRÍTICO: faltar uma = consultora perde comissão)
Criar **1 constante compartilhada** `SITUACOES_VENDA_COMISSIONA` (ex.: em `src/lib/`) e usar nas 6, pra nunca esquecer:
- `api/financeiro/comissoes/elegiveis/route.ts:53`
- `api/financeiro/comissoes/resumo/route.ts:38`
- `api/financeiro/comissoes/fechamentos/route.ts:110`
- `api/financeiro/comissoes/gerar-maio/route.ts:44,101`
- `api/dashboard-comercial/analise-comissoes/route.ts:99,136`
- `api/financeiro/cofre-ouro/upgrades/route.ts:38`

### 5.3 Análises (2 rotas) — incluir se quiser que apareçam
- `api/vendas/analise-frete/route.ts:68`
- `api/vendas/cliente/[id]/historico/route.ts:34`

### 5.4 Front
- `(dashboard)/vendas/VendasClient.tsx`: mapa `SITUACAO` (label "Virou crédito" + cor) + array `TABS` (aba "Virou crédito").
- Varrer outros componentes com badge de situação de venda (grep `SITUACAO`/label de status).

### 5.5 Guardas
- `api/vendas/[id]/cancelar/route.ts`: bloquear cancelar `virou_credito` (terminal).
- `api/vendas/[id]/route.ts:344` (PATCH situacao): NÃO permitir sair de `virou_credito`.

## 6. Mudança no robô `reserva-cron` (ramo do estouro)

Hoje (estouro, diasPassados≥7): gera VC + cancela CRs + deixa `aprovado`.
**Novo (1 transação):**
1. `gerarValeCredito(valor pago)` (já existe).
2. Cancela CRs pendentes da venda (já faz).
3. `UPDATE vendas_erp SET situacao='virou_credito'` (passa pela função de transição).
4. Notifica estoquista ("peça precisa voltar") + consultora ("virou crédito") — já existe.
- **Não** estorna pagamento. **Não** mexe na reserva (peça segue segurada).

## 7. Endpoint da estoquista (devolve a peça) — task #4 do backlog

`POST /api/crediario/reserva/[vendaId]/confirmar-retorno-estoque` (nome a ajustar):
- Aprovação do estoque (reusa Config › Aprovadores, chave `aprovador_devolucao_estoque`).
- Guarda: só venda `virou_credito` com reserva `ativo`.
- Ação: cancela a `reservas_estoque_comercial` ativa da venda → peça volta ao **saldo disponível** (reusar a lógica de cancelamento de reserva, SEM cancelar a venda nem estornar pagamento/VC).
- Registra histórico + notifica consultora.
- A venda **permanece** `virou_credito` (a devolução da peça é evento de estoque, não muda a situação da venda).

## 8. Ordem de implementação (fases) + teste por fase

1. **Banco:** migration (transição + proteção de itens + view conforme §3). Testar com `BEGIN…ROLLBACK` no homolog.
2. **Comissão:** constante + 6 rotas. Testar que uma venda `virou_credito` **conta** comissão do pago.
3. **Robô:** ramo do estouro → `virou_credito`. Testar no front: venda vira `virou_credito`, comissão conta, peça segue reservada, CRs canceladas, VC gerado.
4. **Front:** badge + aba.
5. **Endpoint estoquista:** devolve a peça. Testar: peça volta ao saldo só após aprovar; venda continua `virou_credito`.
- Cada fase: `tsc` zero, teste no front (Germana/homolog), commit seletivo homolog. Migration assinada em prod no deploy.

## 9. Riscos / blindagem (o chefe revisa adversarial)
- **Completude:** a constante compartilhada de comissão evita esquecer um dos 6 lugares (bug silencioso = consultora perde comissão).
- **Faturamento:** decisão §3 fechada ANTES da migration da view.
- **Vendas antigas:** o corte (`crediario_reserva_corte`) protege — só vendas novas entram.
- **Transição:** testar que `virou_credito` é terminal (não dá pra reaprovar/entregar/cancelar por engano).
- **Peça "sumida":** garantir que a reserva fica `ativo` até a estoquista aprovar (sem isso a peça some do saldo sem voltar fisicamente, ou volta cedo demais).
