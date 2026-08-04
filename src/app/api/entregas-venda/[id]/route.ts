/**
 * GET /api/entregas-venda/[id]
 * [id] = entrega_id em entregas_venda
 *
 * Retorna detalhes completos de uma entrega para o drawer de detalhe.
 * Inclui dados da venda, itens com nome/sku, motoboy e usuários
 * envolvidos (quem criou, quem confirmou cada etapa).
 *
 * Três queries em paralelo:
 *   1. Cabeçalho da entrega + venda + motoboy
 *   2. Itens da entrega com nome/sku do produto
 *   3. Contagem de itens (para validação)
 *
 * Regra de visibilidade: consultora só vê entregas de vendas próprias
 * (filtro por vendedor_id em vendas_erp).
 *
 * IMPACTO SE ALTERADO: o drawer de detalhe do frontend depende de TODOS
 * estes campos. Remover colunas quebra a UI de visualização da entrega.
 */
import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { resolverEnderecoEntrega, buscarFotosEntrega } from "@/lib/entrega-venda";

const ROLES_ENTREGAS = ["desenvolvedor", "admin", "gerente_loja", "consultora", "entregador"];

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const entregaId = Number(id);
  if (isNaN(entregaId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const [usuario] = await sql`
    SELECT role, vendedor_id FROM alissonerp.usuarios
    WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario || !ROLES_ENTREGAS.includes(usuario.role as string)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  // Três queries em paralelo para montar o detalhe completo da entrega
  // REGRA DE NEGÓCIO: queries separadas permitem exibição progressiva
  // no frontend (cabeçalho primeiro, itens depois).
  const [entrega, itens, countRow, naEntregaRow, fotosEntrega] = await Promise.all([
    // Query 1 — Cabeçalho da entrega com venda, motoboy e usuários
    // JOIN com vendas_erp para dados comerciais (número, total, situação, cliente)
    // JOIN com motoboys para nome/telefone do entregador
    // JOIN com usuarios para nomes de quem criou e confirmou cada etapa
    sql`
      SELECT
        ev.id,
        ev.venda_id,
        ev.codigo_entrega,
        ev.codigo_cliente,
        ev.codigo_motoboy,
        ev.tipo,
        ev.forma_entrega,
        ev.situacao,
        ev.regiao,
        ev.motoboy_id,
        ev.frete_cobrado,
        ev.frete_motoboy,
        ev.aprovacao_frete_necessaria,
        ev.data_saida,
        ev.data_retirada,
        ev.data_entrega_realizada,
        ev.data_entrega_prevista,
        ev.correios_rastreio,
        ev.correios_data_postagem,
        ev.observacoes,
        ev.created_at,
        ev.updated_at,
        ev.foto_entrega_path,
        ev.latitude_entrega,
        ev.longitude_entrega,
        ev.is_avulso,
        ev.descricao_avulso,
        ev.liberada_em,
        (ev.created_by = ev.motoboy_id) AS auto_criado,
        -- Dados da venda vinculada
        ve.numero_venda,
        ve.total_venda,
        ve.situacao AS venda_situacao,
        ve.cliente_id,
        c.nome AS cliente_nome,
        c.celular AS cliente_celular,
        c.telefone AS cliente_telefone,
        ve.vendedor_id,
        -- Endereço de entrega da VENDA (fallback — ver resolverEnderecoEntrega abaixo)
        ve.endereco_entrega,
        ve.endereco_entrega_numero,
        ve.endereco_entrega_complemento,
        ve.endereco_entrega_bairro,
        ve.endereco_entrega_cidade,
        ve.endereco_entrega_cep,
        ve.endereco_entrega_uf,
        -- BLOCO 4 (jul/2026), P1 — endereço da ENTREGA (migration 355), aliasado
        -- pra não colidir com as colunas de mesmo nome de ve.* acima. É este
        -- conjunto que manda quando preenchido (ver resolverEnderecoEntrega,
        -- src/lib/entrega-venda.ts) — o que a consultora CONFIRMOU na
        -- solicitação de frete avulso, que pode divergir do endereço
        -- cadastrado na venda (ou nem ter venda vinculada).
        ev.endereco_entrega AS entrega_endereco_entrega,
        ev.endereco_entrega_numero AS entrega_endereco_entrega_numero,
        ev.endereco_entrega_complemento AS entrega_endereco_entrega_complemento,
        ev.endereco_entrega_bairro AS entrega_endereco_entrega_bairro,
        ev.endereco_entrega_cidade AS entrega_endereco_entrega_cidade,
        ev.endereco_entrega_cep AS entrega_endereco_entrega_cep,
        ev.endereco_entrega_uf AS entrega_endereco_entrega_uf,
        -- Endereço do cadastro do cliente (fallback)
        c.endereco AS cliente_endereco,
        c.numero AS cliente_numero,
        c.complemento AS cliente_complemento,
        c.bairro AS cliente_bairro,
        c.municipio AS cliente_municipio,
        c.cep AS cliente_cep,
        c.uf AS cliente_uf,
        -- Dados do motoboy
        mb.nome AS motoboy_nome,
        mb.telefone AS motoboy_telefone,
        -- Nomes dos usuários que realizaram ações na entrega
        uc.nome AS criado_por_nome,
        umr.nome AS confirmado_motoboy_retirada_nome,
        ur.nome AS confirmado_retirada_nome,
        ume.nome AS confirmado_motoboy_entrega_nome,
        -- REGRA DE NEGÓCIO (04/08/2026, pedido do Jonathan — timeline fiel):
        -- quem aprovou a solicitação de frete avulso (liberada_por/liberada_em
        -- já existiam na tabela desde a migration 353, mas nunca eram
        -- buscados/exibidos). Só vem preenchido quando a corrida passou pelo
        -- fluxo de solicitação (pool de aprovadores) — criação direta nunca
        -- tem liberada_por. Conferido no banco: NUNCA é a mesma pessoa que
        -- criou (10/10 amostras reais).
        ul.nome AS liberada_por_nome
      FROM alissonerp.entregas_venda ev
      LEFT JOIN alissonerp.vendas_erp ve ON ve.id = ev.venda_id
      LEFT JOIN public.contatos c ON c.id_contato = ve.cliente_id
      LEFT JOIN alissonerp.motoboys mb ON mb.user_id = ev.motoboy_id
      LEFT JOIN alissonerp.usuarios uc ON uc.id = ev.created_by
      LEFT JOIN alissonerp.usuarios umr ON umr.id = ev.confirmado_por_motoboy_retirada
      LEFT JOIN alissonerp.usuarios ur ON ur.id = ev.confirmado_por_retirada
      LEFT JOIN alissonerp.usuarios ume ON ume.id = ev.confirmado_por_motoboy_entrega
      LEFT JOIN alissonerp.usuarios ul ON ul.id = ev.liberada_por
      WHERE ev.id = ${entregaId}
      LIMIT 1
    `,
    // Query 2 — Itens da entrega com dados do produto
    // REGRA DE NEGÓCIO: exibe nome_produto e sku para identificação visual
    // rápida de cada item entregue. quantidade_entregue é a quantidade
    // deste lote específico de entrega.
    sql`
      SELECT
        evi.id,
        evi.entrega_id,
        evi.item_venda_id,
        evi.quantidade_entregue AS quantidade,
        evi.baixa_estoque_realizada,
        ive.nome_produto,
        ive.sku
      FROM alissonerp.entregas_venda_itens evi
      LEFT JOIN alissonerp.itens_venda_erp ive ON ive.id = evi.item_venda_id
      WHERE evi.entrega_id = ${entregaId}
      ORDER BY evi.id
    `,
    // Query 3 — Contagem de itens para consistência
    sql`
      SELECT COUNT(*)::integer AS total
      FROM alissonerp.entregas_venda_itens
      WHERE entrega_id = ${entregaId}
    `,
    // Query 4 — Saldo "Na Entrega" pendente da venda.
    // REGRA DE NEGÓCIO (13/06): se > 0, o motoboy precisa CONFIRMAR O PAGAMENTO
    // antes de poder confirmar a entrega (o front mostra "Confirmar Pagamento" e
    // bloqueia "Confirmar Entrega"). Cobre o caso de pagamento na entrega.
    sql`
      SELECT COALESCE(SUM(valor), 0)::numeric AS total
      FROM alissonerp.pagamentos_venda p
      JOIN alissonerp.entregas_venda ev ON ev.venda_id = p.venda_id
      WHERE ev.id = ${entregaId} AND p.forma = 'Na Entrega' AND p.status = 'pendente'
    `,
    // Query 5 — Fotos da confirmação (migration 357): helper único que
    // unifica a tabela nova (entregas_venda_fotos) com o fallback pra coluna
    // antiga (foto_entrega_path) de entregas confirmadas antes da migration.
    buscarFotosEntrega(entregaId),
  ]);

  if (!entrega[0]) {
    return NextResponse.json({ error: "Entrega não encontrada" }, { status: 404 });
  }

  // REGRA DE NEGÓCIO: consultora só vê entregas de suas próprias vendas.
  // IMPACTO SE REMOVIDO: vazamento de dados entre consultoras.
  if (usuario.role === "consultora" && usuario.vendedor_id != null) {
    if (entrega[0].vendedor_id !== usuario.vendedor_id) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }
  }

  // REGRA DE NEGÓCIO: entregador só vê suas próprias entregas.
  if (usuario.role === "entregador") {
    if (!entrega[0].motoboy_id || entrega[0].motoboy_id !== user.id) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }
  }

  const e = entrega[0];

  // REGRA DE SEGURANÇA (Blindagem 2026-06): códigos A/B mascarados para todos
  // exceto admin/desenvolvedor — o código chega ao cliente/motoboy só por
  // WhatsApp. O drawer mostra a máscara; admin pode revelar (podeVerCodigos).
  // IMPACTO SE REMOVIDO: operador vê o código e confirma entrega sem o
  // cliente estar presente (burla o sistema de dois códigos).
  const podeVerCodigos = ["admin", "desenvolvedor"].includes(usuario.role as string);
  const mascarar = (c: unknown) => (c ? "••••••" : null);

  // BLOCO 4 (jul/2026), P1 — resolve qual conjunto de endereço o drawer
  // recebe: o da ENTREGA (entregas_venda, migration 355) se ela tiver
  // QUALQUER campo próprio preenchido, senão o da VENDA (fallback — cobre
  // entrega normal/não-avulsa, que nunca grava endereço próprio).
  // Ver resolverEnderecoEntrega (src/lib/entrega-venda.ts) para a regra
  // completa e a justificativa de não fazer COALESCE campo a campo.
  const enderecoResolvido = resolverEnderecoEntrega(
    {
      endereco_entrega: e.entrega_endereco_entrega ?? null,
      endereco_entrega_numero: e.entrega_endereco_entrega_numero ?? null,
      endereco_entrega_complemento: e.entrega_endereco_entrega_complemento ?? null,
      endereco_entrega_bairro: e.entrega_endereco_entrega_bairro ?? null,
      endereco_entrega_cidade: e.entrega_endereco_entrega_cidade ?? null,
      endereco_entrega_cep: e.entrega_endereco_entrega_cep ?? null,
      endereco_entrega_uf: e.entrega_endereco_entrega_uf ?? null,
    },
    {
      endereco_entrega: e.endereco_entrega ?? null,
      endereco_entrega_numero: e.endereco_entrega_numero ?? null,
      endereco_entrega_complemento: e.endereco_entrega_complemento ?? null,
      endereco_entrega_bairro: e.endereco_entrega_bairro ?? null,
      endereco_entrega_cidade: e.endereco_entrega_cidade ?? null,
      endereco_entrega_cep: e.endereco_entrega_cep ?? null,
      endereco_entrega_uf: e.endereco_entrega_uf ?? null,
    },
  );

  // Monta o objeto de resposta com conversão de NUMERIC e junção dos itens
  // REGRA DE NEGÓCIO: campos NUMERIC vêm como string do PostgreSQL;
  // converter com Number() para o frontend manipular como número nativo.
  return NextResponse.json({
    // Dados do cabeçalho da entrega
    id: Number(e.id),
    venda_id: Number(e.venda_id),
    codigo_entrega: e.codigo_entrega,
    codigo_cliente: podeVerCodigos ? e.codigo_cliente : mascarar(e.codigo_cliente),
    codigo_motoboy: podeVerCodigos ? e.codigo_motoboy : mascarar(e.codigo_motoboy),
    tipo: e.tipo,
    forma_entrega: e.forma_entrega,
    situacao: e.situacao,
    regiao: e.regiao,
    motoboy_id: e.motoboy_id ? String(e.motoboy_id) : null,
    frete_cobrado: Number(e.frete_cobrado ?? 0),
    frete_motoboy: Number(e.frete_motoboy ?? 0),
    aprovacao_frete_necessaria: Boolean(e.aprovacao_frete_necessaria),
    data_saida: e.data_saida,
    data_retirada: e.data_retirada,
    data_entrega_realizada: e.data_entrega_realizada,
    data_entrega_prevista: e.data_entrega_prevista,
    correios_rastreio: e.correios_rastreio,
    correios_data_postagem: e.correios_data_postagem,
    observacoes: e.observacoes,
    created_at: e.created_at,
    updated_at: e.updated_at,
    foto_entrega_path: e.foto_entrega_path ?? null,
    // REGRA DE NEGÓCIO (03/08/2026): posição GPS bruta capturada na
    // confirmação pelo motoboy — o front monta o link do Google Maps
    // (https://www.google.com/maps?q=lat,lng), sem geocodificação reversa.
    latitude_entrega: e.latitude_entrega != null ? Number(e.latitude_entrega) : null,
    longitude_entrega: e.longitude_entrega != null ? Number(e.longitude_entrega) : null,
    // MULTIFOTO (migration 357): lista já unificada (nova tabela + fallback
    // pra coluna antiga) — ver buscarFotosEntrega em src/lib/entrega-venda.ts.
    fotos_entrega: fotosEntrega,
    is_avulso: Boolean(e.is_avulso),
    descricao_avulso: e.descricao_avulso ?? null,
    auto_criado: Boolean(e.auto_criado),
    // REGRA DE NEGÓCIO (04/08/2026 — timeline fiel): quem aprovou a
    // solicitação e quando. null quando a corrida nasceu direto (sem passar
    // pelo pool de aprovadores) — o front usa isso pra decidir se mostra o
    // passo "Aprovada" na timeline.
    liberada_em: e.liberada_em ?? null,
    liberada_por_nome: e.liberada_por_nome ?? null,
    // Dados da venda
    numero_venda: e.numero_venda,
    total_venda: e.total_venda ? Number(e.total_venda) : null,
    venda_situacao: e.venda_situacao,
    // Saldo "Na Entrega" pendente: se > 0, o motoboy confirma o pagamento antes de entregar.
    na_entrega_pendente: Number(naEntregaRow[0]?.total ?? 0),
    cliente_id: e.cliente_id ? Number(e.cliente_id) : null,
    cliente_nome: e.cliente_nome,
    cliente_celular: e.cliente_celular ?? null,
    cliente_telefone: e.cliente_telefone ?? null,
    vendedor_id: e.vendedor_id ? Number(e.vendedor_id) : null,
    // Endereço de entrega RESOLVIDO — entrega manda, venda é fallback (ver
    // resolverEnderecoEntrega acima e o comentário de regra de negócio).
    ...enderecoResolvido,
    // Endereço do cadastro (fallback se venda não tiver)
    cliente_endereco: e.cliente_endereco ?? null,
    cliente_numero: e.cliente_numero ?? null,
    cliente_complemento: e.cliente_complemento ?? null,
    cliente_bairro: e.cliente_bairro ?? null,
    cliente_municipio: e.cliente_municipio ?? null,
    cliente_cep: e.cliente_cep ?? null,
    cliente_uf: e.cliente_uf ?? null,
    // Dados do motoboy
    motoboy_nome: e.motoboy_nome,
    motoboy_telefone: e.motoboy_telefone,
    // Nomes dos usuários que executaram ações
    criado_por_nome: e.criado_por_nome,
    confirmado_motoboy_retirada_nome: e.confirmado_motoboy_retirada_nome,
    confirmado_retirada_nome: e.confirmado_retirada_nome,
    confirmado_motoboy_entrega_nome: e.confirmado_motoboy_entrega_nome,
    // Itens da entrega (convertendo NUMERIC e boolean)
    itens: itens.map((i) => ({
      id: Number(i.id),
      entrega_id: Number(i.entrega_id),
      item_venda_id: Number(i.item_venda_id),
      quantidade: Number(i.quantidade),
      baixa_estoque_realizada: Boolean(i.baixa_estoque_realizada),
      nome_produto: i.nome_produto ?? "",
      sku: i.sku ?? "",
    })),
    itens_count: Number(countRow[0]?.total ?? 0),
  });
}
