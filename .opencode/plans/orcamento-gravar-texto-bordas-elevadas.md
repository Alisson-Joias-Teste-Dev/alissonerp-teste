# Plano: Remover travas do "Gravar Texto" para perfil "Bordas Elevadas"

**Arquivo:** `src\app\(dashboard)\orcamento\OrcamentoClient.tsx`

---

## Alteração 1 — Input do nome principal (linhas 2670-2679)

### ANTES:
```tsx
<input type="text" maxLength={20} value={activeParams.textContent}
  onChange={(e) => {
    // Sem espaços, só 1ª letra maiúscula, resto minúsculo
    const raw = e.target.value.replace(/\s/g, "");
    if (!raw) { updateParam("textContent", ""); return; }
    const formatted = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
    updateParam("textContent", formatted);
  }}
  placeholder="Nome (sem espaco)"
```

### DEPOIS:
```tsx
<input type="text" maxLength={activeProfile === ProfileType.QuadradoCanal ? 50 : 20} value={activeParams.textContent}
  onChange={(e) => {
    if (activeProfile === ProfileType.QuadradoCanal) {
      updateParam("textContent", e.target.value);
    } else {
      const raw = e.target.value.replace(/\s/g, "");
      if (!raw) { updateParam("textContent", ""); return; }
      const formatted = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
      updateParam("textContent", formatted);
    }
  }}
  placeholder={activeProfile === ProfileType.QuadradoCanal ? "Nome a gravar" : "Nome (sem espaco)"}
```

---

## Alteração 2 — Input dos textos adicionais (linhas 2688-2694)

### ANTES:
```tsx
<input type="text" maxLength={20} value={txt}
  onChange={(e) => {
    const raw = e.target.value.replace(/\s/g, "");
    const formatted = raw ? raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase() : "";
    const u = [...extras]; u[idx] = formatted; setExtras(u);
  }}
  placeholder="Nome ou data (sem espaco)"
```

### DEPOIS:
```tsx
<input type="text" maxLength={activeProfile === ProfileType.QuadradoCanal ? 50 : 20} value={txt}
  onChange={(e) => {
    if (activeProfile === ProfileType.QuadradoCanal) {
      const u = [...extras]; u[idx] = e.target.value; setExtras(u);
    } else {
      const raw = e.target.value.replace(/\s/g, "");
      const formatted = raw ? raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase() : "";
      const u = [...extras]; u[idx] = formatted; setExtras(u);
    }
  }}
  placeholder="Nome ou data (sem espaco)"
```

---

## Resumo

| Regra | Outros perfis | Bordas Elevadas |
|---|---|---|
| Texto obrigatório ao salvar | Sim | Sim |
| Limite de caracteres | 20 | **50** |
| Remover espaços | Sim | **Não (permite)** |
| Forçar 1ª maiúscula, resto minúscula | Sim | **Não (texto livre)** |

---

## Verificação pós-aplicação
- `ProfileType` já está importado no arquivo
- `activeProfile` já está definido na linha 373
- Rodar `npm run typecheck` e `npm run lint` após aplicar
