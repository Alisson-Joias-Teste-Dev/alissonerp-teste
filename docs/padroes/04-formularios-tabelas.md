# Padrões de Formulários e Tabelas

## Formulários

### Campos de senha/credencial (mascarados)
Campos sensíveis devem iniciar mascarados com toggle de visibilidade:
```tsx
<div className="relative">
  <Input label="Token" type={show ? "text" : "password"} value={val} onChange={fn} />
  <button onClick={() => setShow(!show)}
    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
    {show ? <EyeOff size={15} /> : <Eye size={15} />}
  </button>
</div>
```

### Campos readonly com select-all
```tsx
<input readOnly value={url}
  className="w-full px-3 py-2 rounded-lg text-xs border border-gray-200 bg-gray-50 text-gray-500 select-all outline-none"
  onClick={(e) => (e.target as HTMLInputElement).select()} />
```

### Inputs tipo number
Não devem exibir setas de incremento. O componente `Input` já oculta com:
```css
[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none
```

## Tabelas

### Componente Tabela genérico
```tsx
import Tabela from "@/components/Tabela";

<Tabela
  colunas={[
    { key: "nome", header: "Nome", render: (item) => <>{item.nome}</> },
    { key: "status", header: "Status",
      render: (item) => <StatusBadge ativo={item.ativo} /> },
  ]}
  dados={lista}
  onLinhaClick={(item) => abrirDrawer(item)}
  mensagemVazia="Nenhum registro encontrado"
/>
```

| Prop | Tipo | Descrição |
|------|------|-----------|
| `colunas` | `Coluna<T>[]` | Define colunas: key, header, render, className |
| `dados` | `T[]` | Array de objetos com `id: string \| number` |
| `onLinhaClick` | `(item: T) => void` | Callback ao clicar na linha |
| `mensagemVazia` | string | Texto quando array vazio |
| `minWidth` | string | Largura mínima (padrão `"600px"`) |

### Estrutura manual de tabela
Para tabelas complexas, usar HTML semântico:
```tsx
<div className="rounded-lg border border-gray-200 overflow-hidden">
  <table className="w-full text-xs">
    <thead className="bg-gray-50">
      <tr>
        <th className="text-left px-3 py-2 font-semibold text-gray-500">Coluna</th>
      </tr>
    </thead>
    <tbody>
      {dados.map((item) => (
        <tr key={item.id} className="border-t border-gray-200">
          <td className="px-3 py-2 text-gray-900">{item.valor}</td>
        </tr>
      ))}
    </tbody>
  </table>
</div>
```

## Mensagens de Feedback
Sempre usar `MessageBox` para feedback de ações:
```tsx
<MessageBox tipo="ok" mensagem="Salvo com sucesso!" onFechar={() => setMsg(null)} />
<MessageBox tipo="erro" mensagem={erro} />
```

## Navegação por Abas
```tsx
import NavegacaoAbas, { type Aba } from "@/components/NavegacaoAbas";

const abas: Aba[] = [
  { key: "geral", label: "Geral", href: "/pagina/geral", icon: Settings },
];

<NavegacaoAbas abas={abas} activeKey={activeKey} aoMudar={setTab} />
```
