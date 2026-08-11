# Manual — Impressora Zebra ZD500R e módulo RFID do AlissonERP

> Documento de referência técnica completa. Fontes: dossiês oficiais do fabricante
> (`.claude/zebra-zd500r-kb/*.md`, citados como **[Zebra-RFID3]**, **[Zebra-ZPL]**,
> **[GS1-Gen2]**, **[Zebra-devtools]**), o código do módulo (`src/lib/rfid/`,
> `src/hooks/rfid/`, `src/app/api/rfid/`, `src/components/rfid/`) e a retrospectiva
> de bancada `docs/rfid-etiqueta-joia-config-e-retrospectiva.md` (18/07, validada em
> hardware real). Fatos do fabricante citam a fonte; achados só confirmados no
> hardware da loja citam "retrospectiva 18/07"; o que não foi encontrado em nenhuma
> fonte está marcado **[NÃO CONFIRMADO]** — não deve ser tratado como verdade até
> alguém confirmar.
>
> Revisão técnica pendente: Opus (fez os testes reais no hardware).

---

## 1. Visão geral

- **Modelo:** Zebra **ZD500R** — impressora desktop de etiquetas com codificação
  **RFID passivo** embutida. [Zebra-devtools]
- **Resolução:** **203 dpi (8 dots/mm)** padrão; existe variante opcional 300 dpi
  (12 dots/mm), mas o sistema assume 203 dpi (`DOTS_PER_MM = 8` em
  `src/lib/rfid/tipos.ts`). [Zebra-devtools, spec sheet ZD500R]
- **Largura máxima de impressão:** 4.09 in / 104 mm. [Zebra-devtools]
- **RFID:** **UHF EPC Gen2 V2**, ISO/IEC 18000-63, RAIN RFID. Encoder/leitor
  **ThingMagic** integrado ("Adaptive Encoding Technology"). Antena única (fixa em
  `A1`). [Zebra-devtools]
- **Pitch mínimo de codificação:** 16 mm (distância mínima entre tags para
  conseguir imprimir E gravar). [Zebra-devtools]
- **Firmware:** linha **V74** — a versão vista no aviso da UI de calibração
  (`PainelCalibracao.tsx`) e nos dossiês é **V74.19.6Z / V74.20.01ZB**. Nessa
  versão, **recalibrar o comprimento da mídia reseta a programming position da
  tag para o default** — é preciso recalibrar o RFID (`^HR`) depois de qualquer
  recalibração de mídia. [Zebra-RFID3 p.12, confirmado no aviso da tela de
  calibração]
