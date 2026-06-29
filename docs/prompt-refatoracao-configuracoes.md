# PROMPT MATADOR — Refatoração do Módulo /configurações
## Base: TailAdmin Design System + Tailwind CSS v4

---

# PARTE 1 — CATÁLOGO COMPLETO DA UI DO TAILADMIN

## 1.1 Design Tokens (fundação visual)

O TailAdmin define TODOS os seus tokens no `globals.css` via `@theme` do Tailwind v4:

```css
@theme {
  /* Cores semânticas com escala 25-950 */
  --color-brand-50..950: #ecf3ff → #162d6b      /* Azul primário */
  --color-success-50..950: #ecfdf3 → #054f31     /* Verde */
  --color-error-50..950: #fef3f2 → #7a271a        /* Vermelho */
  --color-warning-50..950: #fffaeb → #7a2e0e      /* Âmbar */
  --color-blue-light-50..950: #f0f9ff → #0c4a6e   /* Azul info */
  --color-gray-25..950: #fcfcfd → #101828          /* Cinza */
  --color-orange-25..950, --color-theme-pink, --color-theme-purple
  
  /* Sombras */
  --shadow-theme-xs:  0px 1px 2px 0px rgba(16,24,40,0.05)
  --shadow-theme-sm:  0px 1px 3px 0px rgba(16,24,40,0.10), 0px 1px 2px 0px rgba(16,24,40,0.06)
  --shadow-theme-md:  0px 4px 8px -2px rgba(16,24,40,0.10), 0px 2px 4px -2px rgba(16,24,40,0.06)
  --shadow-theme-lg:  0px 12px 16px -4px rgba(16,24,40,0.08), 0px 4px 6px -2px rgba(16,24,40,0.03)
  --shadow-focus-ring: 0px 0px 0px 4px rgba(70,95,255,0.12)
  
  /* Tipografia */
  --font-outfit: Outfit, sans-serif
  --text-title-2xl: 72px, --text-title-xl: 60px, --text-title-lg: 48px
  --text-title-md: 36px, --text-title-sm: 30px
  --text-theme-xl: 20px, --text-theme-sm: 14px, --text-theme-xs: 12px
  
  /* Z-index */
  --z-index-1..999999
}
```

## 1.2 Componentes UI do TailAdmin — Catálogo Completo

### BUTTON
- **Arquivo**: `src/components/ui/button/Button.tsx`
- **Props**: `size` ("sm"|"md"), `variant` ("primary"|"outline"), `startIcon`, `endIcon`, `disabled`, `onClick`, `className`
- **Classes sm**: `px-4 py-3 text-sm`
- **Classes md**: `px-5 py-3.5 text-sm`
- **Primary**: `bg-brand-500 text-white shadow-theme-xs hover:bg-brand-600 disabled:bg-brand-300`
- **Outline**: `bg-white text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50`
- **Base**: `inline-flex items-center justify-center font-medium gap-2 rounded-lg transition`

### BADGE
- **Arquivo**: `src/components/ui/badge/Badge.tsx`
- **Variant**: "light" (fundo claro, texto colorido) | "solid" (fundo sólido, texto branco)
- **Size**: "sm" (`text-theme-xs`) | "md" (`text-sm`)
- **7 cores**: primary, success, error, warning, info, light, dark
- **Exemplo success light**: `bg-success-50 text-success-600`
- **Exemplo success solid**: `bg-success-500 text-white`
- **Base**: `inline-flex items-center px-2.5 py-0.5 justify-center gap-1 rounded-full font-medium`

### ALERT
- **Arquivo**: `src/components/ui/alert/Alert.tsx`
- **4 variants**: success, error, warning, info
- **Estrutura**: `div > flex[span(icon) + div(title + message + optional Link)]`
- **Classes**: `border-{color}-500 bg-{color}-50` com dark mode
- **Ícones SVG inline** diferentes por variante

### MODAL
- **Arquivo**: `src/components/ui/modal/index.tsx`
- **Props**: `isOpen`, `onClose`, `showCloseButton` (default true), `isFullscreen`, `className`, `children`
- **Backdrop**: `fixed inset-0 bg-gray-400/50 backdrop-blur-[32px]`
- **Content**: `rounded-3xl bg-white` com botão X circular `bg-gray-100 hover:bg-gray-200`
- **Features**: ESC key close, body scroll lock, click-outside, `stopPropagation`

