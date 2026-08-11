import { describe, it, expect } from "vitest";
import {
  buildEpc,
  parseEpc,
  validateEpc,
  isEpcERP,
  isEpcLegado,
  extrairIdProduto,
  formatEpc,
} from "@/lib/rfid/epc";
import { PREFIXO_ERP, PREFIXO_EXTERNO, type Epc } from "@/lib/rfid/tipos";

const epcValido: Epc = "100100003918700000000001" as Epc;

// ── buildEpc ──────────────────────────────────────────────────────────────────
describe("buildEpc", () => {
  it("buildEpc(39187, 1) → '100100003918700000000001'", () => {
    const result = buildEpc(39187, 1);
    expect(result).toBe("100100003918700000000001");
  });

  it("buildEpc(90000852, 999) → '100109000085200000000999'", () => {
    const result = buildEpc(90000852, 999);
    // 1001 + 090000852 + 00000000999 = 24 dígitos
    expect(result).toBe("100109000085200000000999");
  });

  it("prefixo é sempre PREFIXO_ERP ('1001')", () => {
    const result = buildEpc(123, 456);
    expect(result.startsWith(PREFIXO_ERP)).toBe(true);
  });

  it("serial 0 → '00000000000'", () => {
    const result = buildEpc(1, 0);
    expect(result).toBe("100100000000100000000000");
  });

  it("id_produto com 9 dígitos (valor máximo sem overflow) funciona", () => {
    const result = buildEpc(999999999, 1);
    expect(result).toBe("100199999999900000000001");
  });

  it("id_produto com 10 dígitos lança erro", () => {
    expect(() => buildEpc(1000000000, 1)).toThrow();
  });

  it("serial com 12 dígitos lança erro", () => {
    expect(() => buildEpc(1, 100000000000)).toThrow();
  });

  it("retorna 24 dígitos", () => {
    const result = buildEpc(42, 7);
    expect(result).toHaveLength(24);
    expect(/^\d{24}$/.test(result)).toBe(true);
  });
});

// ── parseEpc ──────────────────────────────────────────────────────────────────
describe("parseEpc", () => {
  it("extrai prefixo, idProduto e serial corretamente", () => {
    const parsed = parseEpc(epcValido);
    expect(parsed.prefixo).toBe("1001");
    expect(parsed.idProduto).toBe(39187);
    expect(parsed.serial).toBe(1);
  });

  it("prefixo sempre tem 4 caracteres", () => {
    const epc = buildEpc(5, 10);
    const parsed = parseEpc(epc);
    expect(parsed.prefixo).toHaveLength(4);
  });

  it("buildEpc ⟳ parseEpc (round-trip)", () => {
    const ids = [39187, 90000852, 1, 999999999, 42];
    const serials = [1, 999, 0, 50000000000, 7];
    for (const id of ids) {
      for (const ser of serials) {
        const epc = buildEpc(id, ser);
        const parsed = parseEpc(epc);
        expect(parsed.idProduto).toBe(id);
        expect(parsed.serial).toBe(ser);
        expect(parsed.prefixo).toBe(PREFIXO_ERP);
      }
    }
  });
});

// ── validateEpc ───────────────────────────────────────────────────────────────
describe("validateEpc", () => {
  it("aceita EPC ERP válido (24 dígitos, prefixo 1001)", () => {
    expect(validateEpc("100100003918700000000001")).toBe(true);
  });

  it("aceita EPC legado válido (24 dígitos, prefixo 0000)", () => {
    expect(validateEpc("000000003918700000000001")).toBe(true);
  });

  it("rejeita comprimento errado (< 24)", () => {
    expect(validateEpc("1001000039187000000000")).toBe(false); // 23 dígitos
  });

  it("rejeita comprimento errado (> 24)", () => {
    expect(validateEpc("1001000039187000000000012")).toBe(false); // 25 dígitos
  });

  it("rejeita com letras", () => {
    expect(validateEpc("10010000391870abcdef0001")).toBe(false);
  });

  it("rejeita prefixo inválido (nem 1001 nem 0000)", () => {
    expect(validateEpc("999900003918700000000001")).toBe(false);
  });

  it("rejeita string vazia", () => {
    expect(validateEpc("")).toBe(false);
  });

  it("rejeita espaços no meio", () => {
    expect(validateEpc("1001000039 18700000000001")).toBe(false);
  });

  it("rejeita caracteres especiais", () => {
    expect(validateEpc("1001000039-18700000000001")).toBe(false);
  });
});

