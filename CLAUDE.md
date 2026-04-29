# Alisson ERP — fabricaAJ

> **Todo agente DEVE ler este arquivo antes de qualquer task.**

**Stack:** Next.js 16.1.6 | React 19 | PostgreSQL 15 (Supabase self-hosted) | TailwindCSS v4 | Zustand
**Versao:** v2.30.7 | **Branch:** `homolog` (nunca main direto)
**Docs completos:** `docs/arquitetura.md` | **Changelog:** `docs/CHANGELOG.md`

---

## 1. Arquitetura Rapida

| Schema | Permissao | Conteudo |
|--------|-----------|----------|
| `alissonerp` | Leitura+Escrita | ~60 tabelas, ~35 views, ~30 triggers — ERP fabrica |
| `public` | READONLY | contatos (=clientes), vendedores, produtos, vendas, user_profiles |
| `directus` | READONLY | ordens, pcp, apontamento, controle_estoque, protocolo (legado) |

**Acesso DB:** API routes Next.js com `postgres` npm (SQL direto via `src/lib/db.ts`).
**NUNCA** usar `supabase.from()` para schema alissonerp (PostgREST bug — retorna `[]` silenciosamente).
`supabase.auth.getUser()` e `supabase.storage` funcionam normalmente.

**Storage:** Upload SEMPRE server-side via `src/lib/storage.ts`.
- Buckets PUBLICOS (avatars, imagens): `<img src={url}>` direto, sem signed URL
- Buckets PRIVADOS (protocolo-fotos, apontamento-fotos, ordem-fotos): signed URL via `supabase.storage.createSignedUrl()`, TTL 1h, NUNCA armazenar a URL gerada

**Auth:** Supabase GoTrue. Role de `alissonerp.usuarios.role` (VARCHAR). Permissoes granulares: `src/lib/permissoes.ts`.

---

## 2. Regras Inviolaveis

### Pre-Codigo
```
1. Ler este CLAUDE.md
2. Ler docs/arquitetura.md (se task complexa)
3. SELECT column_name FROM information_schema.columns WHERE table_schema='alissonerp' AND table_name='NOME'
4. SELECT id, name FROM storage.buckets (se envolver fotos)
5. CONFIRMAR que colunas/tabelas/buckets existem ANTES de escrever codigo
6. Migration criada != migration executada — DB eh fonte de verdade
7. NUNCA adivinhar nomes de colunas/tabelas
```

### Git — INVIOLAVEL
```
SEMPRE branch homolog
Formato: feat|fix|chore: descricao (vX.Y.Z)

FIXES PEQUENOS (bugs, ajustes UI, text, comportamento):
  Apos tsc passar: commit → push homolog → merge+push main automaticamente
  Sem necessidade de confirmacao adicional

FEATURES / MIGRATIONS / MUDANCAS ESTRUTURAIS:
  commit → push homolog → PARAR
  Aguardar Jonathan testar → confirmacao separada para main

"Funcionou", "ok", "testei" NAO sao autorizacao para features
Autorizacao "subir pra homolog" = HOMOLOG only, main = confirmacao separada
```

### Database Safety
```
BACKUP obrigatorio antes de ALTER TABLE / DELETE / TRUNCATE
CREATE OR REPLACE (nunca DROP)
ADD COLUMN IF NOT EXISTS (nunca remover colunas)
Adicionar features, NUNCA refatorar codigo que funciona
Mapear TODOS os impactos (views, triggers, componentes) ANTES de implementar
Se impacta 3 lugares, corrigir os 3 na mesma sessao
```

### Ouro = Dinheiro
```
Movimentacoes: SEMPRE dupla-entrada (debito + credito)
Estorno: criar movimentacoes REVERSAS (nunca deletar originais)
Quebra: so quando total_metal > 0 (sem ouro = sem quebra)
Pote (deposito ID=1): NUNCA registra quebra
Metal externo: subtrair do PMC
Pedras: baixa definitiva na saida PCP
Rastrear 100% — toda grama conta
buscarOuroRecebido: SUM(entrada)-SUM(saida), chamar ANTES das CEs de saida
```

