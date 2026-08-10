# Pente-fino no FRONT (código do sistema atual) — 10/08/2026

> **Autor:** sessão Claude Code (Alisson), a pedido do dono — espelho do pente-fino do banco.
> **Onde foi feito:** numa CÓPIA isolada do projeto (`C:\Users\aliss\ERP.IAlisson-copia-pentefino`),
> sem `.git` (impossível publicar dali) e sem arquivos de senha. **Produção e o repositório real
> não foram tocados.** Os 195 arquivos da migração de ontem seguem intactos no repositório real.
> **Status:** limpeza EXECUTADA e validada na cópia. Aplicar no repositório real depende do "pode" do Alisson.

---

## 1. Método (o mesmo do banco)

1. Cópia isolada de tudo (4.182 arquivos, já incluindo as 195 mudanças de ontem).
2. Raio-X com dois medidores automáticos + contraprova manual:
   - **knip** — acha arquivo/função/biblioteca que ninguém usa (segue as ligações reais do código);
   - **jscpd** — acha trechos copiados (compara o código contra ele mesmo);
   - **contraprova** — cada "morto" de `src/` foi re-verificado com busca textual no projeto
     inteiro (import normal, dinâmico e menção em string) antes de ser condenado.
3. Limpeza em 4 fases, com verificação de tipos após cada fase.
4. Validação final: `tsc` + suíte de testes (antes × depois) + build completa do Next.

## 2. Números do raio-X (antes da limpeza)

| Medida | Valor |
|---|---|
| Arquivos de código em `src/` | 1.075 (.ts/.tsx), 239.785 linhas |
| Linhas duplicadas (jscpd, ≥70 tokens) | 17.795 (7,4% do código), 1.148 clones, 717 pares de arquivos |
| Arquivos mortos (knip, projeto todo) | 818 arquivos, ~221 mil linhas |
| Exports mortos dentro de arquivos vivos | 173 exports + 63 tipos |
| Bibliotecas declaradas sem nenhum uso | 4 (`clsx`, `tailwind-merge`, `class-variance-authority`, `date-fns-tz`) |

## 3. O que foi REMOVIDO na cópia (lixo confirmado)

**Total: 1.343 arquivos removidos** (4.182 → 2.839, fora bibliotecas). Em `src/`: 1.075 → 981
arquivos, 239.785 → 217.505 linhas (**−22.280 linhas de código do sistema**).

### Fase A — lixo que nem é do sistema
- **`.aiox-core/`** — sistema de robôs ANTIGO (opencode/aiox, aposentado no CLAUDE.md §4).
  529 arquivos mortos flagrados (~182 mil linhas); pasta inteira removida. `.aiox/` (conhecimento) foi MANTIDA.
- **`.gemini/` e `.opencode/`** — sobras de ferramentas antigas.
- **`tsl-bridge-setup/`** — duplicata byte a byte de `scripts/tsl-bridge/` (1.027 linhas).
- **Raiz do projeto** — 8 arquivos do SITE/catálogo da joalheria (admin-showcase-tab.jsx,
  catalog.jsx, erp-api.js etc., ~3.3 mil linhas — código de outro projeto largado aqui) +
  5 scripts de diagnóstico soltos (diag_*.mjs, debug_ordem.mjs).
  ⚠️ *Se o site ainda precisar desses 8 arquivos, o certo é movê-los pro projeto do site antes de apagar no real.*
- **`scripts/`** — 70 scripts de uso único sem NENHUMA chamada em lugar nenhum (6.861 linhas:
  diagnósticos antigos, rodadores de migração já executada, cargas Tiny). Os 134 scripts ainda
  referenciados por configuração/outros scripts foram mantidos; 4 mencionados só em docs (740 linhas) também.

### Fase B — código morto dentro de `src/` (57 arquivos, ~14,2 mil linhas)
Destaques (lista completa: `knip-arquivos-mortos.txt` na cópia):
- **2 telas antigas de "Nova Venda"** — `NovaVendaClient.tsx` (1.837) + `NovaVendaClientLegado.tsx`
  (1.822). Só a V2 é usada. Eram a maior fonte de duplicação do sistema (~2,5 mil linhas clonadas).
- **Tela de configurações ANTIGA inteira** — `src/components/configuracoes/` (34 componentes,
  ~4,3 mil linhas). A tela atual vive em `app/(dashboard)/configuracoes/` e não usa nada dali.
- KanbanClient, Viewer3D, SearchPalette, DashboardClient/Dashboard antigos, PixPointInline,
  QuebraDrillDown, UserEditDrawer, AprovacaoFreteModal, usePolling e outros.
- **Mantido de propósito:** `src/lib/api-handler.ts` (padrão novo de rota documentado no CLAUDE.md §8
  — ainda sem nenhuma rota adotante; decidir adotar ou aposentar).

### Fase C — módulos abandonados por decisão do dono (livro §8)
- **NF-e/fiscal** — 30 arquivos, 6.202 linhas: telas `/fiscal/*`, 10 rotas `api/fiscal/*`,
  componentes e payloads. Costura feita nas telas vivas: lista de vendas, detalhe da venda,
  devoluções (botões "Emitir NFC-e/NF-e" removidos), menus e permissões.
