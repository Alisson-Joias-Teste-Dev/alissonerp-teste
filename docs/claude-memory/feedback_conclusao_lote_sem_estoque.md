---
name: Conclusão do lote não movimenta estoque
description: Conclusão do lote (distribuição) é só administrativa — ZERO INSERT em movimentacoes_estoque
type: feedback
---

## Regra crítica: dois fluxos distintos

**SAÍDA POR ORDEM (saída PCP):**
- Movimenta estoque: operador → pote (Almox ID=1) ✅ DEVE mover

**CONCLUSÃO DO LOTE (distribuição):**
- Só administrativo ❌ NÃO movimenta estoque
- Faz: calcula totais (ouro, peças, quebra), muda status → concluido
- NÃO FAZ: INSERT em movimentacoes_estoque

Nunca adicionar movimentacoes_estoque no fluxo de conclusão de lote/distribuição.
