import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";

// GET /api/pcp/[id]/historico
//
// Retorna timeline cronológica completa de tudo que aconteceu com a ordem:
//   1. Apontamentos da distribuição (se veio de lote) — marcados com lote_id
//   2. Saída da distribuição (data_baixa da distribuicao_ordens)
//   3. Apontamentos do PCP
//   4. Transferências (origem não armazenada, só destino)
//   5. Saída PCP (se etapas = concluido)

export interface EventoHistorico {
  tipo:
    | "apontamento_distribuicao"
    | "saida_distribuicao"
    | "apontamento_pcp"
    | "transferencia"
    | "saida_pcp";
  data: string;                     // ISO — usado pra ordenar
  // apontamentos
  tipo_nome?: string | null;
  insumo_nome?: string | null;
  qtd?: number;
  categoria_id?: number;
  peso_pedra?: number;
  foto_balanca?: string | null;     // path no bucket apontamento-fotos
  deposito_nome?: string | null;
  criado_por_nome?: string | null;
  criado_por_foto?: string | null;
  // saida_distribuicao
  peso_bruto?: number;
  peso_pedras?: number;
  peso_ouro_real?: number;
  // transferencia
  destino_nome?: string | null;
  obs?: string | null;
  // saida_pcp
  peso_final?: number;
  pmc?: number;
  quebra?: number;
  // badge do lote (só apontamentos_distribuicao)
  lote_id?: number;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [, errRes] = await authOr401(req);
  if (errRes) return errRes;

