# ADR 0006 — Guard de Versão em Mutations (Lost Update Prevention)

**Status:** Accepted  
**Data:** 2026-04-29  
**Story:** 3.2  

## Contexto

O "lost update problem": User A e User B abrem a mesma venda simultaneamente. User A altera observações e salva — `updated_at` muda no banco. User B (que leu o estado original) salva suas alterações logo depois, sobrescrevendo silenciosamente as mudanças de User A sem qualquer aviso.

Em sistemas de atendimento onde vendedoras e gerência podem editar a mesma venda em paralelo (aprovação de desconto, mudança de situação, alteração de entrega), este cenário é frequente e difícil de detectar — o dado simplesmente desaparece.

Mecanismos avaliados:
- **Lock pessimista (SELECT FOR UPDATE):** bloqueia a linha durante a sessão — inviável em HTTP stateless
- **Lock otimista com ETag/versão numérica:** requer coluna extra na tabela
- **Lock otimista com `updated_at`:** usa timestamp existente, sem migration necessária

## Decisão

Guard otimista via campo `client_updated_at` opcional no body do PATCH. O cliente envia o `updated_at` que leu no GET; a rota compara com o valor atual no banco antes de aplicar o UPDATE:

```typescript
// PATCH /api/vendas/[id]
if (body.client_updated_at) {
  const [row] = await sql`SELECT updated_at FROM alissonerp.vendas_erp WHERE id = ${vendaId}`;
  if (row && new Date(row.updated_at).getTime() !== new Date(body.client_updated_at).getTime()) {
    return NextResponse.json(
      { error: "Conflito: registro foi modificado por outro usuário. Recarregue a página." },
      { status: 409 }
    );
  }
}
```

O guard é **retrocompatível**: chamadas que não enviam `client_updated_at` (ex: chamadas server-to-server, rotas internas) passam sem verificação. O front-end de vendas envia `client_updated_at: venda.updated_at` explicitamente.

## Consequências

**Positivas:**
- Proteção contra lost updates em rotas críticas sem migration de schema
- Retrocompatível: clientes existentes sem `client_updated_at` não são afetados
- HTTP 409 semântico — cliente pode apresentar mensagem clara ao usuário
- Sem overhead em operações que não enviam o campo

**Negativas:**
- Janela de corrida existe: dois usuários que leram o estado exatamente ao mesmo tempo e salvam simultaneamente — apenas o segundo recebe 409, mas ambos leram o mesmo estado original
- Depende de precisão do `updated_at` (timestamp with time zone) — colisão de timestamps no mesmo milissegundo causaria falso negativo (extremamente improvável)
- O cliente precisa lembrar de enviar `client_updated_at`; rotas que não enviam ficam sem proteção

**Neutras:**
- Implementado inicialmente em `vendas_erp`; outros recursos (ordens, protocolos) podem adotar o mesmo padrão sem alteração de schema

## Arquivos

- `src/app/api/vendas/[id]/route.ts` — guard implementado no PATCH (linha ~598)
- `src/app/(dashboard)/vendas/[id]/VendaDetalheClient.tsx` — front-end envia `client_updated_at` nos PATCHes
