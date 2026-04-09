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

// PUT /api/orcamento/[id] — atualizar orçamento existente
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const orcId = parseInt(id);
  if (isNaN(orcId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = await req.json();
  const {
    nome_cliente, nome_modelo, peso, valor, markup, desconto_pct,
    cotacao_ouro, tipo, ficha, ficha2, quantidade, cliente_id, foto_3d_base64,
  } = body;

  // Upload foto 3D se enviada
  let foto3dUrl: string | undefined;
  if (foto_3d_base64 && typeof foto_3d_base64 === "string" && foto_3d_base64.startsWith("data:")) {
    const { uploadFile } = await import("@/lib/storage");
    const path = `orcamento/ORC-${orcId}/3d-${Date.now()}.jpg`;
    const result = await uploadFile("ordem-fotos", path, foto_3d_base64, "image/jpeg");
    if (!("error" in result)) foto3dUrl = result.url;
  }

  // Atualizar ficha técnica 1
  let fichaId: number | undefined;
  if (ficha && typeof ficha === "object") {
    const [existing] = await sql`SELECT ficha_tecnica_id FROM alissonerp.orcamentos WHERE id = ${orcId}`;
    if (existing?.ficha_tecnica_id) {
      await sql`
        UPDATE alissonerp.orcamento_fichas_tecnicas SET
          modelo = ${ficha.modelo ?? null}, aro_numeracao = ${ficha.aro_numeracao ?? null},
          largura = ${ficha.largura ?? null}, espessura = ${ficha.espessura ?? null},
          peso_estimado = ${ficha.peso_estimado ?? null}, perfil = ${ficha.perfil ?? null},
          diametro = ${ficha.diametro ?? null}, densidade_ouro = ${ficha.densidade_ouro ?? null},
          cor_metal = ${ficha.cor_metal ?? null}, tipo_fonte = ${ficha.tipo_fonte ?? null},
          texto = ${ficha.texto ?? null}, qtd_pedras = ${ficha.qtd_pedras ?? null},
          tamanho_pedra = ${ficha.tamanho_pedra ?? null}, tipo_aplicacao_pedra = ${ficha.tipo_aplicacao_pedra ?? null},
          profundidade_concava = ${ficha.profundidade_concava ?? null},
          dome_porcentagem = ${ficha.dome_porcentagem ?? null},
          pedra_drill = ${ficha.pedra_drill ?? false}, pedra_meia_lua = ${ficha.pedra_meia_lua ?? false},
          pedra_volta_completa = ${ficha.pedra_volta_completa ?? false}
        WHERE id = ${existing.ficha_tecnica_id}
      `;
      fichaId = existing.ficha_tecnica_id;
    }
  }

  // Atualizar ficha técnica 2 (par)
  let ficha2Id: number | undefined;
  if (ficha2 && typeof ficha2 === "object" && quantidade === 2) {
    const [existing] = await sql`SELECT ficha_tecnica_2_id FROM alissonerp.orcamentos WHERE id = ${orcId}`;
    if (existing?.ficha_tecnica_2_id) {
      await sql`
        UPDATE alissonerp.orcamento_fichas_tecnicas SET
          modelo = ${ficha2.modelo ?? null}, aro_numeracao = ${ficha2.aro_numeracao ?? null},
          largura = ${ficha2.largura ?? null}, espessura = ${ficha2.espessura ?? null},
          peso_estimado = ${ficha2.peso_estimado ?? null}, perfil = ${ficha2.perfil ?? null},
          diametro = ${ficha2.diametro ?? null}, densidade_ouro = ${ficha2.densidade_ouro ?? null},
          cor_metal = ${ficha2.cor_metal ?? null}, tipo_fonte = ${ficha2.tipo_fonte ?? null},
          texto = ${ficha2.texto ?? null}, qtd_pedras = ${ficha2.qtd_pedras ?? null},
          tamanho_pedra = ${ficha2.tamanho_pedra ?? null}, tipo_aplicacao_pedra = ${ficha2.tipo_aplicacao_pedra ?? null},
          dome_porcentagem = ${ficha2.dome_porcentagem ?? null},
          pedra_drill = ${ficha2.pedra_drill ?? false}, pedra_meia_lua = ${ficha2.pedra_meia_lua ?? false},
          pedra_volta_completa = ${ficha2.pedra_volta_completa ?? false}
        WHERE id = ${existing.ficha_tecnica_2_id}
      `;
      ficha2Id = existing.ficha_tecnica_2_id;
    } else {
      // Criar ficha 2 se não existe
      const [newFicha] = await sql`
        INSERT INTO alissonerp.orcamento_fichas_tecnicas (
          modelo, aro_numeracao, largura, espessura, peso_estimado, perfil, diametro,
          densidade_ouro, cor_metal, tipo_fonte, texto, qtd_pedras, tamanho_pedra,
          tipo_aplicacao_pedra, dome_porcentagem, pedra_drill, pedra_meia_lua, pedra_volta_completa,
          pedras_detalhadas
        ) VALUES (
          ${ficha2.modelo ?? null}, ${ficha2.aro_numeracao ?? null}, ${ficha2.largura ?? null},
          ${ficha2.espessura ?? null}, ${ficha2.peso_estimado ?? null}, ${ficha2.perfil ?? null},
          ${ficha2.diametro ?? null}, ${ficha2.densidade_ouro ?? null}, ${ficha2.cor_metal ?? null},
          ${ficha2.tipo_fonte ?? null}, ${ficha2.texto ?? null}, ${ficha2.qtd_pedras ?? null},
          ${ficha2.tamanho_pedra ?? null}, ${ficha2.tipo_aplicacao_pedra ?? null},
          ${ficha2.dome_porcentagem ?? null}, ${ficha2.pedra_drill ?? false},
          ${ficha2.pedra_meia_lua ?? false}, ${ficha2.pedra_volta_completa ?? false},
          '[]'::jsonb
        ) RETURNING id
      `;
      ficha2Id = newFicha.id as number;
    }
  }

  // Atualizar orçamento
  await sql`
    UPDATE alissonerp.orcamentos SET
      nome_cliente = COALESCE(${nome_cliente ?? null}, nome_cliente),
      nome_modelo = COALESCE(${nome_modelo ?? null}, nome_modelo),
      peso = COALESCE(${peso ?? null}, peso),
      valor = COALESCE(${valor ?? null}, valor),
      markup = COALESCE(${markup ?? null}, markup),
      desconto_pct = COALESCE(${desconto_pct ?? null}, desconto_pct),
      cotacao_ouro = COALESCE(${cotacao_ouro ?? null}, cotacao_ouro),
      tipo = COALESCE(${tipo ?? null}, tipo),
      quantidade = COALESCE(${quantidade ?? null}, quantidade),
      cliente_id = COALESCE(${cliente_id ?? null}, cliente_id),
      foto_3d = COALESCE(${foto3dUrl ?? null}, foto_3d),
      ficha_tecnica_2_id = COALESCE(${ficha2Id ?? null}, ficha_tecnica_2_id),
      updated_at = NOW()
    WHERE id = ${orcId}
  `;

  return NextResponse.json({ ok: true });
}
