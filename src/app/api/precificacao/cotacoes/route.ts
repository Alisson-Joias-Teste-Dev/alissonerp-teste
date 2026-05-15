/**
 * GET /api/precificacao/cotacoes
 * Retorna cotações atuais: ouro (R$/g), dólar (R$), parâmetros completos.
 *
 * Fonte de verdade para precificação: public.parametros
 *   - ouro   = preço do ouro em R$/g usado pelos triggers
 *   - dollar = cotação do dólar usada para custo de pedras
 */

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";
import sql from "@/lib/db";

export async function GET() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const role = user.user_metadata?.role as string | undefined;
  if (!isFullAccess(role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  try {
    // public.parametros — fonte de verdade para triggers de precificação
    const [params] = await sql<{ ouro: string; dollar: string }[]>`
      SELECT ouro, dollar
      FROM public.parametros
      LIMIT 1
    `;

    return NextResponse.json({
      ouro_brl_g: Number(params?.ouro ?? 0),
      dollar_brl: Number(params?.dollar ?? 0),
      fator: 1,
      updated_at: null,
    });
  } catch (err) {
    console.error("[GET /api/precificacao/cotacoes]", err);
    return NextResponse.json({ error: "Erro ao buscar cotações" }, { status: 500 });
  }
}
