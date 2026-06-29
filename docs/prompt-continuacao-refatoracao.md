# PROMPT — Continuação da Refatoração das Páginas de Configurações

## Contexto

Já refatoramos 12 das 19 tabs do módulo `/configuracoes` seguindo o design system do TailAdmin + Tailwind CSS v4 com a paleta de cores do ERP Alisson. As páginas que **ainda precisam** de refatoração completa são:

| Página | Tab no código | Linhas atuais | Prioridade | Complexidade |
|---|---|---|---|---|
| IA | `TabIA.tsx` | 550 | ALTA | Média |
| Teores de Ouro | `TabTeores.tsx` | 267 | ALTA | Baixa (já refatorada parcialmente) |
| Tipos de Serviço | `TabTiposServico.tsx` | 308 | ALTA | Baixa (já refatorada parcialmente) |
| Comissões | `TabComissoes.tsx` | 204 | ALTA | Baixa (já refatorada parcialmente) |
| Fretes | `TabFretes.tsx` | 359 | ALTA | Média (já refatorada parcialmente) |
| Gateways | `TabGateways.tsx` | 279 | ALTA | Baixa (já refatorada parcialmente) |
| Metal | `TabMetal.tsx` | 201 | ALTA | Baixa (já refatorada parcialmente) |
| Aprovadores | `TabAprovadores.tsx` | 412 | ALTA | Alta (usa P palette, UI legacy) |
| Permissões | `TabPermissoes.tsx` | 510 | MÉDIA | Alta (já refatorada) |
| Maquininhas | `TabMaquininhas.tsx` | 423 | MÉDIA | Média (já refatorada) |
| Depósitos | `TabDepositos.tsx` | 334 | MÉDIA | Média (já refatorada) |
| Produto Visibilidade | `TabProdutoVisibilidade.tsx` | 146 | BAIXA | Baixa (legado) |

---

## Padrão de UI Estabelecido (O que aplicar em TODAS as páginas)

### 1. Estrutura de página

```tsx
export default function TabXxx() {
  return (
    <div>
      {/* Conteúdo direto, sem Card wrapper extra */}
      {/* O título já vem do ConfiguracoesClient */}
    </div>
  );
}
```

**Regra**: NÃO usar `<Card>` como wrapper principal — o título da página já é exibido pelo `ConfiguracoesClient`.

### 2. Componentes UI obrigatórios

| Componente | Import | Uso |
|---|---|---|
| Card | `@/components/ui/Card` | Seções internas com título |
| Table | `@/components/ui/Table` | Compound: Table, TableHeader, TableBody, TableRow, TableCell |
| Button | `@/components/ui/Button` | Todos os botões (nunca `<button>` inline) |
| Badge | `@/components/ui/Badge` | Status: success, error, warning, neutral, dourado |
| Switch | `@/components/ui/Switch` | Toggles com `checked` + `onChange` |
| InputField | `@/components/ui/InputField` | Campos de formulário com label/hint |
| Alert | `@/components/ui/Alert` | Mensagens de erro **inline** (não toast) |
| Modal | `@/components/ui/Modal` | Modais de confirmação/edição |
| Select | `@/components/ui/Select` | Dropdowns com opções |

### 3. Toast (notificações flutuantes)

```tsx
import { toast } from "sonner";

// Sucesso
toast.success("Item criado com sucesso");

// Erro
toast.error("Erro ao salvar");
```

**Regra**: Usar `toast` para ações bem-sucedidas (criar, editar, excluir, toggle). Usar `Alert` para erros inline de validação.

### 4. Paginação

```tsx
const ITENS_POR_PAGINA = 8; // ou 10 para listas longas
const [page, setPage] = useState(1);
const [search, setSearch] = useState("");

// Resetar página ao buscar
useEffect(() => { setPage(1); }, [search]);

const filtrados = search.trim() ? data.filter(...) : data;
const totalPages = Math.max(1, Math.ceil(filtrados.length / ITENS_POR_PAGINA));
const paginados = filtrados.slice((page - 1) * ITENS_POR_PAGINA, page * ITENS_POR_PAGINA);

// UI da paginação
{totalPages > 1 && (
  <div className="flex items-center justify-between pt-4">
    <p className="text-sm text-gray-500">Página {page} de {totalPages} ({filtrados.length} itens)</p>
    <div className="flex items-center gap-1.5">
      <Button size="sm" variant="outline" disabled={page === 1}>Anterior</Button>
      {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
        <button key={p} className={`w-8 h-8 rounded-lg text-xs font-medium ${p === page ? "bg-esmeralda-500 text-white" : "text-gray-600 hover:bg-gray-100"}`}>{p}</button>
      ))}
      <Button size="sm" variant="outline" disabled={page === totalPages}>Próximo</Button>
    </div>
  </div>
)}
```

