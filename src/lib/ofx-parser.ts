// Parser simples de arquivo OFX/OFC para extração de transações bancárias
// OFX é um formato baseado em SGML (não XML padrão)

export interface OFXTransaction {
  fitid: string;          // ID único do banco
  tipo: "C" | "D";       // C=crédito, D=débito
  valor: number;          // Valor absoluto
  data_transacao: string; // ISO date
  descricao: string;      // Memo/description
}

export interface OFXResult {
  banco: string;
  agencia: string;
  conta: string;
  data_inicio: string;
  data_fim: string;
  transacoes: OFXTransaction[];
}

function extractTag(content: string, tag: string): string {
  const regex = new RegExp(`<${tag}>([^<\\n]+)`, "i");
  const match = content.match(regex);
  return match ? match[1].trim() : "";
}

function parseOFXDate(dateStr: string): string {
  // OFX dates: YYYYMMDDHHMMSS or YYYYMMDD
  if (!dateStr || dateStr.length < 8) return "";
  const y = dateStr.substring(0, 4);
  const m = dateStr.substring(4, 6);
  const d = dateStr.substring(6, 8);
  return `${y}-${m}-${d}`;
}

export function parseOFX(content: string): OFXResult {
  if (content.length > 10 * 1024 * 1024) {
    throw new Error("Arquivo OFX muito grande (máximo 10MB)");
  }

  // Extrair info da conta
  const banco = extractTag(content, "BANKID") || extractTag(content, "ORG");
  const agencia = extractTag(content, "BRANCHID");
  const conta = extractTag(content, "ACCTID");

  // Extrair período
  const data_inicio = parseOFXDate(extractTag(content, "DTSTART"));
  const data_fim = parseOFXDate(extractTag(content, "DTEND"));

  // Extrair transações
  const transacoes: OFXTransaction[] = [];
  const stmtRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  let match;

  while ((match = stmtRegex.exec(content)) !== null) {
    const block = match[1];
    const trntype = extractTag(block, "TRNTYPE");
    const dtposted = extractTag(block, "DTPOSTED");
    const trnamt = extractTag(block, "TRNAMT");
    const fitid = extractTag(block, "FITID");
    const memo = extractTag(block, "MEMO") || extractTag(block, "NAME");

    if (!fitid || !trnamt) continue;

    const valor = parseFloat(trnamt.replace(",", "."));
    if (isNaN(valor)) continue;
    transacoes.push({
      fitid,
      tipo: valor >= 0 ? "C" : "D",
      valor: Math.abs(valor),
      data_transacao: parseOFXDate(dtposted),
      descricao: memo,
    });
  }

  return { banco, agencia, conta, data_inicio, data_fim, transacoes };
}
