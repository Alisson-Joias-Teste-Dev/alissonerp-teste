import { describe, it, expect, beforeEach } from "vitest";
import {
  gerarZplEtiquetaJoia,
  gerarZplCalibracao,
  gerarZplLeituraTid,
  sanitizeZpl,
} from "@/lib/rfid/zpl";
import { type Epc, type DadosEtiqueta } from "@/lib/rfid/tipos";

const epcReal: Epc = "100100003918700000000001" as Epc;

const dados: DadosEtiqueta = {
  id_produto: 39187,
  sku: "1470-6",
  nome: "Aliança Ouro 18k",
};

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

  // Assegura que sempre começamos com o mesmo ZPL (a função é pura)
  function makeZpl(overrides?: Partial<{ epc: Epc; dados: Partial<DadosEtiqueta> }>) {
    const e = overrides?.epc ?? epcReal;
    const d: DadosEtiqueta = {
      id_produto: overrides?.dados?.id_produto ?? dados.id_produto,
      sku: overrides?.dados?.sku ?? dados.sku,
      nome: overrides?.dados?.nome ?? dados.nome,
    };
    return gerarZplEtiquetaJoia(d, e);
  }

  beforeEach(() => {
    zpl = makeZpl();
  });

  // Estrutura básica
  it("contém ^XA e ^XZ", () => {
    expect(zpl).toContain("^XA");
    expect(zpl).toContain("^XZ");
  });

  it("termina com ^XZ", () => {
    expect(zpl.endsWith("^XZ")).toBe(true);
  });

  it("começa com ^XA", () => {
    expect(zpl.startsWith("^XA")).toBe(true);
  });

  // Setup da etiqueta
  it("contém ^MMF (modo RFID desktop)", () => {
    expect(zpl).toContain("^MMF");
  });

  it("contém ^RS8,,,3,N (Gen2, 3 tentativas)", () => {
    expect(zpl).toContain("^RS8,,,3,N");
  });

  it("contém ^CI28 (UTF-8)", () => {
    expect(zpl).toContain("^CI28");
  });

  it("contém ^PW592 e ^LL160 (tamanho 74×20mm)", () => {
    expect(zpl).toContain("^PW592");
    expect(zpl).toContain("^LL160");
  });

  // Comandos RFID
  it("contém ^RFW,H (gravação hex direta), NÃO ^RFW,A", () => {
    expect(zpl).toContain("^RFW,H");
    expect(zpl).not.toContain("^RFW,A");
  });

  it("contém ^RFR,H (leitura RFID)", () => {
    expect(zpl).toContain("^RFR,H");
  });

  it("contém ^HV (retorno ao host)", () => {
    expect(zpl).toContain("^HV");
  });

  // Comandos legacy proibidos
  it("NÃO contém comandos legados (^WT, ^RT, ^RZ)", () => {
    expect(zpl).not.toContain("^WT");
    expect(zpl).not.toContain("^RT");
    expect(zpl).not.toContain("^RZ");
  });

  it("NÃO contém ^RA, ^RM, ^RN, ^RE, ^RQ, ^WV", () => {
    expect(zpl).not.toContain("^RA");
    expect(zpl).not.toContain("^RM");
    expect(zpl).not.toContain("^RN");
    expect(zpl).not.toContain("^RE");
    expect(zpl).not.toContain("^RQ");
    expect(zpl).not.toContain("^WV");
  });

  // Buffer.from proibido
  it("NÃO contém 'Buffer.from' (não usar camada ASCII)", () => {
    expect(zpl).not.toContain("Buffer.from");
  });

  // Dados visuais
  it("contém nome sanitizado do produto", () => {
    expect(zpl).toContain(dados.nome.replace("ê", ""));
    // sanitizeZpl não remove acentuação comum — apenas caracteres de controle.
    // O nome "Aliança Ouro 18k" contém 'ç' que é U+00E7, fora do range de controle.
    // Vamos verificar que pelo menos o texto original aparece:
    expect(zpl).toContain("Alian");
  });

  it("contém SKU", () => {
    expect(zpl).toContain("SKU: 1470-6");
  });

  it("contém SKU e nome sanitizados (sem ^ ou ~)", () => {
    // Verifica que o ZPL não contém raw ^ ou ~ dentro dos campos FD
    const depoisDeXA = zpl.split("^XA")[1];
    const linhasFd = depoisDeXA.split("^FS");
    for (const linha of linhasFd) {
      if (linha.includes("^FD") && !linha.includes("^BQ")) {
        // Extrai o conteúdo entre ^FD e o fim
        const fdContent = linha.split("^FD").pop() ?? "";
        expect(fdContent).not.toContain("^");
        expect(fdContent).not.toContain("~");
      }
    }
  });

  // QR Code
  it("contém QR code ^BQ com EPC", () => {
    expect(zpl).toContain("^BQN,2,4");
    expect(zpl).toContain("^FDLA," + epcReal);
  });

  // Validação de EPC inválido
  it("lança erro para EPC inválido (comprimento errado)", () => {
    expect(() =>
      gerarZplEtiquetaJoia(dados, "curto" as Epc),
    ).toThrow(/EPC inválido/i);
  });

  it("lança erro para EPC inválido (letras em vez de dígitos)", () => {
    expect(() =>
      gerarZplEtiquetaJoia(dados, "abcdefghijklmnopqrstuvwx" as Epc),
    ).toThrow(/EPC inválido/i);
  });

  // Presença do EPC no ^RFW (gravação hex)
  it("^RFW,H^FD contém o EPC completo (24 dígitos)", () => {
    expect(zpl).toContain(`^RFW,H^FD${epcReal}^FS`);
  });

  // ^HV formato correto
  it("^HV especifica 12 bytes com prefixo 'EPC:'", () => {
    expect(zpl).toContain("^HV1,12,EPC:,^FS");
  });
});

// ── gerarZplCalibracao ───────────────────────────────────────────────────────
describe("gerarZplCalibracao", () => {
  it("retorna '^XA\\n^HR\\n^XZ'", () => {
    const result = gerarZplCalibracao();
    expect(result).toBe("^XA\n^HR\n^XZ");
  });

  it("contém apenas 3 comandos", () => {
    const result = gerarZplCalibracao();
    const linhas = result.split("\n").filter(Boolean);
    expect(linhas).toEqual(["^XA", "^HR", "^XZ"]);
  });

  it("é uma string pura (sem efeitos colaterais)", () => {
    const a = gerarZplCalibracao();
    const b = gerarZplCalibracao();
    expect(a).toBe(b);
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

  it("contém ^RFR,H,0,8,2 (leitura do banco TID)", () => {
    expect(tid).toContain("^RFR,H,0,8,2^FN1^FS");
  });

  it("contém ^HV com prefixo TID:", () => {
    expect(tid).toContain("^HV1,,TID:,^FS");
    expect(tid).toContain("TID:");
  });

  it("NÃO contém 'Buffer.from'", () => {
    expect(tid).not.toContain("Buffer.from");
  });

  it("NÃO contém comandos legados (^WT, ^RT, ^RZ)", () => {
    expect(tid).not.toContain("^WT");
    expect(tid).not.toContain("^RT");
    expect(tid).not.toContain("^RZ");
  });
});