### TABLE
- **Arquivo**: `src/components/ui/table/index.tsx`
- **Compound**: Table, TableHeader, TableBody, TableRow, TableCell
- **TableCell** com prop `isHeader` → renderiza `<th>` em vez de `<td>`
- **Estilização aplicada via className** do pai (ex: header `bg-gray-50`, rows `border-b`)

### DROPDOWN
- **Arquivo**: `src/components/ui/dropdown/Dropdown.tsx` + `DropdownItem.tsx`
- **Click-outside**: `useRef` + `useEffect` com `mousedown` listener
- **DropdownItem**: polimórfico (`<Link>` ou `<button>` via prop `tag`)
- **Classes**: `absolute z-40 right-0 mt-2 rounded-xl border border-gray-200 bg-white shadow-theme-lg`

### CARD (ComponentCard)
- **Arquivo**: `src/components/common/ComponentCard.tsx`
- **Outer**: `rounded-2xl border border-gray-200 bg-white`
- **Header**: `px-6 py-5` com `h3 text-base font-medium text-gray-800`
- **Body**: `p-4 border-t border-gray-100 sm:p-6`

### AVATAR
- **Arquivo**: `src/components/ui/avatar/Avatar.tsx` + `AvatarText.tsx`
- **6 sizes**: xsmall(24px) a xxlarge(64px)
- **Status**: online (verde), offline (vermelho), busy (laranja), none
- **AvatarText**: iniciais com cor determinística (hash do nome)

### FORMS
- **Label**: `mb-1.5 block text-sm font-medium text-gray-700` (usa tailwind-merge)
- **InputField**: `h-11 rounded-lg border border-gray-300 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10`
- **Estados**: error (borda + texto vermelho), success, disabled, hint text
- **TextArea**: mesmo padrão do InputField
- **Select**: nativo com `appearance-none`, seta SVG inline, mesmo focus ring
- **Checkbox**: hidden native + div estilizado + checkmark SVG
- **Radio/RadioSm**: hidden native + círculo com dot interno
- **Switch/Toggle**: `h-6 w-11 rounded-full` com knob animado
- **FileInput**: nativo com classes `file:`
- **MultiSelect**: dropdown com chips

### SEARCH BAR (AppHeader)
- **Classes**: `h-11 w-full rounded-lg border border-gray-200 bg-transparent py-2.5 pl-12 pr-14 text-sm shadow-theme-xs`
- **Ícone search**: `absolute left-4 top-1/2 -translate-y-1/2`
- **Atalho ⌘K**: badge `absolute right-2.5` com `rounded-lg border border-gray-200 bg-gray-50 px-[7px] py-[4.5px] text-xs`
- **Foco**: `focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10`

### PAGE BREADCRUMB
- **Arquivo**: `src/components/common/PageBreadCrumb.tsx`
- **Layout**: `flex flex-wrap items-center justify-between gap-3 mb-6`
- **Title**: `h2 text-xl font-semibold text-gray-800`
- **Breadcrumb**: `ol > li > Link (Home > chevron SVG > PageName)`

## 1.3 Padrões de Página do TailAdmin

### PROFILE PAGE (`/profile`)
- **Wrapper**: `rounded-2xl border border-gray-200 bg-white p-5 lg:p-6`
- **Title**: `h3 mb-5 text-lg font-semibold text-gray-800 lg:mb-7`
- **Section cards**: `p-5 border border-gray-200 rounded-2xl lg:p-6`
- **Card internal layout**: `flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between`
- **Data fields**: label `text-xs text-gray-500 mb-2` + value `text-sm font-medium text-gray-800`
- **Grid**: `grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-7 2xl:gap-x-32`
- **Edit button**: `rounded-full border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 lg:w-auto`
- **Modal edit**: `max-w-[700px] rounded-3xl bg-white p-4 lg:p-11`

### ECOMMERCE DASHBOARD (KPI Cards)
- **Grid**: `grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6`
- **KPI Card**: `rounded-2xl border border-gray-200 bg-white p-5 md:p-6`
  - Icon container: `w-12 h-12 bg-gray-100 rounded-xl` (flex centered)
  - Icon: SVG `size-6 text-gray-800`
  - Label: `text-sm text-gray-500`
  - Value: `mt-2 font-bold text-gray-800 text-title-sm`
  - Trend badge: `bg-success-50 text-success-600` (green up) ou `bg-error-50 text-error-600` (red down)

