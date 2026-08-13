import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { hasRole, ROLES_FISCAL } from "@/lib/roles";
import { focusRequest } from "@/lib/fiscal/focus-client";
import {
  buildNfeDevolucaoPayload,
} from "@/lib/fiscal/payload-nfe-devolucao";
import type { EmitenteDados } from "@/lib/fiscal/payload-nfce";
import { zodError } from "@/lib/schemas/common";

const NfeDevolucaoPostSchema = z.object({
  devolucao_id: z.coerce.number().int().positive(),
}).passthrough();

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getUserRole(userId: string): Promise<string | null> {
  const [row] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${userId}::uuid
  `;
  return row?.role ?? null;
}

// ─── POST /api/fiscal/emitir/nfe-devolucao ────────────────────────────────────

interface EmitirNfeDevolucaoBody {
  devolucao_id: number;
}

interface FocusNfeResponse {
  status?: string;
  ref?: string;
  chave_nfe?: string;
  caminho_danfe?: string;
  mensagem_sefaz?: string;
  codigo?: string;
  numero?: number | string;
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
  const raw = await req.json().catch(() => null);
  if (raw === null) return NextResponse.json({ error: "Body invalido" }, { status: 400 });
  const parsed = NfeDevolucaoPostSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { devolucao_id } = parsed.data;

  // ── 3. Buscar devolução + venda vinculada ─────────────────────────────────
  interface DevolucaoRow {
    id: number;
    numero: string | null;
    venda_id: number;
    status: string;
    valor_total_devolvido: string | null;
    nota_fiscal_devolucao_id: number | null;
    empresa_emitente_id: number | null;
    cliente_id: bigint | number | string | null;
  }

  const [devolucao] = await sql<DevolucaoRow[]>`
    SELECT dv.id, dv.numero, dv.venda_id, dv.status,
           dv.valor_total_devolvido, dv.nota_fiscal_devolucao_id,
           v.empresa_emitente_id, v.cliente_id
    FROM alissonerp.devolucoes_venda dv
    JOIN alissonerp.vendas_erp v ON v.id = dv.venda_id
    WHERE dv.id = ${devolucao_id}
  `;

  if (!devolucao)
    return NextResponse.json(
      { error: "Devolucao nao encontrada" },
      { status: 404 },
    );

  // ── 4. Verificar status ────────────────────────────────────────────────────
  const statusPermitidos = ["aprovada", "pendente_entrega", "concluida"];
  if (!statusPermitidos.includes(devolucao.status)) {
    return NextResponse.json(
      {
        error: `Status '${devolucao.status}' nao permite emissao de NF-e. Status permitidos: ${statusPermitidos.join(", ")}`,
      },
      { status: 422 },
    );
  }

  // ── 5. Verificar se já tem nota ───────────────────────────────────────────
  if (devolucao.nota_fiscal_devolucao_id) {
    return NextResponse.json(
      { error: "Devolucao ja possui NF-e emitida" },
      { status: 409 },
    );
  }

  if (!devolucao.empresa_emitente_id) {
    return NextResponse.json(
      { error: "Venda nao possui emitente vinculado" },
      { status: 422 },
    );
  }

  // ── 6. Buscar emitente ────────────────────────────────────────────────────
  const [emitente] = await sql<EmitenteDados[]>`
    SELECT id, razao_social, cnpj, ie, im, regime_tributario,
           logradouro, numero_end, complemento, bairro, municipio,
           uf, cep, codigo_ibge_municipio,
           focus_token_criptografado, ambiente, serie_nfe, proxima_nfe, ativo
    FROM alissonerp.empresas_emitentes
    WHERE id = ${devolucao.empresa_emitente_id}
  `;

  if (!emitente)
    return NextResponse.json(
      { error: "Emitente nao encontrado" },
      { status: 404 },
    );

  if (!emitente.ativo)
    return NextResponse.json({ error: "Emitente inativo" }, { status: 422 });

  if (!emitente.focus_token_criptografado)
    return NextResponse.json(
      { error: "Emitente sem token Focus NFe configurado" },
      { status: 422 },
    );

  // ── 7. Gerar focus_ref ────────────────────────────────────────────────────
  const focusRef = `nfe-dev-${devolucao_id}-${Date.now()}`;

  // ── 8. Transação: reservar número + inserir nota + itens + vincular devolução
  let notaId: number;
  let numero: number;
  let serie: number;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await sql.begin(async (tx: any) => {
      // a. Incrementar proxima_nfe atomicamente
      const [numRow] = await tx`
        UPDATE alissonerp.empresas_emitentes
        SET proxima_nfe = proxima_nfe + 1
        WHERE id = ${emitente.id}
        RETURNING (proxima_nfe - 1) AS numero, serie_nfe AS serie
      `;

      const numNota = Number(numRow.numero);
      const serieNota = Number(numRow.serie);

      const valorTotal = parseFloat(devolucao.valor_total_devolvido ?? "0");

      // b. Inserir nota fiscal
      const [nota] = await tx`
        INSERT INTO alissonerp.notas_fiscais (
          modelo, serie, numero, empresa_emitente_id, tipo_operacao,
          origem_tabela, origem_id, cliente_contato_id,
          natureza_operacao, cfop,
          valor_produtos, valor_desconto, valor_frete, valor_total,
          status, focus_ref, emitida_por_user_id, ambiente
        ) VALUES (
          55,
          ${serieNota},
          ${numNota},
          ${emitente.id},
          'devolucao',
          'devolucoes_venda',
          ${devolucao_id},
          ${devolucao.cliente_id != null ? BigInt(devolucao.cliente_id as string | number) : null},
          'Devolução de venda',
          '1202',
          ${valorTotal},
          0,
          0,
          ${valorTotal},
          'processando',
          ${focusRef},
          ${user.id}::uuid,
          ${emitente.ambiente}
        )
        RETURNING id
      `;

      const notaFiscalId = nota.id as number;

      // c. Inserir itens snapshot
      const itens = await tx`
        SELECT
          di.id, di.produto_id, di.quantidade, di.valor_unitario, di.valor_total,
          COALESCE(ive.nome_produto, '') AS nome_produto,
          ive.sku
        FROM alissonerp.devolucoes_itens di
        LEFT JOIN alissonerp.itens_venda_erp ive ON ive.id = di.item_venda_id
        WHERE di.devolucao_id = ${devolucao_id}
        ORDER BY di.id
      `;

      for (let i = 0; i < itens.length; i++) {
        const item = itens[i];
        const prodIdStr = String(BigInt(item.produto_id as string | number));

        const [pf] = await tx`
          SELECT ncm, cfop_saida, origem, unidade_comercial
          FROM alissonerp.produtos_fiscais
          WHERE id_produto = ${prodIdStr}::bigint
        `;

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
            ${item.nome_produto ?? `Produto ${prodIdStr}`},
            ${(pf?.ncm as string | null) ?? null},
            ${"1202"},
            ${(pf?.unidade_comercial as string | null) ?? "UN"},
            ${item.quantidade},
            ${item.valor_unitario},
            ${parseFloat((item.quantidade * item.valor_unitario).toFixed(2))},
            0,
            ${item.valor_total},
            '400',
            ${(pf?.origem as string | null) ?? "0"}
          )
        `;
      }

      // d. Vincular nota à devolução
      await tx`
        UPDATE alissonerp.devolucoes_venda
        SET nota_fiscal_devolucao_id = ${notaFiscalId}
        WHERE id = ${devolucao_id}
      `;

      return { notaFiscalId, numNota, serieNota };
    });

    notaId = result.notaFiscalId;
    numero = result.numNota;
    serie = result.serieNota;
  } catch (err) {
    console.error("[emitir/nfe-devolucao] Erro na transacao:", err);
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
  let numeroNota: number | null = null;

  try {
    const payload = await buildNfeDevolucaoPayload({
      devolucaoId: devolucao_id,
      emitente,
      serie,
      numero,
    });

    const focusResp = await focusRequest<FocusNfeResponse>(
      "POST",
      `/v2/nfe?ref=${encodeURIComponent(focusRef)}`,
      emitente.focus_token_criptografado,
      payload,
    );

    const fd = focusResp.data;

    if (focusResp.status === 200 && fd.status === "autorizado") {
      focusStatus = "autorizada";
      chave44 = fd.chave_nfe ?? null;
      pdfDanfeUrl = fd.caminho_danfe ?? null;
      numeroNota = fd.numero != null ? Number(fd.numero) : numero;
    } else if (focusResp.status === 202) {
      focusStatus = "processando";
    } else {
      focusStatus = "rejeitada";
      mensagemSefaz =
        fd.mensagem_sefaz ??
        (fd.erros ? fd.erros.map((e) => e.mensagem).join("; ") : null);
      codigoSefaz = fd.codigo ?? null;
    }
  } catch (err) {
    console.error("[emitir/nfe-devolucao] Erro ao chamar Focus NFe:", err);
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
        UPDATE alissonerp.devolucoes_venda
        SET nfe_numero = ${numeroNota ?? numero},
            nfe_chave_44 = ${chave44},
            nfe_emitida_em = now()
        WHERE id = ${devolucao_id}
      `;
    }
  } catch (err) {
    console.error("[emitir/nfe-devolucao] Erro ao atualizar status da nota:", err);
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
