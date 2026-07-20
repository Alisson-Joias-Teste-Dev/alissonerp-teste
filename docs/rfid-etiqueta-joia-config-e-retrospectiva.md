# RFID — Etiqueta de Joia (ZD500R): configuração e retrospectiva

> **NÃO PERDER esta configuração.** Ela foi dialada no hardware real (Zebra ZD500R,
> 203dpi) e é a única combinação que imprime a etiqueta de joia no esquadro e legível.
> A config de impressão está cravada no código (`src/lib/rfid/zpl.ts`), não só na
> impressora — se a impressora resetar/for trocada, o sistema continua mandando os
> valores certos.

Branch: `feat/rfid-impressao-zebra` (PR #108). Data: 18/07.

---

## 1. Estado atual — FUNCIONA ponta a ponta ✅

- Selecionar produto → **Gerar EPC e Imprimir** → grava o chip (`^MMF`+`^RFW`),
  relê (`^RFR`+`^HV`), o front confere o EPC e o registro cai no banco.
- **Testado com chip real pelo sistema** (banco LOCAL de teste) — gravou, conferiu
  o readback e o banco bateu.
- 30 testes verdes (`src/__tests__/rfid/zpl.test.ts`), `tsc` limpo.

---

## 2. Configuração de impressão (a parte crítica)

Tudo vive em `src/lib/rfid/zpl.ts` (constantes no topo + `gerarZplEtiquetaJoia`).

| Parâmetro | Valor | Por quê |
|---|---|---|
| **Darkness** | `~SD11` | Lever REAL de intensidade (0–30). Emitido pelo sistema em TODO job. `print.tone`/`media.darkness` são espelho/legado — **mexer neles NÃO clareia**. Estava no máximo (30) fechando o "6". |
| **Largura** | `^PW576` | Enquadramento horizontal. Essa firmware **IGNORA `^LS`, `^LH` e `zpl.left_position`** — `^PW` é o único lever (aumentar ^PW empurra o conteúdo p/ a ESQUERDA). |
| **Comprimento** | `^LL568` | O gap da mídia limita o comprimento real. |
| **Velocidade** | `^PRB` (3 ips) | Bordas mais nítidas p/ texto pequeno. |
| **Modo** | `^MMF` | RFID (encode + readback). |
| **Posição do chip** | `^RS8,<pos>,,3,N` | `pos` vem da **calibração** (`rfid_etiqueta_modelo.posicao_rfid`, ex.: `F1`). |

### Geometria da tag
Liner 70×35mm. Dois lobos à esquerda **colados costas-com-costas** (dupla face — não é
dobra); rabo fino à direita fica em branco. Cada lobo ~25×10mm.

### Layout (posições `^FO`, em dots — 8/mm)
- **FRENTE (lobo de cima):**
  - SKU — `^FO34,56 ^AEN,30,17` (fonte **OCR-B**, número não fecha)
  - Nome — `^FO34,88 ^ADN,18,10 ^FB196,2` (fonte **D**, quebra 2 linhas)
  - EPC — `^FO34,142 ^A0N,12,12` (texto; OCR-B não cabe — ver lição abaixo)
- **VERSO (lobo de baixo, impresso 180° p/ ler certo depois de colar):**
  - "Alisson" — `^FO86,190 ^ADI,20,11` (fonte D invertida)
  - Logo do leão — `^FO98,212 ^GFA…` (bitmap 1-bit da `public/logo.leaoverde.webp`,
    threshold 210, já girado 180°, ~53×42 dots)
- **Sem código de barras / sem QR** — a peça é controlada pelo chip (EPC).

### Calibração (não perder)
- Chip achado com varredura ampla `^XA^HR,,B30,A,A^XZ` (o default B20 não achava) →
  posição **F1**, chip NXP.
- Calibração de mídia: `~JC`; `label_length` ≈ 304 dots (gap).
- `zpl.left_position` = **0** (tinha 168 empurrando pra direita; zerado).

---

## 3. Erros e acertos (lições)

**Acertos**
- Testar o VISUAL em modo térmico (`^MMT`) via TCP 9100 (`/dev/tcp` do Windows) **sem
  gastar chip** — só passar p/ `^MMF` quando o layout já batia.
- Consultar o agente `zebra-zd500r` (KB oficial) achou o lever de darkness certo.
- Guardar a config no código (não só na impressora) = impossível perder.

**Erros / becos (e a lição)**
- Perdi tempo tentando mover o conteúdo com `^LS` e `zpl.left_position` — **essa
  firmware ignora os dois**. Lição: nessa ZD500R, posição horizontal = `^PW`.
- Baixei `print.tone` de 30→18 e a impressão não mudou — **é variável espelho/legado**.
  Lição: darkness = `~SD` (absoluto), e persistir/emitir explicitamente.
- Tentei o EPC completo em **OCR-B** e estourou a etiqueta — **font E (OCR-B) é bitmap
  de tamanho fixo, não encolhe**; 24 dígitos dão ~45mm > lobo de 25mm. Lição: OCR-B só
  p/ número curto (SKU); EPC longo fica em fonte escalável (fonte 0).
- Achei que o "sem SKU" era dado faltando no banco — era **contrato quebrado** (a rota
  da lista não devolvia `tem_sku_e_nome`). Lição: conferir o dado no banco antes de
  culpar o banco.

**2 bugs do módulo corrigidos no teste**
1. `/api/rfid/produtos-disponiveis` não retornava `tem_sku_e_nome` → todo produto dava
   "sem SKU" e o botão travava. Fix: a rota calcula `Boolean(sku) && Boolean(nome)`.
2. `usePrintFlow.enviar()` lançava "sem EPC no estado" — corrida do React (`stateRef` só
   atualiza no próximo render, e `enviar()` roda antes). Fix: `epcRef` setado síncrono
   no `cadastrar()`.

---

## 4. Onde paramos / o que falta

- [ ] **Commitar** a branch `feat/rfid-impressao-zebra` (merge é manual do Jonathan).
- [ ] **Migration 351** (`rfid_etiqueta_modelo`) → homolog/prod, **assinada** (PGAPPNAME).
      Hoje só existe no LOCAL.
- [ ] Finalizar o **PR #108**.
- [ ] Pendências antigas: SDK BrowserPrint vendorizado; cert 9101 com SAN p/ HTTPS em prod.

## Arquivos tocados nesta rodada
- `src/lib/rfid/zpl.ts` — layout final + config de impressão (constantes) + emite `~SD11`.
- `src/app/api/rfid/produtos-disponiveis/route.ts` — fix `tem_sku_e_nome`.
- `src/hooks/rfid/usePrintFlow.ts` — fix corrida do EPC (`epcRef`).
- `src/components/rfid/PainelLayoutEtiqueta.tsx` — call-site sem código de barras.
- `src/__tests__/rfid/zpl.test.ts` — testes atualizados (30 verdes).
