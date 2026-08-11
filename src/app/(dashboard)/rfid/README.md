# Módulo RFID — Alisson ERP

Cadastro individual de tag RFID com impressão via Zebra Browser Print e
verificação read-back. Inclui tela de calibração de tag (`^HR`).

## Hardware

- **Impressora:** Zebra ZD500R (USB, desktop RFID, single antenna A1, 203 dpi)
- **Encoder:** ThingMagic Gen2 V2 (ISO 18000-63 / RAIN)
- **Tag:** Jewelry loop UHF Gen2, chip M4QT, EPC 96 bits
- **Leitor:** TSL 1128 (Bluetooth) — fase 2

## Arquitetura

```
┌─────────── Hetzner (app Next.js) ─────────┐
│  Páginas:  /rfid/cadastro                 │
│            /rfid/calibrar                 │
│            /rfid/testar                   │
│  APIs:     /api/rfid/cadastrar            │
│            /api/rfid/confirmar-impressao  │
│            /api/rfid/reverter             │
│            /api/rfid/reimprimir           │
│            /api/rfid/sessao               │
│            /api/rfid/produto-preview       │
│            /api/rfid/lookup               │
│            /api/rfid/inventario           │
│            /api/rfid/scan                 │
│            /api/rfid/imprimir             │
│            /api/rfid/produtos-disponiveis │
│            /api/rfid/categorias-disponiveis│
│  DB:       alissonerp.joias_rfid          │
│            alissonerp.joias_leituras      │
│            alissonerp.epc_serial_rfid     │
└───────────────────────────────────────────┘
              ↕ HTTPS
┌──────── Notebook da fábrica ──────────────┐
│  Browser (Chrome/Edge)                    │
│    ↕ HTTPS 127.0.0.1:9101                  │
│  Zebra Browser Print (v1.3+ agente)       │
│    └─ envia ZPL por USB → Zebra ZD500R    │
└───────────────────────────────────────────┘
```

## Pré-requisitos para imprimir

1. Impressora Zebra ZD500R **ligada** e conectada via USB
2. Driver Zebra instalado no SO
3. **Zebra Browser Print v1.3+** instalado:
   - Download: <https://www.zebra.com/us/en/support-downloads/printer-software/printer-setup-utilities/browser-print.html>
   - Abrir o utilitário e deixar rodando em background
   - v1.3+ expõe HTTPS em `localhost:9101` com certificado confiável
   - Configurar **Accepted Hosts** com o domínio do app
4. Mídia RFID carregada (não etiqueta comum — precisa tag RFID)
5. Calibrar mídia antes do primeiro uso (comprimento/gap via painel da impressora)

## Formato do EPC

EPC 96-bit armazenado como **24 dígitos numéricos** (0-9 apenas).

```
1001{id_produto 9 dígitos}{serial 11 dígitos} = 24 dígitos
```

- `1001` — prefixo fixo Alisson ERP (4 dígitos)
- `id_produto` — ID do produto do Tiny (9 dígitos, zero-padded)
- `serial` — sequencial global (11 dígitos, zero-padded)

Exemplo: `100100003918700000000001`
→ prefixo `1001`, produto `000039187`, serial `00000000001`
→ Formatado para exibição: `1001-000039187-00000000001`

### Gravação no chip

O EPC é enviado diretamente como hex numérico no comando `^RFW,H`.
Cada par de caracteres é interpretado como um byte hex:
`"10"` → 0x10, `"01"` → 0x01, etc.

**NÃO** usar Buffer.from / ASCII encoding — isso é um erro comum
que introduz uma camada ASCII indesejada (ex.: `"1"` → 0x31 em vez de nibble 0x1).

### Coexistência com formato legado

Etiquetas com prefixo `0000` (formato externo legado) continuam válidas.
A resolução de produto é feita por lookup com fallback — o sistema tenta
parsear EPC interno (formato `1001`) e, se falhar, faz lookup direto por
EPC na tabela `joias_rfid`.

## Fluxo de cadastro

