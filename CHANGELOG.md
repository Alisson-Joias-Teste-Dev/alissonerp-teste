## v2.12.0 (24/03/2026)
### Features
- Protocolo: responsável (criado por) e concluído por nos cards e detalhe
- Protocolo: thumbnails de foto criação/conclusão clicáveis
- Protocolo: zoom na foto (scroll, duplo clique, arrastar, botões +/−)
- Protocolo: filtro de status Pendentes/Concluídas/Todas (default Pendentes)
- PCP: atribuir operador com metal externo > 0 move pra em_andamento automaticamente
- Precificação: coluna markup atual na simulação de impacto
- Precificação: campo de busca por nome/SKU no preview

### Fixes
- Protocolo: JOIN via alissonerp.usuarios (responsável aparecia — para Francisco Lenilson)
- Protocolo: foto URL resolvida (path relativo → URL completa Storage)
- Protocolo: filtro Pendentes conta protocolos com status !== concluido
- Produtos: fix CadastroProdutoModal

## v2.11.1 (24/03/2026)
### Fixes
- Detalhe ordem: exibir peso_metal_externo no card Comercial (condicional > 0)
- Detalhe ordem: ocultar campos sem dados nos cards Comercial e Produção

## v2.11.0
- feat: teores em configurações + permissões granulares (5 ações) + cadeado teor ligação + fix NaN itens legados

## v2.10.1
- fix: normalizeRow — usar Record<string, unknown>
- fix: auto-atribuir deposito_id no PCP no primeiro apontamento fora do Almoxarifado

## v2.10.0
- feat: integração WhatsApp + phone em user_profiles
- feat: permissões granulares por usuário — purificação e ligação
- feat: módulo purificação 18k→24k + ligação 24k→18k

## v2.9.0
- feat: estorno de lote inteiro + destino transferência avulsa

## v2.8.0
- feat: baixa pedras + avatar + email atômico + senha + operador + lote + storage
- feat: estorno distribuição + avatar + email + senha + pedras + operador + storage
