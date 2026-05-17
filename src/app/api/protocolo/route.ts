import { NextRequest, NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import sql from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/auth-server";
import {
  LIMITS,
  checkArrayLength,
  checkBase64Length,
  payloadTooLargeResponse,
} from "@/lib/payload-limits";

// GET /api/protocolo?user_id=UUID — lista protocolos do motoboy (ou todos se todos=true)
export async function GET(req: NextRequest) {
  let user: Awaited<ReturnType<typeof requireAuth>>;
  try {
    user = await requireAuth(req);
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }

  const userId = req.nextUrl.searchParams.get("user_id");
  const todos = req.nextUrl.searchParams.get("todos") === "true";

  const rows = todos
    ? await sql`
        SELECT p.id, p.direcao::text, p.etapas::text, p.created_at, p.tipo_protocolo,
          (SELECT count(*)::int FROM alissonerp.protocolo_ordens po WHERE po.protocolo_id = p.id) AS total_ordens
        FROM alissonerp.protocolos p
        ORDER BY p.created_at DESC LIMIT 50
      `
    : await sql`
        SELECT p.id, p.direcao::text, p.etapas::text, p.created_at, p.tipo_protocolo,
          (SELECT count(*)::int FROM alissonerp.protocolo_ordens po WHERE po.protocolo_id = p.id) AS total_ordens
        FROM alissonerp.protocolos p
        WHERE p.created_by = ${userId}::uuid OR p.motoboy_id = ${userId}::uuid
        ORDER BY p.created_at DESC LIMIT 50
      `;

  return NextResponse.json(rows);
}

// POST /api/protocolo — cria protocolo + vincula ordens
export async function POST(req: NextRequest) {
  const { direcao, ordem_ids, motoboy_id, foto_criacao, user_id, tipo_protocolo } = await req.json() as {
    direcao: "ida" | "volta";
    ordem_ids: number[];
    motoboy_id?: string;
    foto_criacao?: string;
    user_id?: string;
    tipo_protocolo?: string;
  };

  // Auth obrigatória — user.id substitui body.user_id para created_by e permissões
  let user: Awaited<ReturnType<typeof requireAuth>>;
  try {
    user = await requireAuth(req);
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }

  try {
    checkArrayLength("ordem_ids", ordem_ids, LIMITS.ORDENS_LOTE_MAX);
    checkBase64Length("foto_criacao", foto_criacao, LIMITS.IMAGE_BASE64_MAX);
  } catch (e) {
    const r = payloadTooLargeResponse(e);
    if (r) return r;
    throw e;
  }

  if (!direcao || !Array.isArray(ordem_ids) || ordem_ids.length === 0) {
    return NextResponse.json({ error: "Parâmetros inválidos" }, { status: 400 });
  }

  const tipoFinal = tipo_protocolo ?? "fabrica";

  // Validar permissão do usuário autenticado (admin/dev ignoram)
  {
    const [usuario] = await sql`
      SELECT role::text AS role, tipos_protocolo_permitidos
      FROM alissonerp.usuarios
      WHERE id = ${user.id}::uuid
    `;

    if (usuario) {
      const role = usuario.role as string;
      const tiposPermitidos: string[] = usuario.tipos_protocolo_permitidos ?? [];

      if (!["admin", "desenvolvedor"].includes(role)) {
        if (!tiposPermitidos.includes(tipoFinal)) {
          return NextResponse.json(
            { error: `Sem permissão para criar protocolo ${tipoFinal}` },
            { status: 403 }
          );
        }
      }
    }
  }

  const [prot] = await sql`
    INSERT INTO alissonerp.protocolos (direcao, etapas, motoboy_id, foto_criacao, created_by, tipo_protocolo)
    VALUES (
      ${direcao}, 'pendente',
      ${motoboy_id ?? null}::uuid,
      ${foto_criacao ?? null},
      ${user.id}::uuid,
      ${tipoFinal}
    )
    RETURNING id
  `;

  const rows = ordem_ids.map((ordem_id) => ({ protocolo_id: prot.id, ordem_id }));
  await sql`INSERT INTO alissonerp.protocolo_ordens ${sql(rows)}`;

  // Criar movimentações para ordens conversao_sku
  const ordensSku = await sql`
    SELECT cs.id, cs.sku_origem_id, cs.sku_origem_quantidade,
           cs.local_origem_id, cs.sku_destino_id, cs.quantidade_produzida,
           cs.sku_destino_quantidade_desejada, cs.status_conversao, cs.ordem_id,
           cs.reserva_id, cs.local_destino_id,
           o.numero_ordem
    FROM alissonerp.conversoes_sku cs
    JOIN alissonerp.ordens o ON o.id = cs.ordem_id
    WHERE cs.ordem_id = ANY(${ordem_ids}::int[])
  `;

  for (const cs of ordensSku) {
    if (direcao === "ida" && cs.status_conversao === "aprovado") {
      // Protocolo ida: SKU origem sai do local de origem
      await sql`
        INSERT INTO alissonerp.movimentacoes_estoque_comercial
          (produto_id, tipo, quantidade, motivo, local_estoque_id, status,
           ordem_id, protocolo_id, referencia_id, observacao, created_by)
        VALUES
          (${cs.sku_origem_id}, 'saida', ${cs.sku_origem_quantidade},
           'conversao_sku_ida', ${cs.local_origem_id}, 'efetivado',
           ${cs.ordem_id}, ${prot.id}, ${cs.ordem_id},
           'Saida ' || COALESCE(${cs.numero_ordem}, '#' || ${cs.ordem_id}) || ' (prot ' || ${prot.id} || ')',
           ${user.id}::uuid)
      `;
      // Efetivar a reserva (libera o saldo virtual, já que a saída real foi criada)
      if (cs.reserva_id) {
        await sql`
          UPDATE alissonerp.reservas_estoque_comercial
          SET status = 'efetivado', efetivado_em = NOW()
          WHERE id = ${cs.reserva_id} AND status = 'ativo'
        `;
      }
    } else if (direcao === "volta" && cs.status_conversao === "aguardando_volta") {
      // Protocolo volta: SKU destino sai da fábrica/service
      const localFabrica = tipoFinal === "service" ? 3 : 1;
      const qtdVolta = cs.quantidade_produzida ?? cs.sku_destino_quantidade_desejada;
      await sql`
        INSERT INTO alissonerp.movimentacoes_estoque_comercial
          (produto_id, tipo, quantidade, motivo, local_estoque_id, status,
           ordem_id, protocolo_id, referencia_id, observacao, created_by)
        VALUES
          (${cs.sku_destino_id}, 'saida', ${qtdVolta},
           'conversao_sku_volta', ${localFabrica}, 'efetivado',
           ${cs.ordem_id}, ${prot.id}, ${cs.ordem_id},
           'Retorno ' || ${cs.numero_ordem ?? '#' + cs.ordem_id} || ' (prot ' || ${prot.id} || ')',
           ${user.id}::uuid)
      `;
    }
  }

  await logAudit(sql, {
    tabela: "protocolos",
    operacao: "INSERT",
    registro_id: prot.id,
    usuario_id: user.id,
    dados_depois: { direcao: tipoFinal === "fabrica" ? direcao : direcao, tipo_protocolo: tipoFinal, ordens: ordem_ids.length },
  });

  return NextResponse.json({ id: prot.id });
}
