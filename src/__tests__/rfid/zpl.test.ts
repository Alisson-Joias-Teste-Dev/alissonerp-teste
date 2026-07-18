import { describe, it, expect, beforeEach } from "vitest";
import {
  gerarZplEtiquetaJoia,
  gerarZplCalibracao,
  gerarZplLeituraTid,
  sanitizeZpl,
  type LayoutEtiqueta,
} from "@/lib/rfid/zpl";
import { type Epc, type DadosEtiqueta } from "@/lib/rfid/tipos";

const epcReal: Epc = "100100003918700000000001" as Epc;

const dados: DadosEtiqueta = {
  id_produto: 39187,
  sku: "1470-6",
  nome: "Aliança Ouro 18k",
};

const layout: LayoutEtiqueta = {
  larguraDots: 200,
  alturaDots: 304,
  offsetXDots: 16,
  offsetYDots: 24,
  posicaoRfid: "F1",
};

const codBarras = "100234";

// ── sanitizeZpl (helper) ─────────────────────────────────────────────────────
describe("sanitizeZpl", () => {
  it("remove prefixos ^ e ~", () => {
    expect(sanitizeZpl("nome^FDcomando")).toBe("nome FDcomando");
    expect(sanitizeZpl("nome~HScomando")).toBe("nome HScomando");
  });

  it("remove caracteres de controle", () => {
    expect(sanitizeZpl("nome\tteste\r\n")).toBe("nometeste");
  });

  it("aplica trim", () => {
    expect(sanitizeZpl("  espaços  ")).toBe("espaços");
  });
});

// ── gerarZplEtiquetaJoia ─────────────────────────────────────────────────────
describe("gerarZplEtiquetaJoia", () => {
  let zpl: string;

  function makeZpl(overrides?: Partial<{ epc: Epc; dados: Partial<DadosEtiqueta> }>) {
    const e = overrides?.epc ?? epcReal;
    const d: DadosEtiqueta = {
      id_produto: overrides?.dados?.id_produto ?? dados.id_produto,
      sku: overrides?.dados?.sku ?? dados.sku,
      nome: overrides?.dados?.nome ?? dados.nome,
    };
    return gerarZplEtiquetaJoia(d, e, codBarras, layout);
  }

  beforeEach(() => {
    zpl = makeZpl();
  });

  it("começa com ^XA e termina com ^XZ", () => {
    expect(zpl.startsWith("^XA")).toBe(true);
    expect(zpl.endsWith("^XZ")).toBe(true);
  });

  it("contém ^MMF (modo RFID) e ^CI28 (UTF-8)", () => {
    expect(zpl).toContain("^MMF");
    expect(zpl).toContain("^CI28");
  });

  it("usa a posição de programação do layout no ^RS (ex.: F1)", () => {
    expect(zpl).toContain("^RS8,F1,,3,N");
  });

  it("usa largura/altura do layout (^PW/^LL)", () => {
    expect(zpl).toContain("^PW200");
    expect(zpl).toContain("^LL304");
  });

  it("aplica o offset via ^LH (deslocamento X/Y do modelo)", () => {
    expect(zpl).toContain("^LH16,24");
  });

  // Comandos RFID
  it("contém ^RFW,H (gravação hex direta), NÃO ^RFW,A", () => {
    expect(zpl).toContain("^RFW,H");
    expect(zpl).not.toContain("^RFW,A");
  });

  it("contém ^RFR,H (leitura) e ^HV (retorno ao host)", () => {
    expect(zpl).toContain("^RFR,H");
    expect(zpl).toContain("^HV");
  });

  // Comandos legacy proibidos
  it("NÃO contém comandos legados (^WT, ^RT, ^RZ, ^RA, ^RN)", () => {
    for (const c of ["^WT", "^RT", "^RZ", "^RA", "^RN", "^WV"]) {
      expect(zpl).not.toContain(c);
    }
  });

  it("NÃO usa camada ASCII (sem 'Buffer.from')", () => {
    expect(zpl).not.toContain("Buffer.from");
  });

  // Conteúdo visual
  it("contém o SKU e o nome do produto", () => {
    expect(zpl).toContain(dados.sku);
    expect(zpl).toContain("Alian"); // nome (com acento preservado)
  });

  it("contém o código de barras Code 128 com o número curto", () => {
    expect(zpl).toContain("^BCN");
    expect(zpl).toContain(`^FD${codBarras}^FS`);
  });

  it("NÃO usa QR code (^BQ) — o requisito é código de barras 1D", () => {
    expect(zpl).not.toContain("^BQ");
  });

  it("imprime o EPC em texto (referência)", () => {
    expect(zpl).toContain("EPC ");
  });

  it("^RFW,H^FD contém o EPC completo (24 dígitos)", () => {
    expect(zpl).toContain(`^RFW,H^FD${epcReal}^FS`);
  });

  it("^HV retorna 24 caracteres com prefixo 'EPC:'", () => {
    expect(zpl).toContain("^HV1,24,EPC:,^FS");
  });

  // Validação de EPC inválido
  it("lança erro para EPC inválido (comprimento errado)", () => {
    expect(() =>
      gerarZplEtiquetaJoia(dados, "curto" as Epc, codBarras, layout),
    ).toThrow(/EPC inválido/i);
  });

  it("lança erro para EPC inválido (letras em vez de dígitos)", () => {
    expect(() =>
      gerarZplEtiquetaJoia(dados, "abcdefghijklmnopqrstuvwx" as Epc, codBarras, layout),
    ).toThrow(/EPC inválido/i);
  });

  // Campos ^FD sem ^ ou ~ crus
  it("SKU e nome sanitizados (sem ^ ou ~ dentro dos ^FD)", () => {
    const depois = zpl.split("^XA")[1];
    for (const linha of depois.split("^FS")) {
      if (linha.includes("^FD") && !linha.includes("^BC") && !linha.includes("^RFW")) {
        const fd = linha.split("^FD").pop() ?? "";
        expect(fd).not.toContain("^");
        expect(fd).not.toContain("~");
      }
    }
  });
});

