import { createServerSupabase } from "@/lib/supabase/server";
import sql from "@/lib/db";
import VendaDetalheClient from "./VendaDetalheClient";
import { normalizeConfigRow, normalizeCategoriaRow, type CurvaConfig, type CurvaCategoriaInput } from "@/lib/curva-precificacao";

interface Props {
  params: Promise<{ id: string }>;
}

const FULL_ACCESS = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja", "financeiro"];

export default async function VendaDetalhePage({ params }: Props) {
  const { id } = await params;

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  let role        = "consultora";
  let vendedorId: number | null = null;
  let maxDesconto = 15;

  if (user) {
    const [u] = await sql`
      SELECT role, vendedor_id, mx_desconto_permitido
      FROM alissonerp.usuarios
      WHERE id = ${user.id}::uuid
      LIMIT 1
    `;
    if (u) {
      role       = u.role as string;
      vendedorId = u.vendedor_id ? Number(u.vendedor_id) : null;

      const SUPER = ["desenvolvedor", "admin"];
      if (SUPER.includes(role)) {
        maxDesconto = 100;
      } else if (u.mx_desconto_permitido != null && Number(u.mx_desconto_permitido) > 0) {
        maxDesconto = Number(u.mx_desconto_permitido);
      } else {
        const FULL_ROLES = ["gerente_fabrica", "financeiro"];
        if (FULL_ROLES.includes(role)) maxDesconto = 30;
        else if (role === "gerente_loja") maxDesconto = 50;
        else maxDesconto = 15;
      }
    }
  }

  const descontoAuthThreshold = role === "gerente_loja" ? 30 : undefined;

  // Carrega curva de precificação pra permitir comissão por mkp em itens vindos
  // de orçamento (alianças/peças com `markup_aplicado` preenchido).
  let curvaConfig: CurvaConfig | null = null;
  let curvaCategorias: CurvaCategoriaInput[] = [];
  try {
    const [cfgRow] = await sql`SELECT * FROM alissonerp.curva_config WHERE id = 1 LIMIT 1`;
    if (cfgRow) curvaConfig = normalizeConfigRow(cfgRow);
    const catRows = await sql`SELECT * FROM alissonerp.curva_categorias WHERE ativo = true ORDER BY ordem`;
    curvaCategorias = catRows.map((r) => normalizeCategoriaRow(r));
  } catch {
    // tabelas ausentes — frontend cai no fallback faixas_comissao
  }

  return (
    <VendaDetalheClient
      vendaId={Number(id)}
      role={role}
      vendedorId={vendedorId}
      isFullAccess={FULL_ACCESS.includes(role)}
      maxDesconto={maxDesconto}
      descontoAuthThreshold={descontoAuthThreshold}
      curvaConfig={curvaConfig}
      curvaCategorias={curvaCategorias}
    />
  );
}