### Zonas No-Touch (NUNCA alterar sem autorizacao)
```
fn_processar_apontamento_pcp (018)
fn_processar_transferencia_saida (019)
fn_processar_fechamento_dist (020)
fn_concluir_protocolo
fn_processar_auditoria
fn_criar_servico_from_pcp (092)
fn_calcular_peso_pedra_gramas (092)
Schemas: public.* e directus.* sao READONLY
```

---

## 3. Pitfalls Criticos

```
numero_pedido: public.vendas (NAO pedidos)
Clientes: public.contatos (NAO alissonerp.clientes)
Saldo: vw_saldo_estoque (NAO insumos.saldo legado)
vw_saldo_estoque: SUM(saldo) para agregar, NUNCA LIMIT 1 (multiplas linhas por deposito/insumo)
Ouro Total: SO deposito geral ID=1 (outros sao operadores)
Gemini: gemini-2.5-flash (2.0-flash descontinuado)
IA virgula: normalizar "2,02" -> 2.02 antes de comparar
IA float: Math.abs(a-b) < 0.005 em vez de ===
contatos.id_contato (NAO contatos.id) — PK real
public.produtos.id_produto (NAO id) — PK real, BIGINT
directus.ordens.peso_metal_negocido (TYPO sem A)
distribuicao_ordens.ordens_id (NAO ordem_id)
sql.begin(): parametro do callback usar 'tx' NAO 'sql' (conflito de tipo)
configuracoes_sistema.valor eh TEXT — usar ::jsonb ao comparar
user_profiles.role != alissonerp.usuarios.role (constraints diferentes)
Deposito = Operador (label "Deposito/Operador" na UI)
Conclusao de lote (distribuicao): administrativa, ZERO movimentacoes_estoque
Transferencia metal: foto + IA obrigatoria (tolerancia zero)
peso_pedra_ct: salvar em quilates, trigger calcula gramas (1ct = 0.2g)
camera mobile: navigator.mediaDevices undefined em HTTP — fallback input[type=file]
movimentacoes_estoque.local_estoque_id: NOT NULL
Estoque comercial: inserir item de venda CRIA RESERVA (nunca saida direta) — reserva vira saida ao APROVAR venda
Curva precificacao: chamar aplicarCurvaProduto() apos criar/editar produto com peso+categoria (src/lib/aplicar-curva-produto.ts)
Vale-troca: vale > total venda gera NOVO vale com troco (vale_origem_id rastreia cadeia) — cada vale usado UMA vez
ABC: classificar por receita_total_12m (ultimos 12 meses), NUNCA por capital (estoque * preco) — produto sem venda em 12m = C automatico
parametros_sistema: usar PARAM.X de src/lib/parametros.ts, NUNCA literals como deposito_id=1
reposicao de estoque: verificar SUM(disponivel) pre-reserva, nao SUM(saldo)
dupla-entrada: fn_criar_par_movimentacao agora retorna (saida_id, entrada_id) — capturar
updated_at guard: PATCH vendas aceita client_updated_at → 409 se modificado por outro usuario
audit: logAudit(tx, ...) dentro da mesma transacao — nunca falha a operacao principal
catches silenciosos: usar useErrorStore.getState().push() em vez de .catch(() => {})
defineRoute: novo padrao de API route — ver src/lib/api-handler.ts
fila_sync: erros Tiny vao para fila_sync_externo, nao bloqueiam a operacao principal
```

---

## 4. Sistema de Agentes

### Roles
| Skill | Papel | Dominio |
|-------|-------|---------|
| `/gerente` | Coordenador full-stack | Analisa, quebra tasks, delega, coordena QA |
| `/backend` | Especialista DB+API | migrations/, src/app/api/, src/lib/ (server) |
| `/frontend` | Especialista UI | src/components/, src/app/(dashboard)/, hooks/, stores/ |
| `/qa` | Revisor/Bloqueador | Revisa tudo, checklists, aprova ou rejeita |

### Zone Exclusion
| Diretorio | Dono | Outros |
|-----------|------|--------|
| `supabase/migrations/` | Backend | NUNCA toca |
| `src/app/api/` | Backend | Frontend pode LER |
| `src/lib/db.ts`, `registrar-quebra.ts` | Backend | Frontend pode IMPORTAR |
| `src/components/` | Frontend | Backend NUNCA toca |
| `src/app/(dashboard)/` | Frontend | Backend NUNCA toca |
| `src/hooks/`, `src/stores/` | Frontend | Backend NUNCA toca |
| `src/lib/roles.ts`, `permissoes.ts` | Compartilhado | Ambos podem modificar |
| `docs/`, `CHANGELOG.md` | Ambos | QA verifica |

