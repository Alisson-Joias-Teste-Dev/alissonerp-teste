# Componentes Base UI

Todos os componentes base estão em `src/components/ui/`. São reutilizáveis em qualquer tela do sistema.

## Button
```tsx
import { Button } from "@/components/ui";

<Button variant="primary" size="md" loading={bool} onClick={fn}>
  Salvar
</Button>
```

| Prop | Tipo | Padrão | Opções |
|------|------|--------|--------|
| `variant` | string | `"primary"` | `primary` `secondary` `outline` `ghost` `danger` |
| `size` | string | `"md"` | `sm` `md` `lg` |
| `loading` | boolean | `false` | Mostra spinner e desabilta |
| `disabled` | boolean | — | |

Variants:
- `primary` → bg `#184036`, texto `#F3EADA` (verde escuro)
- `secondary` → bg `#f3f4f6`, texto `#374151` (cinza)
- `outline` → bg transparente, texto `#374151`
- `ghost` → texto `#6b7280`
- `danger` → bg `#dc2626`, texto branco

## Input
```tsx
import { Input } from "@/components/ui";

<Input label="Nome" value={val} onChange={fn} placeholder="..." />
<Input label="Preço" prefix="R$" type="number" step="0.01" />
<Input label="Senha" type="password" />
```

| Prop | Descrição |
|------|-----------|
| `label` | Label uppercase tracking-widest |
| `prefix` | Texto prefixo (ex: "R$", "R$/g") |
| `error` | Mensagem de erro abaixo do campo |
| `type="number"` | Oculta setas com `appearance:textfield` |

Para campos de senha com toggle de visibilidade, usar padrão:
```tsx
<div className="relative">
  <Input label="Token" type={show ? "text" : "password"} value={val} onChange={fn} />
  <button onClick={() => setShow(!show)}
    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
    {show ? <EyeOff size={15} /> : <Eye size={15} />}
  </button>
</div>
```

## Select
```tsx
import { Select } from "@/components/ui";

<Select label="Perfil" options={[
  { value: "admin", label: "Admin" },
  { value: "user", label: "Usuário" },
]} placeholder="Selecione..." value={val} onChange={fn} />
```

## Toggle
```tsx
import { Toggle } from "@/components/ui";

<Toggle ativo={bool} onChange={setter} disabled={bool} />
```

## Badge / StatusBadge
```tsx
import { Badge, StatusBadge } from "@/components/ui";

<Badge>Admin</Badge>
<StatusBadge ativo={true} />   → "Ativo" (verde)
<StatusBadge ativo={false} />  → "Inativo" (cinza)
```

## Spinner
```tsx
import { Spinner } from "@/components/ui";

<Spinner size={14} />
```

## MessageBox
```tsx
import { MessageBox } from "@/components/ui";

<MessageBox tipo="ok" mensagem="Salvo!" onFechar={fn} />
<MessageBox tipo="erro" mensagem="Falhou" />
<MessageBox tipo="info" mensagem="Atenção" />
```

## Modal
```tsx
import { Modal } from "@/components/ui";

<Modal aberto={bool} onClose={fn} titulo="Título" subtitulo="Subtítulo opcional">
  ... conteúdo ...
</Modal>
```