- **Status do modelo:** a ZD500R está **descontinuada** pela Zebra ("no longer
  offering this product for sale"); sucessora indicada é a **ZD621R**. Os
  recursos de suporte da ZD500R não recebem mais atualização, mas continuam
  disponíveis para download. [Zebra-devtools, página EOL]
- **Conexão física: REDE, IP `192.168.3.97`.** ✅ **CONFIRMADO em bancada**
  (sessão 18–20/07): o conteúdo foi enviado direto para `192.168.3.97:9100` (TCP
  raw, via `/dev/tcp`) dezenas de vezes — `getvar` de configuração (dpi,
  `ezpl.print_width`, darkness) e **todos** os prints térmicos de teste passaram
  por esse IP e a impressora respondeu.
  - ⚠️ Os docs antigos do projeto (`docs/regras-negocio/rfid.md` §7 e
    `src/app/(dashboard)/rfid/README.md`) ainda dizem **USB** → estão
    **desatualizados** (impressora foi para a rede). Corrigir esses docs.
  - **Dois caminhos de envio, ambos válidos:** (a) **Browser Print** — o front da
    loja manda o ZPL para a impressora adicionada por IP no agente; (b) **TCP 9100
    raw** — usado apenas para testes de bancada (imprimir térmico sem gastar chip).

---

## 2. Conexão / transporte

### 2.1 Zebra Browser Print (transporte principal)

- SDK **Zebra Browser Print v1.3+**, um agente que roda no PC da loja e expõe uma
  API local para o navegador conversar com a impressora sem driver nativo no
  browser.
- **Porta 9101 — HTTPS.** A partir da v1.3.0 o agente deixou de usar certificado
  autoassinado ("Https no longer uses a self signed certificate"), permitindo que
  uma página **HTTPS** (o AlissonERP roda em HTTPS na Hetzner) chame
  `https://localhost:9101/...` sem erro de mixed content nem aviso de
  certificado inseguro. **Exceção: Safari** ainda exige aceitar o certificado
  manualmente — limitação documentada da própria Zebra. [Zebra-devtools, Browser
  Print User Guide v1.3]
- **Portas 9100 e 9101** são as usadas para RAW printing (ZPL); "Browser Print
  não roda se outro programa já estiver usando a 9100 ou 9101 da máquina".
  [Zebra-devtools]
- **CORS / autorização:** o controle é por listas **Accepted Hosts / Blocked
  Hosts** dentro do próprio agente Browser Print — na primeira visita o usuário
  aprova um pop-up ("allow the website to access your system's printers"), e o
  domínio do ERP precisa estar na lista de Accepted Hosts do agente instalado no
  PC da loja (`README.md` do módulo lista isso como pré-requisito nº 3).
  [Zebra-devtools]
- Endpoints REST usados pela lib JS (`/available`, `/default`) são confirmados
  em material oficial; os endpoints `/write`, `/read`, `/config` usados
  internamente pela `BrowserPrint.js` são plausíveis mas **[NÃO CONFIRMADO]** em
  URL pública — a doc canônica deles vive no arquivo `Documentation/BrowserPrint.js`
  que acompanha o instalador, não numa página indexável. [Zebra-devtools]

### 2.2 SDK no AlissonERP

- Os dois arquivos do SDK estão **vendorizados** em
  `public/browser-print/BrowserPrint-3.1.250.min.js` e
  `public/browser-print/BrowserPrint-Zebra-1.1.250.min.js` (confirmado — os
  arquivos existem no disco, ~7.7 KB e ~12 KB, datados de 2023).
- São carregados **uma única vez para o app inteiro** pelo componente
  `src/components/rfid/RfidPrintScripts.tsx`, via `<Script strategy="afterInteractive">`,
  montado no **layout do dashboard** (`src/app/(dashboard)/layout.tsx`) — antes,
  cada tela que precisava imprimir declarava os próprios `<Script>`; hoje é
  centralizado (o Next dedupa por `src`, então não duplica `<script>` no DOM
  mesmo que algum consumidor monte o componente de novo).
- `src/lib/rfid/browser-print.ts` é o wrapper client-only sobre
  `window.BrowserPrint`: `listarImpressoras()`, `impressoraPadrao()`,
  `enviarEVerificar()` (envia ZPL + lê resposta com timeout, usado no fluxo de
  impressão normal) e `enviarECapturarAte()` (não desiste em leituras vazias —
  usado na calibração, que fica minutos em silêncio antes de responder).
  **Nunca** pode ser importado em Server Components/API routes — só roda no
  browser do PC da loja; o VPS nunca fala direto com a impressora.

### 2.3 Adicionar impressora de rede por IP

A impressora está em **rede** (IP `192.168.3.97`). O Browser Print **não descobre
impressora de rede por broadcast** — tem que ser **adicionada por IP** à mão:
painel do Browser Print (ícone na bandeja do Windows) → **Added Devices → Manage
→ Add** → informar o IP `192.168.3.97` (porta 9100). Depois ela aparece em
`getLocalDevices()` e o `useImpressora` a encontra no polling. [Confirmado em
bancada — ver memória do projeto.] O caminho de configurar o IP na própria
impressora (painel → Network / utilitário ZebraSetup) é o padrão Link-OS quando
precisar mudar o IP estático. Para teste de bancada, o envio direto por
o IP; mas **isso não está confirmado em nenhuma fonte lida para este documento**
— só documentar como procedimento real depois de confirmar com quem mexeu no
hardware.

### 2.4 TCP 9100 raw (só para testes térmicos)

- A Zebra suporta impressão RAW por TCP na porta **9100** — é o caminho padrão
  para mandar ZPL direto ao motor de impressão, mas é **via de mão única**: não
  devolve confirmação de impressão nem de gravação RFID. Para status/config
  bidirecional a Zebra recomenda a porta **9200** (aceita só comandos SGD em
  JSON). [Zebra-devtools]
- **Uso real no projeto:** durante a bancada de calibração, testar o **visual**
  da etiqueta em modo térmico (`^MMT`, sem gravar RFID) foi feito mandando ZPL
  direto pela 9100 via `/dev/tcp` do shell (Git Bash/WSL), **sem gastar chip** —
  só trocando para `^MMF` (RFID) quando o layout já estava correto. Essa foi a
  técnica de iteração rápida da bancada, não um transporte usado em produção
  pelo app (retrospectiva 18/07).

### 2.5 Estado global da impressora (zustand + polling)

- `src/stores/rfidStore.ts` — store zustand simples: `device` (ZebraDevice |
  null), `status` (`"buscando" | "conectado" | "ausente" | "erro"`).
- `src/hooks/rfid/useImpressora.ts` — hook de descoberta: usa `useQuery`
  (react-query) com `refetchInterval: 10_000` (**polling a cada 10 segundos**),
  `staleTime: 5_000`, `retry: false`. A queryFn tenta primeiro
  `impressoraPadrao()` (dispositivo padrão do Browser Print) e cai para o
  primeiro item de `listarImpressoras()` se não houver padrão definido.
  Sincroniza o resultado/erro da query de volta para o `rfidStore` via
  `useEffect`. Erro do tipo `BrowserPrintNaoInstaladoError` → status `"ausente"`;
  qualquer outro erro → status `"erro"`.
- Qualquer componente da árvore pode ler `device`/`status` do store sem duplicar
  a lógica de descoberta (ex.: `BotaoImprimirEtiqueta`, `PainelLayoutEtiqueta`).

---

## 3. Mídia e calibração

### 3.1 Tipo de mídia

✅ **CONFIRMADO em bancada (medido com o Jonathan, 18–20/07): liner 70×35mm.**
Etiqueta **"bandeira + rabo"**: dois **lobos colados costas-com-costas** (dupla
face — NÃO é dobra), cada lobo ~**25×10mm**, na esquerda; um **rabo fino em
branco** à direita (só amarra na peça). O `^RS8,<pos>,,3,N` referencia a posição
calibrada do chip dentro dessa geometria.
- ⚠️ O doc antigo `docs/regras-negocio/rfid.md` §7 ainda diz **"74×20mm"** →
  **desatualizado**, corrigir para 70×35mm.

### 3.2 Calibração de mídia (comprimento/gap) — `~JC`

- **`~JC`** é o comando ZPL genérico de calibração de **mídia** (mede
  comprimento/gap da etiqueta) — **não** é o comando de calibração RFID; a
  calibração RFID é feita por `^HR` (ver 3.3). [Zebra-devtools, doc de comandos
  RFID — o próprio dossiê alerta para não confundir os dois]
- No sistema: `PainelLayoutEtiqueta.tsx` (função `calibrarMidia`) envia
  `'~JC\r\n! U1 getvar "zpl.label_length"\r\n'` e lê de volta o comprimento em
  dots, convertendo para mm (`/8`) para sugerir a altura do modelo.
- Na bancada, o comprimento medido (`label_length`) ficou em **≈304 dots** (o
  gap real da mídia), e é esse valor — junto com `^LL` — que limita o
  comprimento efetivo impresso (retrospectiva 18/07).

### 3.3 Calibração do CHIP (posição RFID) — `^HR`

- **`^HR`** (Calibrate RFID Tag Position) inicia a calibração de tag: move a
  mídia 1 mm por vez, lê o TID para identificar o chip, calibra a posição de
  gravação (**programming position**) e determina os melhores níveis de
  potência de leitura/gravação. Pode levar **até 5 minutos**. Resultados voltam
  ao host como tabela. [Zebra-RFID3 p.37-42]
- **Formato:** `^HRa,b,c,d,e` — `c` = posição inicial da varredura, `d` =
  posição final (ou `A` = automático, para quando achar 5mm consecutivos de
  leitura/gravação OK), `e` = detecção de antena/potência (`A`=automático,
  `M`=manual). **Default de `c` no ZD500R (e demais impressoras não-ZT): `B20`.**
  [Zebra-RFID3 p.37-42]
- **Achado de bancada:** o default `B20` **não achava** o chip da etiqueta de
  joia. A varredura precisou ser **ampla**: `^XA^HR,,B30,A,A^XZ` — começa no
  recuo máximo B30, varre até achar (auto), com detecção automática de
  potência. Resultado: **posição F1**, chip identificado como **NXP**
  (retrospectiva 18/07). Essa é a chamada implementada em
  `gerarZplCalibracao()` (`src/lib/rfid/zpl.ts`).
- A tabela de retorno tem o formato `position=B14 MM,A1,18,25` +
  `tid information=E200.3414:Alien`; a seta `<---****` marca a linha
  vencedora. `src/lib/rfid/verificacao.ts` (`interpretarRespostaCalibracao`)
  faz esse parse e só considera `sucesso: true` se achar a posição **E** a
  seta. [Zebra-RFID3 p.37-42]
- **Importante (firmware V74.19.6Z):** recalibrar a **mídia** (§3.2) reseta a
  **posição de programação RFID** para o default — é preciso rodar `^HR` de
  novo depois. [Zebra-RFID3 p.12; repetido como aviso na tela de calibração]

### 3.4 `zpl.left_position`

**`zpl.left_position` é um SGD (Set-Get-Do) da própria impressora** — ✅
confirmado em bancada: lido/escrito via `! U1 getvar/setvar "zpl.left_position"`.
Estava em **168** (empurrando o conteúdo ~21mm para a direita) e foi **zerado (0)**.
NÃO é campo do `LayoutEtiqueta` (TS) nem comando no `gerarZplEtiquetaJoia()`.
- ⚠️ **Achado importante:** nesta firmware, **mudar `left_position` NÃO move a
  impressão** (setei −64, o `getvar` confirmou o novo valor, mas a saída ficou
  idêntica) — é um dos 3 quirks (§8). O enquadramento horizontal só se resolve por
  **`^PW`**. Não adianta zerar `left_position` ao trocar de impressora; use `^PW576`.

---

## 4. Configuração de impressão

Toda a configuração "que funciona de verdade" está **cravada no código**
(`src/lib/rfid/zpl.ts`, constantes no topo do arquivo) e é reemitida em **todo**
job de impressão — não depende do que estiver salvo na impressora (se a
impressora resetar ou for trocada, o sistema manda os valores certos de novo).

| Parâmetro | Comando | Valor atual | Por quê |
|---|---|---|---|
| **Darkness** | `~SD` | `~SD11` | Lever **real** de escurecimento (0–30, absoluto). [Zebra-ZPL p.331-332] |
| **Largura** | `^PW` | `^PW576` | Único lever de posição **horizontal** que essa firmware respeita. |
| **Comprimento** | `^LL` | `^LL568` | Limitado pelo gap real da mídia (~304 dots medidos na calibração). [Zebra-ZPL p.294] |
| **Velocidade** | `^PR` | `^PRB` (3 ips / 76.2 mm/s) | Bordas mais nítidas para texto pequeno. [Zebra-ZPL p.326] |
| **Modo** | `^MM` | `^MMF` | RFID — encode + read-back. Para impressoras RFID que não são a R110PAX4, `F` é o valor de RFID (a R110PAX4 usa `A`). [Zebra-ZPL p.305-306] |

### 4.1 Darkness: por que `~SD` e não `print.tone`/`media.darkness`

- **`~SD##`** (Set Darkness) define o escurecimento **absoluto**, `00` a `30`
  (dois dígitos). [Zebra-ZPL p.331-332]
- **`^MD`** (Media Darkness) é um ajuste **relativo** (-30 a 30) somado por
  cima do `~SD` salvo — por isso o sistema **não** emite `^MD` por etiqueta
  (evita empilhar ajuste em cima do valor absoluto já salvo). [Zebra-ZPL p.301]
- **`print.tone` / `media.darkness`** são variáveis **espelho/legado**: na
  bancada, baixar `print.tone` de 30→18 **não mudou nada** na impressão real —
  achado confirmado no hardware (retrospectiva 18/07), não está documentado
  como comportamento oficial nos dossiês lidos (a única fonte é o teste
  empírico). O lever que realmente altera o escurecimento é o `~SD`.
- O sistema emite `~SD11` **em todo job** justamente para não depender do valor
  que está salvo (persistido) na impressora.

### 4.2 `^PW` como lever de enquadramento horizontal

- Por especificação, `^PW` (Print Width) define a largura do rótulo em dots
  (2 até a largura física da mídia) — não é, a princípio, um comando de
  posicionamento. [Zebra-ZPL p.329]
- **Achado de bancada (não documentado pelo fabricante para este caso):** nessa
  ZD500R específica, a firmware **ignora `^LS` (Label Shift) e `^LH` (Label
  Home)** — os comandos "corretos" de deslocamento — e **também ignora**
  `zpl.left_position`. O único jeito de mover o conteúdo horizontalmente que
  funcionou na bancada foi variar o `^PW`: **aumentar `^PW` empurra o conteúdo
  para a ESQUERDA**. Essa é uma peculiaridade validada empiricamente, não um
  comportamento documentado pela Zebra nos guias lidos — tratar como
  **[achado de hardware, retrospectiva 18/07]**, não como regra geral de ZPL.

### 4.3 `^PR` — velocidade

- `^PRp,s,b` — `p` = print speed. Tabela oficial de códigos: `A/2`=50.8mm/s,
  `B/3`=76.2mm/s, `C/4`=101.6mm/s, `D/6`=152.4mm/s etc. [Zebra-ZPL p.326]
- O sistema usa **`^PRB`** = 3 ips (76.2 mm/s) — mais lento que o default,
  escolhido para bordas mais nítidas em texto pequeno (SKU/EPC na etiqueta
  pequena de joia).

### 4.4 `^MMF` (RFID) vs `^MMT` (térmico)

- **`^MM`** (Print Mode): `F` = RFID (a maioria das impressoras RFID),
  `A` = R110PAX4 especificamente, além de `T`=Tear-off, `P`=Peel-off,
  `R`=Rewind, `C`=Cutter etc. (modos gerais de impressoras não-RFID).
  [Zebra-ZPL p.305-306]
- O sistema usa `^MMF` em produção (grava o chip). Durante a bancada, trocar
  temporariamente para `^MMT` (modo térmico comum) permitiu testar só o
  **visual/enquadramento** da etiqueta sem gastar chip RFID a cada iteração —
  técnica de teste, não vai para produção (retrospectiva 18/07).

---

## 5. ZPL da etiqueta de joia

Gerado por `gerarZplEtiquetaJoia()` em `src/lib/rfid/zpl.ts`. Etiqueta
"bandeira + rabo": dois lobos colados costas-com-costas (dupla face — não é
dobra), sem código de barras nem QR (a peça é controlada pelo chip/EPC, não por
um código óptico).

```
~SD11
^XA
^PRB
^MMF
^PW576
^LL568
^LH0,0
^LS0
^CI28
^RS8,<pos>,,3,N

^FO34,56^AEN,30,17^FD<sku>^FS
^FO34,88^ADN,18,10^FB196,2,0,L,0^FD<nome>^FS
^FO34,142^A0N,12,12^FDEPC <epc-fmt>^FS

^FO86,190^ADI,20,11^FDAlisson^FS
^FO98,212<^GFA bitmap do leão>^FS

^RFW,H^FD<epc>^FS
^RFR,H^FN1^FS
^HV1,24,EPC:,^FS

^XZ
```

### Comandos usados (frente + verso)

- **`^XA` / `^XZ`** — abre/fecha o formato do rótulo (equivalem a STX/ETX). Todo
  formato ZPL II começa com `^XA` e é impresso ao fechar com `^XZ`.
  [Zebra-ZPL p.370, p.375]
- **`^CI28`** — muda o encoding do formato para **UTF-8**, necessário para nomes
  de produto com acentuação. [Zebra-ZPL p.155-157]
- **`^FO x,y`** (Field Origin) — define o canto superior-esquerdo de cada campo,
  em dots, relativo ao `^LH`. [Zebra-ZPL p.201]
- **`^AEN,30,17`** — família de fontes `^Afo,h,w` (`f`=fonte, `o`=orientação,
  `h`=altura, `w`=largura). Usado no **SKU**, com fonte residente **`E`**,
  orientação `N` (normal), altura 30, largura 17. A sintaxe genérica
  `^Afo,h,w` está confirmada [Zebra-ZPL p.60], mas a associação "fonte E =
  OCR-B" especificamente **[NÃO CONFIRMADO]** nos dossiês lidos (é conhecida na
  documentação geral de fontes residentes Zebra, mas não foi extraída/citada
  aqui) — a retrospectiva 18/07 se refere a essa fonte como "OCR-B" pelo
  comportamento observado (bitmap de tamanho fixo, não encolhe).