### SIDEBAR
- **Arquivo**: `src/layout/AppSidebar.tsx`
- **Estado triplo**: expandido (290px) | hover (290px) | colapsado (90px)
- **Classes**: `fixed mt-16 lg:mt-0 top-0 left-0 bg-white h-screen transition-all duration-300 ease-in-out z-50 border-r border-gray-200`
- **Menu items**: `menu-item group` + `menu-item-active` (custom utilities)
- **Submenu animado**: `overflow-hidden transition-all duration-300` com altura calculada via `scrollHeight`

### HEADER (AppHeader)
- **Classes**: `sticky top-0 flex w-full bg-white border-gray-200 z-99999 lg:border-b`
- **Botão toggle**: `w-10 h-10 lg:w-11 lg:h-11 rounded-lg border border-gray-200`
- **Search**: descrito acima
- **ThemeToggle**: botão pequeno
- **NotificationDropdown**: sino com badge laranja `animate-ping`
- **UserDropdown**: avatar 44px + nome + chevron + dropdown 260px

---

# PARTE 2 — SITUAÇÃO ATUAL DO ERP

## 2.1 O que JÁ FOI FEITO (/configurações)

### Infraestrutura
✅ `globals.css` expandido com design tokens (esmeralda, success, error, warning, info, surface, text, shadows)
✅ Biblioteca UI: Button, Badge, Card, InputField, Select, Label, Table, Modal, Alert
✅ Barrel export em `src/components/ui/index.ts`

### Estrutura do módulo
✅ 16 tabs extraídas do monólito de 6.151 linhas para arquivos individuais
✅ `types.ts` com todas as interfaces
✅ `constants.ts` com paleta, labels, helpers
✅ `ConfiguracoesClient.tsx` orquestrador (~100 linhas)

### Sidebar global
✅ Expandir/recolher (290px ↔ 90px) com hover-to-expand
✅ Margem dinâmica no conteúdo principal
✅ Grupo "Configurações" integrado com 16 subitens
✅ Item ativo destacado

### Header global
✅ Botão toggle sidebar
✅ Busca global com `⌘K` e dropdown de resultados
✅ NotificationDropdown (sino + badge + animação ping)
✅ UserDropdown (avatar + nome + dropdown com Editar Perfil, Configurações, Sair)

### Tabs 100% refatoradas (Tailwind + UI kit)
✅ TabParametros (Cotações de Mercado) — KPI cards + toggles + Alert
✅ TabWebhooks — Card + Table + Badge + Alert
✅ TabUsuarios — Card + Table + Badge + Button + Modal + InputField + Select + Label + Search
✅ TabIA — Cards + Provider selection + Margin config + API Key + Test tool
✅ TabComissoes — Card + Table + Badge + Button + InputField
✅ TabCreditoLoja — Cards + Table + Badge + Button + InputField
✅ TabGateways — Card + Table + Badge + Button + InputField + Select
✅ TabCotacoes — MERGEADO no TabParametros
✅ TabMetal — Card + Button + InputField

### Página de Perfil
✅ `/perfil` — 3 cards estilo TailAdmin (Meta, Info, Security) + modais de edição

### Tabs que AINDA USAM o `P` legacy (precisam ser refatoradas)
| Tab | Linhas | Prioridade |
|---|---|---|
| TabDepositos | 334 | ALTA |
| TabTeores | 267 | ALTA |
| TabPermissoes | 510 | ALTA |
| TabTiposServico | 308 | MÉDIA |
| TabFretes | 359 | MÉDIA |
| TabMaquininhas | 423 | MÉDIA |
| TabIntegracoes | 1433 | ALTA (já tem Card/Alert parciais) |

---

# PARTE 3 — PROMPT DE EXECUÇÃO (O QUE FAZER AGORA)

## REGRAS FUNDAMENTAIS

