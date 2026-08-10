# Resumo simples — o que foi feito enquanto você dormia

**Onde:** só na sua cópia de teste do banco (a de dentro do computador, isolada). **Produção não foi
tocada, nem uma vírgula.**

## Em números
- Começou com 183 tabelas, terminou com **181** (mais 2 tabelas de configuração antigas juntadas numa só).
- **73 telas de consulta** (views), todas testadas depois de cada mudança — nenhuma quebrou.
- Arrumei nome de coluna e tipo de dado em **31 tabelas** e corrigi **24 rotinas automáticas** do banco
  que dependiam desses nomes, pra nada parar de funcionar.
- Achei e corrigi um problema real: o campo que diz se um produto está ativo estava desatualizado pra
  **6.476 produtos** — corrigido, com a fonte certa confirmada no próprio sistema.
- Achei e apaguei **5 rotinas mortas** (existiam no banco mas nenhum botão do sistema chamava elas
  mais).

## O que ficou pronto pra você decidir
1. **Três rotinas do banco que estão marcadas como "não tocar sem autorização"** precisaram de um
   ajuste de nome de coluna (só isso, a lógica é idêntica, testei disparando de verdade). Antes de isso
   ir pra produção, preciso do seu "pode" — são regras de ouro/estoque, prefiro perguntar.
2. Achei que o campo `tipo` dos produtos (código 'S'/'V'/'K') não tem explicação em lugar nenhum. Não
   inventei o que significa — alguém vai precisar me dizer.
3. Um campo chamado "config nova de comentários" nasceu com valor padrão "desligado" porque não existia
   antes na cópia de teste — confirmar se é isso mesmo antes de valer pra produção.

## O que ainda falta (mapeado, mas não fiz — explico por quê)
- Sobrou **18 tabelas** com um tipo de número (`real`, que tem erro de arredondamento) pra trocar por
  outro melhor (`numeric`). Já fiz a mais importante (a do PCP/fabricação) e testei — bateu certinho.
  As outras 18 ficaram documentadas com a receita exata de como fazer, mas não fiz correndo: são campos
  de peso e dinheiro do coração do negócio, prefiro entregar isso mapeado do que arriscar erro de pressa.
- A ideia de **dividir as 4 tabelas gigantes** (produtos, vendas, entregas, ordens) em pedaços menores —
  deixei só a PROPOSTA escrita, não fiz a divisão de verdade (é mudança grande, melhor você e o
  Jonathan olharem antes).
- Trocar **42 campos de texto livre** (que hoje aceitam qualquer coisa digitada) por uma lista fechada
  de opções — também deixei só mapeado, não fiz.

## Onde ver tudo com detalhe
`docs/migracao/LIVRO-DE-REGRAS-migracao-erp-novo.md`, seção 10 (nova, de hoje). Não dei push em nada —
fica pronto pra você e o Jonathan revisarem quando quiserem.
