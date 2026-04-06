import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

const ROLES_PERMITIDOS = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja"];

// ─── POST /api/vendas/[id]/enviar-tiny ────────────────────────────────────────
// Envia venda como pedido para o Tiny ERP
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  if (!usuario || !ROLES_PERMITIDOS.includes(usuario.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const vendaId = Number(id);
  if (isNaN(vendaId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  // Buscar venda
  const [venda] = await sql`
    SELECT
      id, numero_venda, cliente_nome, cliente_cpf_cnpj, cliente_email, cliente_telefone,
      data_venda, total_produtos, total_desconto, total_frete, total_venda,
      situacao, tiny_sync_status, tiny_pedido_id, forma_envio
    FROM alissonerp.vendas_erp
    WHERE id = ${vendaId}
  `;
  if (!venda) return NextResponse.json({ error: "Venda não encontrada" }, { status: 404 });

  if (venda.situacao === "cancelado") {
    return NextResponse.json({ error: "Não é possível enviar venda cancelada" }, { status: 400 });
  }

  // Guard idempotência: não re-enviar se já sincronizado
  if (venda.tiny_sync_status === "sincronizado" && venda.tiny_pedido_id) {
    return NextResponse.json(
      { error: "Venda já enviada ao Tiny (pedido #" + venda.tiny_pedido_id + "). Use 'force=true' para reenviar." },
      { status: 409 }
    );
  }

  // Buscar token Tiny
  const [tokenRow] = await sql`
    SELECT valor FROM alissonerp.configuracoes_secrets WHERE chave = 'tiny_api_token'
  `;
  if (!tokenRow?.valor) {
    return NextResponse.json({ error: "Token do Tiny não configurado. Vá em Configurações > Integrações." }, { status: 400 });
  }
  // O valor é armazenado como JSON string (ex: "\"abc123\"")
  let tinyToken: string;
  try {
    tinyToken = JSON.parse(tokenRow.valor);
  } catch {
    tinyToken = tokenRow.valor;
  }

  if (!tinyToken || tinyToken.trim() === "") {
    return NextResponse.json({ error: "Token do Tiny inválido" }, { status: 400 });
  }

  // Buscar itens
  const itens = await sql`
    SELECT nome_produto, sku, quantidade, preco_unitario
    FROM alissonerp.itens_venda_erp
    WHERE venda_id = ${vendaId}
    ORDER BY id
  `;

  // Montar payload Tiny
  const dataFormatada = venda.data_venda
    ? new Date(venda.data_venda).toLocaleDateString("pt-BR", { timeZone: "UTC" })
    : new Date().toLocaleDateString("pt-BR");

  const pedidoTiny = {
    pedido: {
      numero: venda.numero_venda,
      data_pedido: dataFormatada,
      cliente: {
        nome: venda.cliente_nome || "Cliente não informado",
        cpf_cnpj: venda.cliente_cpf_cnpj || "",
        email: venda.cliente_email || "",
        fone: venda.cliente_telefone || "",
      },
      itens: itens.map((item) => ({
        item: {
          codigo: item.sku || "",
          descricao: item.nome_produto,
          unidade: "UN",
          quantidade: Number(item.quantidade),
          valor_unitario: Number(item.preco_unitario),
        },
      })),
      ...(Number(venda.total_frete) > 0
        ? { valor_frete: Number(venda.total_frete) }
        : {}),
      ...(Number(venda.total_desconto) > 0
        ? { valor_desconto: Number(venda.total_desconto) }
        : {}),
    },
  };

  try {
    const formData = new URLSearchParams();
    formData.append("token", tinyToken);
    formData.append("formato", "json");
    formData.append("pedido", JSON.stringify(pedidoTiny));

    const res = await fetch("https://api.tiny.com.br/api2/pedido.incluir.php", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
      signal: AbortSignal.timeout(15000),
    });

    const data = await res.json() as {
      retorno?: {
        status?: string;
        registros?: {
          registro?: {
            id?: number;
            numero?: string;
          };
        };
        erros?: Array<{ erro: string }> | { erro: string };
        status_processamento?: string;
      };
    };

    const retorno = data.retorno;

    if (retorno?.status === "OK" || retorno?.status_processamento === "3") {
      const tinyId = retorno?.registros?.registro?.id;
      await sql`
        UPDATE alissonerp.vendas_erp SET
          tiny_pedido_id    = ${tinyId ?? null},
          tiny_sync_status  = 'sincronizado',
          tiny_sync_at      = NOW(),
          tiny_sync_erro    = NULL
        WHERE id = ${vendaId}
      `;
      return NextResponse.json({
        ok: true,
        tiny_pedido_id: tinyId,
        message: "Pedido enviado ao Tiny com sucesso",
      });
    }

    // Erro do Tiny
    let erroMsg = "Erro desconhecido do Tiny";
    if (retorno?.erros) {
      if (Array.isArray(retorno.erros)) {
        erroMsg = retorno.erros.map((e) => e.erro).join("; ");
      } else {
        erroMsg = (retorno.erros as { erro: string }).erro;
      }
    }

    await sql`
      UPDATE alissonerp.vendas_erp SET
        tiny_sync_status = 'erro',
        tiny_sync_at     = NOW(),
        tiny_sync_erro   = ${erroMsg}
      WHERE id = ${vendaId}
    `;

    return NextResponse.json({ error: erroMsg }, { status: 502 });
  } catch (e) {
    const erroMsg = e instanceof Error ? e.message : "Falha na comunicação com o Tiny";
    await sql`
      UPDATE alissonerp.vendas_erp SET
        tiny_sync_status = 'erro',
        tiny_sync_at     = NOW(),
        tiny_sync_erro   = ${erroMsg}
      WHERE id = ${vendaId}
    `;
    return NextResponse.json({ error: erroMsg }, { status: 500 });
  }
}
