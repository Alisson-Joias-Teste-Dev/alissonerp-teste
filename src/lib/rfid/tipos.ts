import { z } from "zod";

export const PREFIXO_ERP = "1001";
export const PREFIXO_EXTERNO = "0000";
export const ID_PRODUTO_DIGITS = 9;
export const SERIAL_DIGITS = 11;
export const EPC_TOTAL_DIGITS = 24;

const DIGITS_RE = /^\d+$/;

export const EpcSchema = z
  .string()
  .length(EPC_TOTAL_DIGITS)
  .regex(DIGITS_RE, "EPC deve conter apenas dígitos numéricos")
  .brand<"Epc">();

export type Epc = z.infer<typeof EpcSchema>;

export const DadosEtiquetaSchema = z.object({
  id_produto: z.number().int().positive(),
  sku: z.string().min(1),
  nome: z.string().min(1),
});

export type DadosEtiqueta = z.infer<typeof DadosEtiquetaSchema>;

export interface ProdutoRfid {
  id_produto: number;
  sku: string | null;
  nome: string | null;
  categoria: string | null;
  peso_real: number | null;
  peso_precificado?: number | null;
  preco: number | null;
  imagem: string | null;
  tem_sku_e_nome: boolean;
  qtd_estoque?: number;
}

export type StatusGravacao = "ok" | "void" | "no_tag" | "divergente" | "offline";

export interface ResultadoGravacao {
  status: StatusGravacao;
  epcLido: string | null;
  mensagem: string;
}

export interface ResultadoCalibracao {
  posicao: string | null;
  antena: string | null;
  readPower: number | null;
  writePower: number | null;
  tidInfo: string | null;
  sucesso: boolean;
  raw: string;
}

export const RfidCadastrarSchema = z.object({
  produto_id: z.coerce.number().int().positive(),
});

export const RfidConfirmarSchema = z.object({
  epc: z.string().min(1),
});

export const RfidReverterSchema = z.object({
  epc: z.string().min(1),
  motivo: z.string().optional(),
});

export const RfidReimprimirSchema = z.object({
  epc: z.string().min(1),
});

export const RfidLookupSchema = z.object({
  epcs: z.array(z.string()).min(1),
});
