# Alisson ERP — fabricaAJ

> **Todo agente DEVE ler este arquivo antes de qualquer task.**
> **Esta é a FONTE ÚNICA DE VERDADE do projeto.** Substitui o antigo `AGENTS.md` (opencode).
> Se algo conflitar com outro doc, este arquivo vence.

**Stack:** Next.js 16.1.6 | React 19 | PostgreSQL 15 (Supabase self-hosted) | TailwindCSS v4 | Zustand
**Versao:** v2.83.5 | **Branch:** `homolog` (nunca main direto)
**Docs completos:** `docs/arquitetura.md` | **Changelog:** `docs/CHANGELOG.md`

> Projeto **100% desenvolvido por IA**. A disciplina de processo (§0) é o que mantém a qualidade — leia a §0 ANTES de qualquer coisa.

---

## 0. Como Trabalhar Neste Projeto (LEIA PRIMEIRO)

### Fluxo orientado a plano — INVIOLÁVEL

```
1. RESUMO SEM JARGÃO — antes de qualquer trabalho, apresentar ao Jonathan um resumo
   em português simples do que será feito. Sem termos técnicos.

2. APROVAÇÃO — nada começa sem o "ok" explícito do Jonathan.

3. PLANO TÉCNICO — aprovado o resumo, criar o plano de implementação técnica
   (passo a passo, arquivos, impactos).

4. EXECUÇÃO ESTRITA AO PLANO — os agentes seguem o plano à risca.
   NADA é executado fora do plano. Tudo que for feito tem que estar no plano.

5. MUDANÇA NO MEIO DO CAMINHO — se o agente encontrar uma melhoria ou problema
   fora do escopo aprovado:
     a) PARA. Não implementa.
     b) AVISA o Jonathan: o que é e por que ajudaria o sistema.
     c) Refaz o RESUMO SEM JARGÃO e adiciona o item ao plano.
     d) Só executa DEPOIS de aprovado e DENTRO do plano.

   Regra de ferro: TUDO tem que estar no plano. NADA fora dele.
```

### House Rules

```
- NUNCA alterar código, banco ou arquivos sem aprovação explícita do Jonathan.
  Mesmo em "modo build", qualquer modificação precisa de autorização prévia.
- NÃO gastar tokens à toa — direto ao ponto, sem exploração desnecessária,
  sem retrabalho. Eficiência é regra.
- PRÉVIAS VISUAIS para o Jonathan: enviar SEMPRE como imagem/GIF animado,
  que abre direto na conversa sem precisar salvar. HTML interativo só como
  complemento opcional (o app do Claude pode baixar em vez de abrir).
- COMENTAR A REGRA DE NEGÓCIO (em PT) em todo código novo ou alterado:
    • O QUÊ o trecho faz
    • O PORQUÊ (a regra de negócio por trás)
    • O IMPACTO se for alterado/removido (o que vai quebrar)
  Use `//` para one-liners e `/** */` para blocos no topo de funções/arquivos.
  A migration 292 é um bom exemplo desse padrão de comentário.
```

### Gestão de contexto (MANUAL por enquanto)

```
Quando o contexto chegar a ~50%:
  1. Salvar um arquivo .md (em docs/ ou raiz) com o PRÓXIMO PASSO a executar.
  2. PEDIR ao Jonathan para dar /clear.
  3. Após o /clear, retomar lendo esse .md.

(Por enquanto é manual — Jonathan quer ver o processo acontecer antes de automatizar.
 Depois isso vira um hook via /update-config.)
