import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { internalError } from "@/lib/api-error";
import { zodError, IdSchema } from "@/lib/schemas/common";

const MAX_LEGACY_DATE = "2023-12-31";
const ROLES_PERMITIDOS = ["desenvolvedor", "admin"];

const LegacyItemSchema = z.object({
  produto_id: IdSchema.nullable().optional(),
  nome_produto: z.string().min(1).max(200),
  sku: z.string().max(100).nullable().optional(),
  quantidade: z.number().int().min(1).optional(),
  peso_estimado: z.number().positive("peso medio e obrigatorio"),
  observacao: z.string().max(5000).nullable().optional(),
});

const NovoClienteSchema = z.object({
  nome: z.string().min(1, "Nome do cliente e obrigatorio").max(200),
  telefone: z.string().min(1, "Telefone do cliente e obrigatorio").max(50),
  cpf_cnpj: z.string().max(50).optional(),
  email: z.string().max(200).optional(),
  celular: z.string().max(50).optional(),
  endereco: z.string().max(500).optional(),
  numero: z.string().max(50).optional(),
  complemento: z.string().max(200).optional(),
  bairro: z.string().max(200).optional(),
  municipio: z.string().max(200).optional(),
  cep: z.string().max(20).optional(),
  uf: z.string().max(5).optional(),
});

const VendaLegadoSchema = z.object({
  cliente_id: IdSchema.optional(),
  novo_cliente: NovoClienteSchema.optional(),
  data_venda: z.string().max(50).optional(),
  observacoes: z.string().max(5000).optional(),
  vendedor_id: IdSchema.nullable().optional(),
  itens: z.array(LegacyItemSchema).min(1, "Informe ao menos uma peca").max(100).optional(),
}).refine((d) => d.cliente_id != null || d.novo_cliente != null, {
  message: "Informe um cliente existente ou os dados do novo cliente",
});

