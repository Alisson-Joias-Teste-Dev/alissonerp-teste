# Deploy do Crediário em Produção — checklist (21/06/2026)

> Conferido contra a PROD (read-only) em 21/06. Foco no BANCO (migrations); o código o Easypanel puxa do GitHub (branch main).

## ⚠️ 0. DECISÃO DE ESCOPO (antes de tudo)

A branch `homolog` tem o crediário **misturado com o trabalho de produtos/estoque**. Mergear `homolog→main` leva **TUDO**. As migrations que faltam na prod (homolog não-main) são **316–328**, divididas em:

| Crediário (este módulo) | Produtos/Estoque (outro trabalho) |
|---|---|
| 316, 317, 318, 324, 327, 328 | 319, 320, 321, 322, 323, 325, 326 |

- As migrations do crediário **NÃO dependem** das de produtos (são independentes).
- **MAS** o merge `homolog→main` traz o **código** dos dois. Se subir o código de produtos sem as migrations 319–326, o código de produtos quebra na prod.
- **Decidir:** (a) deploy de tudo (se o lote produtos está testado/pronto), ou (b) separar (cherry-pick só crediário — mais trabalhoso).

## ✅ 1. Já está na PROD (pré-requisitos OK — conferido)
- `296/297` (máquina de transição com payload) ✅ — a 328 se baseia nela.
- `304` (view dedup por public_venda_id) ✅ — a 328 se baseia nela.
- Tabela `vendas_entrega_excecoes_pagamento` ✅ e config `aprovador_entrega_sem_pagamento` = Alisson ✅ → **task 4 (entregar devendo) vai só com CÓDIGO, sem migration nova.**

## 2. Migrations a APLICAR na prod (ordem numérica, cada uma ASSINADA)

Aplicar **em ordem**, cada uma precedida de `SELECT alissonerp.assinar_mudanca_banco(...)` + `PGAPPNAME=claude-code-jonathan` (regra do projeto; sem assinatura = "não foi o Jonathan"):

| # | Migration | Módulo | O que faz |
|---|---|---|---|
| 1 | 316_cr_nasce_na_aprovacao | **Credi** | CR nasce na aprovação (altera `fn_venda_gerar_conta_receber`) |
| 2 | 317_crediario_parcelamento | **Credi** | colunas `pagamentos_venda.credi_tipo/credi_param` + motor das parcelas |
| 3 | 318_crediario_sinal | **Credi** | `credi_vencimento` + `vale_troca.origem/origem_venda_id` + motor sinal (LEGADO) |
| 4 | 319_fix_prevent_negative_sle | Estoque | trava de estoque negativo lê da view |
| 5 | 320_erp_produtos_expand_columns | Produtos | colunas novas em `erp_produtos` |
| 6 | 321_erp_produtos_migrar_dados_public | Produtos | **migra DADOS** (cuidado: DML, conferir antes) |
| 7 | 322_erp_produtos_triggers | Produtos | triggers do erp_produtos |
| 8 | 323_erp_produtos_fks | Produtos | FKs do erp_produtos |
| 9 | 324_crediario_whatsapp_celular | **Credi** | cobrança usa o celular do cliente |
| 10 | 325_sync_erp_to_public_expand | Produtos | sync erp→public |
| 11 | 326_fix_vw_pedras_preco_virgula_decimal | Produtos | view de preço de pedra tolera vírgula |
| 12 | 327_crediario_reserva_corte | **Credi** | semeia config `crediario_reserva_corte` (= data da aplicação na prod) |
| 13 | 328_status_virou_credito | **Credi** | `fn_registrar_transicao_venda` (+virou_credito, base 297), `fn_proteger_itens`, recria `vw_dash_vendas_todas` (base 304) |

**Ordem geral do deploy:** (1) aplicar as migrations na prod (assinadas) → (2) merge `homolog→main` → (3) Easypanel "Implantar" → (4) configurar. **Migrations ANTES do código** (o código novo usa colunas/funções novas).

## 3. Configuração pós-deploy (NÃO é migration — fazer na mão)
- [ ] **Config › Aprovadores › "Devolução de peça — venda virou crédito"** (item MULTI novo): selecionar quem aprova. Se ficar vazio, cai no fallback por cargo de estoque.
- [ ] Conferir `aprovador_entrega_sem_pagamento` (já = Alisson na prod ✅).
- [ ] **Corte:** a 327 semeia `crediario_reserva_corte` = **data em que rodar na prod**. Só vendas criadas a partir daí entram na regra ③/virou_credito. Conferir se é a data desejada.
- [ ] **Agendar os crons diários no Easypanel** (curl com header `x-cron-secret=$CREDIARIO_CRON_SECRET`): `reserva-cron` (③ → VC), `aging-cron` (parcelas/cobrança), `sinal-cron` (legado). **Garantir a env `CREDIARIO_CRON_SECRET` na prod.**

## 4. Verificação pós-deploy
- [ ] Rodar o diagnóstico read-only (mesmo `prod_check.sql`) → tudo `t`.
- [ ] `tsc` na main = zero (já está).
- [ ] Testar 1 fluxo real: criar venda com A Receber → aprovar → ver CR no crediário; abrir a venda → botão "Solicitar aprovação para entregar devendo".

## 5. Cuidados / fora do deploy de código
- **Dados legados** (R$ 337k vencido / ~70 contas "soltas" da raiz do bug): **limpeza à parte, com o Jonathan** — NÃO é parte deste deploy.
- 316 muda comportamento: a partir dela, prod cria CR na aprovação. 327/328 ligam a regra ③/virou_credito (só p/ vendas após o corte).
- A migration 321 é **DML (migra dados)** — revisar o conteúdo antes de assinar/rodar.
