# Crediário — resumo do que foi feito (19/06/2026, à noite)
> Resumo em linguagem simples pra validar e assinar. Detalhe técnico em docs/regras-negocio/crediario.md.

## Em uma frase
Consertei a RAIZ do problema "não conseguem dar baixa": agora a conta a receber
**nasce quando a venda é aprovada** (antes só nascia na entrega) e a baixa do
"A Receber" passou a ter **um lugar só** — a tela do Crediário.

## O que estava quebrado (relembrando)
Existiam DUAS portas pra baixar um "A Receber": a tela da venda (PDV) e o
Crediário. E a conta a receber só nascia na ENTREGA. Resultado: quando alguém
baixava pela venda antes da entrega, o pagamento era confirmado mas a conta a
receber nunca era criada — o recebimento "sumia" do Crediário (recebimento
fantasma). Em produção isso virou R$ 337 mil vencido e 70 contas "soltas".

## O que eu fiz — FASE 1 (a fundação)
1. **Conta a receber nasce na aprovação** (migration 316). Quando o gerente
   aprova uma venda a prazo, a conta a receber já é criada na hora, com o valor
   que falta receber. Não espera mais a entrega.
2. **Porta única** (endpoint da venda). A tela da venda parou de baixar
   "A Receber" — agora ela avisa "isso é feito no Crediário". A baixa acontece
   só num lugar. Acabou a porta dupla.

## Como testei (provas, tudo no banco de HOMOLOG)
- Aprovei uma venda a prazo (nº 15449, R$ 3.064 a receber) → a conta a receber
  nasceu na hora, certinha. A tela do Crediário subiu de 86 pra 87 contas
  (+R$ 3.064). Funciona de ponta a ponta.
- Tentei baixar "A Receber" pela tela da venda → o sistema bloqueou e mandou ir
  pro Crediário (como deve ser). Nada foi baixado errado.
- Verificação de código (tsc): zero erros.

## Por que PAREI na Fase 1 (sendo honesto)
Ao salvar, descobri que tem **trabalho de outra pessoa ainda não salvo (não
commitado)** no projeto — uma mexida em "tiny-contatos"/"contatos"/aprovação de
venda. Eu **não toquei nisso** (não é meu e pode estar pela metade). Mas esse
trabalho mexe em arquivos que eu PRECISO pra as próximas fases (parcelamento,
sinal). Continuar por cima disso ia bagunçar o trabalho da outra pessoa.
Então preferi entregar a Fase 1 sólida e parar, em vez de empurrar as outras
fases de qualquer jeito e arriscar quebrar.

## O que falta (Fases 2 a 5) — ainda NÃO feitas
- F2: parcelamento (entrada + parcelas com vencimento) + aprovação do dono.
- F3: sinal pra segurar peça (7 dias úteis) + virar vale VC-.
- F4: alertas na tela + cobrança no WhatsApp + lembrete "pagou e não buscou".
- F5: comissão (motivo + venda clicável no relatório) + painel da consultora.

## O que VOCÊ precisa fazer
1. **Validar a Fase 1** (testar aprovar uma venda a prazo e ver no Crediário).
2. **Limpar o trabalho não-salvo da outra pessoa** (salvar/commitar OU descartar)
   — sem isso, eu e as crons ficamos travados pra seguir nas Fases 2 e 3.
3. Depois disso, é só me dar o ok que eu sigo as fases seguintes.

## Commits desta sessão (na branch homolog, NADA foi pra main)
- 19d3543e — conta a receber nasce na aprovação (v2.69.0)
- 1a87e959 — porta única, baixa só pelo crediário (v2.69.1)

## Pendência pequena (não atrapalha o funcionamento)
Esconder o botão de "confirmar A Receber" na tela da venda (hoje ele aparece e
mostra a mensagem de "vá pro Crediário"). É só cosmético.
