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

// ---------------------------------------------------------------------------
// Modelo de etiqueta — dimensões, offset de impressão e posição do chip.
// Vários modelos coexistem (cada joia/mídia tem o seu). Medidas em mm.
// ---------------------------------------------------------------------------
export interface EtiquetaModelo {
  id: number;
  nome: string;
  largura_mm: number;
  altura_mm: number;
  offset_x_mm: number;
  offset_y_mm: number;
  posicao_rfid: string | null; // ex.: "F1" (posição de programação calibrada)
  padrao: boolean;
  ativo: boolean;
}

export const EtiquetaModeloInputSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  nome: z.string().min(1, "nome obrigatório"),
  largura_mm: z.coerce.number().positive(),
  altura_mm: z.coerce.number().positive(),
  offset_x_mm: z.coerce.number().default(0),
  offset_y_mm: z.coerce.number().default(0),
  posicao_rfid: z.string().trim().max(8).nullable().optional(),
  padrao: z.boolean().default(false),
});
export type EtiquetaModeloInput = z.infer<typeof EtiquetaModeloInputSchema>;

/** 203 dpi = 8 dots/mm. Converte mm → dots (ZPL). */
export const DOTS_PER_MM = 8;
export const mmToDots = (mm: number): number => Math.round(mm * DOTS_PER_MM);