### Workflow
```
Jonathan -> Gerente (analisa, quebra, delega)
  +-- Backend (DB + API) -> implementa -> tsc -> reporta
  +-- Frontend (UI) -> implementa -> tsc -> reporta
  +-- QA (revisa TUDO) -> APROVADO / REJEITADO
       APROVADO -> Gerente reporta a Jonathan -> aguarda teste
       REJEITADO -> volta ao especialista -> corrige -> QA re-revisa
```

---

## 5. Constraints Imutaveis

```
Deposito ID=1       = Almoxarifado Central (pote)
Insumo ID=1         = Ouro 18k Amarelo
Categoria ID=1      = Metal/Ouro | ID=2 = Pedras
Tipos apontamento   = IDs 1-9 fixos
PMC PCP             = peso_final - outros - metal_externo
PMC Distribuicao    = peso_final - outros (SEM metal_externo)
Servico             -> SEMPRE rota = protocolo
```

PARAMETROS SISTEMA (via src/lib/parametros.ts):
  ALMOXARIFADO_DEPOSITO_ID = Deposito ID=1 (antes hardcoded)
  OURO_18K_INSUMO_ID       = Insumo ID=1 (antes hardcoded)
  METAL_CATEGORIA_ID       = Categoria ID=1 (antes hardcoded)
  PEDRA_CATEGORIA_ID       = Categoria ID=2 (antes hardcoded)
  LOCAL_ESTOQUE_DEFAULT_ID = Local ID=1 (antes hardcoded)
  OURO_24K_LIGA_INSUMO_ID  = Insumo ID=275 (antes hardcoded)
```

### Valores Legados (Directus)
```
situacao: "1"=Cancelado "2"=Criado "3"=Rascunho
status:   "1"=Aguardando "2"=Em Andamento "3"=Concluido
rota:     "1"=PCP "2"=Protocolo
tipo_ordem: "1"=Servico "2"=Fabricacao "3"=Rep.Venda "4"=Rep.Loja "5"=Compra "6"=Garantia "7"=Serv.Interno
etapas_pcp: "1"=Novas "2"=Pendencia "3"=Aguardando "4"=Em Andamento "5"=Concluido "6"=Cancelado
```

---

## 6. Roles do Sistema

```
desenvolvedor    -> TUDO (super-admin, incluir em TODA verificacao)
admin            -> TUDO
gerente_fabrica  -> PCP + estoque + protocolo (cria e conclui)
gerente_loja     -> ordens + protocolo + auditoria loja + precificacao
ourives          -> PCP (so deposito dele)
motoboy          -> protocolo (so cria, NUNCA conclui)
consultora       -> so suas ordens + corrige reprovadas
pcp              -> PCP completo

Fonte de verdade: alissonerp.usuarios.role (VARCHAR(50))
Constantes: src/lib/roles.ts (NUNCA hardcoded)
Permissoes granulares: src/lib/permissoes.ts -> temPermissao()
```

---

## 7. Pos-Task

```
1. npx tsc --noEmit (ZERO erros obrigatorio)
2. Reportar o que foi feito
3. Commit/push: seguir regra Git secao 2 (fixes = auto, features = aguarda)
4. Aguardar Jonathan testar (features e migrations)
5. Atualizar: ~/.claude/projects/C--Users-Jonathan-Ara-jo-OneDrive-fabricaAJ/memory/ (se mudou algo estrutural)
           docs/arquitetura.md (se mudou arquitetura)
           docs/CHANGELOG.md
