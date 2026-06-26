import sql from "@/lib/db";

// ─── Tipos de entrada ────────────────────────────────────────────────────────

export interface ItemPagamento {
  forma_pagamento: string; // "01"=Dinheiro "03"=Cartão Crédito "04"=Cartão Débito "99"=Outros
  valor_pagamento: number;
  nome_credenciadora?: string;
  bandeira_operadora?: string;
  numero_autorizacao?: string;
}

export interface EmitenteDados {
  id: number;
  razao_social: string;
  cnpj: string;
  ie: string | null;
  im: string | null;
  regime_tributario: number;
  logradouro: string | null;
  numero_end: string | null;
  complemento: string | null;
  bairro: string | null;
  municipio: string | null;
  uf: string | null;
  cep: string | null;
  codigo_ibge_municipio: string | null;
  focus_token_criptografado: string;
  ambiente: string;
  serie_nfce: number;
  serie_nfe?: number;
  proxima_nfe?: number;
  ativo: boolean;
}

export interface ItemVendaDados {
  produto_id: bigint | number | string;
  nome_produto: string;
  sku: string | null;
  quantidade: number;
  preco_unitario: number;
  total_item: number;
  pct_desconto: number | null;
}

// ─── Tipos de saída ──────────────────────────────────────────────────────────

interface ItemNfcePayload {
  numero_item: number;
  codigo_produto: string;
  descricao: string;
  ncm: string;
  cfop: string;
  unidade_comercial: string;
  quantidade_comercial: number;
  valor_unitario_comercial: number;
  valor_bruto: number;
  valor_desconto?: number;
  icms_origem: string;
  icms_csosn: string;
  pis_modalidade: string;
  cofins_modalidade: string;
  aliq_ibpt_federal?: number;
  aliq_ibpt_estadual?: number;
  aliq_ibpt_municipal?: number;
  aliq_ibpt_importado?: number;
}

interface PagamentoNfcePayload {
  forma_pagamento: string;
  valor_pagamento: string;
  nome_credenciadora?: string;
  bandeira_operadora?: string;
  numero_autorizacao?: string;
}

interface DestinatarioNfcePayload {
  cpf?: string;
  cnpj?: string;
  nome_destinatario?: string;
  indicador_inscricao_estadual?: number;
  inscricao_estadual?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  cep?: string;
  codigo_pais?: string;
  nome_pais?: string;
}

