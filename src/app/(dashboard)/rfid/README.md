# Módulo RFID — Alisson ERP

Fase 1a: cadastro individual de tag RFID com impressão via Zebra Browser Print.

## Hardware

- **Impressora:** Zebra ZD621R (USB)
- **Tag:** jewelry loop UHF Gen2, chip M4QT, EPC 96 bits
- **Leitor:** TSL 1128 (Bluetooth) — fase 2

## Arquitetura

```
┌─────────── Hetzner (app Next.js) ─────────┐
│  Página:  /rfid/cadastro                  │
│  APIs:    /api/rfid/cadastrar            │
│           /api/rfid/confirmar-impressao   │
│           /api/rfid/reverter              │
│           /api/rfid/reimprimir            │
│           /api/rfid/sessao                │
│           /api/rfid/produto-preview       │
│  DB:      alissonerp.joias_rfid           │
│           alissonerp.joias_leituras       │
│           alissonerp.epc_serial           │
└───────────────────────────────────────────┘
              ↕ HTTPS
┌──────── Notebook da fábrica ──────────────┐
│  Browser (Chrome/Edge)                    │
│    ↕ fetch http://127.0.0.1:9100          │
│  Zebra Browser Print (utilitário)         │
│    └─ envia ZPL por USB → Zebra ZD621R    │
└───────────────────────────────────────────┘
```

## Pré-requisitos para imprimir

1. Impressora Zebra ZD621R **ligada** e conectada via USB
2. Driver Zebra instalado no SO
3. **Zebra Browser Print** instalado:
   - Download: <https://www.zebra.com/us/en/support-downloads/printer-software/printer-setup-utilities/browser-print.html>
   - Abrir o utilitário e deixar rodando em background (porta 9100)
4. Mídia RFID carregada (não etiqueta comum — precisa tag RFID)

## Formato do EPC

```
AJ{AA}{NNNNNNNN}
```

- `AJ` — prefixo Alisson Joias
- `AA` — ano em 2 dígitos (26 = 2026)
- `NNNNNNNN` — serial sequencial (8 dígitos)
- Total: 12 chars ASCII = 24 hex = 96 bits (EPC Gen2)

Exemplo: `AJ2600000001` → gravado na tag como `414A32363030303030303030303031`

## Fluxo de uso

1. Abrir **Suprimentos > Cadastrar Tag RFID** no sidebar
2. Conferir que o banner de status mostra "Zebra Browser Print conectado" (verde)
3. Buscar produto por SKU ou nome (mín. 2 chars, debounce 250ms)
4. Selecionar com ↑↓ + Enter ou clique
5. Conferir dados no card (SKU, nome, categoria, peso, preço)
6. Clicar **"Gerar EPC e Imprimir"** (ou `Ctrl+P`)
7. A etiqueta sai da Zebra — o sistema confirma
8. Repetir (campo de busca volta com foco automático)

## Fluxo transacional (back+front)

```
Click "Imprimir"
  ↓
POST /api/rfid/cadastrar { produto_id }
  ↓ 200 { epc, zpl }
INSERT joias_rfid (status='pendente_impressao')
INSERT joias_leituras (evento='cadastro')
  ↓
enviarZpl(device, zpl) via Zebra Browser Print
  ├── OK   → POST /api/rfid/confirmar-impressao → status='ativo' + toast verde
  └── ERRO → POST /api/rfid/reverter            → DELETE tudo + toast vermelho
```

Garantia: nunca fica joia "pendente_impressao" sem etiqueta física impressa.
Se o browser fechar no meio, a joia fica em `pendente_impressao` e pode ser
detectada/limpa em futuro garbage collector.

## Roles permitidas

| Role | Pode cadastrar? |
|---|---|
| `admin` | ✅ |
| `desenvolvedor` | ✅ |
| `gerente_fabrica` | ✅ |
| `estoquista_fabrica` | ✅ |
| Outros | ❌ (403) |

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
| "Zebra Browser Print não encontrado" | Utilitário não está rodando | Instalar/abrir o Browser Print |
| "Nenhuma impressora encontrada" | Browser Print roda mas USB ausente | Verificar cabo + liga da ZD621R |
| Etiqueta em branco | Mídia RFID errada | Trocar por tag RFID (não comum) |
| EPC não lê no leitor (futuro) | Potência de gravação baixa | Ajustar `^RFW` no template ZPL |
| QR cortado | Tamanho da tag diferente de 50x10mm | Ajustar `^PW` e `^LL` em `src/lib/rfid-zpl.ts` |
| Falha "Sem permissão" | Role sem acesso | Validar `alissonerp.usuarios.role` |

## Arquivos principais

```
src/app/(dashboard)/rfid/cadastro/page.tsx       # entrypoint da rota
src/app/(dashboard)/rfid/cadastro/CadastroRfidClient.tsx  # toda a UI
src/lib/zebra-browser-print.ts                   # wrapper fetch para Zebra
src/lib/rfid-zpl.ts                              # gerador de ZPL (server)
src/app/api/rfid/*                               # 6 endpoints
supabase/migrations/134_modulo_rfid.sql          # schema inicial
```

## Próximas fases (não implementadas)

- **Fase 1b:** cadastro em lote (planilha CSV com lista de SKUs)
- **Fase 2:**  contagem via TSL 1128 (Bluetooth + Web Bluetooth API)
- **Fase 3:**  modo "Geiger" (busca de peça específica por RSSI)
- **Fase 3:**  integração iPhone (HID ou Capacitor)
- **Fase 3:**  import de tags já cadastradas no app RFIDMoura
