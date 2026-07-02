import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { internalError } from "@/lib/api-error";
import { logAudit } from "@/lib/audit";
import { ROLES_INVENTARIO_CONTAR, hasRole } from "@/lib/roles";
import { zodError, IdSchema } from "@/lib/schemas/common";

interface Params { params: Promise<{ id: string }> }

const FinalizarSchema = z.object({
  leituras: z.array(z.string().max(200)).max(10000).optional(),
  contagens: z.array(z.object({
    item_id: IdSchema,
    produto_id: IdSchema,
    quantidade_contada: z.number().nonnegative(),
  })).min(1, "contagens é obrigatório").max(10000),
  leitor_id: z.string().max(100).optional(),
});

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

  // BLINDAGEM: além da role, bloqueia usuário desativado (app RFID usa
  // Bearer token — sessão antiga de funcionário demitido não pode operar)
  const [usuario] = await sql`
    SELECT role, ativo FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario || !hasRole(usuario.role, ROLES_INVENTARIO_CONTAR)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }
  if (usuario.ativo === false) {
    return NextResponse.json({ error: "Usuário desativado" }, { status: 401 });
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
  // BLINDAGEM: inventário cancelado NÃO pode ser "ressuscitado" pelo app
  // RFID como concluído — cancelamento é decisão gerencial final.
  if (inv.status === "cancelado") {
    return NextResponse.json({ error: "Inventário cancelado" }, { status: 409 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = FinalizarSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;

  const leitorId = body.leitor_id ?? "TSL-1128-ANDROID";

  try {
    await sql.begin(async (tx: any) => {
      // 1. Atualizar contagens em batch (1 query em vez de N)
      const itemIds   = body.contagens.map(c => c.item_id);
      const quantidades = body.contagens.map(c => c.quantidade_contada);
      await tx`
        UPDATE alissonerp.itens_inventario_comercial AS t
        SET quantidade_contada = v.qtd::int,
            contado_por        = ${user.id}::uuid,
            contado_em         = now()
        FROM UNNEST(${itemIds}::int[], ${quantidades}::int[]) AS v(item_id, qtd)
        WHERE t.id = v.item_id AND t.inventario_id = ${invId}
      `;

      // 2. Registrar leituras EPC em batch
      if (body.leituras?.length) {
        const unicos = [...new Set(body.leituras)];
        const localNome = inv.local_nome;
        await tx`
          INSERT INTO alissonerp.joias_leituras
            (epc, evento, localizacao, inventario_id, leitor_id, operador, lido_em)
          SELECT
            v.epc, 'inventario', ${localNome}, ${invId}, ${leitorId}, ${user.id}::uuid, now()
          FROM UNNEST(${unicos}::text[]) AS v(epc)
        `;
      }

      // 3. Concluir inventário
      await tx`
        UPDATE alissonerp.inventarios_comercial
        SET status = 'concluido', data_conclusao = now(), concluido_por = ${user.id}
        WHERE id = ${invId}
      `;

      // Ajustes de estoque NAO sao gerados automaticamente — inventario e apenas auditoria

      // Trilha de auditoria: quem finalizou pelo app, quantos itens e leituras
      await logAudit(tx, {
        tabela: "inventarios_comercial",
        operacao: "UPDATE",
        registro_id: invId,
        usuario_id: user.id,
        dados_antes: { status: inv.status },
        dados_depois: {
          status: "concluido",
          origem: "app_rfid_finalizar",
          contagens: body.contagens.length,
          leituras: body.leituras?.length ?? 0,
          leitor_id: leitorId,
        },
      });
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
