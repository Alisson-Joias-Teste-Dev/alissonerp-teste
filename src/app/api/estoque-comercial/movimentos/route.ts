import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { zodError } from "@/lib/schemas/common";

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

  // BLINDAGEM (v2.81.3): BAIXA MANUAL DE ESTOQUE NÃO EXISTE — para NINGUÉM,
  // nem admin/desenvolvedor (regra do Jonathan). Saída de estoque só pelos
  // fluxos rastreáveis: entrega de venda (reserva→saída) e desfecho blindado
  // da pendência de inventário (motivo + validação + auditoria).
  // IMPACTO SE REMOVIDO: reabre porta para sumir peça com uma chamada de API.
  if (tipo === "saida") {
    return NextResponse.json(
      { error: "Baixa manual de estoque é bloqueada para todos — use a entrega da venda ou o desfecho de pendência do inventário" },
      { status: 403 },
    );
  }

  // Detectar se coluna local_estoque_id existe na tabela
  const [hasLocalCol] = await sql`
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'alissonerp'
      AND table_name = 'movimentacoes_estoque_comercial'
      AND column_name = 'local_estoque_id'
    LIMIT 1
  `;

  // (Checagem de saldo de saída removida: saída manual é bloqueada acima
  //  para todos — este endpoint só registra ENTRADA manual. v2.81.3)

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
