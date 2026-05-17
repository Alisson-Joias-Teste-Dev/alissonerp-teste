import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { internalError } from "@/lib/api-error";

const MAX_LEGACY_DATE = "2023-12-31";
const ROLES_PERMITIDOS = ["desenvolvedor", "admin"];

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

  const body = await req.json() as {
    cliente_id?: number;
    novo_cliente?: {
      nome: string;
      telefone: string;
      cpf_cnpj?: string;
      email?: string;
      celular?: string;
      endereco?: string;
      numero?: string;
      complemento?: string;
      bairro?: string;
      municipio?: string;
      cep?: string;
      uf?: string;
    };
    data_venda?: string;
    observacoes?: string;
    vendedor_id?: number | null;
    itens?: LegacyItemInput[];
  };

  // ── Validacao de cliente ─────────────────────────────────────────────────
  if (!body.cliente_id && !body.novo_cliente) {
    return NextResponse.json(
      { error: "Informe um cliente existente ou os dados do novo cliente" },
      { status: 400 },
    );
  }

  if (body.novo_cliente) {
    if (!body.novo_cliente.nome?.trim()) {
      return NextResponse.json({ error: "Nome do cliente e obrigatorio" }, { status: 400 });
    }
    if (!body.novo_cliente.telefone?.trim()) {
      return NextResponse.json({ error: "Telefone do cliente e obrigatorio" }, { status: 400 });
    }
  }

  // ── Validacao de data ────────────────────────────────────────────────────
  const dataVenda = body.data_venda || "2023-01-01";
  if (dataVenda > MAX_LEGACY_DATE) {
    return NextResponse.json(
      { error: `Data maxima permitida: ${MAX_LEGACY_DATE.split("-").reverse().join("/")}` },
      { status: 400 },
    );
  }

  // ── Validacao de itens ───────────────────────────────────────────────────
  if (!Array.isArray(body.itens) || body.itens.length === 0) {
    return NextResponse.json(
      { error: "Informe ao menos uma peca" },
      { status: 400 },
    );
  }

  for (let i = 0; i < body.itens.length; i++) {
    const item = body.itens[i];
    if (!item.nome_produto?.trim()) {
      return NextResponse.json(
        { error: `Item ${i + 1}: nome da peca e obrigatorio` },
        { status: 400 },
      );
    }
    if (item.peso_estimado == null || Number(item.peso_estimado) <= 0) {
      return NextResponse.json(
        { error: `Item ${i + 1}: peso medio e obrigatorio` },
        { status: 400 },
      );
    }
    if (item.quantidade != null && item.quantidade < 1) {
      return NextResponse.json(
        { error: `Item ${i + 1}: quantidade deve ser >= 1` },
        { status: 400 },
      );
    }
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
