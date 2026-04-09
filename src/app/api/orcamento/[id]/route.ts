import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";

const ROLES_ORCAMENTO = ["desenvolvedor", "admin", "gerente_loja", "gerente_fabrica", "consultora"] as const;

// GET /api/orcamento/[id] — detalhe do orçamento
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const orcId = parseInt(id);
  if (isNaN(orcId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [orc] = await sql`
    SELECT o.*, ft.*,
           c.nome AS cliente_nome_contato, c.cpf_cnpj, c.telefone AS cliente_telefone
    FROM alissonerp.orcamentos o
    LEFT JOIN alissonerp.orcamento_fichas_tecnicas ft ON ft.id = o.ficha_tecnica_id
    LEFT JOIN public.contatos c ON c.id_contato = o.cliente_id
    WHERE o.id = ${orcId}
  `;
  if (!orc) return NextResponse.json({ error: "Orçamento não encontrado" }, { status: 404 });

  return NextResponse.json({ orcamento: orc });
}

// PATCH /api/orcamento/[id] — atualizar status (aprovar/rejeitar/enviar)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const orcId = parseInt(id);
  if (isNaN(orcId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [caller] = await sql`
    SELECT u.role, v.id_vendedor
    FROM alissonerp.usuarios u
    LEFT JOIN public.vendedores v ON v.email = u.email
    WHERE u.id = ${user.id}::uuid
  `;
  if (!caller) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 403 });
  const role = caller.role as string;
  const hasAccess = isFullAccess(role) || ROLES_ORCAMENTO.includes(role as typeof ROLES_ORCAMENTO[number]);
  if (!hasAccess) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const body = await req.json() as {
    status: "enviado" | "aprovado" | "rejeitado";
    motivo_rejeicao?: string;
    cliente_id?: number;
  };

  // Buscar orçamento atual
  const [orc] = await sql`
    SELECT o.*, ft.modelo, ft.aro_numeracao, ft.largura, ft.espessura, ft.peso_estimado,
           ft.perfil, ft.diametro, ft.densidade_ouro, ft.cor_metal,
           ft.tipo_fonte, ft.texto, ft.qtd_pedras, ft.tamanho_pedra,
           ft.tipo_aplicacao_pedra, ft.profundidade_concava, ft.friso_lado,
           ft.friso_largura, ft.friso_profundidade, ft.friso_offset,
           ft.canal_largura, ft.canal_borda_altura, ft.chanfro_tamanho,
           ft.dome_porcentagem, ft.pedra_fileiras, ft.pedra_drill,
           ft.pedra_meia_lua, ft.pedra_volta_completa, ft.pedras_detalhadas
    FROM alissonerp.orcamentos o
    LEFT JOIN alissonerp.orcamento_fichas_tecnicas ft ON ft.id = o.ficha_tecnica_id
    WHERE o.id = ${orcId}
  `;
  if (!orc) return NextResponse.json({ error: "Orçamento não encontrado" }, { status: 404 });

  // Atualizar cliente_id se fornecido
  if (body.cliente_id) {
    await sql`UPDATE alissonerp.orcamentos SET cliente_id = ${body.cliente_id} WHERE id = ${orcId}`;
    orc.cliente_id = body.cliente_id;
  }

  // ── ENVIAR ────────────────────────────────────────────────────────────────
  if (body.status === "enviado") {
    await sql`UPDATE alissonerp.orcamentos SET status = 'enviado', updated_at = NOW() WHERE id = ${orcId}`;
    return NextResponse.json({ ok: true, status: "enviado" });
  }

  // ── REJEITAR ──────────────────────────────────────────────────────────────
  if (body.status === "rejeitado") {
    await sql`
      UPDATE alissonerp.orcamentos
      SET status = 'rejeitado', observacoes = COALESCE(${body.motivo_rejeicao ?? null}, observacoes), updated_at = NOW()
      WHERE id = ${orcId}
    `;
    return NextResponse.json({ ok: true, status: "rejeitado" });
  }

  // ── APROVAR → CRIAR VENDA PRÉ-PREENCHIDA ──────────────────────────────────
  if (body.status === "aprovado") {
    const clienteId = orc.cliente_id as number | null;
    if (!clienteId) {
      return NextResponse.json({ error: "Vincule um cliente antes de aprovar" }, { status: 422 });
    }

    const perfilNomes: Record<string, string> = {
      Anatomica: "Anatômica", Boleada: "Boleada", BoleadaDouble: "Boleada Dupla",
      Chanfrada: "Chanfrada", Concava: "Côncava", FrisoUnico: "Friso Único",
      FrisoLateral: "Friso Lateral", QuadradoCanal: "Quadrado Canal", Simples: "Reta",
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resultado = await (sql as any).begin(async (tx: typeof sql) => {
      // 1. Data entrega: +10 dias úteis
      const dataEntrega = new Date();
      let diasUteis = 0;
      while (diasUteis < 10) {
        dataEntrega.setDate(dataEntrega.getDate() + 1);
        const dow = dataEntrega.getDay();
        if (dow !== 0 && dow !== 6) diasUteis++;
      }

      // 2. Criar venda (rascunho) pré-preenchida
      const vendedorId = orc.vendedor_id ?? (caller.id_vendedor ? Number(caller.id_vendedor) : null);
      const [venda] = await tx`
        INSERT INTO alissonerp.vendas_erp (
          numero_venda, cliente_id, vendedor_id, data_venda, data_entrega,
          situacao, observacoes, orcamento_id, created_by
        ) VALUES (
          'V-TEMP', ${clienteId}, ${vendedorId},
          CURRENT_DATE, ${dataEntrega.toISOString().split("T")[0]},
          'rascunho',
          ${'Orçamento ' + orc.numero_orcamento + (orc.nome_modelo ? ' - ' + orc.nome_modelo : '')},
          ${orcId}, ${user.id}::uuid
        )
        RETURNING id
      `;
      // Gerar numero_venda seguindo a sequência do public.vendas
      const [{ proximo }] = await tx`
        SELECT COALESCE(
          GREATEST(
            (SELECT MAX(numero_pedido) + 1 FROM public.vendas),
            (SELECT MAX(numero_venda::bigint) + 1 FROM alissonerp.vendas_erp WHERE numero_venda ~ '^[0-9]+$')
          ),
          1
        ) AS proximo
      `;
      await tx`
        UPDATE alissonerp.vendas_erp
        SET numero_venda = ${String(proximo)}
        WHERE id = ${venda.id}
      `;
      const [vendaFinal] = await tx`SELECT numero_venda FROM alissonerp.vendas_erp WHERE id = ${venda.id}`;

      // 3. Criar item da venda
      const nomeItem = orc.tipo === "alianca"
        ? `Aliança ${perfilNomes[orc.perfil as string] ?? orc.modelo ?? "Personalizada"}`
        : `Peça Personalizada`;
      // Buscar valor e peso diretamente do orçamento (evitar conflito de colunas com ft.*)
      const [orcValores] = await tx`SELECT valor, peso FROM alissonerp.orcamentos WHERE id = ${orcId}`;
      const valorItem = Number(orcValores?.valor ?? 0);
      const pesoItem = Number(orcValores?.peso ?? orc.peso_estimado ?? 0);
      await tx`
        INSERT INTO alissonerp.itens_venda_erp (
          venda_id, nome_produto, quantidade, preco_lista,
          pct_desconto, preco_unitario, total_item, peso_estimado, observacao
        ) VALUES (
          ${venda.id}, ${nomeItem}, 1, ${valorItem},
          0, ${valorItem}, ${valorItem}, ${pesoItem},
          ${'Orçamento ' + orc.numero_orcamento}
        )
      `;

      // 4. Marcar orçamento como convertido com venda vinculada
      await tx`
        UPDATE alissonerp.orcamentos
        SET status = 'convertido', venda_gerada_id = ${venda.id}, updated_at = NOW()
        WHERE id = ${orcId}
      `;

      return { venda_id: venda.id, numero_venda: vendaFinal.numero_venda as string };
    });

    // Venda criada como rascunho — usuário preenche pagamento/frete e aprova manualmente

    return NextResponse.json({
      ok: true,
      status: "convertido",
      venda_id: resultado.venda_id,
      numero_venda: resultado.numero_venda,
    });
  }

  return NextResponse.json({ error: "Status inválido" }, { status: 400 });
}
