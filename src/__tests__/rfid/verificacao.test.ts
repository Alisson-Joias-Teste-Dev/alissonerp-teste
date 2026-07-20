import { describe, it, expect } from "vitest";
import {
  epcConfere,
  interpretarRespostaGravacao,
  interpretarRespostaCalibracao,
} from "@/lib/rfid/verificacao";
import { type Epc } from "@/lib/rfid/tipos";

const epc: Epc = "100100003918700000000001" as Epc;

// ── epcConfere ────────────────────────────────────────────────────────────────
describe("epcConfere", () => {
  it("retorna true para strings idênticas", () => {
    expect(epcConfere(epc, "100100003918700000000001")).toBe(true);
  });

  it("é case-insensitive", () => {
    expect(epcConfere(epc, "100100003918700000000001")).toBe(true);
    expect(epcConfere(epc, "100100003918700000000001")).toBe(true);
    // uppercase: EPC digits only, so case doesn't matter, but let's test hex
    const hexEpc = "ABCDEFABCDEFABCDEFABCDEF" as Epc;
    expect(epcConfere(hexEpc, "abcdefabcdefabcdefabcdef")).toBe(true);
    expect(epcConfere(hexEpc, "ABCDEFABCDEFABCDEFABCDEF")).toBe(true);
  });

  it("retorna false para strings diferentes", () => {
    expect(epcConfere(epc, "100100003918700000000002")).toBe(false);
  });

  it("retorna false para null", () => {
    expect(epcConfere(epc, null)).toBe(false);
  });

  it("retorna false para string vazia", () => {
    expect(epcConfere(epc, "")).toBe(false);
  });

  it("retorna false para string só com espaços", () => {
    // epcConfere chama .trim() — string só com espaços vira "", que é falsy
    expect(epcConfere(epc, "   ")).toBe(false);
  });

  it("ignora whitespace nas pontas (trim)", () => {
    expect(epcConfere(epc, "  100100003918700000000001  ")).toBe(true);
  });
});

// ── interpretarRespostaGravacao ───────────────────────────────────────────────
describe("interpretarRespostaGravacao", () => {
  // --- offline ---
  it("resposta vazia → status 'offline'", () => {
    const result = interpretarRespostaGravacao("", epc);
    expect(result.status).toBe("offline");
    expect(result.epcLido).toBe(null);
  });

  it("resposta só com espaços → status 'offline'", () => {
    const result = interpretarRespostaGravacao("   ", epc);
    expect(result.status).toBe("offline");
  });

  // --- RFID OK ---
  it("'RFID OK' → status 'ok'", () => {
    const result = interpretarRespostaGravacao("RFID OK", epc);
    expect(result.status).toBe("ok");
  });

  it("'rfid ok' (lowercase) também detecta", () => {
    const result = interpretarRespostaGravacao("rfid ok", epc);
    expect(result.status).toBe("ok");
  });

  // --- NO TAG FOUND ---
  it("'NO TAG FOUND' → status 'no_tag'", () => {
    const result = interpretarRespostaGravacao("NO TAG FOUND", epc);
    expect(result.status).toBe("no_tag");
  });

  it("'no tag found' (lowercase) → status 'no_tag'", () => {
    const result = interpretarRespostaGravacao("no tag found", epc);
    expect(result.status).toBe("no_tag");
  });

  // --- VOID ---
  it("'VOID' → status 'void'", () => {
    const result = interpretarRespostaGravacao("VOID", epc);
    expect(result.status).toBe("void");
  });

  it("'Etiqueta VOID detectada' → status 'void'", () => {
    const result = interpretarRespostaGravacao("Etiqueta VOID detectada", epc);
    expect(result.status).toBe("void");
  });

  // --- EPC matching ---
  it("EPC extraído confere → status 'ok'", () => {
    const raw = "EPC: 100100003918700000000001";
    const result = interpretarRespostaGravacao(raw, epc);
    expect(result.status).toBe("ok");
    expect(result.epcLido).toBe("100100003918700000000001");
  });

  // --- EPC divergente ---
  it("EPC extraído diverge → status 'divergente'", () => {
    const raw = "EPC: 100100003918700000000009";
    const result = interpretarRespostaGravacao(raw, epc);
    expect(result.status).toBe("divergente");
    expect(result.epcLido).toBe("100100003918700000000009");
  });

  // --- Formato ^HV ---
  it("extrai EPC do formato ^HV: 'EPC: 100100003918700000000001'", () => {
    // Simula saída real: a impressora retorna header "EPC:" após ^HV
    const raw = "EPC:100100003918700000000001";
    const result = interpretarRespostaGravacao(raw, epc);
    expect(result.status).toBe("ok");
    expect(result.epcLido).toBe("100100003918700000000001");
  });

  it("extrai EPC do formato ^HV com espaços no cabeçalho", () => {
    const raw = "EPC : 100100003918700000000001";
    const result = interpretarRespostaGravacao(raw, epc);
    expect(result.status).toBe("ok");
    expect(result.epcLido).toBe("100100003918700000000001");
  });

  // --- Formato ^HL log ---
  it("extrai EPC do formato de log ^HL", () => {
    const raw = "Jul-17-2026 19:00:00,W,F0,A1,16,00000000,100100003918700000000001";
    const result = interpretarRespostaGravacao(raw, epc);
    expect(result.status).toBe("ok");
    expect(result.epcLido).toBe("100100003918700000000001");
  });

  // --- STX/ETX control characters ---
  it("ignora caracteres de controle STX/ETX na extração", () => {
    // STX = \x02, ETX = \x03 — são removidos por sanitizar
    const raw = "\x02EPC: 100100003918700000000001\x03";
    const result = interpretarRespostaGravacao(raw, epc);
    expect(result.status).toBe("ok");
    expect(result.epcLido).toBe("100100003918700000000001");
  });

  it("resposta com apenas STX/ETX → offline", () => {
    const raw = "\x02\x03";
    const result = interpretarRespostaGravacao(raw, epc);
    expect(result.status).toBe("offline");
  });

  // --- Fallback: EPC sem cabeçalho ---
  it("extrai EPC como fallback (24 dígitos isolados)", () => {
    const raw = "Algum texto 100100003918700000000001 resto";
    const result = interpretarRespostaGravacao(raw, epc);
    expect(result.status).toBe("ok");
    expect(result.epcLido).toBe("100100003918700000000001");
  });

  // --- Resposta não reconhecível ---
  it("resposta irreconhecível → offline", () => {
    const raw = "Printer busy";
    const result = interpretarRespostaGravacao(raw, epc);
    expect(result.status).toBe("offline");
  });

  // --- Precedência: NO TAG FOUND sobre EPC ---
  it("'NO TAG FOUND' mesmo com EPC na resposta → 'no_tag'", () => {
    const raw = "NO TAG FOUND EPC: 100100003918700000000001";
    const result = interpretarRespostaGravacao(raw, epc);
    expect(result.status).toBe("no_tag");
  });

  // --- Precedência: VOID sobre EPC ---
  it("'VOID' mesmo com EPC na resposta → 'void'", () => {
    const raw = "VOID EPC: 100100003918700000000001";
    const result = interpretarRespostaGravacao(raw, epc);
    expect(result.status).toBe("void");
  });
});