// ─── POST /api/vendas/legado ─────────────────────────────────────────────────
// Cria venda antiga (legacy) — registro historico para garantia vitalicia.
// Nao gera financeiro, nao afeta estoque, nao sincroniza com Tiny.
//
// Body: {
//   cliente_id?: number,
//   novo_cliente?: { nome: string, telefone: string },
//   data_venda?: string,           // opcional, default 2023-01-01, max 2023-12-31
//   observacoes?: string,          // default "Registro manual de venda antiga"
//   itens: [{
//     produto_id?: number | null,
//     nome_produto: string,
//     sku?: string | null,
//     quantidade: number,          // default 1
//     peso_estimado: number,       // obrigatorio
//     observacao?: string | null,
//   }]
// }
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  const [usuario] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario) {
    return NextResponse.json({ error: "Usuario nao encontrado" }, { status: 403 });
  }
  if (!ROLES_PERMITIDOS.includes(usuario.role)) {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = VendaLegadoSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data as unknown as {
    cliente_id?: number;
    novo_cliente?: z.infer<typeof NovoClienteSchema>;
    data_venda?: string;
    observacoes?: string;
    vendedor_id?: number | null;
    itens?: LegacyItemInput[];
  };

  // ── Validacao de data ────────────────────────────────────────────────────
  const dataVenda = body.data_venda || "2023-01-01";
  if (dataVenda > MAX_LEGACY_DATE) {
    return NextResponse.json(
      { error: `Data maxima permitida: ${MAX_LEGACY_DATE.split("-").reverse().join("/")}` },
      { status: 400 },
    );
  }

  // Itens obrigatorios — refine acima nao cobre lista vazia se itens=undefined.
  if (!Array.isArray(body.itens) || body.itens.length === 0) {
    return NextResponse.json(
      { error: "Informe ao menos uma peca" },
      { status: 400 },
    );
  }

  try {
    const resultado = await sql.begin(async (tx: any) => {
      // 1. Criar novo cliente se necessario
      let clienteId: number;

      if (body.novo_cliente) {
        const c = body.novo_cliente;
        const [novo] = await tx`
          INSERT INTO public.contatos (
            nome, cpf_cnpj, telefone, celular, email,
            endereco, numero, complemento, bairro, municipio, cep, uf
          ) VALUES (
            ${c.nome.trim()},
            ${c.cpf_cnpj ? c.cpf_cnpj.replace(/\D/g, "") : null},
            ${c.telefone.trim()},
            ${c.celular?.trim() || null},
            ${c.email?.trim() || null},
            ${c.endereco?.trim() || null},
            ${c.numero?.trim() || null},
            ${c.complemento?.trim() || null},
            ${c.bairro?.trim() || null},
            ${c.municipio?.trim() || null},
            ${c.cep ? c.cep.replace(/\D/g, "") : null},
            ${c.uf?.trim().toUpperCase() || null}
          )
          RETURNING id_contato
        `;
        clienteId = Number(novo.id_contato);
      } else {
        clienteId = Number(body.cliente_id);
      }

      // 2. Inserir venda como rascunho primeiro (triggers bloqueiam itens em concluido)
      const observacoes = body.observacoes?.trim() || "Registro manual de venda antiga";

      const [venda] = await tx`
        INSERT INTO alissonerp.vendas_erp (
          numero_venda,
          cliente_id, vendedor_id,
          data_venda,
          observacoes,
          situacao,
          is_legacy,
          total_produtos, total_desconto, total_frete, total_venda, total_comissao,
          created_by
        ) VALUES (
          'LEG-TEMP',
          ${clienteId},
          ${body.vendedor_id ?? null},
          ${dataVenda}::date,
          ${observacoes},
          'rascunho',
          true,
          0, 0, 0, 0, 0,
          ${user.id}::uuid
        )
        RETURNING id
      `;

      // 3. Gerar numero legado: LEG-YYYY-NNNN
      const year = new Date(dataVenda + "T12:00:00").getFullYear();
      const [{ proximo }] = await tx`
        SELECT COALESCE(
          MAX(NULLIF(REGEXP_REPLACE(numero_venda, '^LEG-\\d{4}-', ''), '')::integer) + 1,
          1
        ) AS proximo
        FROM alissonerp.vendas_erp
        WHERE is_legacy = true
          AND numero_venda LIKE ${'LEG-' + year + '-%'}
      `;
      const numeroLegacy = `LEG-${year}-${String(Number(proximo)).padStart(4, "0")}`;

      await tx`
        UPDATE alissonerp.vendas_erp
        SET numero_venda = ${numeroLegacy}
        WHERE id = ${venda.id}
      `;

      // 4. Inserir itens (valores financeiros zerados)
      for (const item of body.itens!) {
        await tx`
          INSERT INTO alissonerp.itens_venda_erp (
            venda_id, produto_id, nome_produto, sku,
            quantidade, preco_lista, pct_desconto, preco_unitario, total_item,
            pct_comissao, valor_comissao, peso_estimado, observacao
          ) VALUES (
            ${venda.id},
            ${item.produto_id ?? null},
            ${item.nome_produto.trim()},
            ${item.sku ?? null},
            ${item.quantidade ?? 1},
            0, 0, 0, 0,
            0, 0,
            ${Number(item.peso_estimado)},
            ${item.observacao ?? null}
          )
        `;
      }

      // 5. Concluir venda (apos itens inseridos para bypassar trigger de bloqueio)
      await tx`
        UPDATE alissonerp.vendas_erp SET situacao = 'concluido' WHERE id = ${venda.id}
      `;

      // 5. Audit log
      await logAudit(tx, {
        tabela: "vendas_erp",
        operacao: "INSERT",
        registro_id: venda.id,
        usuario_id: user.id,
        dados_depois: {
          numero_venda: numeroLegacy,
          is_legacy: true,
          data_venda: dataVenda,
          cliente_id: clienteId,
        },
      });

      return { id: venda.id, numero_venda: numeroLegacy };
    });

    return NextResponse.json(resultado, { status: 201 });
  } catch (err: unknown) {
    return internalError("[POST /api/vendas/legado]", err, "Erro ao cadastrar venda antiga", 400);
  }
}

// ─── Types ─────────────────────────────────────────────────────────────────
interface LegacyItemInput {
  produto_id?: number | null;
  nome_produto: string;
  sku?: string | null;
  quantidade?: number;
  peso_estimado: number;
  observacao?: string | null;
}
