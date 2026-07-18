import type { Epc, ResultadoGravacao, ResultadoCalibracao } from "./tipos";

// ---------------------------------------------------------------------------
// Helpers privados
// ---------------------------------------------------------------------------

/**
 * Remove caracteres de controle (STX/ETX/etc.), preservando espaços,
 * quebras de linha e tabs. Retorna string limpa e sem espaços nas pontas.
 */
function sanitizar(raw: string): string {
  return raw
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .trim();
}

/**
 * Extrai um EPC (24 caracteres hex) da resposta crua da impressora.
 *
 * Prioridade de extração:
 *   1. Cabeçalho "EPC:" (saída do ^HV) — caminho principal
 *   2. Linha de log ^HL (campo de dados ao final) — FALLBACK
 *   3. Qualquer sequência de 24 hex delimitada por borda de palavra
 *   4. Qualquer sequência de 24+ hex (recorte dos primeiros 24)
 *
 * NOTA SOBRE ^HL: Na ZD500R com firmware X.20.16Z+, o log RFID vem
 * DESABILITADO por padrão. Para usar este fallback, habilitar via SGD:
 *   ! U1 setvar "rfid.log.enabled" "on"
 * [CONFIRMADO: Zebra-RFID3 seção 11 — ^HL/~HL]
 *
 * Retorna a string hex em maiúsculas, ou null se nada foi encontrado.
 */
