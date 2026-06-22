# Regras de negócio — Compras Comercial

> Compra de **mercadoria pronta para revenda na loja** (joias acabadas e pedras soltas).
> NÃO confundir com `metal/compras` (compra de ouro/insumo) nem com `compras` (insumo de produção).
> Tela: `src/components/ComprasComercialClient.tsx` · API: `src/app/api/compras-comercial/` ·
> Banco: migrations **272, 273, 274, 331**.

## Fluxo (status no banco)

```
CHEGADA → CADASTRO DAS PEÇAS → CONFERÊNCIA → CONCLUSÃO
recebido_pendente_cadastro → (itens) → [peso bate?] → concluido
                                          │ não bate (> tolerância)
                                          ▼
                              aguardando_aprovacao → aprovado → concluido
```

- **`recebido_pendente_cadastro`** (etapa 1 — chegada): a mercadoria chegou. Registra-se o **lote**
  (qtd de peças, peso total em g, valor total) + **2 fotos** (balança e peças). É a **primeira etapa**
  do módulo — quem abre o compras comercial entra por aqui.
- **`aguardando_aprovacao` / `aprovado` / `rejeitado`**: trilha de aprovação (migration 274). Usada
  quando o peso cadastrado diverge do lote além da tolerância (ver Conferência).
- **`concluido`**: ponto sem volta — entra no estoque comercial e (se ainda não houver) gera contas a pagar.
- `rascunho` / `recebida`: estados legados do fluxo anterior; ainda aceitos para concluir.

## Etapa 1 — Chegada (migration 331)

Ao registrar a chegada (`POST /api/compras-comercial`):
1. Calcula o **valor da grama** = `valor_total_lote / peso_total_g` (ex: R$ 30.000 / 10 g = **R$ 3.000/g**).
2. Sobe as 2 fotos no bucket **privado** `compras-comercial-fotos` (`<id>/balanca.jpg`, `<id>/pecas.jpg`).
3. Roda a **IA na foto da balança** (`validarPesoBalanca`, reuso do módulo metal) comparando o peso lido
   no visor com o `peso_total_g` informado. É **advisory**: registra `ia_match`/`ia_peso_balanca` e avisa,
   mas **não bloqueia** a chegada. A conferência que trava é a do peso na conclusão (abaixo).
4. Nasce em `recebido_pendente_cadastro`.
5. **Conta a pagar gerada JÁ na chegada** a partir do `valor_total_lote` (trigger AFTER INSERT
   `fn_gerar_conta_pagar_chegada_comercial`), parcelada por `qtd_parcelas` a partir de `primeiro_vencimento`.
   A geração na conclusão (`fn_gerar_conta_pagar_compra_comercial`) continua existindo mas vira no-op
   ("só gera se ainda não existir conta") — **não duplica**.

### Saldo de lote pendente
View `vw_saldo_lote_pendente_comercial`: por local, `Σ peso_total_g − Σ peso já cadastrado em itens`,
enquanto a compra está em `recebido_pendente_cadastro`. É o **metal a cadastrar na loja**. Derivado da
própria compra (não duplica estoque); some conforme as peças são cadastradas e zera na conclusão.

## Etapa 2 — Cadastro das peças (rateio por peso)

Reusa a tela/rota de itens existente. **Decisão Jonathan:** cada peça (joia) herda o **custo pela grama
do lote** — `valor_grama` da peça é pré-preenchido com o `valor_grama` do lote (R$ 3.000/g) e
`valor_total = peso_total × valor_grama`. O operador pode ajustar. Pedra solta usa custo total próprio
(ver `compras-pedras.ts`) e ignora a grama do lote.

## Etapa 3 — Conferência + Conclusão

Ao concluir (`PATCH /api/compras-comercial/[id]/concluir`):
- Compara **Σ peso das peças cadastradas** com o `peso_total_g` do lote.
- **Bate** (diferença ≤ `tolerancia_lote_peso_g`, config, default **0,30 g**): conclui direto.
- **Não bate** (diferença de balança maior): **bloqueia a conclusão e pede aprovação**
  (`needs_approval`). O operador clica "Solicitar aprovação"; depois de `aprovado`, a conclusão é liberada
  (o trigger `fn_bloquear_compra_comercial` permite a transição `aprovado → concluido`).
- Na conclusão, o trigger `fn_concluir_compra_comercial` lança a entrada no
  `movimentacoes_estoque_comercial` (tipo `entrada`, motivo `compra_comercial`) por peça, no local da compra.

## Tabelas / colunas-chave

- `compras_comercial`: `situacao`, `total_pecas`, `peso_total_g`, `valor_total_lote`, `valor_grama`,
  `foto_balanca_path`, `foto_pecas_path`, `ia_peso_balanca`, `ia_match`, `ia_confianca`, `ia_mensagem`,
  `qtd_parcelas`, `primeiro_vencimento`, `local_estoque_id`, `bloqueado`.
- `itens_compra_comercial`: `produto_id`, `qtd`, `peso_total`, `valor_grama`, `valor_total`.
- `contas_pagar.compra_comercial_id`: rastreia as parcelas geradas.
- Config `tolerancia_lote_peso_g` (gramas): tolerância de "diferença de balança".

## Gotchas

- A conta a pagar reflete o **valor do lote (acordado)**, não a soma dos itens. Se a conferência aprovar
  uma divergência, `total` (Σ itens, recalculado na conclusão) pode diferir do `valor_total_lote`.
- Bucket `compras-comercial-fotos` é **privado** — registrado em `isPrivateBucket` (storage-url.ts) e no
  proxy `api/storage/[bucket]/[...path]`. Fotos exibidas via `/api/storage/compras-comercial-fotos/<path>`.
- A foto da balança usa o componente `metal/FotoBalancaInput` (já faz a chamada à IA).
