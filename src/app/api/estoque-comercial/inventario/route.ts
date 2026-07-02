import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";
import { ROLE_OPERADOR_INVENTARIO, ROLES_INVENTARIO_GERENTES, ROLES_INVENTARIO_VER, hasRole } from "@/lib/roles";
import { executarAbrirInventario, InventarioAcaoError } from "@/lib/inventario-acoes";
import { criarSolicitacaoInventario } from "@/lib/inventario-solicitacoes";
import { zodError } from "@/lib/schemas/common";

const InventarioPostSchema = z.object({
  local_estoque_id: z.coerce.number().int().positive(),
  obs: z.string().optional(),
  categoria: z.string().optional(),
}).passthrough();

// GET /api/estoque-comercial/inventario — listar inventários
// BLINDAGEM: restrito às roles de estoque/gerência — quantidades do
// estoque comercial não são dado público interno.
export async function GET(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!hasRole(user.role, ROLES_INVENTARIO_VER)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const rows = await sql`
    SELECT
      i.id, i.local_estoque_id, le.nome AS local_nome,
      i.status, i.obs, i.data_abertura, i.data_conclusao,
      i.created_at, i.categoria,
      uc.email AS criado_por_email,
      uf.email AS concluido_por_email,
      (SELECT COUNT(*) FROM alissonerp.itens_inventario_comercial WHERE inventario_id = i.id) AS total_itens,
      (SELECT COUNT(*) FROM alissonerp.itens_inventario_comercial WHERE inventario_id = i.id AND quantidade_contada IS NOT NULL) AS itens_contados,
      (SELECT COUNT(*) FROM alissonerp.itens_inventario_comercial WHERE inventario_id = i.id AND diferenca != 0) AS itens_divergentes
    FROM alissonerp.inventarios_comercial i
    LEFT JOIN alissonerp.locais_estoque le ON le.id = i.local_estoque_id
    LEFT JOIN auth.users uc ON uc.id = i.created_by
    LEFT JOIN auth.users uf ON uf.id = i.concluido_por
    ORDER BY
      CASE i.status WHEN 'aberto' THEN 0 WHEN 'em_contagem' THEN 1 ELSE 2 END,
      i.created_at DESC
    LIMIT 50
  `;

  return NextResponse.json(rows);
}

// POST /api/estoque-comercial/inventario — abrir novo inventário
export async function POST(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;

  const isOperador = user.role === ROLE_OPERADOR_INVENTARIO;
  if (!isOperador && !hasRole(user.role, ROLES_INVENTARIO_GERENTES)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = InventarioPostSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { local_estoque_id, obs, categoria } = parsed.data;

  try {
    /**
     * OPERADOR DE INVENTÁRIO (v2.83.0): não abre direto — o pedido vira
     * tarefa de aprovação do administrador; só executa quando ele aprovar.
     */
    if (isOperador) {
      const [local] = await sql`SELECT nome FROM alissonerp.locais_estoque WHERE id = ${local_estoque_id}`;
      const resumo = [
        `Ação: ABRIR inventário`,
        `Local: ${local?.nome ?? local_estoque_id}`,
        categoria?.trim() ? `Categoria: ${categoria.trim()}` : null,
        obs ? `Obs: ${obs}` : null,
        "",
        "Ao aprovar, o sistema abre o inventário e gera a lista de contagem (peça pronta).",
      ].filter(Boolean).join("\n");
      const solic = await criarSolicitacaoInventario({
        tipoAcao: "abrir",
        payload: { local_estoque_id, obs: obs ?? null, categoria: categoria ?? null },
        resumo,
        user,
      });
      return NextResponse.json(
        { solicitado: true, ...solic, mensagem: "Pedido enviado para aprovação do administrador" },
        { status: 202 },
      );
    }

    const inv = await executarAbrirInventario({ local_estoque_id, obs, categoria, userId: user.id });
    return NextResponse.json({ id: inv.id, created_at: inv.created_at }, { status: 201 });
  } catch (e) {
    if (e instanceof InventarioAcaoError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
