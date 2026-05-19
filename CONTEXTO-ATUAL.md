# CONTEXTO ATUAL DO PROJETO — fabricaAJ

> Caderno de anotações do projeto. A IA lê isso toda vez que abre uma sessão nova.
> Atualizado ao fim de cada tarefa.

---

## 📅 Última sessão
**Data:** 2026-05-19 (hoje — sessão longa, várias tarefas)
**Quem mexeu:** Claude (Opus 4.7) + Alisson

---

## 🔧 Em andamento
Nada em aberto. Última tarefa finalizada: feature pedras-componente (cadastro de produto com soma Ouro+Pedras em tempo real).

---

## ➡️ Próximo passo
1. Testar em produção (`erp.alissonjoias.com.br`) a feature de pedras no cadastro de produto novo
2. Decidir o que fazer com branch `feat/proxima-tarefa` (ainda aberta, 10 commits não mergeados — ver Branches)
3. Verificar migrations 258–261 se foram executadas em produção

---

## ✅ Decisões tomadas (recentes)
- 19/05 — **Pedras-componente:** ao cadastrar produto novo, agora dá pra selecionar pedras do catálogo × quantidade. O preço soma em tempo real mostrando Ouro / Pedras / TOTAL.
- 19/05 — **Camila Silva desativada** (era usuária de teste, removida do sistema).
- 19/05 — **Limites de desconto ajustados:** Cristiane 20%, Débora 20%, Germana 30%.
- 19/05 — **31 solicitações de desconto antigas rejeitadas** em bloco.
- 19/05 — **PIX → Pix normalizado** nas formas de pagamento.
- 19/05 — **16 branches antigas deletadas** (ficaram só `homolog` e `main` + algumas em uso).
- 18/05 — Vendedora/gerente NÃO pode mais editar pagamento confirmado nem campos financeiros da venda. Tem que solicitar alteração ao admin.
- 18/05 — Admin/desenvolvedor/diretor = `ROLES_FINANCEIRO` (únicos que podem mexer em valores).
- 18/05 — Migration 262 criou tabela `solicitacoes_alteracao` (já executada em produção).
- 18/05 — Regra de desconto unificada: agora venda direta de peça pronta usa o mesmo `mx_desconto_permitido` que o orçamento (antes só o orçamento bloqueava).
- 18/05 — Bug histórico do `id_contato` no orçamento corrigido (endpoint retorna `id`, não `id_contato`).

---

## 📋 Pendências do projeto
- [ ] Testar pedras-componente em produção (feature nova de hoje)
- [ ] Decidir `feat/proxima-tarefa`: deletar ou aproveitar algum commit restante (10 commits ainda não mergeados)
- [ ] Verificar migrations 258, 259, 260, 261 — foram executadas em produção? (262 ✅ confirmada)
- [ ] Migration 260 duplicada — dois arquivos com mesmo número (`260_joias_leituras_inventario_id.sql` e `260_orcamento_integridade.sql`) — resolver conflito
- [ ] Reescrever `MEMORY.md` (está com versão de 11/04/2026 — desatualizado)
- [ ] Atualizar `ESTRUTURA_ATUAL.md` (snapshot de 29/04/2026 — desatualizado)
- [ ] 5 orçamentos legados com `cliente_id=null` (auto-vínculo vai resolver ao abrir, mas backfill em massa fica como opção)
- [ ] Expandir pedras: categorias Rubi/Esmeralda/Safira com formato (oval/redonda/quadrada) e tamanho — **ADIADO** por Alisson (faz em lote no módulo de pedras)

---

## 🚨 TRAVA NA OPERAÇÃO HOJE (decisão sua urgente)
Nenhuma trava crítica identificada no momento. ✅

---

## 🩹 Cicatrizes — bugs que JÁ voltaram (não cair de novo)
- **`c.id_contato` vs `c.id`** (orçamento) — endpoint `/api/vendas/clientes/busca` retorna campo `id` (SELECT id_contato AS id). Quem mexer no `selecionarCliente()` SEMPRE aceitar os 2 (`c.id_contato ?? c.id`). Voltou em 18/05.
- **Migration criada ≠ migration executada** — só ter o arquivo em `supabase/migrations/` não cria a tabela. Sempre rodar no banco depois. Aprendido com `262_solicitacoes_alteracao`.
- **Worktree vs main desatualizados** — alterações no main repo não chegam no worktree (homolog) automaticamente. Sempre aplicar nos 2 lados ou sincronizar via merge.

