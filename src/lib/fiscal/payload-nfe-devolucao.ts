import sql from "@/lib/db";
import type { EmitenteDados } from "@/lib/fiscal/payload-nfce";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const s = (v: unknown): string | null => (v == null ? null : String(v));

// ─── Tipos internos ───────────────────────────────────────────────────────────

interface RegraFiscalDev {
  cfop_saida: string;
  cfop_devolucao: string | null;
  csosn: string | null;
  origem: string | null;
  aliq_ibpt_federal: string | null;
  aliq_ibpt_estadual: string | null;
  aliq_ibpt_municipal: string | null;
  aliq_ibpt_importado: string | null;
}

interface ProdutoFiscalDev {
  ncm: string | null;
  cfop_saida: string | null;
  origem: string | null;
  unidade_comercial: string | null;
}

interface DevolucaoItemRow {
  id: number;
  produto_id: bigint | number | string;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
  nome_produto: string | null;
  sku: string | null;
}

interface DestinatarioNfePayload {
  nome: string;
  cpf?: string;
  cnpj?: string;
  inscricao_estadual?: string;
  indicador_inscricao_estadual?: number;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  cep?: string;
  codigo_pais?: string;
  nome_pais?: string;
  email?: string;
}

interface ItemNfePayload {
  numero_item: number;
  codigo_produto: string;
  descricao: string;
  ncm: string;
  cfop: string;
  unidade_comercial: string;
  quantidade_comercial: number;
  valor_unitario_comercial: number;
  valor_bruto: number;
  icms_origem: string;
  icms_csosn: string;
  pis_modalidade: string;
  cofins_modalidade: string;
  aliq_ibpt_federal?: number;
  aliq_ibpt_estadual?: number;
  aliq_ibpt_municipal?: number;
  aliq_ibpt_importado?: number;
}

export interface NfePayload {
  natureza_operacao: string;
  tipo_documento: number;
  finalidade_emissao: number;
  consumidor_final: number;
  presenca_comprador: number;
  modalidade_frete: number;
  data_emissao: string;
  emitente: {
    cnpj: string;
    razao_social: string;
    inscricao_estadual?: string;
    inscricao_municipal?: string;
    regime_tributario: number;
    logradouro?: string;
    numero?: string;
    complemento?: string;
    bairro?: string;
    municipio?: string;
    uf?: string;
    cep?: string;
    codigo_municipio?: string;
  };
  destinatario: DestinatarioNfePayload;
  items: ItemNfePayload[];
  formas_pagamento: Array<{ forma_pagamento: string; valor_pagamento: string }>;
}

// ─── buscarRegraFiscalDev ─────────────────────────────────────────────────────

async function buscarRegraFiscalDev(
  emitenteId: number,
  ncm: string | null,
): Promise<RegraFiscalDev | null> {
  // 1. empresa + ncm
  if (ncm) {
    const [r1] = await sql<RegraFiscalDev[]>`
      SELECT cfop_saida, cfop_devolucao, csosn, origem,
             aliq_ibpt_federal, aliq_ibpt_estadual, aliq_ibpt_municipal, aliq_ibpt_importado
      FROM alissonerp.regras_fiscais
      WHERE empresa_emitente_id = ${emitenteId} AND ncm = ${ncm} AND ativo = true
      LIMIT 1
    `;
    if (r1) return r1;

    // 2. global + ncm
    const [r2] = await sql<RegraFiscalDev[]>`
      SELECT cfop_saida, cfop_devolucao, csosn, origem,
             aliq_ibpt_federal, aliq_ibpt_estadual, aliq_ibpt_municipal, aliq_ibpt_importado
      FROM alissonerp.regras_fiscais
      WHERE empresa_emitente_id IS NULL AND ncm = ${ncm} AND ativo = true
      LIMIT 1
    `;
    if (r2) return r2;
  }

  // 3. empresa + ncm null
  const [r3] = await sql<RegraFiscalDev[]>`
    SELECT cfop_saida, cfop_devolucao, csosn, origem,
           aliq_ibpt_federal, aliq_ibpt_estadual, aliq_ibpt_municipal, aliq_ibpt_importado
    FROM alissonerp.regras_fiscais
    WHERE empresa_emitente_id = ${emitenteId} AND ncm IS NULL AND ativo = true
    LIMIT 1
  `;
  if (r3) return r3;

  // 4. global + ncm null
  const [r4] = await sql<RegraFiscalDev[]>`
    SELECT cfop_saida, cfop_devolucao, csosn, origem,
           aliq_ibpt_federal, aliq_ibpt_estadual, aliq_ibpt_municipal, aliq_ibpt_importado
    FROM alissonerp.regras_fiscais
    WHERE empresa_emitente_id IS NULL AND ncm IS NULL AND ativo = true
    LIMIT 1
  `;
  return r4 ?? null;
}

