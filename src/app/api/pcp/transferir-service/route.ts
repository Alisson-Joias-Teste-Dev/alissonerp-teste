import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { buscarOuroRecebido } from "@/lib/registrar-quebra";
import { createServerSupabase } from "@/lib/supabase/server";
import { internalError } from "@/lib/api-error";
import { zodError, IdSchema, UuidSchema } from "@/lib/schemas/common";

const TransferirServiceSchema = z.object({
  pcp_id: IdSchema,
  deposito_destino_id: IdSchema,
  observacao: z.string().max(5000).nullable().optional(),
  user_id: UuidSchema.nullable().optional(),
});

// POST /api/pcp/transferir-service
// Move uma ordem do PCP de um depósito de ourives para um operador service.
// Cria transferencias_ordem (tipo='service'). O protocolo é criado separadamente pelo motoboy na tela de Protocolo.
// NÃO altera /api/pcp/transferir existente.
//
// Auth: gerente_fabrica, pcp, admin, desenvolvedor
// Body: { pcp_id, deposito_destino_id, observacao?, user_id? }

const ROLES_PERMITIDOS = ["admin", "desenvolvedor", "gerente_fabrica", "pcp"];

export async function POST(req: NextRequest) {
  try {
    return await _handler(req);
  } catch (err) {
    return internalError("[POST /api/pcp/transferir-service]", err);
  }
}

async function _handler(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [caller] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid
  `;
  if (!caller || !ROLES_PERMITIDOS.includes(caller.role as string)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = TransferirServiceSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { pcp_id, deposito_destino_id, observacao, user_id } = parsed.data;

  // 1. Buscar PCP + ordem
  const [pcp] = await sql`
    SELECT p.id, p.deposito_id, p.ordem_id, p.etapas,
           o.local_atual, o.numero_ordem, o.setor_atual
    FROM alissonerp.pcp p
    JOIN alissonerp.ordens o ON o.id = p.ordem_id
    WHERE p.id = ${pcp_id}::integer
    LIMIT 1
  `;
  if (!pcp) return NextResponse.json({ error: "PCP não encontrado" }, { status: 404 });

  const etapasPermitidas = ["novas_ordens", "em_andamento", "aguardando"];
  if (!etapasPermitidas.includes(pcp.etapas as string)) {
    return NextResponse.json(
      { error: `PCP em etapa '${pcp.etapas}' não pode ser transferido para service` },
      { status: 422 }
    );
  }

  // 2. Validar destino: deve ter is_operador_service=true
  const [depDestino] = await sql`
    SELECT d.id, d.nome,
           u.is_operador_service, u.id AS usuario_id
    FROM alissonerp.depositos d
    LEFT JOIN alissonerp.usuarios u ON u.deposito_id = d.id
    WHERE d.id = ${deposito_destino_id}::integer
    LIMIT 1
  `;
  if (!depDestino) {
    return NextResponse.json({ error: "Depósito de destino não encontrado" }, { status: 404 });
  }
  if (!depDestino.is_operador_service) {
    return NextResponse.json(
      { error: "Depósito de destino não é um operador service" },
      { status: 422 }
    );
  }

  const origemDepositoId = Number(pcp.local_atual ?? pcp.deposito_id);
  const ordemId          = pcp.ordem_id as number;
  const numeroOrdem      = pcp.numero_ordem as string;

  if (!origemDepositoId || origemDepositoId <= 0) {
    return NextResponse.json(
      { error: "Operador de origem não atribuído. Atribua um operador antes de transferir para service." },
      { status: 400 }
    );
  }

  if (origemDepositoId === deposito_destino_id) {
    return NextResponse.json({ error: "Origem e destino são iguais" }, { status: 422 });
  }

  // 3. Calcular saldo de ouro a transferir (saldo líquido do operador para esta ordem)
  const ouroSaldo = origemDepositoId !== 1
    ? await buscarOuroRecebido(ordemId, origemDepositoId)
    : 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resultado = await (sql as any).begin(async (tx: typeof sql) => {
    // 4. INSERT transferencias_ordem com tipo_transferencia='service'
    //    setor_id = NULL para bloquear trigger 019 (fn_processar_transferencia)
    const [transf] = await tx`
      INSERT INTO alissonerp.transferencias_ordem
        (pcp_id, ordem_id, deposito_id, setor_id, obs, created_by,
         tipo_transferencia, deposito_origem_id)
      VALUES
        (${pcp_id}::integer, ${ordemId}::integer, ${deposito_destino_id}::integer,
         ${null}, ${observacao ?? null}, ${user_id ?? user.id}::uuid,
         'service', ${origemDepositoId}::integer)
      RETURNING id
    `;
    const transferId = transf.id as number;

    // 5. Mover ouro: SAÍDA da origem → ENTRADA no destino
    if (ouroSaldo > 0) {
      await tx`
        INSERT INTO alissonerp.movimentacoes_estoque
          (insumo_id, deposito_id, saida, entrada, marcador, obs, ordem_id, created_by, local_estoque_id)
        VALUES
          (1, ${origemDepositoId}::integer, ${ouroSaldo}::real, 0,
           'TED'::alissonerp.enum_marcador_estoque,
           ${'Transf. Service #' + pcp_id + ' - ' + numeroOrdem},
           ${ordemId}::integer, ${user_id ?? user.id}::uuid, 1)
      `;
      await tx`
        INSERT INTO alissonerp.movimentacoes_estoque
          (insumo_id, deposito_id, saida, entrada, marcador, obs, ordem_id, created_by, local_estoque_id)
        VALUES
          (1, ${deposito_destino_id}::integer, 0, ${ouroSaldo}::real,
           'TED'::alissonerp.enum_marcador_estoque,
           ${'Transf. Service #' + pcp_id + ' - ' + numeroOrdem},
           ${ordemId}::integer, ${user_id ?? user.id}::uuid, 1)
      `;
    }

    // 6. Atualizar PCP e ordens
    await tx`
      UPDATE alissonerp.pcp
      SET deposito_id = ${deposito_destino_id}::integer,
          etapas      = 'em_andamento'::alissonerp.enum_etapas_pcp,
          updated_at  = now()
      WHERE id = ${pcp_id}::integer
    `;
    await tx`
      UPDATE alissonerp.ordens
      SET local_atual = ${deposito_destino_id}::integer,
          updated_at  = now()
      WHERE id = ${ordemId}::integer
    `;

    return { transferencia_id: transferId };
  });

  return NextResponse.json({
    success: true,
    transferencia_id: resultado.transferencia_id,
    ouro_transferido: parseFloat(ouroSaldo.toFixed(2)),
    deposito_destino: depDestino.nome,
  });
}