1. Abrir **Suprimentos > Cadastrar Tag RFID** no sidebar
2. Conferir que o banner de status mostra "Zebra Browser Print conectado" (verde)
3. Buscar produto por SKU ou nome (mín. 2 chars, debounce 250ms)
4. Selecionar com ↑↓ + Enter ou clique
5. Conferir dados no card (SKU, nome, categoria, peso, preço)
6. Clicar **"Gerar EPC e Imprimir"** (ou `Ctrl+P`)
7. O sistema gera o EPC, cadastra como `pendente_impressao`, envia ZPL
8. A impressora grava, relê e devolve o EPC ao host (read-back)
9. Sistema interpreta a resposta:
   - ✅ **EPC confere** → status `ativo` + toast verde
   - ❌ **VOID / NO TAG FOUND / divergente** → reverte (remove registro) + toast vermelho
10. Repetir (campo de busca volta com foco automático)

### Fluxo transacional (back+front)

```
Click "Imprimir"
  ↓
POST /api/rfid/cadastrar { produto_id }
  ↓ 200 { epc, zpl }
gerarProximoSerial()  → alissonerp.epc_serial_rfid
buildEpc(id_produto, serial)
INSERT joias_rfid (status='pendente_impressao')
INSERT joias_leituras (evento='cadastro')
  ↓
enviarEVerificar(device, zpl) via Zebra Browser Print
  ├── EPC confere        → POST /api/rfid/confirmar-impressao → status='ativo' + toast verde
  ├── VOID / NO TAG      → POST /api/rfid/reverter            → DELETE + toast vermelho
  └── Divergente         → POST /api/rfid/reverter            → DELETE + toast vermelho
```

Garantia: nunca fica joia "pendente_impressao" sem etiqueta física impressa.
Se o browser fechar no meio, a joia fica em `pendente_impressao` e pode ser
detectada/limpa em futuro garbage collector.

## Calibração de tag RFID

Tela `/rfid/calibrar` — restrita a `admin`, `desenvolvedor`, `gerente_fabrica`.

Envia o comando `^HR` para a ZD500R, que executa a calibração automática:
- Move a mídia 1 mm por vez
- Lê o TID do chip para identificar o tipo de tag
- Determina a posição ideal de programação
- Calcula os melhores níveis de potência read/write
- Duração: até ~5 minutos
- Resultados devolvidos ao host como tabela

A seta `<---****` na resposta indica a posição/potência válidas encontradas.

Execute a calibração sempre que:
- Trocar o modelo/lote de etiquetas RFID
- As gravações começarem a falhar com frequência
- O posicionamento da mídia for alterado

## Roles permitidas

| Role | Cadastrar? | Calibrar? |
|---|---|---|
| `admin` | ✅ | ✅ |
| `desenvolvedor` | ✅ | ✅ |
| `gerente_fabrica` | ✅ | ✅ |
| `estoquista_fabrica` | ✅ | ❌ |
| Outros | ❌ (403) | ❌ (403) |

## Atalhos de teclado

| Tecla | Ação |
|---|---|
| `↑` `↓` | Navegar resultados da busca |
| `Enter` | Selecionar produto |
| `Ctrl+P` | Gerar EPC e imprimir (se produto selecionado e impressora conectada) |
| `Esc` | Limpar seleção |

## Troubleshooting

| Sintoma | Causa provável | Solução |
|---|---|---|
| "Zebra Browser Print não encontrado" | Agente não está rodando | Instalar/abrir Browser Print v1.3+ |
| "Nenhuma impressora encontrada" | Browser Print roda mas USB ausente | Verificar cabo + liga da ZD500R |
| Etiqueta em branco | Mídia RFID errada | Trocar por tag RFID (não comum) |
| EPC não lê no leitor (futuro) | Potência de gravação baixa | Executar calibração `^HR` em /rfid/calibrar |
| QR cortado | Tamanho da tag diferente de 74x20mm | Ajustar `^PW` e `^LL` em `src/lib/rfid/zpl.ts` |
| Falha "Sem permissão" | Role sem acesso | Validar `alissonerp.usuarios.role` |
| NO TAG FOUND recorrente | Posição de programação descalibrada | Executar calibração `^HR` |
| EPC divergente | Colisão de tags (múltiplas no campo) | Afastar etiquetas próximas e reimprimir |
| Browser Print não descobre ZD500R | Accepted Hosts não configurado | Adicionar domínio do app no painel Browser Print |
| Mixed content warning no console | Browser Print < v1.3 (HTTP) | Atualizar para v1.3+ (HTTPS na 9101) |

