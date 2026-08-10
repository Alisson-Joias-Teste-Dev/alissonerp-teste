# HANDOFF — Testar as telas do sistema contra a cópia de teste (pós Fase 3.6 + 5 + 4)

> **Para a nova sessão:** leia este arquivo inteiro antes de começar. O Alisson já autorizou este
> trabalho ("vamos fazer isso em uma janela nova") — não precisa perguntar de novo pra começar a
> clicar nas telas. Pode fazer sem medo: é tudo cópia de teste, se quebrar não tem problema.

## Contexto

As Fases 3.6 (`real`→`numeric`), 5 (texto livre→lista fechada nos 42 campos de status) e 4 (9 telas
de organização das 4 tabelas gigantes) estão **100% concluídas e testadas por SQL** na cópia de teste
(`erp_teste`, Postgres 17 dentro do WSL2 Ubuntu, porta 5433). Zero view quebrada, zero bug de tipo
sobrando — os 3 valores "escondidos" que apareceram foram achados e corrigidos (ver
`docs/migracao/LIVRO-DE-REGRAS-migracao-erp-novo.md` §10.11, §10.13, §10.14).

**O que falta:** testar clicando nas telas de verdade do sistema (não só consulta SQL), rodando o
Next.js local apontado pra cópia de teste. Já testei 1 tela (Auditoria) como prova de conceito — bateu
tudo certo. Faltam as outras ~20 áreas.

## Como ligar o sistema apontado pra cópia de teste

O `.env.local` do projeto **já está configurado** pra cópia de teste (deixei assim de propósito, pra
essa sessão continuar direto):
```
DATABASE_URL=postgresql://postgres:<senha-local>@localhost:5433/erp_teste
NEXT_PUBLIC_AMBIENTE=teste
```
(usuário `postgres` do Postgres do WSL teve senha local descartável setada só pra esse teste local — não
é senha de nada real). O resto do `.env.local` (Supabase Auth, Storage, Tiny, Mercado Pago) continua
apontando pra produção — login funciona normal, mas os dados do ERP (pedidos, status, pesos) vêm da
cópia de teste.

**Cuidado com o arquivo `.claude/launch.json`**: é compartilhado entre sessões. Se outra sessão de
Claude Code estiver rodando o servidor na porta 3000, `next dev` recusa subir uma segunda cópia (trava
de lock da pasta `.next`). Já criei uma configuração separada pra isso:
```json
{
  "name": "alissonerp-teste",
  "runtimeExecutable": "npx",
  "runtimeArgs": ["next", "dev", "--hostname", "0.0.0.0", "--port", "3010"],
  "port": 3010,
  "autoPort": false
}
```
Use `preview_start` com `name: "alissonerp-teste"` (porta 3010, não a 3000 de sempre). Se mesmo assim
der erro de lock, pergunte ao Alisson antes de derrubar processo de outra sessão (da última vez ele
autorizou, mas confirme de novo).

## O que testar em cada tela (checklist)

Pra cada área, abrir a tela, conferir que carrega sem erro, que o campo de status/situação aparece
como lista fechada (dropdown), e — se der pra testar sem problema — trocar o status de um registro e
ver se grava. São cópias de teste, então pode gravar à vontade.

- [ ] Distribuição (`distribuicoes`, `apontamentos_distribuicao`, `fechamentos_distribuicao`, `itens_distribuicao`)
- [ ] Compras — fábrica (`compras`, `itens_compra`)
- [ ] Compras Comercial (`compras_comercial`)
- [ ] Compras de Metal (`compras_metal`, aprovações, pagamentos)
- [ ] Vendas (`vendas_erp`, `pagamentos_venda`)
- [ ] Tarefas (`tarefas`, `aprovacoes_tarefa`)
- [ ] Joias RFID (`joias_rfid`)
- [ ] Purificação / Ligação (`purificacoes`, `ligacoes`)
- [ ] Limpeza de Ouro (`limpezas_ouro`)
- [ ] Cofre de Ouro (`cofre_ouro_baixas`, `recebimentos_metal`, `creditos_cliente`)
- [ ] Orçamentos (`orcamentos`)
- [ ] Devolução / Vale-troca / Reembolso (`devolucoes_venda`, `vale_troca`, `reembolsos`)
- [ ] Financeiro (`contas_pagar`, `contas_receber`)
- [ ] Comissão (`fechamentos_comissao`, `fechamento_comissao_itens`)
- [ ] Frete / Motoboy (`fechamentos_frete`, `relatorios_pagamento_motoboy`)
- [ ] Estoque Comercial (`movimentacoes_estoque_comercial`, `reservas_estoque_comercial`, `transferencias_estoque_comercial`, `inventarios_comercial`)
- [ ] Solicitações (`solicitacoes_alteracao`, `solicitacoes_desconto`, `solicitacoes_peca`)
- [ ] Auditoria de Estoque (`auditorias_estoque`, `auditorias_estoque_itens`)
- [ ] Sync Tiny (`fila_sync_externo`, `tiny_sync_produtos`)
- [ ] Exceção de pagamento na entrega (`vendas_entrega_excecoes_pagamento`)
- [ ] Markup (`markup_alteracoes`)
- [ ] Serviços (`servicos`)

Já testado com sucesso: **Auditoria** (status "Aprovada" apareceu certo, peso preciso, rotina protegida
`fn_processar_auditoria` rodou e deixou o parecer "Aprovação automática — trigger").

## Pendências gerais (fora do escopo de "testar telas", mas relevantes)

1. Em produção, 6 tabelas ainda usam o nome antigo `situacao` (não `status`) — a troca de nome
   (§10.6) precisa ir ANTES das mudanças de tipo/enum, quando isso for pra produção.
2. 8 rotinas protegidas (zona intocável) aguardando aval do Jonathan antes de produção.
3. Nada foi aplicado em produção ainda — tudo validado só na cópia + 1 checagem read-only contra
   produção (§10.14).
4. Duas perguntas antigas sem resposta: significado de `erp_produtos.tipo` ('S'/'V'/'K'); confirmar
   valor de `comentarios_ordens_ativo`.
5. **Antes de qualquer trabalho real em produção, reverter o `.env.local`** pra apontar pra produção
   de novo (`DATABASE_URL` de volta pra `72.60.55.140:5543`, `NEXT_PUBLIC_AMBIENTE=producao`) — hoje
   está de propósito na cópia de teste.
6. Item de segurança à parte (sem relação com a refatoração): a senha antiga de produção continua no
   histórico do Git de `scripts/switch-to-producao.sh` — ver
   `docs/seguranca/ALERTA-credenciais-expostas-2026-08-07.md`. Só tratar se o Alisson pedir.

## Referência completa

Tudo documentado em `docs/migracao/LIVRO-DE-REGRAS-migracao-erp-novo.md`, seção 10 (10.11 a 10.14).