```

### Blindagem & engenharia — princípio permanente

```
- NUNCA duplicar tabelas. NUNCA duplicar código. Reusar o que já existe.
- Tudo que for construído deve ser BLINDADO contra problemas futuros.
- Agir SEMPRE com boas práticas e arquitetura/engenharia de software modernas.
- Adicionar features, NUNCA refatorar código que funciona (ver §2 Database Safety).
```

---

## 1. Arquitetura Rapida

| Schema | Permissao | Conteudo |
|--------|-----------|----------|
| `alissonerp` | Leitura+Escrita | 139 tabelas, 71 views, 55 triggers — ERP fabrica |
| `public` | READONLY | 65 tabelas, 45 views — contatos (=clientes), vendedores, produtos, vendas, user_profiles |
| `directus` | READONLY | 110 tabelas (so ~15 ainda lidas) — ordens, pcp, apontamento, controle_estoque, protocolo (legado) |
| `crm` | NAO USADO PELO ERP | 31 tabelas, 13 funcoes — modulo CRM com IA, conversas WhatsApp/Meta, automacoes (provavelmente projeto paralelo no mesmo banco) |
| `auth` | Supabase GoTrue | use `supabase.auth.*` |
| `storage` | Supabase Storage | use `supabase.storage.*` |

> **Mapeamento exaustivo do banco:** ver `docs/db-mapping/` (377 tabelas, 321 funcoes, 148 triggers, 122 views, 234 RLS policies, todos com cross-reference ao codigo).

**Acesso DB:** API routes Next.js com `postgres` npm (SQL direto via `src/lib/db.ts`).
**NUNCA** usar `supabase.from()` para schema alissonerp (PostgREST bug — retorna `[]` silenciosamente).
`supabase.auth.getUser()` e `supabase.storage` funcionam normalmente.
**Escrita no banco (INSERT/UPDATE/DELETE/migration) exige aprovação — ver §0 House Rules e §2 Database Safety.**

**Storage:** Upload SEMPRE server-side via `src/lib/storage.ts`.
- Buckets PUBLICOS (avatars, imagens): `<img src={url}>` direto, sem signed URL
- Buckets PRIVADOS (protocolo-fotos, apontamento-fotos, ordem-fotos): signed URL via `supabase.storage.createSignedUrl()`, TTL 1h, NUNCA armazenar a URL gerada

**Auth:** Supabase GoTrue. Role de `alissonerp.usuarios.role` (VARCHAR). Permissoes granulares: `src/lib/permissoes.ts`.

---

## 2. Regras Inviolaveis

### Pre-Codigo
```
1. Ler este CLAUDE.md (em especial a §0)
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