- **`^ADN,18,10`** / **`^ADI,20,11`** — mesma família `^A`, fonte residente
  **`D`**, orientação `N` (normal, usada no nome do produto) ou `I` (180°,
  usada no "Alisson" do verso — para ler certo depois de colar os dois lobos
  costas-com-costas). Associação exata "fonte D = qual tipografia"
  **[NÃO CONFIRMADO]** nos dossiês (mesma ressalva da fonte E acima).
- **`^A0N,12,12`** — fonte **escalável 0** (a única fonte cujo comportamento de
  escala está 100% confirmado: `f=0` é a fonte interna escalável, `h`/`w` de
  10 a 32000 dots). [Zebra-ZPL p.60] Usada no **EPC** (texto), porque a fonte
  OCR-B (E) é bitmap de tamanho fixo e **não encolhe** — 24 dígitos em OCR-B
  estouravam a etiqueta (~45mm num lobo de 25mm); a fonte escalável permite
  caber o EPC completo (retrospectiva 18/07, lição registrada).
- **`^FB196,2,0,L,0`** (Field Block) — quebra o **nome do produto** em até 2
  linhas dentro de 196 dots de largura, alinhado à esquerda (`L`), sem recuo.
  Parâmetros: `a`=largura do bloco, `b`=máx. de linhas (1–9999), `c`=espaço
  entre linhas, `d`=justificação (`L/C/R/J`), `e`=recuo. [Zebra-ZPL p.186-188]
