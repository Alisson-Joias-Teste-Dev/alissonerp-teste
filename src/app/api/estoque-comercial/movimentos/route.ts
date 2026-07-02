import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { zodError } from "@/lib/schemas/common";
import { ROLES_BAIXA_MANUAL, hasRole } from "@/lib/roles";

const ROLES_PERMITIDOS = [
  "desenvolvedor", "admin", "gerente_fabrica", "gerente_loja",
  "estoquista_fabrica", "estoquista_loja"
];

const MovimentoPostSchema = z.object({
  produto_id: z.coerce.number().int().positive(),
  tipo: z.enum(["entrada", "saida"]),
  quantidade: z.coerce.number().positive(),
  motivo: z.string().min(1, "obrigatório"),
  local_estoque_id: z.coerce.number().int().optional(),
  observacao: z.string().optional(),
}).passthrough();

// POST /api/estoque-comercial/movimentos
// Registra uma movimentação (entrada ou saída) manual
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  if (!usuario || !ROLES_PERMITIDOS.includes(usuario.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = MovimentoPostSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;
  const { produto_id, tipo, quantidade, motivo, observacao } = body;

  // BLINDAGEM (v2.81.2): BAIXA manual (saída) é caso excepcional — SOMENTE
  // admin/desenvolvedor. Estoquista/gerente registram entrada, mas a baixa
  // normal acontece pelos fluxos (entrega de venda etc), nunca na mão.
  if (tipo === "saida" && !hasRole(usuario.role, ROLES_BAIXA_MANUAL)) {
    return NextResponse.json({ error: "Baixa manual de estoque é exclusiva do administrador" }, { status: 403 });
  }

  // Detectar se coluna local_estoque_id existe na tabela
  const [hasLocalCol] = await sql`
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'alissonerp'
      AND table_name = 'movimentacoes_estoque_comercial'
      AND column_name = 'local_estoque_id'
    LIMIT 1
  `;

  // Verificar saldo ao sair
  if (tipo === "saida") {
    if (hasLocalCol) {
      const local_estoque_id = body.local_estoque_id ?? 2;
      const [saldo] = await sql`
        SELECT COALESCE(SUM(
          CASE WHEN tipo = 'entrada' THEN quantidade ELSE -quantidade END
        ), 0) AS disponivel
        FROM alissonerp.movimentacoes_estoque_comercial
        WHERE produto_id = ${produto_id}
          AND local_estoque_id = ${local_estoque_id}
          AND status = 'efetivado'
      `;
      if (Number(saldo?.disponivel ?? 0) < quantidade) {
        return NextResponse.json(
          { error: `Saldo disponível insuficiente. Disponível: ${saldo?.disponivel ?? 0}` },
          { status: 409 }
        );
      }
    } else {
      const [saldo] = await sql`
        SELECT COALESCE(saldo, 0) AS saldo
        FROM alissonerp.vw_saldo_estoque_comercial
        WHERE produto_id = ${produto_id}
      `;
      if (!saldo || Number(saldo.saldo) < quantidade) {
        return NextResponse.json(
          { error: `Saldo insuficiente. Disponível: ${saldo?.saldo ?? 0}` },
          { status: 409 }
        );
      }
    }
  }

  // INSERT com ou sem colunas v2
  if (hasLocalCol) {
    const local_estoque_id = body.local_estoque_id ?? 2;
    const [mov] = await sql`
      INSERT INTO alissonerp.movimentacoes_estoque_comercial
        (produto_id, tipo, quantidade, motivo, local_estoque_id, status, observacao, created_by)
      VALUES
        (${produto_id}, ${tipo}, ${quantidade}, ${motivo}, ${local_estoque_id}, 'efetivado', ${observacao ?? null}, ${user.id})
      RETURNING id, created_at
    `;
    return NextResponse.json({ id: mov.id, created_at: mov.created_at }, { status: 201 });
  } else {
    const [mov] = await sql`
      INSERT INTO alissonerp.movimentacoes_estoque_comercial
        (produto_id, tipo, quantidade, motivo, observacao, created_by)
      VALUES
        (${produto_id}, ${tipo}, ${quantidade}, ${motivo}, ${observacao ?? null}, ${user.id})
      RETURNING id, created_at
    `;
    return NextResponse.json({ id: mov.id, created_at: mov.created_at }, { status: 201 });
  }
}
