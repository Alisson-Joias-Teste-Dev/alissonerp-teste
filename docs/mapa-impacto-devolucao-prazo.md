# Mapa de Impacto — Devolução com prazo de 7 dias úteis + aprovação fora do prazo

> **Data:** 15/06/2026 · Mapeamento line-by-line ANTES de tocar (regra do Jonathan). Aplicação: **produção**.
> **Decisões fechadas (Jonathan 15/06):** 7 dias **úteis**; conta a partir do **dia que o cliente recebeu**
> (`data_entrega_realizada` motoboy / `data_retirada` loja, NÃO o `data_entrega` planejado da venda); dias úteis
> desconta **fim de semana + feriados nacionais + Ceará + Fortaleza**; aprovador fora do prazo = **campo separado**
> em Configurações, lista **aberta** (qualquer usuário ativo que o Jonathan escolher).

---

## Regra (precedência) — a trava de "entregue" NÃO muda
1. Venda **não entregue** → **bloqueio total** (trava atual, intacta — front `NovaDevolucaoClient.tsx:114` +
   backend `devolucoes/route.ts:127`). Sem bypass.
2. Venda **entregue + ≤ 7 dias úteis** → cria devolução normal.
3. Venda **entregue + > 7 dias úteis** → bloqueia o normal + **explica o porquê** + libera **"Solicitar aprovação"**
   (reusa o fluxo que já existe), roteando para o **aprovador fora do prazo** configurado.

---

## JÁ EXISTE (reuso — não duplicar)
- Módulo devolução completo: `criarDevolucao`, `solicitarAprovacaoDevolucao`, `processarAprovacaoDevolucao`,
  `inspecionarItem`, `concluirDevolucao` (`src/lib/devolucoes.ts`).
