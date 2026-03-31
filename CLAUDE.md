# Alisson ERP — fabricaAJ

> **Todo agente DEVE ler este arquivo antes de qualquer task.**

**Stack:** Next.js 16.1.6 | React 19 | PostgreSQL 15 (Supabase self-hosted) | TailwindCSS v4 | Zustand
**Versao:** v2.15.0 | **Branch:** `homolog` (nunca main direto)
**Docs completos:** `docs/arquitetura.md` | **Changelog:** `docs/CHANGELOG.md`

---

## 1. Arquitetura Rapida

| Schema | Permissao | Conteudo |
|--------|-----------|----------|
| `alissonerp` | Leitura+Escrita | ~45 tabelas, ~32 views, ~22 triggers — ERP fabrica |
| `public` | READONLY | contatos (=clientes), vendedores, produtos, vendas, user_profiles |
| `directus` | READONLY | ordens, pcp, apontamento, controle_estoque, protocolo (legado) |

**Acesso DB:** API routes Next.js com `postgres` npm (SQL direto via `src/lib/db.ts`).
**NUNCA** usar `supabase.from()` para schema alissonerp (PostgREST bug — retorna `[]` silenciosamente).
`supabase.auth.getUser()` e `supabase.storage` funcionam normalmente.

**Storage:** Buckets PUBLICOS, upload SEMPRE server-side via `src/lib/storage.ts`, `<img src={url}>` direto. NUNCA `createSignedUrl()`.

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
NUNCA commit/push sem autorizacao EXPLICITA do Jonathan
NUNCA merge ou push direto na main — alertar e confirmar
SEMPRE branch homolog
Formato: feat|fix|chore: descricao (vX.Y.Z)
"Funcionou", "ok", "testei" NAO sao autorizacao
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
3. NAO fazer commit/push
4. Aguardar Jonathan testar
5. Atualizar: MEMORY.md (se mudou algo estrutural), arquitetura.md (se mudou arquitetura), CHANGELOG.md
```

---

## 8. Referencias

- **Arquitetura completa:** `docs/arquitetura.md` (140KB)
- **Memory files:** `~/.claude/projects/C--Users-jonat/memory/`
- **API Routes (88):** ver memory `project_api_routes.md`
- **Modulo Service:** ver memory `project_modulo_service.md`
- **Storage Buckets:** ver memory `project_storage_buckets.md`
- **Usuarios teste:** ver MEMORY.md secao 21
