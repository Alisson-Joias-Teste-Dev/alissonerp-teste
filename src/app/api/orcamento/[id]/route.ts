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

  // ── APROVAR → CRIAR ORDEM DE FABRICAÇÃO ───────────────────────────────────
  if (body.status === "aprovado") {
    const clienteId = orc.cliente_id as number | null;
    if (!clienteId) {
      return NextResponse.json({ error: "Vincule um cliente antes de aprovar" }, { status: 422 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resultado = await (sql as any).begin(async (tx: typeof sql) => {
      // 1. Gerar número da ordem
      const [{ max_id_ali }] = await tx`SELECT COALESCE(MAX(id), 0) AS max_id_ali FROM alissonerp.ordens`;
      const [{ max_id_dir }] = await tx`SELECT COALESCE(MAX(id), 0) AS max_id_dir FROM directus.ordens`;
      const nextNum = Math.max(Number(max_id_ali), Number(max_id_dir)) + 1;
      const numeroOrdem = "C-" + String(nextNum).padStart(4, "0");

      // 2. Data entrega: +10 dias úteis
      const dataEntrega = new Date();
      let diasUteis = 0;
      while (diasUteis < 10) {
        dataEntrega.setDate(dataEntrega.getDate() + 1);
        const dow = dataEntrega.getDay();
        if (dow !== 0 && dow !== 6) diasUteis++;
      }

      // 3. Criar ordem
      const pesoNeg = Number(orc.peso ?? orc.peso_estimado ?? 0);
      const [ordem] = await tx`
        INSERT INTO alissonerp.ordens (
          numero_ordem, tipo_ordem, situacao, status, rota,
          cliente_id, vendedor_id, peso_metal_negociado,
          data_entrega, detalhes_ordem, foto_peca_servico, created_at
        ) VALUES (
          ${numeroOrdem},
          'fabricacao'::alissonerp.enum_tipo_ordem,
          'criado', 'aguardando', 'pcp',
          ${clienteId}, ${orc.vendedor_id ?? (caller.id_vendedor ? Number(caller.id_vendedor) : null)},
          ${pesoNeg},
          ${dataEntrega.toISOString().split("T")[0]},
          ${'Orçamento ' + orc.numero_orcamento + (orc.nome_modelo ? ' - ' + orc.nome_modelo : '')},
          ${orc.foto_3d ?? null},
          NOW()
        )
        RETURNING id, numero_ordem
      `;

      // Mapa perfil enum → nome formatado
      const perfilNomes: Record<string, string> = {
        Anatomica: "Anatômica", Boleada: "Boleada", BoleadaDouble: "Boleada Dupla",
        Chanfrada: "Chanfrada", Concava: "Côncava", FrisoUnico: "Friso Único",
        FrisoLateral: "Friso Lateral", QuadradoCanal: "Quadrado Canal", Simples: "Reta",
      };

      // 4. Criar item da ordem (produto genérico "Personalizado")
      const nomeItem = orc.tipo === "alianca"
        ? `Aliança ${perfilNomes[orc.perfil as string] ?? orc.modelo ?? "Personalizada"}`
        : `Peça Personalizada`;
      await tx`
        INSERT INTO alissonerp.itens_ordem (ordem_id, nome_produto, quantidade, peso_estimado)
        VALUES (${ordem.id}, ${nomeItem}, 1, ${pesoNeg})
      `;

      // 5. Criar ficha técnica vinculada à ordem
      const tipoItem = orc.tipo === "alianca" ? "alianca" : "peca_personalizada";
      const dadosFicha: Record<string, unknown> = {};

      if (orc.tipo === "alianca") {
        if (orc.largura) dadosFicha.milimetragem = String(orc.largura);
        if (orc.aro_numeracao) dadosFicha.numeracao = orc.aro_numeracao.replace("Aro ", "");
        const perfilFormatado = perfilNomes[orc.perfil as string] ?? orc.modelo ?? orc.perfil;
        if (perfilFormatado) dadosFicha.modelo = perfilFormatado;
        if (orc.tipo_fonte) dadosFicha.tipo_fonte = orc.tipo_fonte;
        if (orc.texto) dadosFicha.texto_gravacao = orc.texto;
        if (orc.cor_metal) dadosFicha.cor_metal = orc.cor_metal;
        if (orc.peso_estimado) dadosFicha.peso_estimado = orc.peso_estimado;
        if (orc.espessura) dadosFicha.espessura = orc.espessura;
        if (orc.qtd_pedras) dadosFicha.qtd_pedras = orc.qtd_pedras;
        if (orc.tamanho_pedra) dadosFicha.tamanho_pedra = orc.tamanho_pedra;
        if (orc.tipo_aplicacao_pedra) dadosFicha.tipo_aplicacao_pedra = orc.tipo_aplicacao_pedra;
      } else {
        if (orc.peso_estimado) dadosFicha.peso_estimado = orc.peso_estimado;
        if (orc.cor_metal) dadosFicha.cor_metal = orc.cor_metal;
        if (orc.pedras_detalhadas) dadosFicha.pedras_detalhadas = orc.pedras_detalhadas;
      }

      await tx`
        INSERT INTO alissonerp.fichas_tecnicas (ordem_id, tipo_item, dados, created_by)
        VALUES (${ordem.id}, ${tipoItem}, ${JSON.stringify(dadosFicha)}::jsonb, ${user.id}::uuid)
      `;

      // 6. Criar auditoria loja pendente
      await tx`
        INSERT INTO alissonerp.auditorias (
          situacao, tipo_auditoria, rota_processo, ordem_id,
          peso_negociado, parecer, dados_ordem
        ) VALUES (
          'pendente', 'loja', 'entrada_ordem', ${ordem.id},
          ${pesoNeg}, NULL,
          ${JSON.stringify({
            numero_ordem: numeroOrdem,
            tipo_ordem: "fabricacao",
            rota: "pcp",
            peso_negociado: pesoNeg,
            origem: "orcamento",
            orcamento_id: orcId,
          })}::jsonb
        )
      `;

      // 7. Marcar orçamento como convertido
      await tx`
        UPDATE alissonerp.orcamentos
        SET status = 'convertido', ordem_gerada_id = ${ordem.id}, updated_at = NOW()
        WHERE id = ${orcId}
      `;

      return { ordem_id: ordem.id, numero_ordem: ordem.numero_ordem };
    });

    return NextResponse.json({
      ok: true,
      status: "convertido",
      ordem_id: resultado.ordem_id,
      numero_ordem: resultado.numero_ordem,
    });
  }

  return NextResponse.json({ error: "Status inválido" }, { status: 400 });
}