// ── interpretarRespostaCalibracao ─────────────────────────────────────────────
describe("interpretarRespostaCalibracao", () => {
  it("tabela válida com seta → sucesso=true, extrai todos os campos", () => {
    const raw = [
      "position=B14 MM,A1,18,25",
      "tid information=E200.3414:Alien",
      "leading edge",
      "  B30 16 16",
      "  B29 16 16",
      "  B14 18 25  <---****",
    ].join("\n");
    const result = interpretarRespostaCalibracao(raw);
    expect(result.sucesso).toBe(true);
    expect(result.posicao).toBe("B14");
    expect(result.antena).toBe("A1");
    expect(result.readPower).toBe(18);
    expect(result.writePower).toBe(25);
    expect(result.tidInfo).toBe("E200.3414:Alien");
    expect(result.raw).toBe(raw);
  });

  it("sem seta (<---****) → sucesso=false", () => {
    const raw = [
      "position=B14 MM,A1,18,25",
      "tid information=E200.3414:Alien",
      "  B30 16 16",
      "  B14 18 25",
    ].join("\n");
    const result = interpretarRespostaCalibracao(raw);
    expect(result.sucesso).toBe(false);
    // Campos ainda devem ser extraídos
    expect(result.posicao).toBe("B14");
    expect(result.antena).toBe("A1");
    expect(result.readPower).toBe(18);
    expect(result.writePower).toBe(25);
  });

  it("string vazia → todos os campos null", () => {
    const result = interpretarRespostaCalibracao("");
    expect(result.sucesso).toBe(false);
    expect(result.posicao).toBe(null);
    expect(result.antena).toBe(null);
    expect(result.readPower).toBe(null);
    expect(result.writePower).toBe(null);
    expect(result.tidInfo).toBe(null);
  });

  it("resposta irreconhecível → todos null, sucesso false", () => {
    const result = interpretarRespostaCalibracao("garbage data");
    expect(result.sucesso).toBe(false);
    expect(result.posicao).toBe(null);
    expect(result.antena).toBe(null);
    expect(result.readPower).toBe(null);
    expect(result.writePower).toBe(null);
    expect(result.tidInfo).toBe(null);
  });

  it("extrai TID sem linha de posição", () => {
    const raw = "tid information=E200.3414:Impinj";
    const result = interpretarRespostaCalibracao(raw);
    expect(result.tidInfo).toBe("E200.3414:Impinj");
    expect(result.posicao).toBe(null);
    expect(result.sucesso).toBe(false);
  });

  it("extrai posição sem TID", () => {
    const raw = [
      "position=B14 MM,A1,18,25",
      "  B14 18 25  <---****",
    ].join("\n");
    const result = interpretarRespostaCalibracao(raw);
    expect(result.posicao).toBe("B14");
    expect(result.antena).toBe("A1");
    expect(result.tidInfo).toBe(null);
    expect(result.sucesso).toBe(true);
    expect(result.readPower).toBe(18);
    expect(result.writePower).toBe(25);
  });

  it("ignora STX/ETX na resposta", () => {
    const raw = "\x02position=B14 MM,A1,18,25\n  B14 18 25  <---****\x03";
    const result = interpretarRespostaCalibracao(raw);
    expect(result.sucesso).toBe(true);
    expect(result.posicao).toBe("B14");
    expect(result.readPower).toBe(18);
  });

  it("raw preserva a resposta original (não sanitizada)", () => {
    const raw = "\x02position=B14 MM,A1,18,25\x03";
    const result = interpretarRespostaCalibracao(raw);
    expect(result.raw).toBe(raw);
  });

  it("só seta sem posição → sucesso=false", () => {
    const result = interpretarRespostaCalibracao("  B14 18 25  <---****");
    expect(result.sucesso).toBe(false);
    expect(result.posicao).toBe(null);
  });
});
