import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

// POST /api/estoque/transferir-local
// Transferência de insumo entre locais de estoque (Fábrica ↔ Loja).
// Gera CE dupla-entrada: saída no local origem + entrada no local destino.
// Body: { insumo_id, quantidade, local_origem_id, local_destino_id, obs? }
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [caller] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  const ROLES_PERMITIDAS = ["admin", "desenvolvedor", "gerente_fabrica"];
  if (!caller || !ROLES_PERMITIDAS.includes(caller.role as string)) {
    return NextResponse.json({ error: "Sem permissão — requer admin, desenvolvedor ou gerente_fabrica" }, { status: 403 });
  }

  const { insumo_id, quantidade, local_origem_id, local_destino_id, obs } =
    await req.json() as {
      insumo_id: number;
      quantidade: number;
      local_origem_id: number;
      local_destino_id: number;
      obs?: string | null;
    };

  // Validação básica
  if (!insumo_id || !quantidade || !local_origem_id || !local_destino_id) {
    return NextResponse.json(
      { error: "insumo_id, quantidade, local_origem_id e local_destino_id são obrigatórios" },
      { status: 400 },
    );
  }
  if (quantidade <= 0) {
    return NextResponse.json({ error: "quantidade deve ser maior que zero" }, { status: 400 });
  }
  if (local_origem_id === local_destino_id) {
    return NextResponse.json({ error: "local_origem_id e local_destino_id devem ser diferentes" }, { status: 400 });
  }

  // Verificar que ambos os locais existem e estão ativos
  const locais = await sql`
    SELECT id, nome, ativo FROM alissonerp.locais_estoque
    WHERE id IN (${local_origem_id}, ${local_destino_id})
  `;
  if (locais.length < 2) {
    return NextResponse.json({ error: "Um ou ambos os locais não foram encontrados" }, { status: 404 });
  }
  const origemRow  = locais.find((l) => Number(l.id) === local_origem_id);
  const destinoRow = locais.find((l) => Number(l.id) === local_destino_id);
  if (!origemRow?.ativo) {
    return NextResponse.json({ error: `Local origem (id=${local_origem_id}) está inativo` }, { status: 400 });
  }
  if (!destinoRow?.ativo) {
    return NextResponse.json({ error: `Local destino (id=${local_destino_id}) está inativo` }, { status: 400 });
  }

  // Verificar se é pedra — pedras vêm em ct, converter para gramas (1ct = 0.2g)
  const [insumoRow] = await sql`
    SELECT categoria_id FROM alissonerp.insumos WHERE id = ${insumo_id}
  `;
  const isPedra = insumoRow?.categoria_id === 2;
  const pesoGramas = isPedra ? quantidade * 0.2 : quantidade;

  // Verificar saldo suficiente no local de origem (em gramas)
  const saldoRows = await sql`
    SELECT COALESCE(SUM(COALESCE(entrada, 0)), 0) - COALESCE(SUM(COALESCE(saida, 0)), 0) AS saldo
    FROM alissonerp.movimentacoes_estoque
    WHERE insumo_id = ${insumo_id}
      AND deposito_id = 1
      AND local_estoque_id = ${local_origem_id}
  `;
  const saldo = Number(saldoRows[0]?.saldo ?? 0);
  if (saldo < pesoGramas) {
    const dispLabel = isPedra ? `${(saldo / 0.2).toFixed(4)} ct` : `${saldo.toFixed(4)} g`;
    const solLabel  = isPedra ? `${quantidade.toFixed(4)} ct` : `${quantidade.toFixed(4)} g`;
    return NextResponse.json(
      { error: `Saldo insuficiente no local origem. Disponível: ${dispLabel}, solicitado: ${solLabel}` },
      { status: 422 },
    );
  }

  const obsText = obs?.trim() || `Transferência local: ${origemRow.nome} → ${destinoRow.nome}`;

  // CE dupla — marcador 'TA' (Transferência Avulsa, mais próximo disponível no enum)
  // Saída do local origem
  await sql`
    INSERT INTO alissonerp.movimentacoes_estoque
      (insumo_id, saida, deposito_id, local_estoque_id, marcador, obs)
    VALUES
      (${insumo_id}, ${pesoGramas}::real, 1, ${local_origem_id},
       'TA'::alissonerp.enum_marcador_estoque, ${obsText})
  `;

  // Entrada no local destino
  await sql`
    INSERT INTO alissonerp.movimentacoes_estoque
      (insumo_id, entrada, deposito_id, local_estoque_id, marcador, obs)
    VALUES
      (${insumo_id}, ${pesoGramas}::real, 1, ${local_destino_id},
       'TA'::alissonerp.enum_marcador_estoque, ${obsText})
  `;

  return NextResponse.json({
    ok: true,
    insumo_id,
    quantidade,
    local_origem_id,
    local_destino_id,
    obs: obsText,
  });
}