// ─── buildNfeDevolucaoPayload ─────────────────────────────────────────────────

export async function buildNfeDevolucaoPayload(params: {
  devolucaoId: number;
  emitente: EmitenteDados;
  serie: number;
  numero: number;
}): Promise<NfePayload> {
  const { devolucaoId, emitente } = params;

  // ── Buscar itens da devolução com JOIN itens_venda_erp ────────────────────
  const itens = await sql<DevolucaoItemRow[]>`
    SELECT
      di.id,
      di.produto_id,
      di.quantidade,
      di.valor_unitario,
      di.valor_total,
      COALESCE(ive.nome_produto, '') AS nome_produto,
      ive.sku
    FROM alissonerp.devolucoes_itens di
    LEFT JOIN alissonerp.itens_venda_erp ive ON ive.id = di.item_venda_id
    WHERE di.devolucao_id = ${devolucaoId}
    ORDER BY di.id
  `;

  if (itens.length === 0) {
    throw new Error(`Devolução ${devolucaoId} sem itens`);
  }

  // ── Buscar UF do destinatário via venda ───────────────────────────────────
  interface VendaDevolucaoRow {
    cliente_id: bigint | number | string;
    endereco_entrega_uf: string | null;
    total_venda: string | null;
  }

  const [vendaRow] = await sql<VendaDevolucaoRow[]>`
    SELECT v.cliente_id, v.endereco_entrega_uf, v.total_venda
    FROM alissonerp.devolucoes_venda dv
    JOIN alissonerp.vendas_erp v ON v.id = dv.venda_id
    WHERE dv.id = ${devolucaoId}
  `;

  if (!vendaRow) {
    throw new Error(`Devolução ${devolucaoId} sem venda vinculada`);
  }

  const ufEmitente = (emitente.uf ?? "").toUpperCase();
  const ufDestinatario = (vendaRow.endereco_entrega_uf ?? "").toUpperCase();

  // ── Buscar destinatário (OBRIGATÓRIO em NF-e 55) ──────────────────────────
  interface ContatoRow {
    id_contato: bigint | number | string;
    nome: string | null;
    cpf_cnpj: string | null;
    tipo_pessoa: string | null;
    inscricao_estadual: string | null;
    endereco: string | null;
    numero: string | null;
    complemento: string | null;
    bairro: string | null;
    municipio: string | null;
    cep: string | null;
    uf: string | null;
    ie: string | null;
    indicador_ie: number | null;
    codigo_ibge_municipio: string | null;
  }

  const clienteIdStr = String(BigInt(vendaRow.cliente_id as string | number));
  const [contato] = await sql<ContatoRow[]>`
    SELECT c.id_contato, c.nome, c.cpf_cnpj, c.tipo_pessoa, c.inscricao_estadual,
           c.endereco, c.numero, c.complemento, c.bairro, c.municipio,
           c.cep, c.uf,
           cf.ie, cf.indicador_ie, cf.codigo_ibge_municipio
    FROM public.contatos c
    LEFT JOIN alissonerp.contatos_fiscais cf ON cf.id_contato = c.id_contato
    WHERE c.id_contato = ${clienteIdStr}::bigint
  `;

  if (!contato) {
    throw new Error(`Cliente ${clienteIdStr} não encontrado para devolução ${devolucaoId}`);
  }

  const cpfCnpj = s(contato.cpf_cnpj)?.replace(/\D/g, "") ?? "";
  const indicadorIe = contato.indicador_ie ?? 9;

  const destinatario: DestinatarioNfePayload = {
    nome: s(contato.nome) ?? "NAO IDENTIFICADO",
    indicador_inscricao_estadual: indicadorIe,
  };

  if (cpfCnpj.length === 11) {
    destinatario.cpf = cpfCnpj;
  } else if (cpfCnpj.length === 14) {
    destinatario.cnpj = cpfCnpj;
  }

  // Inscrição estadual conforme indicador_ie
  if (indicadorIe === 2) {
    // isento
    destinatario.inscricao_estadual = "ISENTO";
  } else if (indicadorIe === 1) {
    // contribuinte — incluir IE se disponível
    const ie = s(contato.ie) ?? s(contato.inscricao_estadual);
    if (ie) destinatario.inscricao_estadual = ie;
  }
  // indicadorIe === 9 (não contribuinte) — omitir inscricao_estadual

  if (contato.endereco) {
    destinatario.logradouro = contato.endereco;
    destinatario.numero = s(contato.numero) ?? undefined;
    destinatario.complemento = s(contato.complemento) ?? undefined;
    destinatario.bairro = s(contato.bairro) ?? undefined;
    destinatario.municipio = s(contato.municipio) ?? undefined;
    destinatario.uf = s(contato.uf) ?? undefined;
    destinatario.cep = s(contato.cep)?.replace(/\D/g, "") ?? undefined;
    destinatario.codigo_pais = "1058";
    destinatario.nome_pais = "Brasil";
  }

  // ── Montar itens ──────────────────────────────────────────────────────────
  const itemsPayload: ItemNfePayload[] = [];
  let valorTotalItens = 0;

  for (let idx = 0; idx < itens.length; idx++) {
    const item = itens[idx];
    const produtoIdStr = String(BigInt(item.produto_id as string | number));

    // Dados fiscais do produto
    const [pf] = await sql<ProdutoFiscalDev[]>`
      SELECT ncm, cfop_saida, origem, unidade_comercial
      FROM alissonerp.produtos_fiscais
      WHERE id_produto = ${produtoIdStr}::bigint
    `;

    const ncm = pf?.ncm ?? null;

    if (!ncm) {
      console.warn(
        `[buildNfeDevolucaoPayload] Produto ${produtoIdStr} sem NCM — usando "00000000"`,
      );
    }

    const regra = await buscarRegraFiscalDev(emitente.id, ncm);
    const csosn = s(regra?.csosn) ?? "400";
    const origem = s(regra?.origem) ?? s(pf?.origem) ?? "0";
    const unidade = s(pf?.unidade_comercial) ?? "UN";

    // CFOP de devolução
    let cfop: string;
    if (regra?.cfop_devolucao) {
      cfop = regra.cfop_devolucao;
    } else {
      // Mesmo estado → 1202, outro estado → 2202
      cfop = ufEmitente === ufDestinatario ? "1202" : "2202";
    }

    const valorBruto = parseFloat(
      (item.quantidade * item.valor_unitario).toFixed(2),
    );
    valorTotalItens += valorBruto;

    const itemPayload: ItemNfePayload = {
      numero_item: idx + 1,
      codigo_produto: s(item.sku) ?? produtoIdStr,
      descricao: item.nome_produto ?? `Produto ${produtoIdStr}`,
      ncm: ncm ?? "00000000",
      cfop,
      unidade_comercial: unidade,
      quantidade_comercial: item.quantidade,
      valor_unitario_comercial: item.valor_unitario,
      valor_bruto: valorBruto,
      icms_origem: origem,
      icms_csosn: csosn,
      pis_modalidade: "07",
      cofins_modalidade: "07",
    };

    if (regra?.aliq_ibpt_federal != null) {
      itemPayload.aliq_ibpt_federal = parseFloat(String(regra.aliq_ibpt_federal));
    }
    if (regra?.aliq_ibpt_estadual != null) {
      itemPayload.aliq_ibpt_estadual = parseFloat(String(regra.aliq_ibpt_estadual));
    }
    if (regra?.aliq_ibpt_municipal != null) {
      itemPayload.aliq_ibpt_municipal = parseFloat(String(regra.aliq_ibpt_municipal));
    }
    if (regra?.aliq_ibpt_importado != null) {
      itemPayload.aliq_ibpt_importado = parseFloat(String(regra.aliq_ibpt_importado));
    }

    itemsPayload.push(itemPayload);
  }

  // ── Payload final ─────────────────────────────────────────────────────────
  const payload: NfePayload = {
    natureza_operacao: "Devolução de venda",
    tipo_documento: 0,
    finalidade_emissao: 4,
    consumidor_final: 1,
    presenca_comprador: 0,
    modalidade_frete: 9,
    data_emissao: new Date().toISOString(),
    emitente: {
      cnpj: emitente.cnpj.replace(/\D/g, ""),
      razao_social: emitente.razao_social,
      regime_tributario: emitente.regime_tributario,
    },
    destinatario,
    items: itemsPayload,
    formas_pagamento: [
      {
        forma_pagamento: "90",
        valor_pagamento: valorTotalItens.toFixed(2),
      },
    ],
  };

  if (emitente.ie) payload.emitente.inscricao_estadual = emitente.ie;
  if (emitente.im) payload.emitente.inscricao_municipal = emitente.im;
  if (emitente.logradouro) payload.emitente.logradouro = emitente.logradouro;
  if (emitente.numero_end) payload.emitente.numero = emitente.numero_end;
  if (emitente.complemento) payload.emitente.complemento = emitente.complemento;
  if (emitente.bairro) payload.emitente.bairro = emitente.bairro;
  if (emitente.municipio) payload.emitente.municipio = emitente.municipio;
  if (emitente.uf) payload.emitente.uf = emitente.uf;
  if (emitente.cep) payload.emitente.cep = emitente.cep.replace(/\D/g, "");
  if (emitente.codigo_ibge_municipio)
    payload.emitente.codigo_municipio = emitente.codigo_ibge_municipio;

  return payload;
}
