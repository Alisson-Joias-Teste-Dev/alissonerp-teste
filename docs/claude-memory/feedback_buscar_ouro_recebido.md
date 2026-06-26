---
name: feedback_buscar_ouro_recebido
description: Armadilha critica em buscarOuroRecebido — deve usar saldo liquido e ser chamada ANTES das CEs de saida
type: feedback
---

`buscarOuroRecebido` em `src/lib/registrar-quebra.ts` deve retornar SUM(entrada) - SUM(saida) para calcular o saldo liquido do operador para a ordem — NAO apenas SUM(entrada).

Alem disso, nas rotas que registram quebra (pcp/transferir e pcp/saida), a funcao DEVE ser chamada ANTES de qualquer INSERT de CE de saida (TED, SM, QUEBRA_PCP). Se chamada depois, o saldo liquido ja inclui as saidas desta operacao e fica incorreto.

**Why:** Quando um operador recebe ouro de uma ordem mais de uma vez (ex: Carlos recebe 12.31g, transfere, recebe 9.23g de volta), a formula SUM(entrada) = 21.54g inflava o ouro_recebido. Isso gerava QUEBRA_PCP CE errado (12.56g em vez de 0.25g) e saldo negativo no deposito do operador. Bug encontrado em C-1060 (Carlos Eduardo) e C-1129 (Natan). Correcao de dados realizada em 30/03/2026 (v2.14.2).

**How to apply:**
1. Em qualquer rota que chame buscarOuroRecebido: garantir que a chamada esta ANTES de qualquer INSERT em movimentacoes_estoque para esta operacao
2. A formula SUM(entrada) - SUM(saida) garante que rodadas anteriores (entradas+saidas previas) sejam consideradas corretamente
3. Para a rota transferir: buscarOuroRecebido antes do loop de TED CEs
4. Para a rota saida: buscarOuroRecebido antes dos CEs SM e QUEBRA_PCP
