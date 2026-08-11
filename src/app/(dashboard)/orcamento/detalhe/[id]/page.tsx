import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { isFullAccess } from "@/lib/roles";
import OrcamentoDetalheClient from "./OrcamentoDetalheClient";
import { loadOrcamentoConfig } from "@/lib/orcamento-config";
import { normalizeConfigRow, normalizeCategoriaRow, type CurvaConfig, type CurvaCategoriaInput } from "@/lib/curva-precificacao";
import { ROLES_ORCAMENTO } from "@/lib/orcamento-shared";
import { calcularTetoDesconto, FULL_ACCESS_ROLES_DESCONTO } from "@/lib/desconto/precificar-item";
import { buscarFallbackDescontoSemCadastro } from "@/lib/aprovacao-regras";

export const dynamic = "force-dynamic";

export default async function OrcamentoDetalhePage({ params }: { params: Promise<{ id: string }> }) {
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

  const { id } = await params;
  const orcId = Number(id);
  if (isNaN(orcId)) notFound();

  const [orc] = await sql`
    SELECT o.*,
           v.numero_pedido AS venda_numero_pedido,
           ord.numero_ordem AS ordem_numero
    FROM alissonerp.orcamentos o
    LEFT JOIN public.vendas v ON v.id = o.venda_gerada_id
    LEFT JOIN alissonerp.ordens ord ON ord.id = o.ordem_gerada_id
    WHERE o.id = ${orcId}
    LIMIT 1
  `;
  if (!orc) notFound();

  // Restrict consultora to own orcamentos
  if (role === "consultora" && orc.usuario_id !== user.id) redirect("/orcamento");

  // Fetch ficha técnica
  let ficha = null;
  if (orc.ficha_tecnica_id) {
    const [ft] = await sql`SELECT * FROM alissonerp.orcamento_fichas_tecnicas WHERE id = ${orc.ficha_tecnica_id}`;
    ficha = ft ?? null;
  }

  // Fetch ficha técnica 2 — só se quantidade=2 ASSEGURADA. Bug #15: orçamentos
  // antigos podiam ter ficha_tecnica_2_id setado com quantidade=1 (ou vice-versa)
  // devido a regressões pré-v2.42.2. Carregar a ficha2 nesses casos confundia
  // a UI (exibia par mesmo sendo unidade).
  let ficha2 = null;
  const qtdOrc = Number(orc.quantidade ?? 1);
  if (orc.ficha_tecnica_2_id && qtdOrc === 2) {
    const [ft2] = await sql`SELECT * FROM alissonerp.orcamento_fichas_tecnicas WHERE id = ${orc.ficha_tecnica_2_id}`;
    ficha2 = ft2 ?? null;
  }
  // Normaliza no objeto que vai pro client — evita pares órfãos.
  const orcamento = {
    ...orc,
    quantidade: qtdOrc === 2 && ficha2 ? 2 : 1,
    ficha_tecnica_2_id: qtdOrc === 2 && ficha2 ? orc.ficha_tecnica_2_id : null,
    ficha,
    ficha2,
  };

  // Cotações
  const [paramRow] = await sql`SELECT ouro, dollar FROM public.parametros LIMIT 1`;
  const cotacaoOuro = Number(paramRow?.ouro ?? 0);
  const cotacaoDolar = Number(paramRow?.dollar ?? 5.80);

  const config = await loadOrcamentoConfig();

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

  let curvaConfig: CurvaConfig | null = null;
  let curvaCategorias: CurvaCategoriaInput[] = [];
  try {
    const [cfgRow] = await sql`SELECT * FROM alissonerp.curva_config WHERE id = 1 LIMIT 1`;
    if (cfgRow) curvaConfig = normalizeConfigRow(cfgRow);
    const catRows = await sql`SELECT * FROM alissonerp.curva_categorias WHERE ativo = true ORDER BY ordem`;
    curvaCategorias = catRows.map((r) => normalizeCategoriaRow(r));
  } catch { /* tabelas podem não existir */ }

  return (
    <OrcamentoDetalheClient
      orcamento={orcamento}
      role={role}
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
