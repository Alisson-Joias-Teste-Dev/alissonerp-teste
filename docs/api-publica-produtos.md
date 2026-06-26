# API Pública de Produtos — Alisson ERP

Endpoint aberto para uso no site externo. Não requer autenticação.

**Base URL:** `https://erp.alissonjoias.com.br/api/public/produtos`  
**Método:** `GET`  
**CORS:** Aberto (`*`)  
**Cache:** 60 segundos (stale-while-revalidate 300s)

---

## Parâmetros de consulta

| Parâmetro | Tipo | Padrão | Descrição |
|---|---|---|---|
| `busca` | string | — | Filtra por nome ou SKU (mínimo 2 caracteres) |
| `categoria` | string | — | Filtra por categoria (ex: `Anel`, `Pulseira`, `Colar`) |
| `tipo_metal` | string | — | Filtra por metal (ex: `Ouro 18k`, `Prata 925`) |
| `com_estoque` | boolean | — | `true` = só produtos com estoque disponível |
| `sku` | string | — | Busca produto específico pelo SKU |
| `order` | string | `nome` | Ordenação: `nome` ou `preco` |
| `page` | number | `1` | Página atual |
| `limit` | number | `50` | Itens por página (máximo: 100) |

---

## Exemplos de requisição

### Listar todos os produtos ativos
```
GET https://erp.alissonjoias.com.br/api/public/produtos?page=1&limit=50
```

### Buscar por nome ou SKU
```
GET https://erp.alissonjoias.com.br/api/public/produtos?busca=anel
```

### Filtrar por categoria
```
GET https://erp.alissonjoias.com.br/api/public/produtos?categoria=Anel
```

### Filtrar por categoria e metal
```
GET https://erp.alissonjoias.com.br/api/public/produtos?categoria=Anel&tipo_metal=Ouro+18k
```

### Apenas produtos com estoque disponível
```
GET https://erp.alissonjoias.com.br/api/public/produtos?com_estoque=true
```

### Produto específico por SKU
```
GET https://erp.alissonjoias.com.br/api/public/produtos?sku=AN001
```

### Ordenar por preço
```
GET https://erp.alissonjoias.com.br/api/public/produtos?order=preco&limit=20
```

### Combinando filtros com paginação
```
GET https://erp.alissonjoias.com.br/api/public/produtos?categoria=Pulseira&com_estoque=true&order=preco&page=1&limit=24
```

---

## Formato de resposta

```json
{
  "produtos": [
    {
      "id_produto": 42,
      "nome": "Anel Solitário",
      "sku": "AN042",
      "tipo_metal": "Ouro 18k",
      "categoria": "Anel",
      "tem_pedra_preciosa": true,
      "foto": "https://...",
      "preco": 1250.00,
      "preco_variacao_min": 980.00,
      "eh_pai": true,
      "parent_sku": null,
      "sufixo_variacao": null,
      "estoque": 3
    }
  ],
  "total": 150,
  "page": 1,
  "totalPages": 3
}
```

### Campos da resposta

| Campo | Tipo | Descrição |
|---|---|---|
| `id_produto` | number | ID único do produto |
| `nome` | string | Nome do produto |
| `sku` | string | Código SKU |
| `tipo_metal` | string | Metal do produto |
| `categoria` | string | Categoria (ex: `Anel -> Feminino`) |
| `tem_pedra_preciosa` | boolean | Se possui pedra preciosa |
| `foto` | string \| null | URL da imagem do produto |
| `preco` | number | Preço de venda |
| `preco_variacao_min` | number \| null | Preço mínimo entre variações filhas (quando `eh_pai = true`) |
| `eh_pai` | boolean \| null | `true` se é produto pai com variações |
| `parent_sku` | string \| null | SKU do produto pai (quando é variação) |
| `sufixo_variacao` | string \| null | Identificador da variação (ex: `17`, `Vermelho`) |
| `estoque` | number | Quantidade disponível em estoque |
| `total` | number | Total de registros encontrados |
| `page` | number | Página atual |
| `totalPages` | number | Total de páginas |

---

## Produtos com variações

Produtos como anéis (por numeração) ou correntes (por comprimento) são estruturados em **pai + filhos**.

O endpoint retorna apenas os **pais** por padrão. Para buscar as variações de um produto pai:

```
GET https://erp.alissonjoias.com.br/api/public/produtos?sku=AN042-17
```

Ou itere pelos filhos filtrando por `parent_sku` na sua aplicação.

---

## Integração com JavaScript

### Fetch nativo
```js
const res = await fetch(
  'https://erp.alissonjoias.com.br/api/public/produtos?categoria=Anel&com_estoque=true&limit=24'
)
const { produtos, total, totalPages } = await res.json()
```

### Axios
```js
const { data } = await axios.get('https://erp.alissonjoias.com.br/api/public/produtos', {
  params: {
    categoria: 'Anel',
    com_estoque: true,
    order: 'preco',
    limit: 24,
    page: 1
  }
})
```

---

## Observações

- Apenas produtos com `situacao = 'A'` (ativo) são retornados.
- Produtos filhos (variações) são omitidos da listagem padrão — aparecem apenas quando buscados pelo SKU.
- O campo `foto` é uma URL pública direta (sem expiração).
- A API não possui autenticação e é somente leitura — nenhuma escrita é possível.