function extrairEpc(raw: string): string | null {
  const limpo = sanitizar(raw);
  if (!limpo) return null;

  const linhas = limpo.split(/\r?\n/);

  for (const linha of linhas) {
    const l = linha.trim();
    if (!l) continue;

    // 1 – ^HV com cabeçalho "EPC:"
    const hv = l.match(/^EPC\s*:\s*([0-9A-Fa-f]{24})\b/i);
    if (hv) return hv[1].toUpperCase();

    // 2 – Linha de log ^HL
    // Formato: Mmm-DD-YYYY HH:MM:SS,[operação],[pos],[antena],[potência],[status],[dados]
    // Ex: Jul-17-2026 19:00:00,W,F0,A1,16,00000000,100100003918700000000001
    const hl = l.match(
      /^[A-Z][a-z]{2}-\d{2}-\d{4}\s+\d{2}:\d{2}:\d{2},[A-Z]+,[^,]+,[^,]+,\d+,[0-9A-Fa-f]{8},([0-9A-Fa-f]{24,})\b/i,
    );
    if (hl) return hl[1].toUpperCase();
  }

  // 3 – Fallback: 24 hex chars delimitados por borda de palavra
  const word = limpo.match(/\b([0-9A-Fa-f]{24})\b/i);
  if (word) return word[1].toUpperCase();

  // 4 – Último recurso: sequência de 24+ hex chars em qualquer lugar
  const loose = limpo.match(/([0-9A-Fa-f]{24,})/i);
  if (loose) return loose[1].slice(0, 24).toUpperCase();

  return null;
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/**
 * Compara o EPC esperado (tipo Epc, 24 dígitos) com o EPC lido da tag.
 *
 * - Case-insensitive
 * - Ignora espaços nas pontas
 * - `lido` nulo, vazio ou só espaços → false
 *
 * Pura — sem IO.
 */
export function epcConfere(esperado: Epc, lido: string | null): boolean {
  if (!lido) return false;
  return esperado.trim().toUpperCase() === lido.trim().toUpperCase();
}

/**
 * Interpreta a resposta crua da impressora após uma operação de gravação RFID
 * (ex.: saída de `device.read()` do Browser Print, combinando SGD + ^HV).
 *
 * **Lógica de detecção (ordem de precedência):**
 *   1. Resposta vazia / inutilizável → `"offline"`
 *   2. Contém `"NO TAG FOUND"` → `"no_tag"`
 *   3. Contém `"VOID"` → `"void"`
 *   4. EPC extraído da resposta **confere** com o esperado → `"ok"`
 *   5. EPC extraído da resposta **não confere** com o esperado → `"divergente"`
 *   6. Contém `"RFID OK"` (sem EPC extraível) → `"ok"`
 *   7. Nenhuma das anteriores → `"offline"`
 *
 * **Nunca lança exceção** — sempre retorna um `ResultadoGravacao`.
 *
 * @param raw       String crua devolvida pela impressora (pode conter STX/ETX,
 *                  múltiplas linhas, SGD + ^HV misturados).
 * @param epcEsperado  EPC que se esperava gravar (24 dígitos).
 */
export function interpretarRespostaGravacao(
  raw: string,
  epcEsperado: Epc,
): ResultadoGravacao {
  const limpo = sanitizar(raw);

  // 1 – Offline (vazio)
  if (!limpo) {
    return {
      status: "offline",
      epcLido: null,
      mensagem:
        "Impressora não respondeu. Verifique conexão e alimentação.",
    };
  }

  const epcLido = extrairEpc(limpo);

  // 2 – NO TAG FOUND
  if (/NO\s+TAG\s+FOUND/i.test(limpo)) {
    return {
      status: "no_tag",
      epcLido,
      mensagem:
        "Nenhuma etiqueta RFID detectada. Posicione a etiqueta e tente novamente.",
    };
  }

  // 3 – VOID
  if (/VOID/i.test(limpo)) {
    return {
      status: "void",
      epcLido,
      mensagem:
        "Falha na gravação da etiqueta. A etiqueta foi invalidada (VOID).",
    };
  }

  // 4 – EPC extraído e confere → sucesso
  if (epcLido && epcConfere(epcEsperado, epcLido)) {
    return {
      status: "ok",
      epcLido,
      mensagem: "EPC gravado e verificado com sucesso.",
    };
  }

  // 5 – EPC extraído mas diverge → alerta (possível colisão de tags)
  if (epcLido && !epcConfere(epcEsperado, epcLido)) {
    return {
      status: "divergente",
      epcLido,
      mensagem:
        `Divergência: EPC lido (${epcLido}) difere do esperado ` +
        `(${epcEsperado}). Possível colisão de etiquetas.`,
    };
  }

  // 6 – RFID OK (SGD rfid.error.response), sem EPC extraível
  if (/RFID\s+OK/i.test(limpo)) {
    return {
      status: "ok",
      epcLido,
      mensagem: "Gravação RFID concluída com sucesso.",
    };
  }

  // 7 – Nada reconhecível
  return {
    status: "offline",
    epcLido,
    mensagem: "Resposta da impressora não reconhecida.",
  };
}

/**
 * Interpreta a tabela de calibração RFID retornada pelo comando `^HR`.
 *
 * Extrai:
 *   - Posição de programação (ex.: `"B14"`)
 *   - Elemento de antena (ex.: `"A1"`)
 *   - Potência de leitura (ex.: `18`)
 *   - Potência de gravação (ex.: `25`)
 *   - Informação do TID (ex.: `"E200.3414:Alien"`)
 *
 * A seta `<---****` na tabela marca a posição/potência válidas encontradas.
 * Se ela **não** estiver presente, `sucesso` será `false`, mesmo que os
 * demais campos tenham sido preenchidos.
 *
 * Exemplo de entrada esperado:
 * ```
 * position=B14 MM,A1,18,25
 * tid information=E200.3414:Alien
 * leading edge
 *   B30 16 16
 *   B29 16 16
 *   ...
 *   B14 18 25  <---****
 * ```
 *
 * @param raw  Resposta crua da impressora ao `^HR` (ou equivalente SGD).
 */
export function interpretarRespostaCalibracao(
  raw: string,
): ResultadoCalibracao {
  const limpo = sanitizar(raw);

  // Indicador de posição/potência válidas encontradas
  const hasArrow = limpo.includes("<---****");

  // Linha de cabeçalho: position=B14 MM,A1,18,25
  // "MM" é opcional (alguns firmwares omitem)
  const posRegex = /position\s*=\s*(\w+)\s*(?:MM\s*)?,(\w+),(\d+),(\d+)/i;
  const posMatch = limpo.match(posRegex);

  // Linha de TID: tid information=E200.3414:Alien
  const tidRegex = /tid\s+information\s*=\s*(.+)/i;
  const tidMatch = limpo.match(tidRegex);

  const posicao = posMatch ? posMatch[1] : null;
  const antena = posMatch ? posMatch[2] : null;
  const readPower = posMatch ? parseInt(posMatch[3], 10) : null;
  const writePower = posMatch ? parseInt(posMatch[4], 10) : null;
  const tidInfo = tidMatch ? tidMatch[1].trim() : null;

  // Calibração bem-sucedida = encontrou linha de posição E a seta de validação
  const sucesso = posicao !== null && hasArrow;

  return {
    posicao,
    antena,
    readPower,
    writePower,
    tidInfo,
    sucesso,
    raw, // preserva a resposta original para debug
  };
}
