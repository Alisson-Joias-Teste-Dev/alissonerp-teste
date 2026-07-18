import {
  PREFIXO_ERP,
  PREFIXO_EXTERNO,
  ID_PRODUTO_DIGITS,
  SERIAL_DIGITS,
  EPC_TOTAL_DIGITS,
  type Epc,
  EpcSchema,
} from "./tipos";

const PREFIXO_LEN = 4;

const EPC_RE = /^\d{24}$/;
const ERP_RE = new RegExp(`^${PREFIXO_ERP}\\d{20}$`);
const LEGADO_RE = new RegExp(`^${PREFIXO_EXTERNO}\\d{20}$`);

export function buildEpc(idProduto: number, serial: number): Epc {
  const prefixo = PREFIXO_ERP;
  const prod = String(idProduto).padStart(ID_PRODUTO_DIGITS, "0");
  const ser = String(serial).padStart(SERIAL_DIGITS, "0");

  // id_produto max atual = 90.000.852 (~11x de folga nos 9 dígitos).
  // Se aproximar de 1e9, redistribuir dígitos entre id_produto e serial
  // sem tocar nas etiquetas antigas (o lookup usa casamento exato em joias_rfid).
  if (prod.length > ID_PRODUTO_DIGITS) {
    throw new Error(
      `id_produto ${idProduto} excede ${ID_PRODUTO_DIGITS} dígitos`
    );
  }
  if (ser.length > SERIAL_DIGITS) {
    throw new Error(
      `serial ${serial} excede ${SERIAL_DIGITS} dígitos`
    );
  }

  const raw = `${prefixo}${prod}${ser}`;
  return EpcSchema.parse(raw);
}

export function parseEpc(
  epc: Epc
): { prefixo: string; idProduto: number; serial: number } {
  return {
    prefixo: epc.slice(0, PREFIXO_LEN),
    idProduto: parseInt(epc.slice(PREFIXO_LEN, PREFIXO_LEN + ID_PRODUTO_DIGITS), 10),
    serial: parseInt(epc.slice(PREFIXO_LEN + ID_PRODUTO_DIGITS), 10),
  };
}

export function validateEpc(input: string): input is Epc {
  if (!EPC_RE.test(input)) return false;
  if (ERP_RE.test(input)) return true;
  if (LEGADO_RE.test(input)) return true;
  return false;
}

export function isValidEpc(input: string): input is Epc {
  return validateEpc(input);
}

export function isEpcERP(epc: string): boolean {
  return epc.startsWith(PREFIXO_ERP);
}

export function isEpcLegado(epc: string): boolean {
  return epc.startsWith(PREFIXO_EXTERNO);
}

export function extrairIdProduto(epc: string): number | null {
  if (!EPC_RE.test(epc)) return null;
  const idStr = epc.slice(PREFIXO_LEN, PREFIXO_LEN + ID_PRODUTO_DIGITS);
  const id = parseInt(idStr, 10);
  return isNaN(id) || id <= 0 ? null : id;
}

export function formatEpc(epc: Epc): string {
  const { prefixo, idProduto, serial } = parseEpc(epc);
  return `${prefixo}-${String(idProduto).padStart(ID_PRODUTO_DIGITS, "0")}-${String(serial).padStart(SERIAL_DIGITS, "0")}`;
}