---

## ⚙️ Configurações suspeitas que pedem decisão sua
| Usuário | Configuração atual | Status |
|---------|---------------------|--------|
| Camila Silva (consultora) | Desativada | ✅ Resolvido hoje |
| Débora Eduarda (consultora) | `mx_desconto_permitido = 20%` | ✅ Ajustado hoje |
| Cristiane (consultora) | `mx_desconto_permitido = 20%` | ✅ Ajustado hoje |
| Germana Valentim (gerente loja) | `mx_desconto_permitido = 30%` | ✅ Ajustado hoje |
| Robson Nunes (gerente fábrica) | `mx_desconto_permitido = 0%` | ⚠️ Confirmar se ele vende — se não vende, OK |
| Pix / PIX | Normalizado pra "Pix" | ✅ Resolvido hoje |

---

## ⚠️ Avisos importantes ativos
- **Docker Desktop não está subindo** na máquina local. Pode desinstalar sem prejuízo — projeto não usa Docker localmente (só pro deploy em produção, que roda no servidor).
- **CRM tem schema próprio** (`crm.*`) — NÃO mexer. É projeto paralelo no mesmo banco.

---

## 🌳 Branches abertas
**Em uso ativo:**
- `homolog` — onde o desenvolvimento acontece (worktree local aponta aqui)
- `main` — produção

**Ainda aberta (precisa decisão):**
- `feat/proxima-tarefa` — 10 commits não mergeados (pedras-catalogo, drawer produto, etc). A feature principal (pedras) foi reimplementada do zero. Deletar ou guardar?

**Limpeza feita hoje:** 16 branches antigas deletadas ✅

**Última sincronização homolog ↔ main:** 19/05/2026
**Última subida pra main:** 19/05/2026 — `ab76119` (pedras-componente feature v2.60.5)

---

## 🗄️ Última versão em produção
- **Em main hoje:** `ab76119` — pedras-componente feature completa
- **Em homolog hoje:** mesmo commit (sincronizado)
- **Última versão semântica:** `v2.60.5` (pedras-componente no cadastro de produto)

---

## 💾 Últimas mudanças no banco de dados (Migrations)
| Nº | Nome | Criada | Executada em prod? |
|----|------|--------|---------------------|
| 262 | `solicitacoes_alteracao` (tabela nova) | 18/05/2026 | ✅ Sim (rodada hoje) |
| 261 | `allow_negative_inventory_adjustment` | recente | — verificar |
| 260 | `joias_leituras_inventario_id` / `orcamento_integridade` (2 com nº 260 — duplicado!) | — | — verificar |
| 259 | `venda_numero_sequence` | — | — verificar |
| 258 | `orcamento_snapshot_lock` | — | — verificar |

⚠️ **Atenção:** existem **DUAS** migrations com número `260` (`260_joias_leituras_inventario_id.sql` e `260_orcamento_integridade.sql`). Verificar qual rodou.

---

## 📜 Histórico recente (últimas 5 tarefas)
1. **19/05** — Pedras-componente: cadastro de produto com seleção de pedras do catálogo + soma Ouro/Pedras/TOTAL — ✅ v2.60.5
2. **19/05** — Operacional: desativar Camila, ajustar limites Cristiane/Débora/Germana, rejeitar 31 requests, normalizar Pix, limpar 16 branches — ✅ feito
3. **18/05** — Unificar regra de desconto (orçamento + venda direta usam mesmo `mx_desconto_permitido`) — ✅ v2.60.4
4. **18/05** — Consertar bug recorrente: `id_contato`/`id` no orçamento (causa raiz no endpoint) — ✅ v2.60.4
5. **18/05** — Bloquear vendedora de editar pagamento confirmado + fluxo solicitação de alteração — ✅ v2.60.1/2 + migration 262

---

## 🩺 Saúde rápida do sistema
- **Servidor local (`npm run dev`):** rodando em `http://localhost:3000`
- **Banco Supabase:** `72.60.55.140:5543` — conecta normal
- **Docker Desktop:** pode desinstalar (não usa localmente)
- **TypeScript (`tsc --noEmit`):** sem erros nos 2 repos (verificado hoje, após pedras-componente)
- **Produção:** `erp.alissonjoias.com.br` — último deploy `ab76119`

---

_Última atualização: 2026-05-19 (fim de sessão)_
