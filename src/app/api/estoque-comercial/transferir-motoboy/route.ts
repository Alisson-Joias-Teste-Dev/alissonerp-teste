import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

const MOTORBOY_WH = 5;
const LOJA_WH = 2;
const FABRICA_WH = 1;

const ROLES_PERMITIDOS = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja"];

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const produtoId = searchParams.get("produto_id");
  const warehouseId = searchParams.get("warehouse_id");
  const itemType = searchParams.get("item_type") ?? "produto";

  let rows;
  if (produtoId && warehouseId) {
    rows = await sql`
      SELECT id, item_id, warehouse_id, actual_qty, qty_after, voucher_type,
             posting_date, posting_time, obs, created_at
      FROM alissonerp.stock_ledger_entry
      WHERE item_id = ${Number(produtoId)}::bigint
        AND item_type = ${itemType}
        AND warehouse_id = ${Number(warehouseId)}
        AND is_cancelled = false
      ORDER BY posting_date DESC, posting_time DESC
      LIMIT 50
    `;
  } else if (produtoId) {
    rows = await sql`
      SELECT l.id AS warehouse_id, l.nome AS warehouse_nome,
             COALESCE(SUM(sle.actual_qty), 0)::numeric AS saldo_fisico
      FROM alissonerp.locais_estoque l
      LEFT JOIN alissonerp.stock_ledger_entry sle
        ON sle.warehouse_id = l.id
        AND sle.item_id = ${Number(produtoId)}::bigint
        AND sle.item_type = ${itemType}
        AND sle.is_cancelled = false
      WHERE l.id IN (${LOJA_WH}, ${FABRICA_WH}, ${MOTORBOY_WH})
      GROUP BY l.id, l.nome
      ORDER BY l.id
    `;
  } else {
    return NextResponse.json({ error: "produto_id obrigatório" }, { status: 400 });
  }

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario || !ROLES_PERMITIDOS.includes(usuario.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const body = await req.json() as {
    action: string;
    produto_id: number;
    quantidade: number;
    motoboy_id?: string;
    obs?: string;
  };

  const { action, produto_id, quantidade, motoboy_id, obs } = body;

  if (!action || !produto_id || !quantidade || quantidade <= 0) {
    return NextResponse.json(
      { error: "Campos obrigatórios: action, produto_id, quantidade" },
      { status: 400 }
    );
  }

  const today = new Date().toISOString().split("T")[0];
  const nowTime = new Date().toTimeString().split(" ")[0];

  switch (action) {

    // ── FÁBRICA → MOTORBOY ────────────────────────────────────────
    case "enviar_para_motoboy": {
      if (!motoboy_id) {
        return NextResponse.json({ error: "motoboy_id é obrigatório" }, { status: 400 });
      }

      const [saldoOrigem] = await sql`
        SELECT COALESCE(SUM(actual_qty), 0)::numeric AS saldo
        FROM alissonerp.stock_ledger_entry
        WHERE item_id = ${produto_id}::bigint
          AND item_type = 'produto'
          AND warehouse_id = ${FABRICA_WH}
          AND is_cancelled = false
      `;

      if (!saldoOrigem || Number(saldoOrigem.saldo) < quantidade) {
        return NextResponse.json(
          {
            error: "STOCK_INSUFFICIENT",
            message: `Saldo insuficiente na Fábrica. Disponível: ${saldoOrigem?.saldo ?? 0}`,
            disponivel: saldoOrigem?.saldo ?? 0,
            solicitado: quantidade,
          },
          { status: 409 }
        );
      }

      const result = await sql.begin(async (tx) => {
        const [saida] = await tx`
          INSERT INTO alissonerp.stock_ledger_entry
            (item_id, item_type, warehouse_id, actual_qty, voucher_type, obs, created_by, posting_date, posting_time)
          VALUES
            (${produto_id}::bigint, 'produto', ${FABRICA_WH}, ${-quantidade}, 'transferencia',
             ${`Motoboy:${motoboy_id} ${obs ?? ""}`}, ${user.id}::uuid, ${today}, ${nowTime})
          RETURNING id
        `;

        const [entrada] = await tx`
          INSERT INTO alissonerp.stock_ledger_entry
            (item_id, item_type, warehouse_id, actual_qty, voucher_type, voucher_id, obs, created_by, posting_date, posting_time)
          VALUES
            (${produto_id}::bigint, 'produto', ${MOTORBOY_WH}, ${quantidade}, 'transferencia',
             ${saida.id}, ${`Motoboy:${motoboy_id} ${obs ?? ""}`}, ${user.id}::uuid, ${today}, ${nowTime})
          RETURNING id
        `;

        return { saida_id: saida.id, entrada_id: entrada.id };
      });

      return NextResponse.json(
        {
          success: true,
          action: "enviar_para_motoboy",
          ...result,
        },
        { status: 201 }
      );
    }

    // ── MOTORBOY → LOJA ───────────────────────────────────────────
    case "receber_na_loja": {
      const [saldoMotoboy] = await sql`
        SELECT COALESCE(SUM(actual_qty), 0)::numeric AS saldo
        FROM alissonerp.stock_ledger_entry
        WHERE item_id = ${produto_id}::bigint
          AND item_type = 'produto'
          AND warehouse_id = ${MOTORBOY_WH}
          AND is_cancelled = false
      `;

      const emTransito = Number(saldoMotoboy?.saldo ?? 0);
      if (emTransito < quantidade) {
        return NextResponse.json(
          {
            error: "STOCK_NOT_IN_TRANSIT",
            message: `Item não está em custódia com o motoboy. Em custódia: ${emTransito}`,
            em_custodia: emTransito,
          },
          { status: 409 }
        );
      }

      const result = await sql.begin(async (tx) => {
        const [saida] = await tx`
          INSERT INTO alissonerp.stock_ledger_entry
            (item_id, item_type, warehouse_id, actual_qty, voucher_type, obs, created_by, posting_date, posting_time)
          VALUES
            (${produto_id}::bigint, 'produto', ${MOTORBOY_WH}, ${-quantidade}, 'transferencia',
             ${`Recebido Loja ${obs ?? ""}`}, ${user.id}::uuid, ${today}, ${nowTime})
          RETURNING id
        `;

        const [entrada] = await tx`
          INSERT INTO alissonerp.stock_ledger_entry
            (item_id, item_type, warehouse_id, actual_qty, voucher_type, voucher_id, obs, created_by, posting_date, posting_time)
          VALUES
            (${produto_id}::bigint, 'produto', ${LOJA_WH}, ${quantidade}, 'transferencia',
             ${saida.id}, ${`Recebido Loja ${obs ?? ""}`}, ${user.id}::uuid, ${today}, ${nowTime})
          RETURNING id
        `;

        return { saida_motoboy_id: saida.id, entrada_loja_id: entrada.id };
      });

      return NextResponse.json(
        {
          success: true,
          action: "receber_na_loja",
          ...result,
        },
        { status: 201 }
      );
    }

    default:
      return NextResponse.json(
        { error: `Ação inválida: ${action}. Use: enviar_para_motoboy | receber_na_loja` },
        { status: 400 }
      );
  }
}
