# Regras de Negócio — Mapa dos Módulos

> **Para a IA (e quem mais mexer no sistema):** este é o **roteador** das regras de negócio.
> Antes de mexer em QUALQUER módulo, **leia o arquivo dele aqui**. Estes docs são **mantidos à mão** (≠ `docs/schema/*`, que é auto-gerado): são o **PORQUÊ e o COMO** do negócio.

## Protocolo (regra de ferro)

1. Vou mexer num módulo → **leio `docs/regras-negocio/<modulo>.md` primeiro**.
2. **Se o módulo NÃO tem regra documentada ainda → PARO.** Peço as regras ao Jonathan, gravo aqui, e **só então** implemento.
3. Regra nova → **acrescento**. Regra mudou → **corrijo** (no mesmo momento da mudança de código).
4. Nunca implementar num módulo sem a regra dele estar documentada e confirmada.

## Status dos módulos

| Módulo | Arquivo | Status |
|--------|---------|--------|
| Comercial (vendas, vale-troca, comissão, entrega) | `comercial.md` | ✅ documentado |
| **Aprovações** (quem decide o quê — config-first, os 19 eventos) | `aprovacoes.md` | ✅ documentado |
| Promoções (campanhas de desconto) | `promocoes.md` | ✅ documentado |
| Orçamento (cotações → vira venda) | `orcamento.md` | ✅ documentado |
| Produtos (precificação, pedras, pai/variações) | `produtos.md` | ✅ documentado |
| Financeiro (contas a receber, caixa, crediário, comissão/fechamento) | `financeiro.md` | ⬜ a capturar |
| Estoque (comercial + insumos) | `estoque.md` | ⬜ a capturar |
| PCP / Produção | `pcp.md` | ⬜ a capturar |
| Ordens | `ordens.md` | 🟨 só **garantia** documentado (17/07) — os outros 8 tipos, a capturar |
| Metal/Ouro (purificação, ligação, quebra, cofre) | `metal.md` | ⬜ a capturar |
| Protocolo (transporte de ordem, ouro e estoque) | `protocolo.md` | ✅ documentado |
| Devolução | `devolucao.md` | ⬜ a capturar |
| Precificação (curva) | `precificacao.md` | ⬜ a capturar |
| Admin (usuários, permissões, parâmetros) | `admin.md` | ⬜ a capturar |

> Faltou módulo? A gente acrescenta linha aqui quando aparecer. O arquivo de cada módulo só é criado quando formos capturar a regra dele (não criar stubs vazios — economiza ruído).
