# HANDOFF — retomar na Etapa 5 (Purificação) em janela nova

> **Para a nova sessão:** leia este arquivo inteiro antes de fazer qualquer coisa. O Alisson já
> aprovou e acompanhou todo o trabalho descrito aqui — não precisa reexplicar nem pedir autorização
> de novo pra continuar exatamente esta etapa. Ele só abriu uma janela nova pra continuar (não é
> troca de assunto).

## Onde estamos

Isto é a continuação de uma sessão de "pente-fino no front" (limpeza de código morto + duplicado),
espelhando o pente-fino já feito no banco. **Etapas 1 a 4 do plano de consolidação estão prontas,
testadas e publicadas na branch `homolog`** (commits v2.85.0 a v2.85.8). Nada foi pra `main`/produção.

**Leia primeiro, nesta ordem:**
1. `docs/migracao/PLANO-consolidacao-duplicacoes-vivas.md` — o plano inteiro, com as regras do jogo
   (seção "Regras do jogo", vale pra TODAS as etapas) e o histórico das etapas 1-4 já feitas.
2. `docs/migracao/PENTE-FINO-FRONT-2026-08-10.md` — o raio-X original que gerou este plano (seção 5).

## As regras do jogo (resumo — o plano tem o detalhe completo)

1. **Só extração pura.** Comportamento IGUAL, sempre. Tirar a cópia, apontar todo mundo pro lugar
   único — nada além disso.
2. **"Parecido" não é "igual".** `diff` real ANTES de unificar qualquer coisa. Nas etapas 3 e 4 essa
   regra salvou de um bug real duas vezes: coisas que pareciam idênticas por fora escondiam regra de
   negócio diferente por dentro (ex.: mesmo número de tipo significando coisas diferentes em duas
   telas). Se achar isso aqui também, **PARE e avise o Alisson** antes de codificar — em linguagem
   simples, sem jargão.
3. **Um commit por etapa** na `homolog`, cada um capaz de ser desfeito sozinho.
4. **Validação de cada etapa:** `npx tsc --noEmit` zero erros → `npx vitest run` sem falha NOVA (o
   baseline atual é **613 passaram / 80 falharam / 1 pulado** — são falhas pré-existentes de
   webhooks/Mercado Pago, sem relação com este trabalho) → abrir a tela de verdade no servidor local
   contra o banco de teste e clicar no fluxo → medir a duplicação nesses arquivos de novo (deve cair).
5. Toda função extraída ganha comentário de regra de negócio em PT (o quê / por quê / impacto).

## O que é a Etapa 5

**Purificação** — `LigacaoTab.tsx` (1.235 linhas) × `PurificacaoClient.tsx` (1.240 linhas), ambos em
`src/app/(dashboard)/purificacao/`. O raio-X original mediu **457 linhas idênticas** entre os dois —
o maior cluster de duplicação *dentro de um módulo só* encontrado no pente-fino. Existe também
`LimpezaTab.tsx` (763 linhas) no mesmo módulo — vale espiar se ele participa da mesma duplicação ou
é uma terceira coisa separada.

**Ainda não foi lido o conteúdo desses arquivos nesta sessão** — a etapa 5 começa do zero, exatamente
como as etapas 3 e 4 começaram: ler os 2-3 arquivos inteiros primeiro, rodar `diff` de verdade nos
trechos que parecem iguais, só DEPOIS decidir o que extrair. Não presumir que basta juntar tudo num
componente só — pode ser (como na etapa 3b) ou pode ser só um pedaço pequeno de verdade igual (como
nas etapas 3a e 4). Descobrir primeiro, decidir depois.

## Ambiente

- Branch: `homolog`. Último commit: `c462a4e0` (docs: marca etapa 4 concluída). `git status` limpo,
  nada pendente pra salvar.
- Banco de teste local pra abrir telas de verdade: `.env.local` já aponta pra `erp_teste`
  (`localhost:5433`, WSL2). Servidor: `preview_start` com `name: "alissonerp-teste"` (porta 3010).
- Usuário logado no navegador de teste: Robson (`gerente_fabrica`) — já tem acesso a `/purificacao`
  direto pelo `ROLE_MENUS`, sem precisar liberar nada extra desta vez.
- **Nunca digitar senha em tela de login** (regra de segurança fixa) — se precisar de outro usuário
  de teste, os já criados em `erp_teste` estão documentados na memória (`admin.teste@alisson.local`,
  `consultora.teste@alisson.local`, `gerente-loja.teste@alisson.local`, senha `Teste@123` — mas
  **eu não posso logar com eles**, só o Alisson pode digitar a senha).

## Depois da Etapa 5

O plano continua com: 6a (reviver testes de pagamento, pré-requisito), 6b (Pagamentos — cartão/PIX,
alto risco por mexer com dinheiro), 7 (Compras × Compras-Comercial, precisa decisão de negócio antes).
Tudo detalhado no plano.
