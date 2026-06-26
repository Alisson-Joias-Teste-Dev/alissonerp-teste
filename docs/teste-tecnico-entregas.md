# Teste Técnico — Módulo de Entregas com WhatsApp

## Informações Gerais

| Item | Detalhe |
|---|---|
| **Prazo de entrega** | 11/06/2026 até 09:00 |
| **Forma de entrega** | Repositório **GitHub público** + link do deploy |
| **Stack obrigatória** | Next.js (App Router), React, TypeScript, Supabase |
| **Backend** | Sem backend desacoplado — todo código roda no Next.js (server actions ou API routes) |

## O que entregar

1. Link do repositório **GitHub público**
2. Link do **deploy** (Vercel, Railway ou similar) com o sistema rodando
3. **README** com:
   - Instruções de setup
   - Credenciais de teste (se necessário)
   - Descrição de como testar cada fluxo

**O avaliador precisa conseguir testar o sistema completo sem falar com você.**

---

## O que construir

### PDV Mínimo (30% do tempo)

Funcionalidades básicas para viabilizar o teste das entregas:

| Funcionalidade | Descrição |
|---|---|
| Lista de produtos | Exibir produtos fictícios (mínimo 10) com nome e preço |
| Carrinho | Adicionar / remover itens, exibir total |
| Identificação do cliente | Formulário com nome, WhatsApp e CPF |
| Finalizar venda | Salvar no Supabase e gerar código de retirada único |
| Confirmação | Tela de confirmação exibindo o código gerado |

**Invista o mínimo possível aqui.** O foco da avaliação é o módulo de entregas.

---

### Módulo de Entregas (70% do tempo)

#### Tipo de entrega

Ao finalizar a venda, o vendedor escolhe entre:
- **Retirar na Loja**
- **Motoboy**

#### Retirada na Loja

**Fluxo normal:**
- Atendente digita o código de retirada
- Sistema localiza a venda e exibe os itens
- Atendente confirma a retirada
- Sistema registra data/hora e responsável

**Fluxo de exceção — cliente não tem o código:**
- Opção "Não tenho o código" na tela
- Cliente informa CPF para localizar a venda
- **Exige autorização de um gerente:**
  - Nome / identificação de quem autorizou
  - Motivo registrado
  - Tudo salvo em tabela de log
- Após autorização, a retirada é liberada

#### Entrega por Motoboy

**Tela do motoboy (responsiva, feita para celular):**

- Motoboy se identifica com **código próprio** (cadastrado no sistema)
- Visualiza **apenas as entregas atribuídas a ele**
- Para liberar a retirada dos itens, precisa informar:
  - Código do motoboy
  - Código do cliente (gerado na venda)
  - **Ambos devem ser válidos** para liberar

**Entrega parcial:**
- Motoboy pode marcar itens individualmente como entregues
- Itens não entregues ficam com status "pendente" para nova tentativa

**Entrega total:**
- Marca todos os itens como entregues de uma vez

**Registro:**
- Toda entrega registra: data/hora, motoboy responsável, itens entregues, itens pendentes, observações

---

### WhatsApp

Enviar o código de retirada para o WhatsApp do cliente no momento da finalização da venda.

A mensagem deve conter:
- Nome da loja (fictício)
- Código de retirada
- Instruções:
  - Se for retirar na loja: apresentar o código
  - Se for motoboy: informar o código para o entregador

**Você decide qual API / serviço utilizar.** O envio deve ser funcional — o avaliador precisa receber a mensagem.

Obs.: existem serviços de API REST para WhatsApp que funcionam com trial gratuito, sem necessidade de VPS. A chamada é feita direto do Next.js.

---

### Segurança (requisitos obrigatórios)

- Código de retirada **aleatório e não sequencial** (mínimo 6 caracteres alfanuméricos)
- Nada de ID 1, 2, 3 — use crypto ou hash
- Motoboy **só pode ver as próprias entregas**
- Fluxo "esqueci o código" **exige autorização registrada**
- Validações **no backend** (não confiar apenas no frontend)
- Taxa de tentativas ou logging para o fluxo de autorização

---

### Automação

O setup do projeto deve ser o mais automatizado possível:

- Migration SQL para criar todas as tabelas
- Seed de dados (produtos e clientes fictícios)
- `npm run dev` já sobe o projeto

O avaliador precisa apenas:
1. Criar um projeto gratuito no Supabase
2. Rodar as migrations
3. Configurar as variáveis de ambiente
4. Rodar `npm install && npm run dev`

---

## Estrutura de dados (sugestão)

Você pode adaptar, mas a estrutura mínima deve contemplar:

| Entidade | Campos mínimos |
|---|---|
| Produtos | id, nome, preco |
| Clientes | id, nome, whatsapp, cpf |
| Vendas | id, cliente_id, total, tipo_entrega, codigo_retirada, situacao, created_at |
| Itens da venda | id, venda_id, produto_id, quantidade, preco_unitario |
| Entregas | id, venda_id, tipo, situacao, motoboy_id, created_at |
| Itens da entrega | id, entrega_id, item_venda_id, quantidade, entregue, observacao |
| Motoboys | id, nome, whatsapp, codigo, ativo |
| Autorizações | id, entrega_id, autorizado_por, motivo, created_at |

---

## Critérios de avaliação

| Critério | Peso |
|---|---|
| Módulo de entregas completo e funcional | 40% |
| Integração WhatsApp funcionando | 20% |
| Segurança (códigos, autorizações, validação backend) | 15% |
| Qualidade do código e organização | 10% |
| PDV mínimo funcional | 10% |
| README e instruções | 5% |

---

## Observações finais

- Leia a especificação **completa** antes de começar
- Priorize o **módulo de entregas** — é o que mais pesa na avaliação
- O PDV deve ser apenas o suficiente para testar as entregas (não exagere)
- A integração com WhatsApp vale 20% — não deixe para o final
- Teste **todos os fluxos de exceção** (esqueceu o código, entrega parcial, motoboy inválido)
- **O deploy é obrigatório** — o avaliador vai testar o sistema rodando
- Não esqueça de incluir credenciais de teste no README
- Revise a segurança: código aleatório, autorização registrada, validação no backend
