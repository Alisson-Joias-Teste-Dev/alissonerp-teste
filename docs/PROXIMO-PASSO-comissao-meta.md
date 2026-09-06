# Comissão x meta — estado da implementação (05/09/2026)

## O que já está feito (v1, no working tree, NADA commitado nem aplicado no banco)

- `supabase/migrations/376_comissao_fator_meta.sql` — **NÃO EXECUTADA**. Cria
  `comissao_resultado_mensal`, as colunas `comissao_bruta`/`fator_meta`/`motivo_fator` em
  `fechamento_comissao_itens` e o parâmetro `COMISSAO_VENDEDORES_EXCLUIDOS = [134]`.
- `src/lib/comissao-fator.ts` — ponto único do fator (vigência, congelamento, excluídos).
- Fator aplicado em: `comissao-extrato.ts` (linhas previstas, saldo anterior, previsão de
  crediário), `fechamentos`, `elegiveis`, `resumo`, `comissao-lancamentos` (devolução).
- `fechamentos/[id]/fechar` congela o resultado do mês.
- `ajustes` bloqueia bônus (natureza `bonus` x `acerto`) para quem fechou abaixo de 100%.
- Front: cartão da meta + descritivo no extrato, % da meta na lista, natureza no lançamento.
- Docs: `comercial.md` §2.2, `CLAUDE.md` (pitfall), `CHANGELOG.md`.
- `npx tsc --noEmit` limpo.

## Ordem para subir

1. Jonathan aprova → aplicar a migration 376 em produção (`scripts/aplicar-migracao-prod.sh`).
   **Sem ela o código quebra**: as colunas e a tabela não existem.
2. Cadastrar as **metas de setembro/2026** (`metas_vendedoras`) — hoje NÃO existem; sem meta o
   fator é 1 e a regra nova não vale.
3. Rodar `docs/seguranca/PENDENTE-comissao-devolucoes-agosto-fator-2026-09-05.sql` (acerto dos
   3 débitos de devolução da Débora, R$ 53,71).
4. Testar na tela → só então commit/push homolog → main com autorização separada.

## Depois (v2)

- Data de **aprovação** da venda como competência (hoje é `data_venda` = data do rascunho).
- Levar toda a regra do §2.2 para o v2 já nascida certa.
