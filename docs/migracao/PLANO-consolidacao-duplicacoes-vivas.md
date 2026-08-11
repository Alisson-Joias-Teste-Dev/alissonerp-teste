# Plano — Consolidação das duplicações em código VIVO

> **Data:** 10/08/2026 · **Origem:** pente-fino do front (`PENTE-FINO-FRONT-2026-08-10.md` §5)
> **Status:** plano proposto — aguarda aprovação do Alisson pra começar.
> Alvo: as regras de negócio copiadas em vários lugares do código EM USO. Cada cópia é um lugar
> a mais pra dar bug diferente — o objetivo é cada regra existir em UM lugar só.

## Regras do jogo (valem pra TODAS as etapas)

1. **Só extração pura.** O comportamento fica IGUAL: nenhuma tela muda de cara, nenhuma conta muda
   de resultado. Tirar a cópia, apontar todo mundo pro lugar único — nada além disso.
2. **"Parecido" não é "igual".** Antes de unificar, `diff` real das cópias. Se pra unificar
   precisar MUDAR comportamento → **PARA e reporta** (lição do banco: as 3 views de saldo
   pareciam duplicatas e eram 3 coisas diferentes — livro §10.3).
3. **Uma etapa por vez, cada uma reversível sozinha.** Um commit por etapa na `homolog`. Nunca
   big-bang, nunca misturar etapas.
4. **Validação de cada etapa:** `tsc` zero erros → testes sem falha nova → abrir a(s) tela(s)
   afetada(s) no servidor local apontando pra cópia de teste (`erp_teste`) e rodar o fluxo
   principal → re-medir duplicação (jscpd): o número TEM que cair.
5. Toda função extraída ganha **comentário de regra de negócio em PT** (o quê / porquê / impacto),
   padrão do projeto.

## Etapas, na ordem (mais barata e segura primeiro)

