# Regras para Agentes — Alisson ERP (fabricaAJ)

> Este documento é OBRIGATÓRIO. Todo agente DEVE ler antes de qualquer task.
> Violação de qualquer regra é considerada GRAVE.

---

## 1. ANTES DE QUALQUER CÓDIGO

```
1. Ler fabricaAJ/MEMORY.md inteiro
2. Ler fabricaAJ/docs/arquitetura.md
3. Ler fabricaAJ/docs/referencia-storage-imagens.md (se envolver fotos/upload)
4. SELECT column_name de CADA tabela antes de usar
5. NUNCA adivinhar nomes de colunas/tabelas
6. Verificar se o que vai criar JÁ EXISTE no banco (colunas, buckets, etc.)
```

---

## 2. GIT — REGRAS INVIOLÁVEIS

```
❌ NUNCA fazer commit ou push sem autorização EXPLÍCITA do Jonathan
❌ NUNCA fazer merge ou push direto na main
✅ SEMPRE trabalhar na branch homolog
✅ SEMPRE aguardar Jonathan testar antes de pedir push
✅ Quando Jonathan autorizar: commit com mensagem descritiva + tag SemVer
```

**Formato de commit:**
```
feat: descrição (vX.Y.Z)   → nova feature
fix: descrição (vX.Y.Z)    → correção de bug
chore: descrição (vX.Y.Z)  → manutenção/docs
```

**Versionamento SemVer:**
- MAJOR (vX.0.0) = quebra de compatibilidade
- MINOR (v2.X.0) = nova feature
- PATCH (v2.9.X) = fix de bug

**VIOLAÇÃO REGISTRADA:** Em 20/03/2026 um agente fez push sem autorização. Isso NUNCA deve se repetir.

---

## 3. BANCO DE DADOS

```
⚠️ BACKUP OBRIGATÓRIO antes de qualquer:
   - Migration / ALTER TABLE / DELETE / TRUNCATE
   - Operação destrutiva de qualquer tipo

⚠️ Migration criada ≠ migration executada
   - SEMPRE executar o SQL no banco após criar o arquivo
   - Validar com SELECT que as colunas/tabelas existem

⚠️ CREATE OR REPLACE, ADD COLUMN IF NOT EXISTS
   - Nunca criar duplicatas

⚠️ Constraints imutáveis:
   - Depósito ID=1 = Almoxarifado Central (pote) — NUNCA registra quebra
   - Insumo ID=1 = Ouro 18k Amarelo
   - Categoria ID=1 = Metal/Ouro | ID=2 = Pedras
   - public.produtos = READONLY (não alterar)
   - directus.* = READONLY (não alterar)
```

---

## 4. PITFALLS CONHECIDOS — DECORAR

```
⚠️ tipo_auditoria (NÃO "tipo") na tabela auditorias
⚠️ itens_ordem de DUAS fontes:
   - directus.itens_ordem_1 (PDV) + alissonerp.itens_ordem (ERP)
⚠️ servico_loja: enum existe no banco MAS escondido do frontend
⚠️ INTEGER vs UUID: ordens.id=INTEGER, usuarios.id=UUID — NUNCA comparar sem cast
⚠️ created_by recebe user.id (UUID) → sempre cast ::uuid
⚠️ contatos.id_contato (NÃO contatos.id) — PK real
⚠️ public.produtos.id_produto (NÃO id) — PK real, BIGINT
⚠️ directus.ordens.peso_metal_negocido (TYPO sem A)
⚠️ distribuicao_ordens.ordens_id (NÃO ordem_id)
⚠️ sql.begin(): parâmetro do callback usar 'tx' NÃO 'sql' (conflito de tipo)
⚠️ getPublicUrl: guard se já começa com http (evita URL duplicada)
⚠️ depositoId: NUNCA fallback silencioso — erro 400 se sem operador
⚠️ user_profiles: PK em id_user + UNIQUE em email — JOINs sempre por id_user
⚠️ Estorno: filtrar CEs por obs ILIKE '%distribuicao #ID%'
⚠️ IA float: Math.abs(a-b) < 0.005 em vez de ===
⚠️ Peso ouro: sempre 2 casas decimais (.toFixed(2) ou formatPeso())
⚠️ Pedras: quantidade em UN, nunca exibir como gramas
⚠️ fn_concluir_protocolo / fn_processar_auditoria: NÃO MEXER
```