// ── gerarZplCalibracao ───────────────────────────────────────────────────────
describe("gerarZplCalibracao", () => {
  it("usa a varredura ampla ^HR,,B30,A,A (que achou o chip no hardware)", () => {
    expect(gerarZplCalibracao()).toBe("^XA\n^HR,,B30,A,A\n^XZ");
  });

  it("é pura", () => {
    expect(gerarZplCalibracao()).toBe(gerarZplCalibracao());
  });
});

// ── gerarZplLeituraTid ───────────────────────────────────────────────────────
describe("gerarZplLeituraTid", () => {
  let tid: string;
  beforeEach(() => {
    tid = gerarZplLeituraTid();
  });

  it("contém ^XA e ^XZ", () => {
    expect(tid).toContain("^XA");
    expect(tid).toContain("^XZ");
  });

  it("contém ^RFR,H,0,8,2 (leitura do banco TID) e ^HV com TID:", () => {
    expect(tid).toContain("^RFR,H,0,8,2^FN1^FS");
    expect(tid).toContain("^HV1,,TID:,^FS");
  });

  it("NÃO contém comandos legados", () => {
    for (const c of ["^WT", "^RT", "^RZ"]) expect(tid).not.toContain(c);
  });
});

// ── Regressão: ^HV byte-count alinhado ao parser ─────────────────────────────
describe("^HV byte-count vs verificacao.ts parser", () => {
  it("^HV retorna 24 — o que o parser /[0-9A-Fa-f]{24}/ espera", () => {
    const zpl = gerarZplEtiquetaJoia(dados, epcReal, codBarras, layout);
    const m = zpl.match(/\^HV1,(\d+),EPC:/);
    expect(m).not.toBeNull();
    expect(parseInt(m![1], 10)).toBe(24);
  });

  it("EPC tem exatamente 24 dígitos", () => {
    expect(epcReal).toHaveLength(24);
    expect(/^\d{24}$/.test(epcReal)).toBe(true);
  });
});
