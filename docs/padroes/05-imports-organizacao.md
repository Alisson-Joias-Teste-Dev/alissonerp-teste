# Organização de Imports e Código

## Ordem dos Imports

```tsx
// 1. React / Next
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

// 2. Bibliotecas externas
import { Save, Plus, Eye, EyeOff } from "lucide-react";

// 3. Componentes do sistema (ui, shared)
import { Button, Input, Toggle, MessageBox } from "@/components/ui";
import Tabela from "@/components/Tabela";
import NavegacaoAbas from "@/components/NavegacaoAbas";

// 4. Componentes do domínio (relativos)
import ModalNovoUsuario from "./usuarios/ModalNovoUsuario";

// 5. Hooks e utils
import { useAuth } from "@/hooks/useAuth";
import { useErrorStore } from "@/stores/errorStore";
```

## Organização do Componente

Dentro do componente, seguir ordem:

```tsx
"use client";                              // 1. Diretiva

import ...                                 // 2. Imports

interface Props { ... }                    // 3. Tipos (Props primeiro)

const CONSTANTE = { ... };                 // 4. Constantes (P, ROLE_LABEL, etc.)

function helperFn() { ... }               // 5. Funções auxiliares (se houver)

export default function Componente({       // 6. Componente principal
  prop1,
}: Props) {
  // 6a. Hooks (useState, useEffect)
  const [state, setState] = useState();
  
  // 6b. Effects
  useEffect(() => { ... }, []);
  
  // 6c. Handlers
  async function handleSave() { ... }
  
  // 6d. Render condicional (loading)
  if (loading) return <Spinner />;
  
  // 6e. JSX
  return ( ... );
}
```

## Nomenclatura

| Item | Padrão | Exemplo |
|------|--------|---------|
| Arquivos | `PascalCase.tsx` | `UserEditDrawer.tsx` |
| Pastas | `snake_case` | `configuracoes/integracoes/` |
| Componentes | PascalCase | `TabParametros` |
| Funções | camelCase | `handleSave`, `abrirModal` |
| Constantes | UPPER_SNAKE | `ROLE_LABEL`, `PROVEDORES` |
| Props | PascalCase | `interface Props` |

## O que NÃO fazer

### ❌ Componente gigante (> 500 linhas)
Quebrar em sub-componentes.

### ❌ Estado global para dados locais
Usar props e callbacks entre pai e filho.

### ❌ Inline styles misturados com Tailwind
Preferir Tailwind classes. Inline styles só para valores dinâmicos.

### ❌ P constantes com cores
Usar classes Tailwind direto (`text-gray-900`, `bg-white`, `border-gray-200`).