- **Conciliação bancária** — aba "Bancário" do Financeiro (função de 330 linhas), página
  `/financeiro/bancario`, 4 rotas (`extratos`, `lancamentos`, `conciliar`, `upload-ofx`) e
  4 arquivos de teste. As consultas às tabelas `fin_extratos_bancarios`/`fin_lancamentos_bancarios`
  saíram do carregamento do Financeiro (`_data.ts`).
- **MANTIDA a "Conciliação MP"** (`/financeiro/conciliacao` + `conciliacao-pendente`) — é outra
  coisa: conferência de pagamentos Mercado Pago, viva e usada.

### Fase D — catálogo de dependências
- Removidas do `package.json` as 4 bibliotecas sem nenhum uso.
- **NÃO removidas** as 6 devDependencies suspeitas (`pg`, `exceljs`, `fs-extra`, `inquirer`,
  `yaml`, `@clack/prompts`) — scripts vivos podem usá-las; conferir com calma depois.

## 4. Validação (o "juiz")

| Prova | Antes (cópia intacta) | Depois (cópia limpa) |
|---|---|---|
| `npx tsc --noEmit` | 0 erros | **0 erros** (conferido após CADA fase) |
| Testes (vitest) | 910 ✓ / 112 ✗ / 1 pulado | **613 ✓ / 80 ✗ / 1 pulado** |
| Build completa (`next build`) | — | **OK — 0 erros, todas as rotas geradas** |

- A queda no total de testes (1.023 → 694) é esperada: os arquivos de teste da conciliação
  abandonada e do `.aiox-core` foram removidos junto com os módulos.
- As 13 suítes que ainda falham **já falhavam antes** (falhas antigas de webhooks/HMAC e
  Mercado Pago, documentadas no handoff de ontem). **Zero falha nova.**

### 4.1 Build
`npx next build` na cópia limpa (apontando pro banco de teste `erp_teste`): **concluída com
sucesso, exit 0, zero erros** — todas as páginas e rotas de API compilaram e a tabela de rotas
foi gerada completa. É a prova mais forte de que a limpeza não quebrou nada que o sistema usa.

## 5. O que foi ENCONTRADO mas NÃO mexido — duplicação em código VIVO (precisa de plano aprovado)

Remoção de lixo é segura; consolidar código vivo é refatoração — fica para decisão e plano próprio:

| Cluster | Tamanho | Sugestão |
|---|---|---|
| **Compras × Compras-Comercial** | módulos gêmeos: rotas 60–87% idênticas, clients 1.629 + 1.049 linhas | extrair núcleo comum com bandeira fábrica/comercial |
| Purificação: `LigacaoTab` × `PurificacaoClient` | 457 linhas iguais | extrair componentes compartilhados |
| 4 modais "Nova Ordem …" | 250 + 148 linhas copiadas | já existe `NovaOrdemServicoBaseModal`; migrar os 4 |
| Pagamentos: `CartaoInline` × `MercadoPagoCobranca` + rotas criar-link/criar-pix (PagBank × MP) | 163 + 151 + 123 | núcleo de cobrança único por gateway |
| `ApontamentoDistModal` × `ApontamentoPCPModal` | 187 | base comum |
| `getComissao()` copiada 2× (V2 e Detalhe da Venda) | — | extrair para `src/lib` |
| `SUM(saldo)` reimplementado em 7 rotas | — | extrair para `src/lib` (pitfall conhecido do CLAUDE.md) |
| `DevolucoesClient` × `ValeTrocaClient` | 108 | avaliar |
| Duplicação interna: `dashboard-comercial/page.tsx`, `FinanceiroClient` | 174 + 133 | fatiar quando tocar nesses arquivos |

**Arquivos gigantes** (fatiar aos poucos, nunca "big bang"): VendaDetalheClient 4.532 linhas,
OrcamentoClient 4.418, NovaVendaClientV2 3.691, FinanceiroClient ~3.29 mil (já emagreceu 330),
gestão-estoque/Dashboard 2.883, ServiceApp 2.758, ProdutoDrawer 2.757.

**Limpeza fina futura:** 173 exports + 63 tipos mortos dentro de arquivos vivos.

## 6. Como aplicar no repositório REAL (aguarda o "pode" do Alisson)

1. Repetir as fases A→D no repositório real (as listas exatas estão na cópia:
   `knip-arquivos-mortos.txt`, `scripts-lixo-real.txt`) — ou espelhar a cópia validada.
2. Commit em blocos separados (um por fase) na `homolog`, depois dos 195 arquivos de ontem
   (ordem: primeiro salvar ontem, depois o pente-fino — são trabalhos distintos).
3. `tsc` + testes após cada bloco. NADA vai para produção/`main` sem aprovação separada.
4. Depois de aplicado: atualizar CLAUDE.md §3 (pitfalls que citam arquivos removidos),
   docs/arquitetura.md e CHANGELOG.

## 7. Decisões pendentes (Alisson)

1. **Aplicar a limpeza no repositório real?** (fases A–D; a cópia prova que não quebra nada)
2. Os **8 arquivos do site** na raiz: mover pro projeto do site ou apagar de vez?
3. **Conciliação bancária**: ontem a tela foi "consertada" na cópia de teste do banco; o livro diz
   que o módulo foi abandonado. Este pente-fino seguiu o livro (removeu). Confirmar que é isso mesmo.
4. `api-handler.ts` (padrão novo sem adoção): adotar nas próximas rotas ou aposentar?
5. Consolidações do §5 (código vivo): quais entram no plano e em que ordem?
