import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess, hasRole } from "@/lib/roles";
import { submeterVendaParaAprovacaoCredito } from "@/lib/vendas-credito-aprovar";
import { approveVenda } from "@/lib/vendas-aprovar";

// ─── POST /api/vendas/[id]/solicitar-aprovacao ───────────────────────────────
// Consultora/gerente solicita aprovação de venda.
// Se tem "A Receber" → cria tarefa de aprovação de crédito.
// Se não tem "A Receber" e user é gerente+/admin/diretor → approveVenda direto.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const vendaId = Number(id);
  if (isNaN(vendaId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  let tipo = "";
  try { const b = await req.json(); tipo = b?.tipo ?? ""; } catch { /* body opcional */ }

  const [usuario] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 403 });

  // Validar venda em rascunho
  const [venda] = await sql`
    SELECT v.id, v.situacao, v.bloqueado, v.aprovacao_credito_tarefa_id,
           v.desconto_aprovado_por,
           EXISTS(
             SELECT 1 FROM alissonerp.itens_venda_erp
             WHERE venda_id = ${vendaId} AND pct_desconto > 30
           ) AS tem_desconto_alto
    FROM alissonerp.vendas_erp v WHERE v.id = ${vendaId}
  `;
  if (!venda) return NextResponse.json({ error: "Venda não encontrada" }, { status: 404 });
  if (venda.situacao !== "rascunho") {
    return NextResponse.json({ error: "Venda não está em rascunho" }, { status: 409 });
  }
  if (venda.bloqueado) {
    return NextResponse.json({ error: "Venda bloqueada" }, { status: 409 });
  }
  // ── Bloquear solicitação de crédito/gerente se desconto >30% não aprovado ─
  if (tipo !== "desconto" && venda.tem_desconto_alto && !venda.desconto_aprovado_por) {
    return NextResponse.json(
      { error: "Esta venda tem desconto acima de 30%. Solicite aprovação de desconto primeiro (tipo=desconto)." },
      { status: 409 }
    );
  }

  // ── Aprovação de desconto (>30%) ─────────────────────────────────────────
  if (tipo === "desconto") {
    if (venda.aprovacao_credito_tarefa_id) {
      return NextResponse.json({ ok: true, aguardando_aprovacao_desconto: true, message: "Já existe aprovação pendente" });
    }
    const [admin] = await sql`
      SELECT id FROM alissonerp.usuarios
      WHERE role IN ('admin', 'desenvolvedor') AND ativo = true
      ORDER BY id LIMIT 1
    `;
    if (!admin) return NextResponse.json({ error: "Nenhum administrador ativo encontrado" }, { status: 500 });

    const [vendaInfo] = await sql`
      SELECT numero_venda, total_venda FROM alissonerp.vendas_erp WHERE id = ${vendaId}
    `;
    const itensDesconto = await sql`
      SELECT sku, nome_produto, preco_lista, pct_desconto, preco_unitario, quantidade
      FROM alissonerp.itens_venda_erp
      WHERE venda_id = ${vendaId} AND pct_desconto > 30
      ORDER BY id
    `;
    const linhasItens = itensDesconto.map((it) => {
      const sem = Number(it.preco_lista).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      const com = Number(it.preco_unitario).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      return `• ${it.sku} — ${it.nome_produto}\n  Tabela: ${sem} | Desconto: ${Number(it.pct_desconto).toFixed(0)}% | Final: ${com}`;
    }).join("\n");
    const descricao = `Venda ${vendaInfo.numero_venda} com desconto acima de 30%\nTotal: ${Number(vendaInfo.total_venda).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}\n\nItens com desconto:\n${linhasItens}`;

    const [tarefa] = await sql`
      INSERT INTO alissonerp.tarefas
        (titulo, descricao, responsavel_id, criado_por, prioridade, status, venda_id, tags)
      VALUES
        (${"Aprovar desconto — " + vendaInfo.numero_venda},
         ${descricao},
         ${admin.id}::uuid, ${user.id}::uuid,
         'alta', 'aguardando_aprovacao', ${vendaId},
         ${sql.array(["aprovacao_desconto"])})
      RETURNING id
    `;
    await sql`
      INSERT INTO alissonerp.aprovacoes_tarefa (tarefa_id, solicitante_id, aprovador_id, status)
      VALUES (${tarefa.id}, ${user.id}::uuid, ${admin.id}::uuid, 'pendente')
    `;
    await sql`
      UPDATE alissonerp.vendas_erp
      SET aprovacao_credito_tarefa_id = ${tarefa.id}, updated_at = NOW()
      WHERE id = ${vendaId}
    `;
    await sql`
      INSERT INTO alissonerp.notificacoes (usuario_id, tipo, titulo, mensagem, remetente_id, link)
      VALUES (${admin.id}::uuid, 'aprovacao', ${"Aprovar desconto — " + vendaInfo.numero_venda},
        ${"Venda " + vendaInfo.numero_venda + " aguarda aprovação de desconto acima de 30%"},
        ${user.id}::uuid, ${`/vendas/${vendaId}`})
    `.catch(() => {});
    return NextResponse.json({ ok: true, aguardando_aprovacao_desconto: true, tarefa_id: tarefa.id });
  }

  // Verificar se já tem aprovação pendente (para fluxos não-desconto)
  if (venda.aprovacao_credito_tarefa_id) {
    return NextResponse.json({
      ok: true,
      aguardando_aprovacao_credito: true,
      message: "Já existe uma aprovação pendente para esta venda",
    });
  }

  // Checar se tem "A Receber"
  const [aReceber] = await sql`
    SELECT COALESCE(SUM(valor), 0) AS total
    FROM alissonerp.pagamentos_venda
    WHERE venda_id = ${vendaId} AND forma = 'A Receber' AND status = 'pendente'
  `;
  const totalAReceber = parseFloat(aReceber.total);

  if (totalAReceber > 0) {
    // Precisa aprovação de crédito
    try {
      const result = await submeterVendaParaAprovacaoCredito(vendaId, user.id);
      return NextResponse.json({
        ok: true,
        aguardando_aprovacao_credito: result.precisa_aprovacao,
        tipo_aprovacao: result.tipo,
        tarefa_id: result.tarefa_id,
        message: result.message,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  // Sem "A Receber" — fluxo normal
  const ROLES_APROVAR_DIRETO = ["desenvolvedor", "admin", "diretor", "gerente_fabrica", "gerente_loja"];
  if (isFullAccess(usuario.role) || hasRole(usuario.role, ROLES_APROVAR_DIRETO)) {
    // Aprovar diretamente
    try {
      const result = await approveVenda(vendaId, user.id, { tinyBestEffort: false });
      return NextResponse.json({
        ok: true,
        aguardando_aprovacao_credito: false,
        ordem_criada: result.ordem_criada,
        tiny_erro: result.tiny_erro,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: msg }, { status: 502 });
    }
  }

  // Consultora sem A Receber — criar tarefa de aprovação simples para gerente
  const [gerente] = await sql`
    SELECT id FROM alissonerp.usuarios
    WHERE role = 'gerente_loja' AND ativo = true
    ORDER BY id LIMIT 1
  `;
  if (!gerente) {
    return NextResponse.json({ error: "Nenhum gerente de loja ativo encontrado" }, { status: 500 });
  }

  const [vendaInfo] = await sql`
    SELECT numero_venda, total_venda FROM alissonerp.vendas_erp WHERE id = ${vendaId}
  `;

  const [tarefa] = await sql`
    INSERT INTO alissonerp.tarefas
      (titulo, descricao, responsavel_id, criado_por, prioridade, status, venda_id, tags)
    VALUES
      (${"Aprovar venda — " + vendaInfo.numero_venda},
       ${"Venda " + vendaInfo.numero_venda + " — R$ " + Number(vendaInfo.total_venda).toFixed(2)},
       ${gerente.id}::uuid, ${user.id}::uuid,
       'alta', 'aguardando_aprovacao', ${vendaId},
       ${sql.array(["aprovacao_venda"])})
    RETURNING id
  `;

  await sql`
    INSERT INTO alissonerp.aprovacoes_tarefa (tarefa_id, solicitante_id, aprovador_id, status)
    VALUES (${tarefa.id}, ${user.id}::uuid, ${gerente.id}::uuid, 'pendente')
  `;

  await sql`
    UPDATE alissonerp.vendas_erp
    SET aprovacao_credito_tarefa_id = ${tarefa.id}, updated_at = NOW()
    WHERE id = ${vendaId}
  `;

  await sql`
    INSERT INTO alissonerp.notificacoes (usuario_id, tipo, titulo, mensagem, remetente_id, link)
    VALUES (${gerente.id}::uuid, 'aprovacao', ${"Aprovar venda — " + vendaInfo.numero_venda},
      ${"Venda " + vendaInfo.numero_venda + " aguardando aprovação"},
      ${user.id}::uuid, ${`/vendas/${vendaId}`})
  `.catch(() => {});

  return NextResponse.json({
    ok: true,
    aguardando_aprovacao_credito: true,
    tipo_aprovacao: "gerente",
    tarefa_id: tarefa.id,
    message: "Venda enviada para aprovação do gerente",
  });
}
