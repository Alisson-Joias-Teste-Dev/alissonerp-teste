import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { isFullAccess } from "@/lib/roles";
import OrcamentoClient from "./OrcamentoClient";

export const dynamic = "force-dynamic";

const ROLES_ORCAMENTO = ["desenvolvedor", "admin", "gerente_loja", "gerente_fabrica", "consultora"] as const;

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

  // Buscar config de orçamento (tabela pode não existir se migration não rodou)
  let configRow = null;
  try {
    const rows = await sql`
      SELECT id, name, start_mkp, discount_percent, gold_price, camera_override,
             profile, pricing_categories, groove_rules, stone_markup, stone_prices,
             risco_width, risco_depth, preco_gravacao, stone_markups_table
      FROM alissonerp.config_orcamento
      WHERE name = 'default'
      LIMIT 1
    `;
    configRow = rows[0] ?? null;
  } catch {
    // tabela ainda não existe — usa defaults
  }

  const config = configRow ? {
    id: configRow.id as number,
    name: configRow.name as string,
    start_mkp: Number(configRow.start_mkp ?? 3.5),
    discount_percent: Number(configRow.discount_percent ?? 0),
    gold_price: Number(configRow.gold_price ?? 0),
    camera_override: configRow.camera_override ? Number(configRow.camera_override) : null,
    profile: (configRow.profile as string) ?? "Anatomica",
    pricing_categories: Array.isArray(configRow.pricing_categories) ? configRow.pricing_categories : [],
    groove_rules: Array.isArray(configRow.groove_rules) ? configRow.groove_rules : [],
    stone_markup: Number(configRow.stone_markup ?? 2.5),
    stone_prices: Array.isArray(configRow.stone_prices) ? configRow.stone_prices : [],
    risco_width: Number(configRow.risco_width ?? 0.1),
    risco_depth: Number(configRow.risco_depth ?? 0.2),
    preco_gravacao: Number(configRow.preco_gravacao ?? 100),
    stone_markups_table: (typeof configRow.stone_markups_table === "object" && configRow.stone_markups_table) ? configRow.stone_markups_table as Record<string, Record<string, number>> : {},
  } : null;

  // Pode gerenciar config: admin, desenvolvedor, gerente_loja
  const canManageConfig = isFullAccess(role) || role === "gerente_loja";

  return (
    <OrcamentoClient
      cotacaoOuro={cotacaoOuro}
      cotacaoDolar={cotacaoDolar}
      config={config}
      canManageConfig={canManageConfig}
      userName={String(caller.nome ?? "")}
      userId={user.id}
      vendedorId={caller.id_vendedor ? Number(caller.id_vendedor) : null}
      maxDesconto={Number(caller.mx_desconto_permitido ?? 0)}
    />
  );
}
