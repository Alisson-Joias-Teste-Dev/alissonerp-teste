# Paleta de Cores e Estilos

## Cores Principais
```css
--primary:   #184036  /* Verde escuro — botões, headers, toggles ativos */
--gold:      #DB9864  /* Dourado — detalhes, links, hover */
--bg-card:   #ffffff  /* Branco — fundo de cards */
--bg-page:   #f9fafb  /* Cinza claro — fundo de página */
--border:    #e5e7eb  /* Cinza — bordas de cards e inputs */
--text:      #111827  /* Quase preto — texto principal */
--text-secondary: #6b7280  /* Cinza médio — texto secundário */
--text-muted:#9ca3af  /* Cinza claro — texto mutado */
```

## Tailwind — Preferir classes a inline styles

### ✅ Certo (Tailwind classes)
```tsx
<div className="bg-white border border-gray-200 rounded-xl p-5">
  <p className="text-sm font-semibold text-gray-900">Título</p>
  <p className="text-xs text-gray-400">Subtítulo</p>
</div>
```

### ❌ Evitar (inline styles)
```tsx
<div style={{ backgroundColor: "#fff", border: "1px solid #e5e7eb", borderRadius: "12px", padding: "20px" }}>
```

## Cards
Todos os cards seguem o padrão:
```tsx
<div className="rounded-xl p-5 space-y-4 bg-white border border-gray-200">
```

## Tabelas
```tsx
<div className="w-full overflow-x-auto rounded-xl border border-gray-200 bg-white">
  <table className="w-full min-w-[600px] text-sm">
```

## Inputs
```tsx
// Com prefixo (R$, R$/g)
<Input label="Valor" prefix="R$" type="number" step="0.01" />

// Simples
<Input label="Nome" placeholder="Digite..." />
```

## Botões
```tsx
<Button variant="primary">Salvar</Button>
<Button variant="secondary">Cancelar</Button>
<Button variant="danger" loading={bool}>Excluir</Button>
```

## Responsividade
```tsx
// Grid de 4 colunas em desktop, 2 em mobile
<div className="grid grid-cols-2 sm:grid-cols-4 gap-4">

// Grid de 3 colunas
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
```
