import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { hasRole, ROLES_FISCAL } from "@/lib/roles";
import { focusRequest } from "@/lib/fiscal/focus-client";
import {
  buildNfcePayload,
  type EmitenteDados,
  type ItemPagamento,
  type ItemVendaDados,
} from "@/lib/fiscal/payload-nfce";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getUserRole(userId: string): Promise<string | null> {
  const [row] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${userId}::uuid
  `;
  return row?.role ?? null;
}

// ─── POST /api/fiscal/emitir/nfce ─────────────────────────────────────────────

interface EmitirNfceBody {
  venda_id: number;
  pagamentos: ItemPagamento[];
  cliente_id?: number;
}

interface FocusNfceResponse {
  status?: string;
  ref?: string;
  chave_nfe?: string;
  caminho_danfe?: string;
  mensagem_sefaz?: string;
  codigo?: string;
  erros?: Array<{ codigo: string; mensagem: string }>;
}

export async function POST(req: NextRequest) {
  // ── 1. Auth ────────────────────────────────────────────────────────────────
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });

  const role = await getUserRole(user.id);
  if (!hasRole(role, ROLES_FISCAL))
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });

  // ── 2. Parse body ─────────────────────────────────────────────────────────
  let body: EmitirNfceBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body invalido" }, { status: 400 });
  }

  const { venda_id, pagamentos, cliente_id } = body;

  if (!venda_id || !Array.isArray(pagamentos) || pagamentos.length === 0) {
    return NextResponse.json(
      { error: "venda_id e pagamentos sao obrigatorios" },
      { status: 400 },
    );
  }

  // ── 3. Buscar venda ───────────────────────────────────────────────────────
  interface VendaRow {
    id: number;
    numero_venda: string | null;
    empresa_emitente_id: number | null;
    nota_fiscal_id: number | null;
    total_produtos: string | null;
    total_desconto: string | null;
    total_frete: string | null;
    total_venda: string | null;
  }

  const [venda] = await sql<VendaRow[]>`
    SELECT id, numero_venda, empresa_emitente_id, nota_fiscal_id,
           total_produtos, total_desconto, total_frete, total_venda
    FROM alissonerp.vendas_erp
    WHERE id = ${venda_id}
  `;

  if (!venda)
    return NextResponse.json({ error: "Venda nao encontrada" }, { status: 404 });

  // ── 4. Verificar se já tem nota ───────────────────────────────────────────
  if (venda.nota_fiscal_id) {
    return NextResponse.json(
      { error: "Venda ja possui NFC-e emitida" },
      { status: 409 },
    );
  }

  if (!venda.empresa_emitente_id) {
    return NextResponse.json(
      { error: "Venda nao possui emitente vinculado" },
      { status: 422 },
    );
  }

  // ── 5. Buscar emitente ────────────────────────────────────────────────────
  const [emitente] = await sql<EmitenteDados[]>`
    SELECT id, razao_social, cnpj, ie, im, regime_tributario,
           logradouro, numero_end, complemento, bairro, municipio,
           uf, cep, codigo_ibge_municipio,
           focus_token_criptografado, ambiente, serie_nfce, proxima_nfce, ativo
    FROM alissonerp.empresas_emitentes
    WHERE id = ${venda.empresa_emitente_id}
  `;

  if (!emitente)
    return NextResponse.json({ error: "Emitente nao encontrado" }, { status: 404 });

  if (!emitente.ativo)
    return NextResponse.json({ error: "Emitente inativo" }, { status: 422 });

  if (!emitente.focus_token_criptografado)
    return NextResponse.json(
      { error: "Emitente sem token Focus NFe configurado" },
      { status: 422 },
    );

  // ── 6. Buscar itens da venda ──────────────────────────────────────────────
  const itens = await sql<ItemVendaDados[]>`
    SELECT produto_id, nome_produto, sku, quantidade,
           preco_unitario, total_item, pct_desconto
    FROM alissonerp.itens_venda_erp
    WHERE venda_id = ${venda_id}
    ORDER BY id
  `;

  if (itens.length === 0)
    return NextResponse.json(
      { error: "Venda sem itens" },
      { status: 422 },
    );

  // ── 7. Gerar focus_ref ────────────────────────────────────────────────────
  const focusRef = `nfce-${venda_id}-${Date.now()}`;

  // ── 8. Transação: reservar número + inserir nota + itens + atualizar venda ─
  let notaId: number;
  let numero: number;
  let serie: number;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await sql.begin(async (tx: any) => {
      // a. Incrementar proxima_nfce atomicamente
      const [numRow] = await tx`
        UPDATE alissonerp.empresas_emitentes
        SET proxima_nfce = proxima_nfce + 1
        WHERE id = ${emitente.id}
        RETURNING (proxima_nfce - 1) AS numero, serie_nfce AS serie
      `;

      const numNota = Number(numRow.numero);
      const serieNota = Number(numRow.serie);

      // b. Inserir nota fiscal
      const [nota] = await tx`
        INSERT INTO alissonerp.notas_fiscais (
          modelo, serie, numero, empresa_emitente_id, tipo_operacao,
          origem_tabela, origem_id, cliente_contato_id,
          natureza_operacao, cfop,
          valor_produtos, valor_desconto, valor_frete, valor_total,
          status, focus_ref, emitida_por_user_id, ambiente
        ) VALUES (
          65,
          ${serieNota},
          ${numNota},
          ${emitente.id},
          1,
          'vendas_erp',
          ${venda_id},
          ${cliente_id ?? null},
          'Venda a consumidor',
          '5102',
          ${parseFloat(venda.total_produtos ?? "0")},
          ${parseFloat(venda.total_desconto ?? "0")},
          ${parseFloat(venda.total_frete ?? "0")},
          ${parseFloat(venda.total_venda ?? "0")},
          'processando',
          ${focusRef},
          ${user.id}::uuid,
          ${emitente.ambiente}
        )
        RETURNING id
      `;

      const notaFiscalId = nota.id as number;

      // c. Inserir itens (snapshot)
      for (let i = 0; i < itens.length; i++) {
        const item = itens[i];
        const prodIdStr = String(BigInt(item.produto_id as string | number));

        // buscar dados fiscais do produto para snapshot
        const [pf] = await tx`
          SELECT ncm, cfop_saida, origem, unidade_comercial
          FROM alissonerp.produtos_fiscais
          WHERE id_produto = ${prodIdStr}::bigint
        `;

        const valorDesconto = item.pct_desconto && (item.pct_desconto as number) > 0
          ? parseFloat((item.quantidade * item.preco_unitario * ((item.pct_desconto as number) / 100)).toFixed(2))
          : 0;

        await tx`
          INSERT INTO alissonerp.notas_fiscais_itens (
            nota_fiscal_id, numero_item, produto_id,
            codigo_produto, descricao, ncm, cfop,
            unidade_comercial, quantidade, valor_unitario,
            valor_bruto, valor_desconto, valor_total,
            icms_csosn, icms_origem
          ) VALUES (
            ${notaFiscalId},
            ${i + 1},
            ${prodIdStr}::bigint,
            ${String(item.sku ?? prodIdStr)},
            ${item.nome_produto},
            ${(pf?.ncm as string | null) ?? null},
            ${(pf?.cfop_saida as string | null) ?? '5102'},
            ${(pf?.unidade_comercial as string | null) ?? 'UN'},
            ${item.quantidade},
            ${item.preco_unitario},
            ${parseFloat((item.quantidade * item.preco_unitario).toFixed(2))},
            ${valorDesconto},
            ${item.total_item},
            '400',
            ${(pf?.origem as string | null) ?? '0'}
          )
        `;
      }

      // d. Vincular nota à venda
      await tx`
        UPDATE alissonerp.vendas_erp
        SET nota_fiscal_id = ${notaFiscalId}
        WHERE id = ${venda_id}
      `;

      return { notaFiscalId, numNota, serieNota };
    });

    notaId = result.notaFiscalId;
    numero = result.numNota;
    serie = result.serieNota;
  } catch (err) {
    console.error("[emitir/nfce] Erro na transacao:", err);
    return NextResponse.json(
      { error: "Erro ao registrar nota no banco" },
      { status: 500 },
    );
  }

  // ── 9. Montar payload e chamar Focus NFe ───────────────────────────────────
  let focusStatus: string = "processando";
  let mensagemSefaz: string | null = null;
  let codigoSefaz: string | null = null;
  let chave44: string | null = null;
  let pdfDanfeUrl: string | null = null;

  try {
    const payload = await buildNfcePayload({
      vendaId: venda_id,
      emitente,
      itens,
      pagamentos,
      clienteId: cliente_id != null ? BigInt(cliente_id) : undefined,
      serie,
      numero,
    });

    const focusResp = await focusRequest<FocusNfceResponse>(
      "POST",
      `/v2/nfce?ref=${encodeURIComponent(focusRef)}`,
      emitente.focus_token_criptografado,
      payload,
    );

    const fd = focusResp.data;

    if (focusResp.status === 200 && fd.status === "autorizado") {
      // Autorizado direto
      focusStatus = "autorizada";
      chave44 = fd.chave_nfe ?? null;
      pdfDanfeUrl = fd.caminho_danfe ?? null;
    } else if (focusResp.status === 202) {
      // Aceito para processamento assíncrono
      focusStatus = "processando";
    } else {
      // Erro / rejeição
      focusStatus = "rejeitada";
      mensagemSefaz =
        fd.mensagem_sefaz ??
        (fd.erros ? fd.erros.map((e) => e.mensagem).join("; ") : null);
      codigoSefaz = fd.codigo ?? null;
    }
  } catch (err) {
    console.error("[emitir/nfce] Erro ao chamar Focus NFe:", err);
    focusStatus = "rejeitada";
    mensagemSefaz = "Erro de comunicacao com Focus NFe";
  }

  // ── 10. Atualizar status da nota ──────────────────────────────────────────
  try {
    await sql`
      UPDATE alissonerp.notas_fiscais
      SET status = ${focusStatus},
          chave_44 = ${chave44},
          pdf_danfe_url = ${pdfDanfeUrl},
          codigo_sefaz = ${codigoSefaz},
          mensagem_sefaz = ${mensagemSefaz},
          updated_at = now()
      WHERE id = ${notaId}
    `;

    if (focusStatus === "autorizada") {
      await sql`
        UPDATE alissonerp.vendas_erp
        SET nfce_numero = ${numero},
            nfce_chave_44 = ${chave44},
            nfce_emitida_em = now()
        WHERE id = ${venda_id}
      `;
    }
  } catch (err) {
    console.error("[emitir/nfce] Erro ao atualizar status da nota:", err);
  }

  return NextResponse.json(
    {
      nota_fiscal_id: notaId,
      status: focusStatus,
      focus_ref: focusRef,
      numero,
      serie,
      chave_44: chave44,
      pdf_danfe_url: pdfDanfeUrl,
      mensagem_sefaz: mensagemSefaz,
    },
    { status: focusStatus === "rejeitada" ? 422 : 201 },
  );
}
