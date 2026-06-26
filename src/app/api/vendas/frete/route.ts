import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

// ─── GET /api/vendas/frete?bairro=X&municipio=Y ───────────────────────────────
// Busca o valor de frete pelo bairro+municipio.
// Se não encontrar: retorna { valor: null, personalizado: true }
// Se encontrar:     retorna { id, bairro, municipio, valor, personalizado: false }
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const bairro    = searchParams.get("bairro")?.trim();
  const municipio = searchParams.get("municipio")?.trim() ?? "Fortaleza";

  if (!bairro) {
    return NextResponse.json({ error: "bairro é obrigatório" }, { status: 400 });
  }

  const [frete] = await sql`
    SELECT id, bairro, municipio, valor
    FROM alissonerp.fretes_bairro
    WHERE bairro    ILIKE ${bairro}
      AND municipio ILIKE ${municipio}
      AND ativo = true
    LIMIT 1
  `;

  if (!frete) {
    return NextResponse.json({ valor: null, personalizado: true });
  }

  return NextResponse.json({
    id:          frete.id,
    bairro:      frete.bairro,
    municipio:   frete.municipio,
    valor:       Number(frete.valor),
    personalizado: false,
  });
}