- **`^FD...^FS`** (Field Data / Field Separator) — dado do campo (até 3072
  bytes; não pode conter `^`/`~` literais — por isso `sanitizeZpl()` substitui
  esses caracteres por espaço antes de montar o ZPL) e fecha a definição do
  campo. [Zebra-ZPL p.190, p.204]
- **`^GFA,...`** (Graphic Field) — bitmap do **logo do leão** (verso), já
  convertido para monocromático 1-bit (threshold ~210, ~53×42 dots) e **já
  rotacionado 180°** no próprio bitmap (o `^GFA` imprime como está — não gira
  por orientação de campo). A sintaxe detalhada dos parâmetros de `^GFA`
  **[NÃO CONFIRMADO]** nos dossiês lidos para este documento (não foi um dos
  comandos cobertos pelos 3 arquivos `doc-*.md` do KB — só `^BQ`/`^BC` foram
  detalhados entre os comandos gráficos/código de barras). A constante
  `LOGO_LEAO_GFA` está embutida no código para não depender de asset em
  runtime.

---

## 6. RFID encode + readback

### 6.1 Gravação — `^RFW,H`

```
^RFW,H^FD<epc>^FS
```

- **`^RF`** é o comando unificado de leitura/gravação/senha RFID:
  `^RFo,f,b,n,m` (`o`=operação, `f`=formato, `b`=senha/bloco, `n`=nº de bytes,
  `m`=banco de memória Gen2). "`^RFW`" é a notação usual para `o=W` (write);
  "`^RFR`" para `o=R` (read). [Zebra-RFID3 p.46-49]