### Assinatura de Mudancas no Banco — OBRIGATORIO (toda mudanca, sempre)
```
O token de acesso ao banco de PRODUCAO e COMPARTILHADO entre a IA do Jonathan
(Claude Code) e a IA do chefe. Para rastrear QUEM mexeu, TODO agente DEVE assinar
ANTES de qualquer DDL/DML manual no banco (view, funcao, trigger, INSERT/UPDATE/DELETE):

  SELECT alissonerp.assinar_mudanca_banco(
    '<autor>',     -- quem AUTORIZOU: 'alisson' | 'jonathan' | 'chefe' — SEMPRE quem de fato mandou (nunca assinar por outro)
    '<agente>',    -- ferramenta executora: 'claude-code' | 'ia-chefe'
    '<descricao>', -- o que muda, em linguagem clara
    '<sql>'        -- o SQL aplicado (resumo fiel)
  );

E setar a etiqueta da conexao ANTES de conectar:  PGAPPNAME='claude-code-jonathan'
(a IA do chefe deve usar a sua propria etiqueta, ex 'ia-chefe';
sessoes do Alisson via Claude Code Web usam PGAPPNAME='claude-code-alisson' e autor 'alisson').

Livro: alissonerp.log_mudancas_banco (append-only, criado na migration 303).
Captura sozinho app_name + IP de origem + usuario. NUNCA pular a assinatura.
REGRA DE DEFESA: mudanca que aparece no banco e NAO esta no livro = nao foi o Jonathan.
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
fn_processar_transferencia (019) — nome do ARQUIVO eh _saida.sql, mas a funcao se chama sem _saida
fn_processar_fechamento_dist (020)
fn_concluir_protocolo
fn_processar_auditoria
fn_criar_servico_from_pcp (092)
fn_calcular_peso_pedra_gramas (092)
Schemas: public.* e directus.* sao READONLY
Schema crm.* nao eh usado pelo codigo do ERP — nao tocar
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
postgres.js: BIGINT volta como STRING, INTEGER como number — `vendas_erp.vendedor_id` e `public.vendedores.id_vendedor` sao BIGINT, `fechamento_comissao_itens.consultora_id` e INTEGER. Cruzar as duas fontes numa chave de Map/Set SEM `::int` no SELECT duplica a linha (cada vendedora apareceu 2x no extrato de comissao, 03/08/2026). tsc NAO pega — so o driver rodando pega. Sempre `::int` (ou `Number()`) antes de virar chave.
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
tem_pedra_preciosa = joia COM pedra, NUNCA usar para classificar pedra solta — usar ehPedraSolta() de src/lib/compras-pedras.ts (categoria 'Pedras' OU produto_pedra_extras OU nome COMEÇA com nome de pedra; includes() no nome era o bug do AJ5079)
camera mobile: navigator.mediaDevices undefined em HTTP — fallback input[type=file]
movimentacoes_estoque.local_estoque_id: NOT NULL
Estoque comercial: inserir item de venda CRIA RESERVA (nunca saida direta) — reserva vira saída NA ENTREGA (confirmação do recebimento/retirada). Aprovar a venda NÃO baixa estoque — só baixa a conta a receber (financeiro, mig 299). Ver comercial.md §3
Curva precificacao: chamar aplicarCurvaProduto() apos criar/editar produto com peso+categoria (src/lib/aplicar-curva-produto.ts)
Vale-troca: vale > total venda gera NOVO vale com troco (vale_origem_id rastreia cadeia) — cada vale usado UMA vez
Orcamento rascunho QuadradoCanal (Bordas Elevadas): 6 useEffects de auto-ajuste em OrcamentoClient.tsx (linhas ~911, ~968, ~988, ~1082, ~1135, ~1153) DEVEM começar com `if (isHydratingRef.current) return;` — sem isso, ao reabrir rascunho o sistema recalcula canalWidth/stoneRows/stoneCount e sobrescreve modelo/valor/peso negociados. Bug recorrente desde v2.42 — NUNCA REMOVER OS GATES.
ORDEM DE ALIANCA NAO NASCE SOZINHA (362, 27/07/2026): approveVenda NAO cria ordem quando orcamentos.tipo='alianca' — criarOrdemDoOrcamento so cria com opts.aroConfirmado, flag passada SO por POST /api/vendas/[id]/abrir-ordem (confirmacao do aro de cada alianca). Peca personalizada segue automatica. Trocar o aro recalcula peso (src/lib/orcamento-aro-peso.ts, por DELTA) e altera ordens.peso_metal_negociado, NUNCA orcamentos.peso/valor (base do preco). Ficha 2 so conta se quantidade=2. Ver docs/regras-negocio/comercial.md §12
ABC: classificar por receita_total_12m (ultimos 12 meses), NUNCA por capital (estoque * preco) — produto sem venda em 12m = C automatico
parametros_sistema: usar PARAM.X de src/lib/parametros.ts, NUNCA literals como deposito_id=1
reposicao de estoque: verificar SUM(disponivel) pre-reserva, nao SUM(saldo)
dupla-entrada: fn_criar_par_movimentacao agora retorna (saida_id, entrada_id) — capturar
updated_at guard: PATCH vendas aceita client_updated_at → 409 se modificado por outro usuario
audit: logAudit(tx, ...) dentro da mesma transacao — nunca falha a operacao principal
catches silenciosos: usar useErrorStore.getState().push() em vez de .catch(() => {})
defineRoute: novo padrao de API route — ver src/lib/api-handler.ts
fila_sync: erros Tiny vao para fila_sync_externo, nao bloqueiam a operacao principal
itens_inventario_comercial.diferenca: coluna GERADA pelo banco — NUNCA escrever nela via UPDATE (mig 336 blinda)
inventario comercial: "conferido" != "contado" — marcar conferido NUNCA grava quantidade_contada (bug v2.79 gravava qtd do sistema = contagem falsa)
inventario comercial: NAO ajusta estoque ao concluir (auditoria pura); roles em ROLES_INVENTARIO_* de src/lib/roles.ts; regras em docs/regras-negocio/comercial.md §7
inventario comercial: PECA PRONTA filtrada na LEITURA via condPecaPronta() de src/lib/inventario-peca-pronta.ts (GET/concluir/contar/app) — vale ate para inventario aberto antes da regra; snapshot novo tambem exclui (v2.81.4)
inventario comercial: fechar pendencia como resolvida EXIGE desfecho_tipo (mig 338) — venda_sem_baixa valida a venda e EFETIVA a reserva junto com a saida (senao disponivel cai em dobro); desfecho com movimento nao se desfaz (409, exige estorno)
baixa manual de estoque NAO EXISTE por cargo (v2.81.3) — /movimentos recusa QUALQUER saida (403, ate admin/dev); movimento so por CONCILIACAO com documento conferido (falta<->venda sem baixa, sobra<->devolucao sem entrada), exclusiva de ROLES_BAIXA_MANUAL (admin/dev) + dupla confirmacao; desfecho 'perda' do INVENTARIO = so registro, SEM baixa
PERDA/EXTRAVIO (354, 21/07/2026): UNICA baixa manual do ERP, endpoint proprio /api/estoque-comercial/perda, gate por IDENTIDADE (isMasterAdmin -> parametros_sistema.MASTER_ADMIN_USER_ID), NUNCA por role — nem admin nem dev; estorno de perda tambem so o master; limitada ao DISPONIVEL; motivo 'perda_extravio' em src/lib/perda-extravio.ts; ver docs/regras-negocio/comercial.md §11
```

