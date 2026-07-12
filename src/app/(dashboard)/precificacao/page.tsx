import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { isPrecificacaoAccess } from "@/lib/roles";
import { podeDecidir } from "@/lib/aprovacoes";
import PrecificacaoClient from "./PrecificacaoClient";
import sql from "@/lib/db";
import {
  normalizeConfigRow,
  normalizeCategoriaRow,
  type CurvaConfig,
  type CurvaCategoriaInput,
} from "@/lib/curva-precificacao";

export const dynamic = 'force-dynamic';

export default async function PrecificacaoPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Ler role do JWT metadata (mesmo padrão de /configuracoes)
  // user_profiles está em public (não alissonerp), então supabase.from() não funciona
  const role = user.user_metadata?.role as string | undefined;

  if (!isPrecificacaoAccess(role)) redirect("/");

  // REGRA DE NEGÓCIO: quem aprova é o(s) UUID(s) configurado(s) em Configurações ›
  // Aprovadores › "Precificação" (política config-first — 03b-config-first-estrito.md),
  // não mais um cargo fixo. Calculado aqui (server) e passado como prop pro client
  // decidir se mostra o botão "Aprovar" — sem isso, um aprovador configurado que não
  // seja admin/dev/diretor ficaria sem o botão (regressão de UX).
  const podeAprovarPrecificacao = (
    await podeDecidir({ id: user.id, role: role ?? null }, "precificacao")
  ).pode;

  // Server-side: buscar dados iniciais
  const [faixasPedrasRaw, configRaw, cotacoesRaw] = await Promise.all([
    sql`
      SELECT id, nome, tamanho_min, tamanho_max, unidade, markup, ativo
      FROM alissonerp.markup_pedras
      ORDER BY tamanho_min ASC
    `,
    sql<{ chave: string; valor: string }[]>`
      SELECT chave, valor
      FROM alissonerp.configuracoes_sistema
      WHERE chave IN ('preco_limiar_subir', 'preco_limiar_descer', 'preco_arredondamento')
    `,
    sql`
      SELECT ouro, dollar
      FROM public.parametros
      LIMIT 1
    `,
  ]);

  // A curva pode nao existir ainda (se a migration 144 nao foi aplicada).
  // Degrada com graca: passa null/[] e a UI mostra valores padrao.
  let curvaConfigRaw: readonly Record<string, unknown>[] = [];
  let curvaCategoriasRaw: readonly Record<string, unknown>[] = [];
  try {
    curvaConfigRaw = (await sql`
      SELECT start_mkp, start_commission, gold_cost_percentage,
             sucata_compra_min_pct, sucata_compra_max_pct, arredondamento
      FROM alissonerp.curva_config WHERE id = 1
    `) as unknown as readonly Record<string, unknown>[];
    curvaCategoriasRaw = (await sql`
      SELECT id, nome, max_weight, variation, comm_variation, max_discount, ativo, ordem
      FROM alissonerp.curva_categorias
      ORDER BY ordem ASC
    `) as unknown as readonly Record<string, unknown>[];
  } catch {
    console.warn("[precificacao/page] curva_config/curva_categorias ainda não existem — aplicar migration 144");
  }

  const config: Record<string, string> = {
    preco_limiar_subir: "2",
    preco_limiar_descer: "5",
    preco_arredondamento: "dezena",
  };
  for (const r of configRaw) config[r.chave] = r.valor;

  const [cotacao] = cotacoesRaw as unknown as { ouro: string; dollar: string }[];

  const curvaConfig: CurvaConfig | null = curvaConfigRaw[0]
    ? normalizeConfigRow(curvaConfigRaw[0])
    : null;

  const curvaCategorias: CurvaCategoriaInput[] = curvaCategoriasRaw.map((r) => normalizeCategoriaRow(r));

  return (
    <PrecificacaoClient
      faixasPedrasInicial={faixasPedrasRaw as unknown as FaixaPedra[]}
      configInicial={config}
      cotacaoInicial={{
        ouro_brl_g: Number(cotacao?.ouro ?? 0),
        dollar_brl: Number(cotacao?.dollar ?? 0),
        fator: 1,
        updated_at: null,
      }}
      currentUserId={user.id}
      currentUserRole={role ?? ""}
      podeAprovarPrecificacao={podeAprovarPrecificacao}
      curvaConfigInicial={curvaConfig}
      curvaCategoriasInicial={curvaCategorias}
    />
  );
}

export interface FaixaPedra {
  id: number;
  nome: string;
  tamanho_min: string;
  tamanho_max: string;
  unidade: string;
  markup: string;
  ativo: boolean;
}
