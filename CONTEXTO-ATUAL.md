# CONTEXTO ATUAL DO PROJETO — fabricaAJ

> Caderno de anotações do projeto. A IA lê isso toda vez que abre uma sessão nova.
> Atualizado ao fim de cada tarefa.

---

## 📅 Última sessão
**Data:** 2026-05-19 (hoje)
**Quem mexeu:** Claude (Opus 4.7) + Alisson

---

## 🔧 Em andamento
Nada em aberto. Última tarefa finalizada: criar `REGRAS-ALISSON.md` + planejar `CONTEXTO-ATUAL.md`.

---

## ➡️ Próximo passo
1. Revisar este arquivo `CONTEXTO-ATUAL.md` e dizer se está bom
2. Decidir o que fazer com **Camila (0%) e Débora (100%)** de limite de desconto (ver "Configurações suspeitas" abaixo)
3. Decidir o que fazer com as **31 solicitações de desconto pendentes** (ver "Trava na operação hoje" abaixo)

---

## ✅ Decisões tomadas (recentes)
- 18/05 — Vendedora/gerente NÃO pode mais editar pagamento confirmado nem campos financeiros da venda. Tem que solicitar alteração ao admin.
- 18/05 — Admin/desenvolvedor/diretor = `ROLES_FINANCEIRO` (únicos que podem mexer em valores).
- 18/05 — Migration 262 criou tabela `solicitacoes_alteracao` (já executada em produção).
- 18/05 — Regra de desconto unificada: agora venda direta de peça pronta usa o mesmo `mx_desconto_permitido` que o orçamento (antes só o orçamento bloqueava).
- 18/05 — Bug histórico do `id_contato` no orçamento corrigido (endpoint retorna `id`, não `id_contato`).

---

## 📋 Pendências do projeto
- [ ] Limpar 12 branches velhas (`feat/orcamento-*`, `feat/pedras-*` etc — provavelmente já mergeadas)
- [ ] Reescrever `MEMORY.md` (está com versão de 11/04/2026 — desatualizado)
- [ ] Atualizar `ESTRUTURA_ATUAL.md` (snapshot de 29/04/2026 — desatualizado)
- [ ] "Pix" vs "PIX" duplicados nas formas de pagamento (relatórios quebram separando)
- [ ] 5 orçamentos legados restantes com `cliente_id=null` (auto-vínculo no v2.60.3 vai resolver ao abrir, mas se preferir backfill em massa, fica como pendência)

---

## 🚨 TRAVA NA OPERAÇÃO HOJE (decisão sua urgente)
| Quem está travado | O quê | Quanto tempo |
|-------------------|-------|--------------|
| **Vendedoras** | 31 solicitações de desconto pendentes — ninguém aprovou/rejeitou | últimos 30 dias |
| **Camila Silva** (consultora) | Limite de desconto = 0% — não consegue dar nem 1% | desde sempre |
| **Gerentes loja** (Germana / Geovana) | Limite = 0% — não conseguem dar nenhum desconto | desde sempre |

---

## 🩹 Cicatrizes — bugs que JÁ voltaram (não cair de novo)
- **`c.id_contato` vs `c.id`** (orçamento) — endpoint `/api/vendas/clientes/busca` retorna campo `id` (SELECT id_contato AS id). Quem mexer no `selecionarCliente()` SEMPRE aceitar os 2 (`c.id_contato ?? c.id`). Voltou em 18/05.
- **Migration criada ≠ migration executada** — só ter o arquivo em `supabase/migrations/` não cria a tabela. Sempre rodar no banco depois. Aprendido com `262_solicitacoes_alteracao`.
- **Worktree vs main desatualizados** — alterações no main repo não chegam no worktree (homolog) automaticamente. Sempre aplicar nos 2 lados ou sincronizar via merge.

---

## ⚙️ Configurações suspeitas que pedem decisão sua
| Usuário | Configuração atual | Sugestão |
|---------|---------------------|----------|
| Camila Silva (consultora) | `mx_desconto_permitido = 0%` | Provável bug. Definir entre 5-15%. |
| Débora Eduarda (consultora) | `mx_desconto_permitido = 100%` | Risco alto. Reduzir pra 30% ou similar. |
| Germana Valentim (gerente loja) | `mx_desconto_permitido = 0%` | Gerente normalmente autoriza desconto. Subir pra 30%. |
| Robson Nunes (gerente fábrica) | `mx_desconto_permitido = 0%` | OK se ele não vende — confirmar. |
| Pix / PIX | 2 formas duplicadas no banco | Normalizar pra "Pix" único. |

---

## ⚠️ Avisos importantes ativos
- **Docker Desktop não está subindo** na máquina local. Pode desinstalar sem prejuízo — projeto não usa Docker localmente (só pro deploy em produção, que roda no servidor).
- **CRM tem schema próprio** (`crm.*`) — NÃO mexer. É projeto paralelo no mesmo banco.

---

## 🌳 Branches abertas (24 hoje — RECOMENDADO LIMPAR)
**Em uso ativo:**
- `homolog` — onde o desenvolvimento acontece (worktree local aponta aqui)
- `main` — produção

**Antigas que provavelmente já podem deletar:**
- `claude/amazing-bouman-117060`, `claude/laughing-jepsen-552726`, `claude/romantic-wiles-19152c`, `claude/upbeat-chebyshev-523917`, `claude/vigorous-blackburn-3814dc` (5 branches automáticas)
- `feat/orcamento-friso-pedras-v2`, `feat/orcamento-hardening-v2.43`, `feat/orcamentos-de-aliancas`, `feat/pedras-catalogo-v2.21` (4 features antigas — provavelmente já mergeadas)
- `checkpoint-testes`

**Última sincronização homolog ↔ main:** 18/05/2026 (sessão atual)
**Última subida pra main:** 18/05/2026 — `d63ea52` (REGRAS-ALISSON.md + 4 fixes acumulados)

---

## 🗄️ Última versão em produção
- **Em main hoje:** `d63ea52` — REGRAS-ALISSON.md + v2.60.1 → v2.60.4
- **Em homolog hoje:** mesmo commit (sincronizado)
- **Última versão semântica:** `v2.60.4` (regra desconto unificada + fix cliente)

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
1. **18/05** — Subir REGRAS-ALISSON.md + 4 fixes acumulados pra main — ✅ feito
2. **18/05** — Unificar regra de desconto (orçamento + venda direta) — ✅ v2.60.4
3. **18/05** — Consertar bug que voltou: `id_contato`/`id` no orçamento — ✅ v2.60.4
4. **18/05** — Auto-vincular cliente em orçamento legado sem `cliente_id` — ✅ v2.60.3
5. **18/05** — Bloquear vendedora de editar pagamento confirmado + criar fluxo de solicitação de alteração — ✅ v2.60.1/2 + migration 262

---

## 🩺 Saúde rápida do sistema
- **Servidor local (`npm run dev`):** rodando em `http://localhost:3000` (reiniciado hoje)
- **Banco Supabase:** `72.60.55.140:5543` — conecta normal
- **Docker Desktop:** não está rodando (pode desinstalar)
- **TypeScript (`tsc --noEmit`):** sem erros nos 2 repos (verificado hoje)

---

_Última atualização: 2026-05-19_
