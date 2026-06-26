# Runbook: Deploy para Homolog e Promoção para Main

**Módulo:** DevOps / CI-CD  
**Severidade:** Informativo (procedimento padrão)  
**Tempo estimado:** 10–20 min

---

## Visão Geral

Todo código vai primeiro para `homolog` (preview Vercel) → teste → promoção para `main` (produção Vercel automática).

**Nunca** fazer push direto em `main` sem passar por `homolog`.

---

## Checklist de Deploy

### Pré-Deploy (obrigatório)

- [ ] **1. Verificar erros TypeScript**
  ```bash
  npx tsc --noEmit
  ```
  Deve retornar zero erros. **Não avançar se houver erros.**

- [ ] **2. Verificar lint (opcional mas recomendado)**
  ```bash
  npm run lint
  ```

- [ ] **3. Confirmar branch correta**
  ```bash
  git branch --show-current
  # Deve ser: homolog
  ```
  Se estiver em outra branch, fazer merge para `homolog` primeiro.

---

### Deploy para Homolog

- [ ] **4. Commitar mudanças**
  ```bash
  git add -A
  git commit -m "feat|fix|chore: descricao clara (vX.Y.Z)"
  ```
  Formato do commit: seguir Conventional Commits com versão.  
  Exemplos:
  - `feat: crediário — tela de aprovação (v2.37.0)`
  - `fix: paginação PCP retornando 500 (v2.36.7)`

- [ ] **5. Push para homolog**
  ```bash
  git push origin homolog
  ```

- [ ] **6. Aguardar build no Vercel**
  - Acessar [Vercel Dashboard](https://vercel.com) → projeto `fabricaAJ`
  - Verificar build do branch `homolog` (preview URL gerada automaticamente)
  - Build deve concluir sem erros

---

### Teste em Preview

- [ ] **7. Testar funcionalidades tocadas**
  - Abrir a preview URL gerada pelo Vercel
  - Testar o fluxo completo das funcionalidades alteradas
  - Verificar console do browser por erros JavaScript
  - Testar com usuário de teste (pedir credenciais ao Jonathan se necessário)

- [ ] **8. Confirmar ausência de regressões**
  - Testar pelo menos um fluxo adjacente à mudança
  - Ex.: se alterou PCP, verificar também a tela de apontamentos

---

### Promoção para Main (Produção)

Executar **apenas após teste aprovado em homolog**.

- [ ] **9. Merge homolog → main**
  ```bash
  git checkout main
  git merge homolog
  git push origin main
  git checkout homolog
  ```

- [ ] **10. Aguardar deploy de produção**
  - Vercel faz deploy automático ao receber push em `main`
  - Acompanhar no Dashboard — geralmente 2–4 minutos

- [ ] **11. Smoke test em produção**
  - Acessar a URL de produção
  - Verificar as funcionalidades críticas alteradas
  - Confirmar que não há erros 500 ou tela branca

---

## Regras de Commit por Tipo de Mudança

| Tipo | Fluxo | Autorização para main |
|------|-------|----------------------|
| Bug fix / ajuste UI / texto | Commit → push homolog → merge main automático | Não precisa (fix pequeno) |
| Feature nova | Commit → push homolog → **aguardar Jonathan testar** | Jonathan confirma explicitamente |
| Migration de banco | Commit → push homolog → **aguardar Jonathan testar** | Jonathan confirma explicitamente |
| Mudança estrutural | Commit → push homolog → **aguardar Jonathan testar** | Jonathan confirma explicitamente |

---

## Troubleshooting

### Build falha no Vercel
1. Verificar logs do build no Dashboard Vercel
2. Rodar `npx tsc --noEmit` localmente — geralmente é erro de TypeScript não detectado
3. Corrigir o erro, commitar e fazer push novamente

### Preview URL com erro 500
1. Verificar logs de runtime no Vercel (Functions tab)
2. Verificar se variáveis de ambiente estão configuradas no Vercel (Settings > Environment Variables)
3. Confirmar que a migration correspondente foi executada no banco

### Conflito de merge
```bash
# Resolver conflito e continuar
git checkout main
git merge homolog
# resolver conflitos manualmente
git add .
git commit -m "chore: resolver conflito merge homolog->main"
git push origin main
git checkout homolog
```

---

## Rollback de Produção

Se o deploy em main causar problema crítico:
```bash
# Reverter para o commit anterior em main
git checkout main
git revert HEAD --no-edit
git push origin main
```

Ou no Vercel Dashboard → **Deployments** → deployment anterior → **Promote to Production**.