export interface NfcePayload {
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
  destinatario?: DestinatarioNfcePayload;
  items: ItemNfcePayload[];
  formas_pagamento: PagamentoNfcePayload[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const s = (v: unknown): string | null => (v == null ? null : String(v));

interface RegraFiscal {
  cfop_saida: string;
  csosn: string | null;
  origem: string | null;
  aliq_ibpt_federal: string | null;
  aliq_ibpt_estadual: string | null;
  aliq_ibpt_municipal: string | null;
  aliq_ibpt_importado: string | null;
}

interface ProdutoFiscal {
  ncm: string | null;
  cfop_saida: string | null;
  origem: string | null;
  unidade_comercial: string | null;
  ean: string | null;
}

async function buscarRegraFiscal(
  emitenteId: number,
  ncm: string | null,
): Promise<RegraFiscal | null> {
  // 1. empresa + ncm
  if (ncm) {
    const [r1] = await sql<RegraFiscal[]>`
      SELECT cfop_saida, csosn, origem, aliq_ibpt_federal, aliq_ibpt_estadual,
             aliq_ibpt_municipal, aliq_ibpt_importado
      FROM alissonerp.regras_fiscais
      WHERE empresa_emitente_id = ${emitenteId} AND ncm = ${ncm} AND ativo = true
      LIMIT 1
    `;
    if (r1) return r1;

    // 2. global + ncm
    const [r2] = await sql<RegraFiscal[]>`
      SELECT cfop_saida, csosn, origem, aliq_ibpt_federal, aliq_ibpt_estadual,
             aliq_ibpt_municipal, aliq_ibpt_importado
      FROM alissonerp.regras_fiscais
      WHERE empresa_emitente_id IS NULL AND ncm = ${ncm} AND ativo = true
      LIMIT 1
    `;
    if (r2) return r2;
  }

  // 3. empresa + ncm null
  const [r3] = await sql<RegraFiscal[]>`
    SELECT cfop_saida, csosn, origem, aliq_ibpt_federal, aliq_ibpt_estadual,
           aliq_ibpt_municipal, aliq_ibpt_importado
    FROM alissonerp.regras_fiscais
    WHERE empresa_emitente_id = ${emitenteId} AND ncm IS NULL AND ativo = true
    LIMIT 1
  `;
  if (r3) return r3;

  // 4. global + ncm null
  const [r4] = await sql<RegraFiscal[]>`
    SELECT cfop_saida, csosn, origem, aliq_ibpt_federal, aliq_ibpt_estadual,
           aliq_ibpt_municipal, aliq_ibpt_importado
    FROM alissonerp.regras_fiscais
    WHERE empresa_emitente_id IS NULL AND ncm IS NULL AND ativo = true
    LIMIT 1
  `;
  return r4 ?? null;
}

// ─── buildNfcePayload ─────────────────────────────────────────────────────────

export async function buildNfcePayload(params: {
  vendaId: number;
  emitente: EmitenteDados;
  itens: ItemVendaDados[];
  pagamentos: ItemPagamento[];
  clienteId?: bigint | number;
  serie: number;
  numero: number;
}): Promise<NfcePayload> {
  const { emitente, itens, pagamentos, clienteId } = params;

  // ── Montar itens ──────────────────────────────────────────────────────────
  const itemsPayload: ItemNfcePayload[] = [];

  for (let idx = 0; idx < itens.length; idx++) {
    const item = itens[idx];
    const produtoId = BigInt(item.produto_id as string | number);
    const produtoIdStr = String(produtoId);

    // Buscar dados fiscais do produto
    const [pf] = await sql<ProdutoFiscal[]>`
      SELECT ncm, cfop_saida, origem, unidade_comercial, ean
      FROM alissonerp.produtos_fiscais
      WHERE id_produto = ${produtoIdStr}::bigint
    `;

    const ncm = pf?.ncm ?? null;

    if (!ncm) {
      console.warn(
        `[buildNfcePayload] Produto ${produtoId} sem NCM — usando "00000000"`,
      );
    }

    const regra = await buscarRegraFiscal(emitente.id, ncm);

    const cfop = s(regra?.cfop_saida) ?? s(pf?.cfop_saida) ?? "5102";
    const csosn = s(regra?.csosn) ?? "400";
    const origem = s(regra?.origem) ?? s(pf?.origem) ?? "0";
    const unidade = s(pf?.unidade_comercial) ?? "UN";

    const valorDesconto =
      item.pct_desconto && item.pct_desconto > 0
        ? parseFloat(
            (
              item.quantidade *
              item.preco_unitario *
              (item.pct_desconto / 100)
            ).toFixed(2),
          )
        : undefined;

    const itemPayload: ItemNfcePayload = {
      numero_item: idx + 1,
      codigo_produto: s(item.sku) ?? String(produtoId),
      descricao: item.nome_produto,
      ncm: ncm ?? "00000000",
      cfop,
      unidade_comercial: unidade,
      quantidade_comercial: item.quantidade,
      valor_unitario_comercial: item.preco_unitario,
      valor_bruto: parseFloat(
        (item.quantidade * item.preco_unitario).toFixed(2),
      ),
      icms_origem: origem,
      icms_csosn: csosn,
      pis_modalidade: "07",
      cofins_modalidade: "07",
    };

    if (valorDesconto !== undefined) {
      itemPayload.valor_desconto = valorDesconto;
    }

    if (regra?.aliq_ibpt_federal != null) {
      itemPayload.aliq_ibpt_federal = parseFloat(
        String(regra.aliq_ibpt_federal),
      );
    }
    if (regra?.aliq_ibpt_estadual != null) {
      itemPayload.aliq_ibpt_estadual = parseFloat(
        String(regra.aliq_ibpt_estadual),
      );
    }
    if (regra?.aliq_ibpt_municipal != null) {
      itemPayload.aliq_ibpt_municipal = parseFloat(
        String(regra.aliq_ibpt_municipal),
      );
    }
    if (regra?.aliq_ibpt_importado != null) {
      itemPayload.aliq_ibpt_importado = parseFloat(
        String(regra.aliq_ibpt_importado),
      );
    }

    itemsPayload.push(itemPayload);
  }

  // ── Destinatário (opcional) ───────────────────────────────────────────────
  let destinatario: DestinatarioNfcePayload | undefined;

  if (clienteId != null) {
    interface ContatoRow {
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

    const [contato] = await sql<ContatoRow[]>`
      SELECT c.nome, c.cpf_cnpj, c.tipo_pessoa, c.inscricao_estadual,
             c.endereco, c.numero, c.complemento, c.bairro, c.municipio,
             c.cep, c.uf,
             cf.ie, cf.indicador_ie, cf.codigo_ibge_municipio
      FROM public.contatos c
      LEFT JOIN alissonerp.contatos_fiscais cf ON cf.id_contato = c.id_contato
      WHERE c.id_contato = ${String(BigInt(clienteId as string | number))}::bigint
    `;

    if (contato) {
      const cpfCnpj = s(contato.cpf_cnpj)?.replace(/\D/g, "") ?? "";
      destinatario = {
        nome_destinatario: s(contato.nome) ?? undefined,
        indicador_inscricao_estadual: contato.indicador_ie ?? 9,
      };

      if (cpfCnpj.length === 11) {
        destinatario.cpf = cpfCnpj;
      } else if (cpfCnpj.length === 14) {
        destinatario.cnpj = cpfCnpj;
        if (contato.ie) {
          destinatario.inscricao_estadual = contato.ie;
        }
      }

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
    }
  }

  // ── Formas de pagamento ───────────────────────────────────────────────────
  const formasPagamento: PagamentoNfcePayload[] = pagamentos.map((p) => {
    const fp: PagamentoNfcePayload = {
      forma_pagamento: p.forma_pagamento,
      valor_pagamento: p.valor_pagamento.toFixed(2),
    };
    if (p.nome_credenciadora) fp.nome_credenciadora = p.nome_credenciadora;
    if (p.bandeira_operadora) fp.bandeira_operadora = p.bandeira_operadora;
    if (p.numero_autorizacao) fp.numero_autorizacao = p.numero_autorizacao;
    return fp;
  });

  // ── Payload final ─────────────────────────────────────────────────────────
  const payload: NfcePayload = {
    natureza_operacao: "Venda a consumidor",
    tipo_documento: 1,
    finalidade_emissao: 1,
    consumidor_final: 1,
    presenca_comprador: 1,
    modalidade_frete: 9,
    data_emissao: new Date().toISOString(),
    emitente: {
      cnpj: emitente.cnpj.replace(/\D/g, ""),
      razao_social: emitente.razao_social,
      regime_tributario: emitente.regime_tributario,
    },
    items: itemsPayload,
    formas_pagamento: formasPagamento,
  };

  if (emitente.ie) payload.emitente.inscricao_estadual = emitente.ie;
  if (emitente.im) payload.emitente.inscricao_municipal = emitente.im;
  if (emitente.logradouro)
    payload.emitente.logradouro = emitente.logradouro;
  if (emitente.numero_end) payload.emitente.numero = emitente.numero_end;
  if (emitente.complemento)
    payload.emitente.complemento = emitente.complemento;
  if (emitente.bairro) payload.emitente.bairro = emitente.bairro;
  if (emitente.municipio) payload.emitente.municipio = emitente.municipio;
  if (emitente.uf) payload.emitente.uf = emitente.uf;
  if (emitente.cep)
    payload.emitente.cep = emitente.cep.replace(/\D/g, "");
  if (emitente.codigo_ibge_municipio)
    payload.emitente.codigo_municipio = emitente.codigo_ibge_municipio;

  if (destinatario) payload.destinatario = destinatario;

  return payload;
}