---

## 5. STORAGE / IMAGENS

```
✅ TODOS os buckets são PÚBLICOS (public = true)
✅ Upload SEMPRE server-side via src/lib/storage.ts
✅ Salvar URL COMPLETA no banco (não path/filename)
✅ Frontend: <img src={campo}> direto — SEM signed URLs
✅ Views DEVEM incluir coluna foto no SELECT
✅ upsert: true no upload (sobrescreve se existe)
❌ NUNCA usar createSignedUrl()
❌ NUNCA upload client-side (supabase.storage.from().upload() no browser)
```

---

## 6. DOCUMENTAÇÃO — MANTER ATUALIZADA

```
Após CADA task concluída:
1. Atualizar MEMORY.md se mudou algo estrutural (tabela, coluna, API, regra)
2. Atualizar arquitetura.md se mudou arquitetura técnica
3. Atualizar docs/CHANGELOG.md com a versão e o que mudou

REGRA: Todo push DEVE atualizar o CHANGELOG.md

Documentos de referência:
- MEMORY.md → Estado atual do sistema (sobrescreve)
- docs/arquitetura.md → Arquitetura técnica (sobrescreve)
- docs/CHANGELOG.md → Histórico por versão (append-only, nunca deleta)
- docs/referencia-storage-imagens.md → Padrão de upload
- AGENT-RULES.md → Este documento (regras dos agentes)
```

---

## 7. WORKFLOW DE DESENVOLVIMENTO

```
1. Receber task do Jonathan (via prompt)
2. LER toda documentação relevante (MEMORY, arquitetura, storage)
3. SELECT nas tabelas envolvidas (nunca adivinhar)
4. Se task complexa: REPORTAR plano antes de implementar
5. Implementar com cuidado (fix cirúrgico quando possível)
6. npx tsc --noEmit (ZERO erros obrigatório)
7. Reportar o que foi feito
8. AGUARDAR Jonathan testar
9. AGUARDAR Jonathan autorizar push
10. SÓ ENTÃO: commit + push + atualizar CHANGELOG
```

---

## 8. REGRAS DE SEGURANÇA — OURO É DINHEIRO

```
- Movimentações de estoque: SEMPRE dupla-entrada (débito + crédito)
- Estorno: criar movimentações REVERSAS (nunca deletar originais)
- Quebra: só registrar quando total_metal > 0 (sem ouro = sem quebra)
- Metal externo: subtrair do PMC (ouro do cliente ≠ ouro da joalheria)
- Pedras: baixa definitiva na saída PCP (SP consumidas + QBP quebra)
- Pote (dep 1): NUNCA registra quebra
- Ouro: rastrear 100% — toda grama conta
```

---

## 9. ZONAS DE EXCLUSÃO

```
❌ NÃO alterar triggers sem autorização explícita:
   - fn_processar_apontamento_pcp (018)
   - fn_processar_transferencia_saida (019)
   - fn_processar_fechamento_dist (020)
   - fn_concluir_protocolo
   - fn_processar_auditoria

❌ NÃO alterar schemas readonly:
   - public.* (PDV/Tiny) — READONLY
   - directus.* (legado CMS) — READONLY

❌ Zona de exclusão entre agentes:
   - Agente A: PCP + Distribuição + Transferência + Saída + Ordens
   - Agente B: Produtos + Precificação + Dashboard + Mobile + Docs
   - Agente NÃO mexe na área do outro
```

---

## 10. ROLES DO SISTEMA

```
desenvolvedor = TUDO (super-admin)
admin = TUDO
gerente_fabrica = PCP + estoque + protocolo
gerente_loja = ordens + protocolo + precificação
ourives = PCP (só depósito dele)
motoboy = protocolo (PWA mobile)
consultora = ordens (só as dela) + conferência
pcp = PCP completo
estoquista_fabrica = estoque fábrica
estoquista_loja = estoque loja

Constantes em src/lib/roles.ts (NUNCA hardcoded)
ROLES_FULL_ACCESS = ['admin', 'desenvolvedor']
```

---

## 11. AO FINALIZAR QUALQUER TASK

```
1. Reportar o que foi feito (tabela checklist)
2. Informar se tem TypeScript erros
3. NÃO fazer commit/push
4. Perguntar: "Jonathan quer testar antes de avançar?"
5. Aguardar resposta
```