### 5. Busca/Filtro

```tsx
<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
  <div className="relative flex-1 max-w-xs">
    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
    <input type="text" placeholder="Filtrar..." value={search} onChange={e => setSearch(e.target.value)}
      className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-4 text-sm focus:border-esmeralda-300 focus:ring-2 focus:ring-esmeralda-500/10 outline-none" />
    {search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={14} /></button>}
  </div>
  {/* Botão de ação (Novo, etc) */}
</div>
```

### 6. Classes recorrentes

```
Cards internos:         p-5 border border-gray-200 rounded-2xl lg:p-6
Título de card:         text-lg font-semibold text-gray-800
Descrição de card:      text-sm text-gray-500
Header de tabela:       px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider
Corpo de tabela:        px-6 py-4 text-sm text-gray-700
Loading:                flex items-center justify-center py-16
Spinner:                <Loader2 size={20} className="animate-spin text-gray-400" />
Empty state:            text-center py-12 text-gray-400
Botão primário:         <Button size="sm">...</Button>
Botão outline:          <Button size="sm" variant="outline">...</Button>
Botão ghost:            <Button size="sm" variant="ghost">...</Button>
```

### 7. Tratamento de erros

```tsx
const [erro, setErro] = useState<string | null>(null);

// Na renderização:
{erro && <Alert variant="error" message={erro} showClose onClose={() => setErro(null)} className="mb-4" />}
```

### 8. Loading state

```tsx
if (loading) return (
  <div className="flex items-center justify-center py-16">
    <Loader2 size={20} className="animate-spin text-gray-400" />
  </div>
);
```

### 9. Imports padronizados

```tsx
"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Search, X, Pencil, Save } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Switch } from "@/components/ui/Switch";
import { InputField } from "@/components/ui/InputField";
import { Alert } from "@/components/ui/Alert";
import { Table, TableHeader, TableBody, TableRow, TableCell } from "@/components/ui/Table";
```

**Regra**: NUNCA importar `P` de `./constants`. NUNCA usar `style={{ }}`. NUNCA usar `<table>` HTML puro. Usar sempre os componentes UI.

---

## Plano de Refatoração por Página

### Página 1: IA (`TabIA.tsx`) — 550 linhas

**Situação atual**: Já foi refatorada em parte, mas ainda tem problemas:
- Toggle de validação por IA
- Seleção de provedor (Claude, OpenAI, Gemini)
- Configuração de API Key  
- Margem de tolerância para pedras
- Ferramenta de teste de validação de peso

**O que ajustar**:

1. **Adicionar paginação**: Provedores são só 3, não precisa. Mas o toggle deve usar `<Switch>` (já está).
2. **Adicionar busca**: Não se aplica (não é lista).
3. **Adicionar toast**: Substituir os badges de feedback por `toast.success()` / `toast.error()` no salvamento de config e API key.
4. **Cards**: Verificar se cada seção usa `<Card>` corretamente (título, descrição).
5. **Tratamento de erro**: Usar `<Alert>` para erros de API.
6. **Loading state**: Já tem, verificar se usa `text-gray-400`.

### Página 2: Teores de Ouro (`TabTeores.tsx`) — 267 linhas

**Situação atual**: Já refatorada com Card + Table + Button + Badge.
**O que ajustar**: 
- Verificar se usa `toast` nos salvamentos (handleSave, handleSaveLiga)
- Verificar se toggles (ativo/inativo) usam `<Badge>`
- Confirmar que não tem `style={{ }}` ou `P.xxx`

### Página 3: Tipos de Serviço (`TabTiposServico.tsx`) — 308 linhas

**Situação atual**: Já refatorada.
**O que ajustar**:
- Adicionar `toast.success("Tipo criado com sucesso")` no handleCriar
- Adicionar `toast.success("Tipo atualizado")` no handleEditar
- Adicionar paginação se necessário
- Adicionar busca se necessário

### Página 4: Comissões (`TabComissoes.tsx`) — 204 linhas

**Situação atual**: Já refatorada.
**O que ajustar**:
- Adicionar `toast.success()` ao criar/editar faixa
- Adicionar paginação
- Badge de status já está ok

### Página 5: Fretes (`TabFretes.tsx`) — 359 linhas

**Situação atual**: Já refatorada com busca, paginação e toggles.
**O que ajustar**:
- Verificar paginação (já tem filtro, mas não paginação por página)
- Adicionar paginação: dividir a lista filtrada em páginas
- Toast para criar/editar frete (handleCriarFrete, handleSalvar)

### Página 6: Gateways (`TabGateways.tsx`) — 279 linhas