## Arquivos principais

```
src/app/(dashboard)/rfid/cadastro/page.tsx           # entrypoint cadastro
src/app/(dashboard)/rfid/cadastro/CadastroRfidClient.tsx  # UI do cadastro
src/app/(dashboard)/rfid/calibrar/page.tsx            # entrypoint calibração
src/app/(dashboard)/rfid/calibrar/CalibrarRfidClient.tsx  # UI da calibração
src/app/(dashboard)/rfid/testar/page.tsx              # tela de teste/diagnóstico

src/lib/rfid/tipos.ts             # tipos, schemas Zod, constantes
src/lib/rfid/epc.ts               # build/parse/validate/format EPC
src/lib/rfid/zpl.ts               # gerador de ZPL (^RFW,H + ^RFR + ^HV)
src/lib/rfid/browser-print.ts     # wrapper SDK Browser Print (client only)
src/lib/rfid/verificacao.ts       # interpretador de resposta (read-back)
src/lib/rfid/repo.ts              # repositório DB (server only)
src/lib/rfid/roles.ts             # constantes de roles/permissões
src/lib/rfid/__tests__/zpl.test.ts  # testes unitários do ZPL

src/components/rfid/BuscaProduto.tsx       # autocomplete de produto
src/components/rfid/CardProdutoPreview.tsx # card de preview do produto
src/components/rfid/PreviewEtiqueta.tsx    # preview visual da etiqueta
src/components/rfid/BannerImpressora.tsx   # status da impressora
src/components/rfid/BotaoImprimir.tsx      # botão de impressão
src/components/rfid/PainelCalibracao.tsx   # painel de calibração ^HR
src/components/rfid/SessaoSidebar.tsx      # sessão atual/sidebar

src/hooks/rfid/useBuscaProduto.ts   # hook de busca com debounce
src/hooks/rfid/useImpressora.ts     # hook de descoberta da impressora
src/hooks/rfid/usePrintFlow.ts      # hook do fluxo completo de impressão
src/hooks/rfid/useSessao.ts         # hook de sessão RFID
src/hooks/rfid/useCalibracao.ts     # hook de calibração ^HR

src/app/api/rfid/cadastrar/route.ts              # gera EPC + cadastra pendente
src/app/api/rfid/confirmar-impressao/route.ts    # confirma gravação → ativo
src/app/api/rfid/reverter/route.ts               # reverte cadastro pendente
src/app/api/rfid/reimprimir/route.ts             # reimpressão com mesmo EPC
src/app/api/rfid/sessao/route.ts                 # dados da sessão
src/app/api/rfid/produto-preview/route.ts        # preview de produto
src/app/api/rfid/lookup/route.ts                 # lookup de EPCs
src/app/api/rfid/inventario/route.ts             # consulta de inventário
src/app/api/rfid/scan/route.ts                   # scan/leitura
src/app/api/rfid/imprimir/route.ts               # impressão direta
src/app/api/rfid/produtos-disponiveis/route.ts   # lista produtos sem RFID
src/app/api/rfid/categorias-disponiveis/route.ts # categorias com pendências

supabase/migrations/134_modulo_rfid.sql           # schema inicial
```

## Próximas fases (não implementadas)

- **Fase 1b:** cadastro em lote (planilha CSV com lista de SKUs)
- **Fase 2:**  contagem via TSL 1128 (Bluetooth + Web Bluetooth API)
- **Fase 3:**  modo "Geiger" (busca de peça específica por RSSI)
- **Fase 3:**  integração iPhone (HID ou Capacitor)
- **Fase 3:**  import de tags já cadastradas no app RFIDMoura