- **Formato `H` (Hex)** é o default e o usado aqui: os dados do `^FD` são
  gravados **literalmente** byte a byte (cada par de caracteres hex = 1 byte).
  O EPC de 24 dígitos **já é** a string hex a gravar — **não** passa por
  `Buffer.from`/ASCII encoding (isso introduziria uma camada indesejada, onde
  o caractere `"1"` viraria `0x31` em vez do nibble `0x1`). Regra de ouro
  documentada no topo do `zpl.ts` e em `docs/regras-negocio/rfid.md` §1.
  [Zebra-RFID3 p.46, exemplos p.21-22]
- Banco de memória default (`m`) = **E** (EPC 96-bit): grava no endereço Gen2
  `20h`, 12 bytes. [Zebra-RFID3 p.48]

### 6.2 Read-back — `^RFR,H^FN1` + `^HV1,24,EPC:`

```
^RFR,H^FN1^FS
^HV1,24,EPC:,^FS
```

- Padrão recomendado pela própria Zebra ("RFID Label Format 5 — Encode Tag,
  Read Tag, and Return Results to Host"): depois do `^RFW`, incluir um
  `^RFR` no **mesmo campo** (`^FN1`) e devolver ao host via `^HV`, para o
  software comparar o EPC lido com o esperado. [Zebra-RFID3, "Sample RFID
  Label Formats" p.24-27]
- **`^HV#,n,h,t,a`** (Host Verification): `#`=número do campo (casa com
  `^FN1`), `n`=**quantidade de bytes a devolver**, `h`=cabeçalho ASCII
  (aqui `"EPC:"`). [Zebra-RFID3 p.43]
- **Por que `n=24` e não `12`:** o EPC de 96 bits lido por `^RFR,H` volta como
  **24 caracteres hex** (representação em texto, 2 caracteres por byte) — o
  parâmetro `n` do `^HV` conta **caracteres do campo devolvido**, não bytes
  crus da tag. Com `n=12` só metade da string hex volta, o parser (que exige
  24 caracteres) não casa, e o fluxo **revertia uma gravação boa** (interpretava
  como falha). Esse foi um bug real do módulo, corrigido em 18/07:
  `^HV1,12,EPC:,^FS` → **`^HV1,24,EPC:,^FS`** — código + comentário + teste de
  regressão que liga o `n` do ZPL gerado ao nº de caracteres exigido pelo
  parser (fonte: dossiês `PLANO-CORRECAO-rfid.md` e
  `REMEDIACAO-rfid-completa.md`, ambos no KB). **Atenção:** o arquivo
  `docs/regras-negocio/rfid.md` §4 ainda mostra o exemplo antigo com `n=12` —
  está **desatualizado** em relação ao `zpl.ts` atual; vale corrigir.

### 6.3 Interpretação da resposta — `verificacao.ts`

`interpretarRespostaGravacao(raw, epcEsperado)` nunca lança exceção; sempre
retorna `{ status, epcLido, mensagem }`. Ordem de precedência:

1. **Resposta vazia** → `"offline"` ("Impressora não respondeu").
2. Contém `"NO TAG FOUND"` → `"no_tag"` (sem etiqueta no campo de leitura).
3. Contém `"VOID"` → `"void"` (a impressora já ejetou/marcou a etiqueta como
   inválida — comportamento padrão da Zebra quando a gravação/leitura falha,
   ver `^RS` abaixo).
4. EPC extraído da resposta **confere** com o esperado → `"ok"`.
5. EPC extraído mas **diverge** → `"divergente"` (possível colisão de tags —
   mais de uma etiqueta no campo de leitura da antena).
6. Contém `"RFID OK"` (SGD `rfid.error.response`) sem EPC extraível → `"ok"`
   (fallback).
7. Nada reconhecível → `"offline"`.

A extração do EPC (`extrairEpc`) tenta, em ordem: cabeçalho `EPC:` do `^HV`
(caminho principal) → linha de log `^HL` (fallback, exige
`rfid.log.enabled=on`, pois vem desabilitado por padrão em firmware
X.20.16Z+) → qualquer sequência de 24 hex isolada por borda de palavra →
qualquer sequência de 24+ hex em qualquer lugar (último recurso).

### 6.4 VOID e tentativas — `^RS`

Embora `^RS` (Set Up RFID Parameters) não seja emitido explicitamente pelo
`zpl.ts` atual além de `^RS8,<pos>,,3,N` (que fixa `t=8` tipo de tag Gen2,
`p=<pos>` calibrada, `n=3` tentativas, `e=N` sem ação especial de erro), vale
saber o comportamento default da impressora: se a gravação falha ou a tag não
é detectada, a impressora **ejeta a etiqueta com "VOID" impresso atravessado**
e tenta reimprimir com os mesmos dados até `n` vezes (1–10, default 3).
[Zebra-RFID3 p.54-56]

### 6.5 Formato do EPC

```
1001{id_produto 9 dígitos}{serial 11 dígitos} = 24 dígitos numéricos
```

- **Prefixo `1001`** — `PREFIXO_ERP` em `src/lib/rfid/tipos.ts`, fixo, 4
  dígitos, identifica etiquetas geradas pelo AlissonERP.
- **Prefixo `0000`** — `PREFIXO_EXTERNO`, formato legado de um sistema externo
  anterior; convive (etiquetas antigas continuam válidas e saem de circulação
  aos poucos). O digitos 5–13 do formato legado eram o `id_api` do produto no
  Tiny (não o `id_produto` do ERP) — ver `reference_rfid_etiqueta_id_api_externo`.
- **`id_produto`** — 9 dígitos, zero-padded, o ID do produto (hoje o máximo
  real é 90.000.852 — 8 dígitos, folga de ~11× nos 9 dígitos disponíveis;
  `buildEpc()` lança erro se algum dia passar de 1 bilhão).
- **`serial`** — 11 dígitos, zero-padded, sequencial **global** (não por
  produto), gerado atomicamente por `alissonerp.gerar_proximo_serial_rfid()`
  (tabela `alissonerp.epc_serial_rfid`, migration `350_rfid_serial_novo_formato.sql`).
- Exemplo: `100100003918700000000001` → prefixo `1001`, produto `000039187`,
  serial `00000000001`. Formatado para exibição: `1001-000039187-00000000001`.
- Coexistência: o lookup tenta primeiro parsear como formato interno (`1001`)
  e, se falhar, faz busca direta por EPC na tabela `joias_rfid` (funciona para
  qualquer prefixo, inclusive `0000`).

---

## 7. Fluxo no sistema

### 7.1 Máquina de estados — `usePrintFlow`

`src/hooks/rfid/usePrintFlow.ts` — reducer com as fases:
`idle → cadastrando → enviando → verificando → confirmado | void | offline`.

1. **`cadastrar(produtoId)`** — `POST /api/rfid/cadastrar`: gera serial, monta
   EPC (`buildEpc`), grava a joia como `pendente_impressao` (transação única:
   joia + leitura), gera o ZPL (`gerarZplJoiaDoModelo`, usando o modelo padrão
   salvo). Retorna `{ epc, zpl }`. O EPC também é guardado num **`epcRef`**
   síncrono — não só no state do reducer — porque `enviar()` roda logo depois
   de `await cadastrar()`, **antes** do próximo render, e ler o EPC só do state
   (que só atualiza no próximo render) dava `null`. Esse era um bug real
   ("sem EPC no estado"), corrigido na rodada de 18/07.
2. **`enviar(device, zpl)`** — chama `enviarEVerificar` (Browser Print),
   interpreta a resposta com `interpretarRespostaGravacao`, despacha a ação
   correspondente (`VERIFICACAO_OK` / `_VOID` / `_DIVERGENTE` / `_OFFLINE`).
3. **`confirmar(epc)`** — `POST /api/rfid/confirmar-impressao`: só aceita se a
   joia estiver `pendente_impressao`; muda para `ativo`. Chamado só quando o
   read-back deu `"ok"`.
4. **`reverter(epc, motivo?)`** — `POST /api/rfid/reverter`: rollback total
   (deleta a joia + leituras associadas). Chamado em `void`, `no_tag`,
   `divergente` e `offline`. Garante que nunca fica uma joia
   `pendente_impressao` sem etiqueta física gravada com sucesso.

`src/hooks/rfid/useImprimirEtiqueta.ts` encapsula esse ciclo completo
(`useImpressora` + `usePrintFlow` + toasts + invalidação de query) num único
hook `imprimir(produtoId)`.

### 7.2 `<BotaoImprimirEtiqueta>` — componente reutilizável

`src/components/rfid/BotaoImprimirEtiqueta.tsx` — usa `useImprimirEtiqueta()`
internamente. Duas variantes:
- **`variant="full"`** — botão grande com overlay de progresso (via
  `<BotaoImprimir>`).
- **`variant="compact"`** — botão pequeno com ícone, para caber em headers de
  drawer/linha de tabela; mostra atalho de reconexão quando a impressora não
  está conectada.

**Onde aparece hoje (confirmado no código):**
- `src/app/(dashboard)/estoque-comercial/[produtoId]/EstoqueComercialDetalheClient.tsx`
  — variante `compact`, no painel de detalhe do produto no estoque comercial.

**Não confirmado nos outros lugares citados na tarefa:** a tela de cadastro
dedicada (`src/app/(dashboard)/rfid/cadastro/CadastroRfidClient.tsx`) tem seu
**próprio** `handleImprimir` + usa o componente base `<BotaoImprimir>`
diretamente (não o `<BotaoImprimirEtiqueta>` reutilizável) — o docstring do
hook `useImprimirEtiqueta` diz explicitamente que encapsula "o mesmo fluxo hoje
implementado" ali, sugerindo que ainda não foi migrado para usar o componente
compartilhado (possível duplicação a unificar depois). O painel de
Configurações (`PainelLayoutEtiqueta`, §7.3) também **não** usa
`<BotaoImprimirEtiqueta>` — tem seu próprio botão "Imprimir teste" com EPC
fixo de teste, propositalmente separado do fluxo real de cadastro.

### 7.3 Aba RFID em Configurações

`src/components/configuracoes/TabRfid.tsx`, registrada na tela de
Configurações como a aba **"RFID"** (`key: "rfid"`, ícone `Tag`) em
`PaginaConfiguracoes.tsx` — visível só para quem tem a mesma permissão de
`maquininhas` (checagem `canSeeMaquininhas`). Renderiza
`<PainelLayoutEtiqueta>`, que concentra:
- **Seletor de modelo** (dropdown com os modelos salvos + opção "novo modelo").
- **Formulário do modelo:** nome, largura/altura (mm), posição do chip
  (`posicao_rfid`, ex. `F0`/`F1`/`B5`), deslocamentos X/Y (mm), checkbox
  "modelo padrão".
- **Calibrar mídia** (`~JC`, §3.2) — atualiza a altura sugerida.
- **Calibrar chip** (`^HR` varredura ampla, §3.3) — preenche
  `posicao_rfid` automaticamente e mostra o TID identificado.
- **Imprimir teste** — gera o ZPL da etiqueta de joia com um EPC fixo de teste
  (`100100000000000000000001`) e o layout atual do formulário, sem tocar no
  banco (não cria/consome serial real).
- **Salvar modelo** — `POST /api/rfid/modelos` (upsert por `id`).
- **Excluir** — `DELETE /api/rfid/modelos/[id]`.

Fluxo sugerido pela própria UI: Calibrar mídia → Calibrar chip → ajustar
deslocamentos → Imprimir teste até alinhar → Salvar modelo. O cadastro real
passa a imprimir com esse modelo salvo como padrão.

### 7.4 Modelo padrão — `rfid_etiqueta_modelo`

- Tabela **`alissonerp.rfid_etiqueta_modelo`** (migration
  `351_rfid_etiqueta_modelo.sql`). Campos: `id`, `nome`, `largura_mm`,
  `altura_mm`, `offset_x_mm`, `offset_y_mm`, `posicao_rfid`, `padrao`, `ativo`.
- `modeloEtiquetaPadrao()` (em `src/lib/rfid/repo.ts`) busca o modelo marcado
  `padrao=true` e é chamado pelas rotas `cadastrar`, `imprimir` e `reimprimir`
  para montar o `LayoutEtiqueta` passado a `gerarZplJoiaDoModelo()`.
- **Nesta ZD500R, só a `posicao_rfid` (`^RS`) é realmente usada em runtime** —
  as dimensões/offset do modelo ficam salvas por referência, mas o
  enquadramento horizontal real é fixo via `^PW576` no código (porque a
  firmware ignora `^LS`/`^LH`/`left_position`, ver §4.2). Ou seja, mudar
  largura/altura/offset no formulário da aba RFID **não** move o conteúdo na
  impressão atual — só `posicao_rfid` tem efeito direto hoje.
- Segundo a retrospectiva 18/07, a migration 351 **existe só no ambiente
  LOCAL de teste** — falta aplicar em homolog/prod (assinada, PGAPPNAME), mas o
  arquivo `.sql` já está no repositório.

### 7.5 Outras rotas do módulo

| Rota | Função |
|---|---|
| `POST /api/rfid/cadastrar` | Fluxo principal: gera EPC, cadastra `pendente_impressao`, devolve ZPL |
| `POST /api/rfid/imprimir` | Alias do cadastrar (mesma lógica; resposta inclui `status: "pendente_impressao"`) |
| `POST /api/rfid/reimprimir` | Regenera ZPL para joia já **`ativa`** (mesmo EPC, não gera novo) — usado quando a etiqueta física sai ruim; registra evento `reimpressao` |
| `POST /api/rfid/confirmar-impressao` | `pendente_impressao` → `ativo` |
| `POST /api/rfid/reverter` | Rollback (`DELETE`) de joia `pendente_impressao` |
| `GET/POST /api/rfid/modelos` | Lista/upsert de modelos de etiqueta |
| `DELETE /api/rfid/modelos/[id]` | Exclui modelo |
| `/api/rfid/lookup`, `/scan`, `/inventario`, `/sessao`, `/produto-preview`, `/produtos-disponiveis`, `/categorias-disponiveis` | Suporte a busca/sessão/inventário — não cobertos em detalhe neste documento (fora do escopo de impressora/ZPL) |

### 7.6 Permissões

`src/lib/rfid/roles.ts`:
- **`ROLES_CADASTRAR_RFID`** — `admin`, `desenvolvedor`, `gerente_fabrica`,
  `estoquista_fabrica` (mais qualquer role "full access", via `isFullAccess`).
- **`ROLES_CALIBRAR_RFID`** — `admin`, `desenvolvedor`, `gerente_fabrica`
  (não inclui `estoquista_fabrica`).

---

## 8. Troubleshooting

| Sintoma | Causa provável | Como resolver |
|---|---|---|
| **`NO TAG FOUND`** recorrente | Posição de programação (`^RS`/`posicao_rfid`) descalibrada ou mídia errada | Rodar calibração de chip com varredura ampla: `^XA^HR,,B30,A,A^XZ` (aba RFID em Configurações → "Calibrar chip"). O default `B20` pode não achar tags de etiqueta pequena/joia. |
| Etiqueta sai **VOID** | Falha de gravação (potência insuficiente, tag defeituosa) ou transponder fora da posição | A própria impressora já ejeta com "VOID" impresso e tenta de novo (`^RS`, até `n` vezes, default 3). No sistema, `void` sempre chama `reverter()` — a joia nunca fica `ativo` sem confirmação real. Verificar calibração e mídia. |
| **"Sem EPC no estado"** ao chamar `enviar()` | Corrida do React: `enviar()` roda logo após `await cadastrar()`, antes do state do reducer atualizar no próximo render | **Corrigido** em 18/07 — `epcRef` síncrono em `usePrintFlow.ts` elimina a corrida. Se reaparecer, é regressão dessa correção. |
| Impressora **"não conectada"** | Browser Print não está rodando, ou USB desconectado, ou host não está em Accepted Hosts | Abrir/instalar o agente Browser Print v1.3+; conferir cabo/energia da ZD500R; adicionar o domínio do ERP em Accepted Hosts no painel do agente. `useImpressora` faz polling a cada 10s — reconecta sozinho quando a impressora volta. |
| **Divergência de EPC** | Colisão — mais de uma tag no campo de leitura da antena | Afastar etiquetas próximas antes de gravar; reimprimir. |
| **Impressão em branco** | Mídia térmica comum carregada em vez de mídia RFID | Trocar por rolo de tag RFID. |
| **Quirk 1 — `^LS`/`^LH`/`left_position` não fazem nada** | Peculiaridade desta firmware (achado de bancada, não documentado pela Zebra) | Usar `^PW` para mover o conteúdo horizontalmente (aumentar `^PW` empurra para a esquerda). Ver §4.2. |
| **Quirk 2 — `print.tone`/`media.darkness` não clareiam/escurecem** | Variáveis espelho/legado nesta ZD500R | Usar `~SD` (absoluto, 0–30). Ver §4.1. |
| **Quirk 3 — OCR-B (fonte E) "não fecha" o número / estoura a etiqueta** | Fonte bitmap de tamanho fixo, não escala | Usar fonte E só para textos curtos (SKU); para o EPC completo (24 dígitos), usar a fonte escalável `^A0`. Ver §5. |
| Recalibração de comprimento "perdeu" a posição do RFID | Firmware V74.19.6Z reseta a `programming position` toda vez que a mídia é remedida | Sempre recalibrar o chip (`^HR`) depois de recalibrar a mídia (`~JC`). |
| `^HV` devolve só metade do EPC / reverte gravação boa | Bug já corrigido: `n` do `^HV` era `12` (deveria ser `24`, pois `n` conta caracteres da string hex de retorno, não bytes crus) | Já corrigido no `zpl.ts` atual (`^HV1,24,EPC:,^FS`). Se algum código antigo/doc mostrar `^HV1,12`, está desatualizado — não replicar (`docs/regras-negocio/rfid.md` §4 ainda tem o exemplo velho). |
| SDK do Browser Print ausente (`window.BrowserPrint` undefined) | Falta vendorizar os arquivos `.min.js` em `public/browser-print/` | **Já resolvido** — `BrowserPrint-3.1.250.min.js` e `BrowserPrint-Zebra-1.1.250.min.js` estão no disco e carregados via `RfidPrintScripts` no layout do dashboard. |

---

## 9. Referências

- **KB oficial (dossiês do fabricante)** — `.claude/zebra-zd500r-kb/`:
  - `doc-zebra-rfid-comandos.md` — comandos RFID do ZPL II (`^RF`, `^RS`,
    `^HR`, `^RB`, `~RO`, `^RR`, `^RW`, `^RU`, `^RL`, `^HL`/`~HL`, `^HV`),
    fonte primária RFID Programming Guide 3 (P1062165-05EN).
  - `doc-zebra-zd500r-devtools.md` — specs da ZD500R, Browser Print
    (portas/endpoints/mixed content), TCP 9100/9200, status/erros, Link-OS.
  - `doc-epc-gen2-e-zpl-format.md` — memória EPC Gen2 (CRC/PC/EPC/TID, campo
    L) + comandos ZPL de formatação (`^XA`/`^XZ`, `^PW`, `^LL`, `^LH`, `^FO`,
    `^FT`, `^A`, `^FD`, `^FB`, `^CI`, `^FH`, `^BQ`, `^BC`, `^MM`, `^MD`, `~SD`,
    `^PR`, `^MN`, `^JU`, `^PQ`).
  - `provas.json` — prova de sintaxe exata usada para validar o agente
    especialista.
  - `README.md`, `PLANO-refatoracao-rfid-zebra.md`,
    `PLANO-CORRECAO-rfid.md`, `REMEDIACAO-rfid-completa.md`,
    `PENDENCIAS-pre-prod-rfid.md` — histórico de planejamento/correção da
    rodada de 17–18/07 (contexto do projeto, não do fabricante).
- **Docs do projeto (UNC):**
  - `docs/rfid-etiqueta-joia-config-e-retrospectiva.md` — configuração validada
    em hardware real (18/07), fonte principal dos "achados de bancada" citados
    neste documento.
  - `docs/regras-negocio/rfid.md` — regras de negócio (EPC, ciclo de vida,
    permissões) — **parcialmente desatualizado** (mídia 74×20mm vs 70×35mm;
    `^HV1,12` vs `^HV1,24`) em relação ao código/retrospectiva atuais.
  - `src/app/(dashboard)/rfid/README.md` — mapa do módulo, também com trechos
    desatualizados (menciona QR code no troubleshooting, mas o layout atual
    não usa QR/código de barras).
- **Agente especialista:** `.claude/agents/zebra-zd500r.md` (persona
  "Aria-Firmware") — venceu a entrevista de sintaxe ZPL/RFID com 100% em 2
  rodadas; consultar para decisões futuras de sintaxe/default de comando
  Zebra em vez de "adivinhar de cabeça".