1. **NÃO commitar nada** — branch `refactor/configuracoes`
2. **Manter TODAS as regras de negócio** — só mudar estrutura/UI
3. **Paleta de cores do ERP** — esmeralda (#184036), creme (#FAFAF7), dourado (#DB9864)
4. **Componentes UI do ERP** — usar os que já existem em `src/components/ui/`
5. **Padrão de página** — seguir o modelo `/profile` do TailAdmin
6. **Responsividade** — `overflow-x-hidden` no main, `min-w-0` nos flex children
7. **Sem inline styles** — usar classes Tailwind
8. **Sem P, ROLE_LABEL, etc. inline** — importar de `./constants` ou usar classes

## EXECUÇÃO — PASSO A PASSO

### PASSO 1: Refatorar TabDepositos
- Remover import do `P` (se existir)
- Adicionar imports: Card, Table, Button, Badge, InputField
- Estrutura: 1 Card "Depósitos e Setores" com tabela estilizada
- Formulários inline viram Card separado ou seção com toggle
- Botões: trocar `<button style={{...}}>` por `<Button>`
- Tabelas: trocar `<table>` + inline styles por `<Table>` compound
- Badges de status: `<Badge>`
- Manter lógica de CRUD intacta (fetch, state, handlers)

### PASSO 2: Refatorar TabTeores
- Mesmo padrão do TabDepositos
- Card "Teores de Ouro" + Card "Tipos de Liga"
- Tabelas com Badge de status (ativo/inativo)
- InputField para edição inline

### PASSO 3: Refatorar TabPermissoes
- Card "Matriz de Permissões"
- Tabela com linha de roles e colunas de módulos
- Ícones Lock/Eye/PenLine para níveis de permissão
- Modal para criar nova role

### PASSO 4: Refatorar TabTiposServico
- Card "Tipos de Serviço" com tabela
- Formulário inline ou Card separado

### PASSO 5: Refatorar TabFretes
- Card "Fretes por Bairro" com tabela
- Formulário para adicionar/editar frete
- Select de bairros

### PASSO 6: Refatorar TabMaquininhas
- Card "Dispositivos Point" com tabela
- Formulário para cadastrar device
- Select de vendedores

### PASSO 7: Refatorar TabIntegracoes (COMPLETO)
- Remover TODOS os `style={{}}` e `P.xxx`
- Cada integração vira uma seção dentro de Card
- InputField com type="password" para campos secretos
- Toggles para ativar/desativar integrações
- Alert para mensagens de sucesso/erro
- Manter exatamente as mesmas chamadas de API (fetch)

### PASSO 8: Verificação Final
- Build sem erros: `npx next dev` deve compilar
- Navegação: todos os links do menu de Configurações funcionam
- Tabs carregam dados corretamente
- Responsivo: sem scroll horizontal

## CHECKLIST POR COMPONENTE

Ao refatorar CADA tab, verificar:
- [ ] `"use client"` no topo
- [ ] Imports enxutos (só o que usa)
- [ ] Sem `import { P }` do constants (só se for tab legacy)
- [ ] Usa Card como wrapper principal
- [ ] Usa Table compound para listas
- [ ] Usa Badge para status/tags
- [ ] Usa Button para ações
- [ ] Usa InputField para campos de formulário
- [ ] Usa Alert para mensagens
- [ ] Usa Modal para modais
- [ ] Espaçamento: `space-y-5 sm:space-y-6`, `gap-4 md:gap-6`
- [ ] Cards: `p-5 border border-gray-200 rounded-2xl lg:p-6`
- [ ] Títulos: `text-lg font-semibold text-gray-800`
- [ ] Labels: `text-sm font-medium text-gray-700`
- [ ] Texto secundário: `text-sm text-gray-500`
- [ ] Sem classes/cores hardcoded (ex: `#184036`) — usar tokens
- [ ] Regras de negócio preservadas (comparar com original)

---

# PARTE 4 — REFERÊNCIA RÁPIDA DE CLASSES

## Cards
```
rounded-2xl border border-gray-200 bg-white p-5 lg:p-6
```

## Tabelas
```
Header: px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider
Body: px-6 py-4 text-sm text-gray-700
Wrapper: overflow-x-auto
```

## Botões
```
primary: bg-esmeralda-500 text-white shadow-theme-xs hover:bg-esmeralda-600
outline: bg-white text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50
ghost: bg-transparent text-gray-600 hover:bg-gray-100
danger: bg-error-500 text-white shadow-theme-xs hover:bg-error-600
```

## Inputs
```
wrapper: rounded-lg border border-gray-300 bg-white shadow-theme-xs
focus: focus:border-esmeralda-300 focus:ring-2 focus:ring-esmeralda-500/10
disabled: bg-gray-100 text-gray-500 cursor-not-allowed
```

## Badges
```
light: bg-esmeralda-50 text-esmeralda-600 | bg-success-50 text-success-600 | bg-error-50 text-error-600
solid: bg-esmeralda-500 text-white | bg-success-500 text-white | bg-error-500 text-white
```

## Alertas
```
success: border-success-500 bg-success-50 text-success-600
error: border-error-500 bg-error-50 text-error-600
```

## Toggle Switch (manual)
```
button: flex items-center gap-1.5 text-sm font-medium
active icon: text-success-500
inactive icon: text-gray-300
```