- **Pedir aprovação já pronto:** `solicitarAprovacaoDevolucao` ([devolucoes.ts:220](src/lib/devolucoes.ts#L220))
  cria tarefa + `aprovacoes_tarefa` + notificação + seta `status='aguardando_aprovacao'`.
- Geração do vale: `gerarValeTroca` ([devolucoes.ts:493](src/lib/devolucoes.ts#L493)).
- Tabela `devolucoes_venda` já tem `tarefa_id`, `aprovador_id`, `aprovado_em`, `status`.
- Config de aprovadores: `TabAprovadores.tsx` + `configuracoes/aprovadores/route.ts` + `configuracoes_sistema`.
- Carregamento da venda por número: `buscarVenda` ([NovaDevolucaoClient.tsx:82](src/app/(dashboard)/devolucoes/nova/NovaDevolucaoClient.tsx#L82)).
- Data real da entrega: `entregas_venda.data_entrega_realizada` (motoboy) / `data_retirada` (loja), gravadas em
  `confirmarEntrega` (`src/lib/entrega-venda.ts`) quando o Código A é confirmado.

---

## A CONSTRUIR (pequeno) + ONDE ENCAIXA

### NOVO 1 — Helper de dias úteis com feriados
`src/lib/dias-uteis.ts`:
- `feriados(ano)` → nacionais fixos (01/01, 21/04, 01/05, 07/09, 12/10, 02/11, 15/11, 25/12) + móveis via Páscoa
  (Sexta-feira Santa, Carnaval, Corpus Christi) + **Ceará** (25/03 Data Magna) + **Fortaleza** (15/08 N. Sra. da
  Assunção — **CONFIRMAR lista completa de Fortaleza com Jonathan**).
- `diasUteisEntre(de, ate)` → conta dias úteis (exclui sáb/dom + feriados).
- **Risco:** lista de feriados muda; comentar bem e deixar fácil de editar.

### NOVO 2 — Avaliação de prazo (server-side, fonte única)
`src/lib/prazo-devolucao.ts` → `avaliarPrazoDevolucao(vendaId)`:
- Lê a data real: `COALESCE(data_entrega_realizada, data_retirada)` da `entregas_venda` confirmada da venda.
- Calcula dias úteis até hoje. Retorna `{ dataEntregaReal, diasUteis, dentroPrazo (≤7), motivo }`.
- **Risco/nota:** venda com entrega **parcial** tem várias `entregas_venda` — definir qual data usar (mais recente
  confirmada, ou a do item devolvido). **DECIsÃO menor a confirmar.**
- `PRAZO_DEVOLUCAO_DIAS = 7` (constante; pode virar config depois).

### NOVO 3 — Endpoint leve de elegibilidade (front consome no buscarVenda)
`GET /api/devolucoes/elegibilidade?venda_id=` → chama `avaliarPrazoDevolucao`. (Mantém o cálculo no servidor.)

### CHANGE 1 — Front `NovaDevolucaoClient.tsx` (~linha 114-117)
Depois de carregar a venda (e DEPOIS da trava de 'entregue' que continua): chamar elegibilidade. Se fora do prazo:
mostrar a **explicação** ("entregue há X dias úteis — passou do prazo de 7") e trocar o botão para
**"Solicitar aprovação"** (em vez de criar direto). Dentro do prazo: fluxo normal.

### CHANGE 2 — Backend `POST /api/devolucoes` ([route.ts:127](src/app/api/devolucoes/route.ts#L127))
LOGO DEPOIS da trava de 'entregue' (que NÃO muda), adicionar o gate de prazo: se fora do prazo e a requisição
não é o caminho "solicitar aprovação" → bloquear (409) com a explicação. (Espelho server-side do front.)

### CHANGE 3 — `solicitarAprovacaoDevolucao` ([devolucoes.ts:239-265](src/lib/devolucoes.ts#L239))
Quando a devolução é **fora do prazo**, usar a nova chave de config `aprovador_devolucao_fora_prazo` para achar o
aprovador (em vez do fallback atual `aprovadora_credito_gerente`). Manter o fallback se a chave estiver vazia.

### CHANGE 4 — Config (1 linha nova, lista ABERTA)
- `configuracoes/aprovadores/route.ts`: +chave `aprovador_devolucao_fora_prazo` em `CHAVES` ([:24](src/app/api/configuracoes/aprovadores/route.ts#L24)),
  no GET ([:101](src/app/api/configuracoes/aprovadores/route.ts#L101)) e PUT ([:134](src/app/api/configuracoes/aprovadores/route.ts#L134));
  **+lista `todos_usuarios` (todos ativos)** para o dropdown aberto.
- `TabAprovadores.tsx`: +item em `CONFIG_ITENS`, +campo na interface e no state, usando a lista `todos_usuarios`.

### Opcional — coluna de registro
`ADD COLUMN IF NOT EXISTS alissonerp.devolucoes_venda.fora_prazo boolean DEFAULT false` (só pra registrar que foi
exceção). Migration segura, assinada no log_mudancas_banco (303). **Confirmar se vale a pena ou se inferimos.**

---

## DB / Migrations
- Nova chave em `configuracoes_sistema` = **dado** (via PUT existente), **sem migration**.
- (Opcional) 1 `ADD COLUMN fora_prazo` — segura.
- **NÃO** toca a trava de 'entregue', nem o vale, nem a aprovação existente (só estende).

## Decisões menores ainda em aberto
1. Lista exata de **feriados de Fortaleza** (e CE) — confirmar com Jonathan.
2. Venda com **entrega parcial**: qual `entregas_venda` define a data (mais recente confirmada?).
3. Coluna `fora_prazo` (registrar) — sim ou não.

## Teste (produção, com cuidado)
Venda entregue há <7 úteis (cria normal) · há >7 úteis (bloqueia + explica + solicitar aprovação → aprovar →
gera vale) · venda não entregue (bloqueio total intacto) · feriado no meio da contagem (confere o cálculo).
