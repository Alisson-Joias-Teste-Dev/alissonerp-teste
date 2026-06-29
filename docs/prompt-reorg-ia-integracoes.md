# PROMPT — Reorganização: IA + Integrações

## Contexto

A página de **IA** (`?tab=ia`) hoje mistura duas responsabilidades:
1. **Configuração de integração** (selecionar provedor, salvar API key)
2. **Regras de negócio + ferramenta operacional** (margem de tolerância, teste de peso)

Em ERPs de referência (SAP, Odoo, Salesforce), IA é sempre uma seção própria, não fica dentro de integrações. Mas as **credenciais de API** (keys) devem ficar na tela de Integrações, junto com Open Exchange Rates, Mercado Pago, etc.

## Plano de Execução

### PASSO 1 — Mover API Key da IA para Integrações

**Arquivo**: `src/components/configuracoes/TabIA.tsx`
- Remover o Card "Configurar API Key" inteiro (título + provedor select + InputField da key + botão Salvar Key)
- Remover os estados relacionados: `keyProvedor`, `keyValor`, `mostrarKey`, `salvandoKey`
- Remover a função `salvarKey()`
- Remover os imports não mais usados (CheckCircle, AlertTriangle se não referenciados)

**Arquivo**: `src/components/configuracoes/TabIntegracoes.tsx`
- Adicionar um novo card de integração no array `INFOS`:
  ```tsx
  { id: "ia_providers", name: "Provedores de IA", description: "Claude, OpenAI e Gemini para validação de peso", icon: Bot }
  ```
- No `switch` de `renderFields()`, adicionar um novo `case "ia_providers"` com campos:
  - Select do provedor (Claude / OpenAI / Gemini)
  - InputField type="password" para API Key
- No `handleSave`, mapear `"ia_providers"` para salvar no endpoint `/api/configuracoes/ia/key`
- No `carregarTudo`, carregar status das keys de IA (verificar se cada provedor tem key configurada)

### PASSO 2 — Simplificar a página de IA

**Arquivo**: `src/components/configuracoes/TabIA.tsx`

A página de IA deve ficar focada apenas em:
1. **Toggle de Validação por IA** (ativar/desativar) — já existe, manter
2. **Seleção de provedor ativo** (qual dos 3 usar) — já existe, manter
3. **Tolerância de Validação** (margem para ouro e pedras) — já existe, manter
4. **Ferramenta de teste** (foto da balança + peso) — já existe, manter

**O que remover**: Apenas o Card "Configurar API Key" e seus estados/funções.

**Ajustes adicionais**:
- Remover imports não usados (`EyeOff`, `Eye`, `Save`, `InputField` — verificar se ainda são usados em outras partes)
- Garantir que `toast.success()` / `toast.error()` são usados em todos os feedbacks
- Substituir o toggle manual (ToggleLeft/ToggleRight) pelo componente `<Switch>` — se ainda não estiver

### PASSO 3 — Atualizar a página de Integrações

**Arquivo**: `src/components/configuracoes/TabIntegracoes.tsx`

Adicionar o novo card "Provedores de IA" ao grid:

```tsx
const INFOS = [
  // ... existentes
  { id: "ia_providers", name: "Provedores de IA", description: "Claude, OpenAI e Gemini para validação de peso de metais e pedras", icon: Bot },
];
```

O modal de edição para esse tipo deve ter:
1. Um `<Select>` para escolher o provedor (Claude, OpenAI, Gemini)
2. Um `<InputField type="password">` para a API Key
3. Indicador visual de quais provedores já têm key configurada

### PASSO 4 — Verificar integridade

- Rodar `npx next dev` e verificar que não há erros de compilação
- Acessar `?tab=ia` — verificar que a página carrega sem o Card de API Key
- Acessar `?tab=integracoes` — verificar que o novo card "Provedores de IA" aparece
- Clicar no card "Provedores de IA" — verificar que o modal abre com os campos corretos
- Salvar uma API Key — verificar que o toast aparece e o status atualiza
- Testar a ferramenta de teste de peso na IA — verificar que continua funcionando

### PASSO 5 — Limpeza

- Remover imports não utilizados em `TabIA.tsx`
- Remover estados não utilizados em `TabIA.tsx`
- Remover funções não utilizadas em `TabIA.tsx`

---

## Estrutura Esperada Após Refatoração

### TabIA.tsx (após limpeza)
```
Card: Validação por IA (toggle)
Card: Provedor Ativo (seleção Claude/GPT/Gemini)
Card: Tolerância de Validação (margens ouro + pedras)
Card: Testar Validação (foto + peso + resultado)
```

### TabIntegracoes.tsx (após adição)
```
Card: WooCommerce
Card: Kommo
Card: Tiny ERP
Card: Open Exchange Rates
Card: Mercado Pago
Card: PagBank
Card: Banco Inter
Card: Provedores de IA  ← NOVO
```

---

## Regras de Negócio — NÃO ALTERAR

- Endpoints de API (`/api/configuracoes/ia`, `/api/configuracoes/ia/key`)
- Lógica de validação de peso (`/api/pcp/validar-peso`)
- Estrutura de resposta dos endpoints
- Formato dos payloads enviados