---

## 4. Sistema de Agentes (Claude Code)

> Os agentes rodam como **skills do Claude Code** (`/gerente`, `/backend`, `/frontend`, `/qa`),
> definidos em `.claude/commands/`. (O fluxo antigo `@aiox-master`/opencode foi descontinuado.)

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
Jonathan -> /gerente (resumo sem jargao -> aprovacao -> plano tecnico -> delega)
  +-- /backend (DB + API) -> implementa SEGUINDO O PLANO -> tsc -> reporta
  +-- /frontend (UI) -> implementa SEGUINDO O PLANO -> tsc -> reporta
  +-- /qa (revisa TUDO) -> APROVADO / REJEITADO
       APROVADO -> /gerente reporta a Jonathan -> aguarda teste
       REJEITADO -> volta ao especialista -> corrige -> QA re-revisa

Nenhum agente executa nada fora do plano aprovado (ver §0).
QA nunca eh pulado. Push para main exige aprovacao explicita (ver §2 Git).
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
operador_inventario -> VE tudo do estoque + conta via RFID; NAO edita nada direto (abrir/concluir/cancelar inventario = solicitacao aprovada pelo admin, mig 339)
pcp              -> PCP completo

Fonte de verdade: alissonerp.usuarios.role (VARCHAR(50))
Constantes: src/lib/roles.ts (NUNCA hardcoded)
Permissoes granulares: src/lib/permissoes.ts -> temPermissao()
```

---

## 7. Pos-Task

```
1. npx tsc --noEmit (ZERO erros obrigatorio)
2. Reportar o que foi feito (e confirmar que ficou DENTRO do plano — ver §0)
3. Commit/push: seguir regra Git secao 2 (fixes = auto, features = aguarda)
4. Aguardar Jonathan testar (features e migrations)
5. Atualizar docs afetadas (ver §9): docs/arquitetura.md, docs/CHANGELOG.md,
   memory files, este CLAUDE.md (se mudou algo estrutural)
```

---

## 8. Padrao de API Route (pos-EPIC-001)

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

---

## 9. Documentacao Sempre em Sincronia (OBRIGATORIO)

Toda alteracao no codigo — bug, refatoracao ou feature — DEVE atualizar a documentacao afetada no MESMO commit.

Arquivos de documentacao do projeto:
- `CLAUDE.md` (este — fonte unica de verdade)
- `MEMORY.md` / `docs/claude-memory/MEMORY.md`
- `docs/arquitetura.md`
- `docs/CHANGELOG.md`
- `ESTRUTURA_ATUAL.md`
- `.aiox/knowledge/context.md`

O que atualizar:
- Arquivo criado/deletado/renomeado → atualizar referencias em todos os docs
- Componente adicionado/removido → atualizar lista de componentes
- Comportamento alterado → atualizar descricao do comportamento
- Contagens (ex: "5 modais") → recalcular e corrigir

Regra: se o commit altera codigo mas nao atualiza docs afetadas, o trabalho NAO esta completo. Docs desatualizadas sao bugs.

---

## 10. Referencias

- **Mapeamento exaustivo do banco:** `docs/db-mapping/` — 7 schemas, 377 tabelas, 321 funcoes (com corpo), 148 triggers, 122 views, 234 RLS policies, cross-reference com codigo. Comecar em `docs/db-mapping/README.md`.
- **Schema doc resumido por categoria:** `docs/schema/` (alissonerp-vendas, -pcp, -estoque, -admin, -ordens, -outros, public, directus)
- **Regras de negócio (mantido à MÃO, por módulo):** `docs/regras-negocio/` (ex.: `comercial.md`) — o PORQUÊ/COMO do negócio (≠ schema auto-gerado). LER o arquivo do módulo ANTES de mexer nele e MANTER atualizado (regra nova → acrescenta; mudou → corrige).
- **Arquitetura completa:** `docs/arquitetura.md` (~155KB)
- **Dominio ERP (schemas, fluxos, tabelas):** `docs/claude-memory/MEMORY.md`
- **Memory files:** `~/.claude/projects/.../memory/`
- **API Routes (280+):** ver memory `project_api_routes.md`
- **Modulo Service:** ver memory `project_modulo_service.md`
- **Storage Buckets:** ver memory `project_storage_buckets.md`
- **Usuarios teste:** ver `docs/claude-memory/MEMORY.md` secao 17