  const { id } = await params;
  const pcpId = parseInt(id);
  if (isNaN(pcpId)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  // 1. Buscar PCP + foto da saída (se existir)
  const [pcp] = await sql`
    SELECT p.id, p.ordem_id, p.etapas::text AS etapas,
           p.peso_final, p.pmc, p.quebra, p.data_conclusao,
           so.foto_balanca
    FROM alissonerp.pcp p
    LEFT JOIN alissonerp.saidas_ordem so ON so.id = p.saida_ordem_id
    WHERE p.id = ${pcpId}
    LIMIT 1
  `;
  if (!pcp) {
    return NextResponse.json({ error: "PCP não encontrado" }, { status: 404 });
  }

  const ordemId = pcp.ordem_id as number;
  const eventos: EventoHistorico[] = [];

  // 2. Buscar distribuicao desta ordem (se veio de lote)
  const [distOrdem] = await sql`
    SELECT do2.id, do2.distribuicao_id, do2.data_baixa,
           do2.peso_bruto, do2.peso_pedras, do2.peso_ouro_real
    FROM alissonerp.distribuicao_ordens do2
    WHERE do2.ordens_id = ${ordemId}
    ORDER BY do2.id DESC
    LIMIT 1
  `;

  // 3. Apontamentos da distribuição (todo o lote, com badge do lote)
  if (distOrdem?.distribuicao_id) {
    const aptsDist = await sql`
      SELECT
        a.id, a.qtd, a.created_at, a.foto_balanca,
        ta.descricao  AS tipo_nome,
        i.nome        AS insumo_nome,
        i.categoria_id,
        COALESCE(i.peso_pedra, 0)::float8 AS peso_pedra,
        up.name       AS criado_por_nome,
        up.avatar_url AS criado_por_foto
      FROM alissonerp.apontamentos_distribuicao a
      LEFT JOIN alissonerp.tipos_apontamento ta ON ta.id = a.tipo_apontamento_id
      LEFT JOIN alissonerp.insumos i            ON i.id  = a.insumo_id
      LEFT JOIN public.user_profiles up         ON up.id_user = a.created_by
      WHERE a.distribuicao_id = ${distOrdem.distribuicao_id as number}
      ORDER BY a.created_at ASC
    `;

    for (const a of aptsDist) {
      eventos.push({
        tipo:            "apontamento_distribuicao",
        data:            a.created_at as string,
        tipo_nome:       a.tipo_nome as string | null,
        insumo_nome:     a.insumo_nome as string | null,
        qtd:             Number(a.qtd),
        categoria_id:    Number(a.categoria_id),
        peso_pedra:      Number(a.peso_pedra) || undefined,
        foto_balanca:    a.foto_balanca as string | null,
        criado_por_nome: a.criado_por_nome as string | null,
        criado_por_foto: a.criado_por_foto as string | null,
        lote_id:         Number(distOrdem.distribuicao_id),
      });
    }

    // 4. Saída da distribuição
    if (distOrdem.data_baixa) {
      eventos.push({
        tipo:          "saida_distribuicao",
        data:          distOrdem.data_baixa as string,
        peso_bruto:    Number(distOrdem.peso_bruto)    || undefined,
        peso_pedras:   Number(distOrdem.peso_pedras)   || undefined,
        peso_ouro_real: Number(distOrdem.peso_ouro_real) || undefined,
      });
    }
  }

  // 5. Apontamentos PCP
  const aptsPcp = await sql`
    SELECT
      a.id, a.qtd, a.created_at, a.foto_balanca,
      ta.descricao  AS tipo_nome,
      i.nome        AS insumo_nome,
      i.categoria_id,
      COALESCE(i.peso_pedra, 0)::float8 AS peso_pedra,
      d.nome        AS deposito_nome,
      up.name       AS criado_por_nome,
      up.avatar_url AS criado_por_foto
    FROM alissonerp.apontamentos_pcp a
    LEFT JOIN alissonerp.tipos_apontamento ta ON ta.id = a.tipo_apontamento_id
    LEFT JOIN alissonerp.insumos i            ON i.id  = a.insumo_id
    LEFT JOIN alissonerp.depositos d          ON d.id  = a.deposito_id
    LEFT JOIN public.user_profiles up         ON up.id_user = a.created_by
    WHERE a.pcp_id = ${pcpId}
    ORDER BY a.created_at ASC
  `;

  for (const a of aptsPcp) {
    eventos.push({
      tipo:            "apontamento_pcp",
      data:            a.created_at as string,
      tipo_nome:       a.tipo_nome as string | null,
      insumo_nome:     a.insumo_nome as string | null,
      qtd:             Number(a.qtd),
      categoria_id:    Number(a.categoria_id),
      peso_pedra:      Number(a.peso_pedra) || undefined,
      foto_balanca:    a.foto_balanca as string | null,
      deposito_nome:   a.deposito_nome as string | null,
      criado_por_nome: a.criado_por_nome as string | null,
      criado_por_foto: a.criado_por_foto as string | null,
    });
  }

  // 6. Transferências (deposito_id = destino; origem não é armazenada)
  const transferencias = await sql`
    SELECT
      t.id, t.deposito_id, t.obs, t.created_at,
      dep.nome      AS destino_nome,
      up.name       AS criado_por_nome,
      up.avatar_url AS criado_por_foto
    FROM alissonerp.transferencias_ordem t
    LEFT JOIN alissonerp.depositos dep ON dep.id = t.deposito_id
    LEFT JOIN public.user_profiles up  ON up.id_user = t.created_by
    WHERE t.ordem_id = ${ordemId}
    ORDER BY t.created_at ASC
  `;

  for (const t of transferencias) {
    eventos.push({
      tipo:            "transferencia",
      data:            t.created_at as string,
      destino_nome:    t.destino_nome as string | null,
      obs:             t.obs as string | null,
      criado_por_nome: t.criado_por_nome as string | null,
      criado_por_foto: t.criado_por_foto as string | null,
    });
  }

  // 7. Saída PCP (se concluído)
  if (pcp.etapas === "concluido" && pcp.data_conclusao) {
    eventos.push({
      tipo:         "saida_pcp",
      data:         pcp.data_conclusao as string,
      peso_final:   pcp.peso_final ? Number(pcp.peso_final) : undefined,
      pmc:          pcp.pmc        ? Number(pcp.pmc)        : undefined,
      quebra:       pcp.quebra !== null ? Number(pcp.quebra) : undefined,
      foto_balanca: pcp.foto_balanca as string | null,
    });
  }

  // 8. Ordenar cronologicamente
  eventos.sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());

  return NextResponse.json({ eventos, total: eventos.length });
}
