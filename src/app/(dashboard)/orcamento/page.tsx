import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { isFullAccess } from "@/lib/roles";
import OrcamentoClient from "./OrcamentoClient";
import { loadOrcamentoConfig } from "@/lib/orcamento-config";
import { normalizeConfigRow, normalizeCategoriaRow, type CurvaConfig, type CurvaCategoriaInput } from "@/lib/curva-precificacao";
import { ROLES_ORCAMENTO } from "@/lib/orcamento-shared";
import { calcularTetoDesconto, FULL_ACCESS_ROLES_DESCONTO } from "@/lib/desconto/precificar-item";
import { buscarFallbackDescontoSemCadastro } from "@/lib/aprovacao-regras";

export const dynamic = "force-dynamic";

export default async function OrcamentoPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [caller] = await sql`
    SELECT u.role, u.nome, u.deposito_id, u.mx_desconto_permitido,
           v.id_vendedor
    FROM alissonerp.usuarios u
    LEFT JOIN public.vendedores v ON v.email = u.email
    WHERE u.id = ${user.id}::uuid
  `;
  if (!caller) redirect("/login");

  const role = caller.role as string;
  const hasAccess = isFullAccess(role) || ROLES_ORCAMENTO.includes(role as typeof ROLES_ORCAMENTO[number]);
  if (!hasAccess) redirect("/");

  // Buscar cotações
  const [params] = await sql`SELECT ouro, dollar FROM public.parametros LIMIT 1`;
  const cotacaoOuro = Number(params?.ouro ?? 0);
  const cotacaoDolar = Number(params?.dollar ?? 5.80);

  const config = await loadOrcamentoConfig();

  // Pode gerenciar config: admin, desenvolvedor, gerente_loja
  const canManageConfig = isFullAccess(role) || role === "gerente_loja";

  // REGRA DE NEGÓCIO (Fase 5, 15/07): FONTE ÚNICA — antes era
  // `Number(caller.mx_desconto_permitido ?? 0)` sem NENHUM fallback de cargo,
  // travando admin sem cadastro em 0% no slider. Agora usa calcularTetoDesconto
  // (mesma função do gate real em aprovacao-regras.ts), com admin/desenvolvedor
  // full-access = 100% e fallback configurável pra quem não tem cadastro.
  const fallbackDesconto = await buscarFallbackDescontoSemCadastro();
  const maxDesconto = calcularTetoDesconto(
    caller.mx_desconto_permitido != null ? Number(caller.mx_desconto_permitido) : null,
    role,
    FULL_ACCESS_ROLES_DESCONTO,
    fallbackDesconto,
  );

  // ── Curva dinâmica de precificação (para peças personalizadas) ──────────
  let curvaConfig: CurvaConfig | null = null;
  let curvaCategorias: CurvaCategoriaInput[] = [];
  try {
    const [cfgRow] = await sql`SELECT * FROM alissonerp.curva_config WHERE id = 1 LIMIT 1`;
    if (cfgRow) curvaConfig = normalizeConfigRow(cfgRow);
    const catRows = await sql`SELECT * FROM alissonerp.curva_categorias WHERE ativo = true ORDER BY ordem`;
    curvaCategorias = catRows.map((r) => normalizeCategoriaRow(r));
  } catch {
    // tabelas podem não existir ainda
  }

  return (
    <OrcamentoClient
      cotacaoOuro={cotacaoOuro}
      cotacaoDolar={cotacaoDolar}
      config={config}
      canManageConfig={canManageConfig}
      userName={String(caller.nome ?? "")}
      userId={user.id}
      vendedorId={caller.id_vendedor ? Number(caller.id_vendedor) : null}
      maxDesconto={maxDesconto}
      curvaConfig={curvaConfig}
      curvaCategorias={curvaCategorias}
    />
  );
}