```

---

## 8. Referencias

- **Arquitetura completa:** `docs/arquitetura.md` (140KB)
- **Dominio ERP (schemas, fluxos, tabelas):** `docs/claude-memory/MEMORY.md`
- **Memory files:** `~/.claude/projects/C--Users-Jonathan-Ara-jo-OneDrive-fabricaAJ/memory/`
- **API Routes (280+):** ver memory `project_api_routes.md`
- **Modulo Service:** ver memory `project_modulo_service.md`
- **Storage Buckets:** ver memory `project_storage_buckets.md`
- **Usuarios teste:** ver `docs/claude-memory/MEMORY.md` secao 17

---

## 9. Regras Obrigatorias

### Documentacao sempre em sincronia

Toda alteracao no codigo — seja correcao de bug, refatoracao, ou feature nova — DEVE atualizar a documentacao afetada no MESMO commit.

Arquivos de documentacao do projeto:
- `MEMORY.md`
- `CLAUDE.md`
- `docs/arquitetura.md`
- `ESTRUTURA_ATUAL.md`
- `.aiox/knowledge/context.md`

O que atualizar:
- Arquivo criado/deletado/renomeado → atualizar referencias em todos os docs
- Componente adicionado/removido → atualizar lista de componentes
- Comportamento alterado → atualizar descricao do comportamento
- Contagens (ex: "5 modais") → recalcular e corrigir

Regra: se o commit altera codigo mas nao atualiza docs afetadas, o trabalho NAO esta completo. Docs desatualizadas sao bugs.

---

## 10. Orquestracao Automatica de Tarefas (@aiox-master)

### Fluxo padrao — Jonathan so precisa explicar o problema e dar a aprovacao final

Quando uma tarefa e iniciada via @aiox-master, o fluxo abaixo e executado AUTOMATICAMENTE, sem Jonathan precisar dizer qual agente chamar:

```
1. Jonathan explica o problema → @aiox-master entende e faz perguntas de clareza
2. @aiox-master delega → @analyst investiga (codigo, banco, logs)
3. @analyst entrega → @aiox-master delega → @architect avalia impacto e solucao
4. @architect entrega → @aiox-master delega → @dev (feature/refactor) ou @hotfix (bug prod)
5. Implementacao pronta → @aiox-master delega → @qa revisa
6. @qa APROVA → @aiox-master pede AUTORIZACAO FINAL ao Jonathan
7. Jonathan aprova → @aiox-master delega → @devops faz push
8. @devops confirma push → @aiox-master reporta tarefa concluida

REJEICAO: se @qa REJEITAR → @aiox-master devolve automaticamente ao @dev/hotfix → repete ate @qa aprovar
```

### Responsabilidades do Jonathan nesse fluxo

```
- Explicar o problema no inicio
- Responder perguntas do time durante o processo
- Dar a aprovacao final ANTES do push (passo 7)
- Qualquer outro passo e automatico
```

### Responsabilidades do @aiox-master

```
- Entender o problema e fazer perguntas de clareza antes de comecar
- Adaptar o fluxo: pular etapas que nao fazem sentido (ex: bug simples nao precisa de @analyst)
- Informar Jonathan quando o proximo agente foi acionado e o que ele vai fazer
- Nunca pular o @qa — toda mudanca de codigo passa por revisao
- Nunca autorizar push sem aprovacao explicita do Jonathan
```

### Troca de modelo entre fases

O fluxo usa modelos diferentes por fase:

```
FASE DE ANALISE (Opus):
  @aiox-master, @analyst, @architect, @qa → exigem Opus

FASE DE EXECUCAO (Sonnet):
  @sm, @dev, @hotfix, @devops → rodam em Sonnet
```

Regra para o @aiox-master:

```
Ao terminar a fase de analise (antes de @dev/@hotfix):
  → Avisar: "Analise completa. Troque para Sonnet com /model sonnet e diga 'continua'."

Ao terminar a fase de execucao (antes de @qa):
  → Avisar: "Implementacao pronta. Troque para Opus com /model opus e diga 'continua'."

Quando Jonathan disser "continua" apos a troca:
  → Retomar exatamente de onde parou e delegar pro proximo agente.
```

---

## 11. Padrao de API Route (pos-EPIC-001)

### Novo padrao com defineRoute (recomendado para rotas novas)
```typescript
import { defineRoute } from "@/lib/api-handler";
import { z } from "zod";

const InputSchema = z.object({ campo: z.string() });

export const POST = defineRoute({
  requireRoles: ["admin", "desenvolvedor"],
  inputSchema: InputSchema,
  handler: async (_req, { user, body }) => {
    // user.id, user.role disponiveis
    // body ja validado pelo schema
    return NextResponse.json({ ok: true });
  },
});
```

### Padrao legado (ainda funcional, migrar gradualmente)
```typescript
import { requireAuth } from "@/lib/auth-server";
// usar requireAuth() em vez de createServerSupabase() + getUser() manual
```