| # | O quê | Tam. | Risco | Observação |
|---|---|---|---|---|
| **1** | ✅ **FEITO 10/08** — `getComissao()` → `src/lib/comissao.ts`, wrapper local em cada tela chama a versão única | P | baixíssimo | 2 cópias eram byte-a-byte idênticas. `tsc` limpo, testes = baseline exato (613/80/1). |
| **2** | ✅ **FEITO 10/08** — `SUM(saldo)` → `src/lib/estoque-saldo.ts::buscarSaldoEstoque()`, aplicado em 8 dos 10 call sites (distribuição, PCP, purificação/ligação ×4, relatórios, service ×2) | P/M | baixo | 2 call sites ficaram DE FORA de propósito por serem diferentes de verdade: `purificacao/liga-tipos` (subquery correlacionada por linha) e `service/transferir-insumo` linha 133 (GROUP BY em 2 depósitos numa query só). `tsc` limpo, testes = baseline exato, jscpd caiu de 17.795 para 13.572 linhas duplicadas. |
| **3** | ✅ **FEITO 10/08** — Modais "Nova Ordem": **3a** extrai a busca de produto compartilhada (Rep.Loja × Serv.Interno) pra `_shared/ProdutoBuscaOrdem.tsx`; **3b** cria `NovaOrdemVendaBaseModal.tsx` (molde novo, não o `NovaOrdemServicoBaseModal` — são famílias diferentes, ver nota abaixo) e migra Fabricação/Rep.Venda pra wrappers finos | M | médio | Ao ler o código de verdade, a suposição original ("já existe base pronta") estava errada — corrigido com o Alisson antes de mexer (ver nota). `tsc` limpo, testes = baseline exato, testado AO VIVO no navegador com dado real (Kenia Costa Lopes/#15926) nos dois tipos. |
| **4** | ✅ **FEITO 10/08** — Modais de apontamento: `ApontamentoDistModal` × `ApontamentoPCPModal` — extraídos `useValidacaoIABalanca` (hook) + `FotoBalancaCampo` + `InsumoPedraAutocomplete` pra `_shared/` | M | médio | Fluxo de ouro, só a TELA — rotinas protegidas do banco não tocadas. Achado real: o tipo "8 — Outros" significa coisas DIFERENTES nas duas telas (Dist=form simples, PCP=foto+IA completa) — NÃO unificado, ficou como estava. `tsc` limpo, testes = baseline exato, testado AO VIVO no PCP com dado real. 1576→1138 linhas somadas. |
| **5** | ✅ **FEITO 10/08** — `LigacaoTab` × `PurificacaoClient`: paleta/formatação/rótulos de status, pedaços de tela repetidos (Section/Row/Overlay/ModalBox/estilos), o campo "foto da balança + validação por IA" (4 cópias) e a caixa "Perda/Ganho" ao concluir (2 cópias) → `purificacao/_shared/` | M | médio | Maior cluster interno de um módulo só. |
| **6a** | **Reviver os testes de pagamento** (pré-requisito da 6b) | M | — | As 13 suítes que falham hoje são quase todas da área de pagamento (checar-point, criar-pix, webhook-mp, confirmar-pagamento…). Sem essa rede de proteção, NÃO se mexe em código de dinheiro. |
| **6b** | **Pagamentos** — `CartaoInline` × `MercadoPagoCobranca` (163) + rotas criar-link/criar-pix duplicadas entre PagBank e Mercado Pago (151+123) → núcleo de cobrança único | M/G | **ALTO (dinheiro)** | Só depois da 6a. Teste manual até a beira da cobrança (sem cobrar de verdade); cobrança real só em homolog com valor simbólico se o Alisson autorizar. |
| **7** | **Compras × Compras-Comercial** — módulos gêmeos inteiros (rotas 60–87% idênticas; clients 1.629 + 1.049 linhas) | G | alto | Por último e com DECISÃO DE NEGÓCIO antes: os dois módulos vão continuar divergindo de propósito (fábrica ≠ comercial) ou deviam convergir? Falar com Jonathan. Só depois desenhar o núcleo comum com bandeira. |

## Fora do plano (de propósito)

- **Devoluções × Vale-Troca** (108 linhas) — avaliar na passada; pode não compensar o risco.
- **Duplicação interna dos arquivos gigantes** (dashboard-comercial, FinanceiroClient) — resolver
  quando os gigantes forem fatiados (projeto separado, não este).
- **173 exports + 63 tipos mortos** — limpeza fina à parte, sem pressa.

## Nota de verificação — Etapas 1 e 2

Abrir a tela e clicar até o fim do fluxo (regra 4) só foi possível parcialmente: a tela de
Purificação abriu com dado real da cópia de teste (sem erro), mas Vendas ficou fora do alcance do
usuário de teste logado (falta o módulo "vendas" pra ele nesta cópia — travinha do banco de teste,
sem relação com o código mexido) e um clique de aba ficou bloqueado por um aviso flutuante na tela.
A prova ficou apoiada em: `tsc` limpo, testes idênticos ao "antes" (zero falha nova), duplicação
medida em queda (jscpd), e comparação byte-a-byte confirmando que cada cópia unificada era
realmente idêntica antes da extração. Testar clicando até o fim (criar uma venda, apontar PCP,
fazer uma ligação de fato) fica pendente pra próxima sessão com um usuário de teste com o módulo
"vendas" liberado.

## Nota de verificação — Etapa 3

Ao abrir os 4 arquivos de verdade, a suposição original do plano ("já existe um molde pronto, é só
encaixar os 4") não batia: `NovaOrdemServicoBaseModal` existe, mas é de OUTRA família de pedido
(garantia/serviço venda). Fabricação e Reposição Venda formam uma família (mesmo passo-a-passo
Cliente→Venda→Itens→Revisão, 68% de linhas idênticas) que precisou de um molde NOVO
(`NovaOrdemVendaBaseModal.tsx`). Reposição Loja e Serviço Interno são telas de formato diferente
(busca de produto + preenchimento, sem passo-a-passo) — só o pedacinho de busca de produto era
igual de verdade (confirmado por diff), então ali a extração foi um componente pequeno, não um
molde inteiro. Isso foi conferido com o Alisson antes de escrever qualquer código (regra 2 do jogo:
"parecido não é igual").

Verificação ao vivo: com um usuário de teste liberado temporariamente pros 2 tipos (revertido depois,
banco de teste local), percorri as telas de Fabricação (até a Ficha Técnica, onde a validação real
bloqueou por "Milimetragem obrigatório" — prova que a regra de negócio disparou de verdade) e
Reposição Venda (as 4 telas até a Revisão, confirmando texto/rota corretos). Nenhuma ordem de teste
foi de fato criada.

## Nota de verificação — Etapa 4

Mesma lição da etapa 3, num caso menor: os dois modais de apontamento (Distribuição e PCP) pareciam
duplicados em ~187 linhas, mas ao ler o código de verdade, o número do tipo "8" (Outros) significa
coisas DIFERENTES em cada tela (Distribuição trata como formulário simples sem foto; PCP trata como
fluxo completo com foto+validação por IA e um filtro de categoria próprio). Confirmado com diff que
essa é a única divergência real de negócio; o resto (validação da foto por IA e busca de pedra) era
byte-a-byte idêntico (só formatação), então só essas duas partes foram extraídas.

Verificação ao vivo: abri o apontamento de uma ordem PCP real (#1668), troquei pro tipo "Entrada de
Pedra", busquei e selecionei um insumo real ("Diamante 1,3mm/PD1073") e confirmei que o texto
exclusivo do PCP ("Câmera ou galeria") apareceu certinho no campo de foto.

## Nota de verificação — Etapa 5

Lidos os 3 arquivos inteiros (`PurificacaoClient.tsx`, `LigacaoTab.tsx`, `LimpezaTab.tsx`) antes de
decidir qualquer coisa, como manda a regra 2. Confirmado por leitura direta (não suposição): o
campo "foto + validação por IA" já existente em `src/components/forms/_shared` (etapa 4, usado no
apontamento PCP/Distribuição) **não é a mesma peça** — guarda a foto como link temporário (blob) e
tem outra aparência (Tailwind); aqui a foto precisa ir em base64 dentro do JSON salvo e a aparência é
outra (estilo inline já existente da Purificação/Ligação). Usar a peça de lá mudaria a cara da tela —
proibido pela regra 1. Por isso a extração desta etapa criou peças NOVAS, só para este módulo, em
`purificacao/_shared/`: paleta e formatação (`estilos.ts`, `formatadores.ts` — confirmado que também
NÃO são os mesmos formatadores de `src/lib/formatters.ts`, que devolvem outro formato de saída),
pedaços de tela repetidos (`ui.tsx`), o campo de foto+IA (`useFotoBalancaIA.ts` +
`FotoBalancaIACampo.tsx`, com rótulo e texto de "selecionado" mantidos por tela — cada uma usava uma
frase levemente diferente) e a caixa de Perda/Ganho ao concluir (`resultadoProcesso.ts` +
`ResultadoProcessoBox.tsx`, com os rótulos "Retornado"/"Produzido" e "Perda processo"/"Perda"
mantidos por tela). Achada também uma divergência real de comportamento entre as duas telas (não
unificada, de propósito): ao editar o peso já com foto validada, o modal de Ligação limpa a validação
da IA (força revalidar), mas o de Purificação não limpava — mantido exatamente como estava em cada
tela.

`LimpezaTab.tsx` confirmado como uma terceira coisa separada (fluxo de metal sujo, cards e modais
próprios) — só reaproveitou as 3 funçõezinhas de formatação idênticas, resto intocado.

`tsc` limpo, testes = baseline exato (613 passaram / 80 falharam / 1 pulado). Duplicação nos 2
arquivos principais caiu de 1.235+1.240=2.475 linhas para 937+910=1.847 linhas (mais 426 linhas nas
peças novas reaproveitáveis).

Verificação ao vivo: aberta a tela de Purificação/Ligação real (banco de teste, usuário Robson) —
aba Ligação com os 10 lotes reais renderizando certo, cálculo em tempo real do "Nova Ligação"
correto (10g→14.49g 18k esperado), foto+IA chamando a API de verdade e mostrando "IA leu... ✅ OK"
com o texto exato de antes, botão de salvar liberando na hora certa. No "Concluir Purificação"
(purif #5 real), testados os dois caminhos: retornado 3.50g → "Ganho de teor +0.46g (+15.13%)"; e
retornado 2.50g → "Perda processo 0.54g (17.76%)" com o alerta de perda alta — os dois com o rótulo
exato de cada tela. Nenhum dos dois modais foi de fato submetido (fechados com Cancelar).

## Ritmo e paradas

- Etapas 1 e 2 saem numa sessão só. Etapas 3, 4 e 5: uma por sessão, com calma.
- Etapa 6 só começa quando a 6a estiver verde. Etapa 7 só com a decisão de negócio tomada.
- Ganho estimado: **~2 mil linhas duplicadas a menos** e cada regra de negócio com dono único.
- Qualquer surpresa ("parecido mas não igual") → para, documenta no livro, pergunta.