// ── isEpcERP / isEpcLegado ────────────────────────────────────────────────────
describe("isEpcERP", () => {
  it("detecta prefixo 1001", () => {
    expect(isEpcERP("100100003918700000000001")).toBe(true);
  });

  it("rejeita prefixo 0000", () => {
    expect(isEpcERP("000000003918700000000001")).toBe(false);
  });

  it("rejeita string aleatória", () => {
    expect(isEpcERP("999900003918700000000001")).toBe(false);
  });
});

describe("isEpcLegado", () => {
  it("detecta prefixo 0000", () => {
    expect(isEpcLegado("000000003918700000000001")).toBe(true);
  });

  it("rejeita prefixo 1001", () => {
    expect(isEpcLegado("100100003918700000000001")).toBe(false);
  });

  it("rejeita string aleatória", () => {
    expect(isEpcLegado("999900003918700000000001")).toBe(false);
  });
});

// ── extrairIdProduto ──────────────────────────────────────────────────────────
describe("extrairIdProduto", () => {
  it("extrai ID correto das posições 5–13", () => {
    const result = extrairIdProduto("100100003918700000000001");
    expect(result).toBe(39187);
  });

  it("extrai ID de EPC legado (prefixo 0000)", () => {
    const result = extrairIdProduto("000000003918700000000001");
    expect(result).toBe(39187);
  });

  it("extrai ID grande (9 dígitos)", () => {
    const epc = buildEpc(999999999, 1);
    const result = extrairIdProduto(epc);
    expect(result).toBe(999999999);
  });

  it("extrai ID pequeno (1 dígito)", () => {
    const epc = buildEpc(7, 1);
    const result = extrairIdProduto(epc);
    expect(result).toBe(7);
  });

  it("retorna null para string não-numérica", () => {
    expect(extrairIdProduto("abcdefghijklmnopqrstuvwx")).toBe(null);
  });

  it("retorna null para comprimento != 24", () => {
    expect(extrairIdProduto("1001")).toBe(null);
    expect(extrairIdProduto("1001000039187000000000012")).toBe(null);
  });

  it("retorna null para string vazia", () => {
    expect(extrairIdProduto("")).toBe(null);
  });

  it("retorna null quando ID nas posições 5–13 é zero", () => {
    // Construir um EPC onde o campo id_produto é "000000000"
    const epc = `100100000000000000000001` as Epc;
    expect(extrairIdProduto(epc)).toBe(null);
  });
});

// ── formatEpc ─────────────────────────────────────────────────────────────────
describe("formatEpc", () => {
  it("formata com hífens: '1001-000039187-00000000001'", () => {
    const result = formatEpc(epcValido);
    expect(result).toBe("1001-000039187-00000000001");
  });

  it("formata EPC com id grande", () => {
    const epc = buildEpc(90000852, 999);
    const result = formatEpc(epc);
    expect(result).toBe("1001-090000852-00000000999");
  });

  it("sempre tem 2 hífens e 3 segmentos", () => {
    const epc = buildEpc(123, 456);
    const parts = formatEpc(epc).split("-");
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe(PREFIXO_ERP);
    expect(parts[1]).toHaveLength(9);
    expect(parts[2]).toHaveLength(11);
  });
});

// ── Type check (Epc branded type) ────────────────────────────────────────────
describe("Epc branded type", () => {
  it("buildEpc retorna string de 24 dígitos que satisfaz EpcSchema", () => {
    const result = buildEpc(39187, 1);
    expect(typeof result).toBe("string");
    expect(result).toHaveLength(24);
    expect(/^\d{24}$/.test(result)).toBe(true);
  });
});