**Situação atual**: Já refatorada com Card + Table + Buttons.
**O que ajustar**:
- Adicionar toast ao criar/editar/excluir gateway
- Toggle de ativo/inativo já usa Button mas sem toast — adicionar toast
- Paginação se necessário

### Página 7: Metal (`TabMetal.tsx`) — 201 linhas

**Situação atual**: Já refatorada com Card + InputField + Button.
**O que ajustar**:
- Formulário: adicionar toast ao salvar (`toast.success("Configurações salvas")`)
- Erro: usar `<Alert>` para erroMsg
- Loading: verificar se usa spinner padrão

### Página 8: Aprovadores (`TabAprovadores.tsx`) — 412 linhas

**Situação atual**: Usa `P` palette, `style={{ }}`, botões inline. PRECISA DE REFATORAÇÃO COMPLETA.
**O que fazer**:
1. Remover TODOS os imports de `P` e `style={{ }}`
2. Substituir por classes Tailwind
3. Cada seção de aprovador virar um Card
4. Botões virar `<Button>`
5. Toggle/status usar `<Badge>`
6. Formulário de seleção de aprovador usar `<Select>`
7. Adicionar toast ao salvar
8. Adicionar Alert para erros

---

## Checklist de Verificação (por página)

Ao terminar cada página, verificar:

- [ ] `"use client"` no topo
- [ ] Sem `import { P } from "./constants"` (ou qualquer referência a `P.xxx`)
- [ ] Sem `style={{ }}` — zero ocorrências
- [ ] Sem `<table>` HTML puro — usar `<Table>` compound
- [ ] Sem `<button>` inline — usar `<Button>`
- [ ] Sem `<input>` inline básico — usar `<InputField>`
- [ ] Toggles usam `<Switch checked={} onChange={} />`
- [ ] Status usam `<Badge color="" />`
- [ ] Ações de sucesso usam `toast.success()`
- [ ] Ações de erro usam `toast.error()`
- [ ] Erros de validação inline usam `<Alert variant="error" />`
- [ ] Listas têm paginação (se + de 8 itens)
- [ ] Listas têm busca/filtro (se + de 8 itens)
- [ ] Loading state usa spinner padrão
- [ ] Empty state tem mensagem amigável
- [ ] Componentes UI importados do barrel `@/components/ui/Xxx`
- [ ] Ícones importados de `lucide-react` individualmente
- [ ] `useEffect` de reset de página: `useEffect(() => { setPage(1); }, [search]);`
- [ ] `const ITENS_POR_PAGINA = 8;` no topo do arquivo

---

## Regras de Negócio — NUNCA ALTERAR

1. **TODAS as chamadas de API** (`fetch`, `supabase.from()`, etc.) devem permanecer idênticas
2. **TODOS os estados** (`useState`) que armazenam dados de negócio devem ser mantidos
3. **TODAS as funções de negócio** (`handleSave`, `handleDelete`, `toggleXxx`, etc.) devem manter a mesma lógica
4. **NENHUMA validação de formulário** deve ser removida ou alterada
5. **NENHUM fluxo de autorização/permissão** deve ser modificado
6. Apenas a **camada de apresentação** (JSX/HTML) e os **imports** devem ser alterados

---

## Ordem de Execução Recomendada

1. Gateways (simples, 279 linhas)
2. Metal (simples, 201 linhas)
3. Tipos de Serviço (simples, 308 linhas)
4. Comissões (simples, 204 linhas)
5. Fretes (médio, 359 linhas)
6. Teores de Ouro (médio, 267 linhas)
7. IA (médio, 550 linhas)
8. Aprovadores (complexo, 412 linhas — refatoração completa)

---

## DEPOIS de refatorar todas as páginas

1. Rodar `npx next dev` e verificar que não há erros de compilação
2. Navegar por todas as 19 tabs de Configurações
3. Verificar que cada ação (criar, editar, excluir, toggle) funciona
4. Verificar responsividade em mobile (sem scroll horizontal)
5. Verificar que toasts aparecem corretamente
6. Limpar o arquivo morto `TabCotacoes.tsx` (se ainda existir)
7. NÃO commitar — branch `refactor/configuracoes`

---

## Referência Rápida de Cores do ERP

```
Esmeralda (primário): bg-esmeralda-500 (#184036), bg-esmeralda-50 (#E8F0ED)
Success (verde):      bg-success-50, text-success-600
Error (vermelho):      bg-error-50, text-error-600
Warning (âmbar):      bg-warning-50, text-warning-600
Dourado (accent):     text-dourado-DEFAULT (#DB9864), bg-dourado-light/40
Texto:                 text-gray-900 (principal), text-gray-500 (secundário), text-gray-400 (muted)
Borda:                 border-gray-200, border-gray-100
Fundo:                 bg-white, bg-gray-50
```
