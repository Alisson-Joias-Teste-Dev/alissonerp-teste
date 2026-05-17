import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";

// POST /api/pcp/ordem-teste
// Cria uma ordem de teste direto no PCP, sem passar pelo fluxo normal.
// Permissão: somente desenvolvedor.
//
// Pré-requisito: migration 065_ordens_eh_teste.sql deve ter sido executada.
//   ALTER TABLE alissonerp.ordens ADD COLUMN IF NOT EXISTS eh_teste BOOLEAN NOT NULL DEFAULT false;

export async function POST(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (user.role !== "desenvolvedor") {
    return NextResponse.json({ error: "Sem permissão — só desenvolvedor" }, { status: 403 });
  }

  const { peso_negociado, deposito_id, etapa_inicial } = await req.json() as {
    peso_negociado?: number;
    deposito_id?: number | null;
    etapa_inicial?: "novas_ordens" | "aguardando" | "em_andamento";
  };

  const etapa     = etapa_inicial ?? "novas_ordens";
  const pesoFinal = Number(peso_negociado ?? 2.5);

  // ordens.local_atual: novas_ordens/aguardando → Almox (1), em_andamento → operador
  const ordemLocalAtual = etapa === "em_andamento" ? (deposito_id ?? 2) : 1;
  // pcp.deposito_id: novas_ordens → NULL, aguardando → 1, em_andamento → operador
  const pcpDepositoId = etapa === "em_andamento"
    ? (deposito_id ?? 2)
    : etapa === "novas_ordens"
    ? null
    : 1;

  // 2. Gerar número sequencial T-XXXX
  const [ultimo] = await sql`
    SELECT numero_ordem
    FROM alissonerp.ordens
    WHERE numero_ordem LIKE 'T-%'
    ORDER BY id DESC
    LIMIT 1
  `;
  const ultimoNum  = ultimo?.numero_ordem
    ? parseInt((ultimo.numero_ordem as string).replace("T-", "")) || 0
    : 0;
  const numeroOrdem = `T-${String(ultimoNum + 1).padStart(4, "0")}`;

  // 3. INSERT em alissonerp.ordens (campos mínimos obrigatórios)
  const [ordem] = await sql`
    INSERT INTO alissonerp.ordens
      (numero_ordem, tipo_ordem, rota, local_atual, peso_metal_negociado, eh_teste, created_by)
    VALUES
      (${numeroOrdem},
       ${"fabricacao"}::alissonerp.enum_tipo_ordem,
       ${"pcp"}::alissonerp.enum_rota_ordem,
       ${ordemLocalAtual},
       ${pesoFinal},
       ${true},
       ${user.id}::uuid)
    RETURNING id
  `;

  // 4. INSERT em alissonerp.pcp
  const [pcp] = await sql`
    INSERT INTO alissonerp.pcp
      (ordem_id, etapas, deposito_id, created_by)
    VALUES
      (${ordem.id as number},
       ${etapa}::alissonerp.enum_etapas_pcp,
       ${pcpDepositoId},
       ${user.id}::uuid)
    RETURNING id
  `;

  return NextResponse.json({
    ok:    true,
    ordem: { id: ordem.id, numero: numeroOrdem },
    pcp:   { id: pcp.id, etapa },
  });
}
