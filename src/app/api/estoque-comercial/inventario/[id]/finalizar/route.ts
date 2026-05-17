import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { gerarAjustesDivergencias } from "@/lib/inventario-helpers";
import { internalError } from "@/lib/api-error";

interface Params { params: Promise<{ id: string }> }

const ROLES_CONTAR = [
  "desenvolvedor", "admin", "gerente_fabrica", "gerente_loja",
  "estoquista_fabrica", "estoquista_loja",
];

export async function POST(req: NextRequest, { params }: Params) {
  const supabase = await createServerSupabase();

  const authHeader = (await headers()).get("authorization");
  let user = null;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    const { data } = await supabase.auth.getUser(token);
    user = data.user;
  } else {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  }

  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario || !ROLES_CONTAR.includes(usuario.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const invId = Number(id);

  const [inv] = await sql`
    SELECT i.id, i.status, i.local_estoque_id, le.nome AS local_nome
    FROM alissonerp.inventarios_comercial i
    JOIN alissonerp.locais_estoque le ON le.id = i.local_estoque_id
    WHERE i.id = ${invId}
  `;
  if (!inv) return NextResponse.json({ error: "Inventário não encontrado" }, { status: 404 });
  if (inv.status === "concluido") {
    return NextResponse.json({ error: "Inventário já concluído" }, { status: 409 });
  }

  const body = await req.json() as {
    leituras?: string[];
    contagens: Array<{ item_id: number; produto_id: number; quantidade_contada: number }>;
    leitor_id?: string;
  };

  if (!body.contagens?.length) {
    return NextResponse.json({ error: "contagens é obrigatório" }, { status: 400 });
  }

  const leitorId = body.leitor_id ?? "TSL-1128-ANDROID";

  try {
    await sql.begin(async (tx: any) => {
      // 1. Atualizar contagens dos itens
      for (const c of body.contagens) {
        await tx`
          UPDATE alissonerp.itens_inventario_comercial
          SET quantidade_contada = ${c.quantidade_contada},
              diferenca = ${c.quantidade_contada} - quantidade_sistema,
              contado_por = ${user.id}::uuid,
              contado_em = now()
          WHERE id = ${c.item_id} AND inventario_id = ${invId}
        `;
      }

      // 2. Registrar leituras EPC no histórico
      if (body.leituras?.length) {
        const unicos = [...new Set(body.leituras)];
        for (const epc of unicos) {
          await tx`
            INSERT INTO alissonerp.joias_leituras
              (epc, evento, localizacao, leitor_id, operador, lido_em)
            VALUES
              (${epc}, 'inventario', ${inv.local_nome}, ${leitorId}, ${user.id}::uuid, now())
          `;
        }
      }

      // 3. Concluir inventário
      await tx`
        UPDATE alissonerp.inventarios_comercial
        SET status = 'concluido', data_conclusao = now(), concluido_por = ${user.id}
        WHERE id = ${invId}
      `;

      // 4. Gerar ajustes de estoque para divergências
      await gerarAjustesDivergencias(tx, invId, inv.local_estoque_id, user.id);
    });

    return NextResponse.json({
      ok: true,
      inventario_id: invId,
      mensagem: "Inventário concluído com sucesso",
    });
  } catch (err) {
    return internalError(`[POST /api/estoque-comercial/inventario/${invId}/finalizar]`, err);
  }
}
