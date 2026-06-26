# Estrutura de Componentes

## Organização de Pastas

```
src/components/
  ui/                    ← Componentes base reutilizáveis (Button, Input, Toggle, etc.)
  Tabela.tsx             ← Componentes de propósito geral
  NavegacaoAbas.tsx

  <dominio>/             ← Componentes específicos de um domínio
    TabXxx.tsx           ← Componente principal da tela (orquestrador)
    <subdominio>/        ← Sub-componentes quebrados do orquestrador
      ComponenteA.tsx
      ComponenteB.tsx
```

## Regras de Componentização

### 1. Um arquivo, uma responsabilidade
Cada arquivo deve ter **uma única função exportada como default**. Se um componente passar de ~300 linhas, extraia sub-componentes.

### 2. Orquestradores finos
O componente principal da tela (orquestrador) deve:
- Gerenciar estado e efeitos colaterais (fetch, save)
- Importar e renderizar sub-componentes
- Ser enxuto (< 200 linhas idealmente)

### 3. Sub-componentes por domínio
Agrupar sub-componentes em subpastas:
```
TabIntegracoes.tsx        ← orquestrador (~50 linhas)
integracoes/
  IntegracaoWooCommerce.tsx
  IntegracaoKommo.tsx
  ...
```

### 4. Props, não estado compartilhado
Sub-componentes recebem dados e callbacks via props. Não usar contexto ou store para estado local da tela.

### 5. "use client" apenas quando necessário
- **Server Components** (sem `"use client"`): páginas que buscam dados do banco
- **Client Components** (com `"use client"`): componentes com interatividade (state, effects, handlers)

### 6. Nomenclatura
- Componentes: `PascalCase.tsx`
- Pastas: `snake_case` ou `camelCase`
- Arquivo de teste: `Componente.test.tsx`
- Interface de props: `Props` (nome genérico dentro do arquivo)
