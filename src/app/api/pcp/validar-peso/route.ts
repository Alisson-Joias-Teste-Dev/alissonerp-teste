import { NextRequest, NextResponse } from "next/server";
import { validarPesoBalanca } from "@/lib/ia-validar-peso";
import { createServerSupabase } from "@/lib/supabase/server";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

// POST /api/pcp/validar-peso
// Body (FormData):
//   tipo = 'metal' (default) | 'pedra'
//   file = imagem
//   peso = string (gramas) — peso digitado (metal) ou peso calculado qtd×peso_pedra (pedra, modo_ct=false)
//   peso_ct = string (quilates) — peso em ct (pedra, modo_ct=true)
//             Se peso_ct fornecido + tipo=pedra → IA lê ct da balança diretamente
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  // Mesma janela do /api/ia/validar-peso (10/min, 100/hora por user).
  try {
    rateLimit(`pcp-validar-peso:min:${user.id}`, 10, 60_000);
    rateLimit(`pcp-validar-peso:hour:${user.id}`, 100, 60 * 60_000);
  } catch (e) {
    const r = rateLimitResponse(e);
    if (r) return r;
    throw e;
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const tipo = (formData.get("tipo") as string | null) ?? "metal";

  if (!file) {
    return NextResponse.json({ error: "Foto obrigatória" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString("base64");
  const mediaType = file.type || "image/jpeg";

  // Sprint 3: para tipo=pedra, aceitar peso_ct (quilates) além de peso (gramas)
  const pesoCTStr = formData.get("peso_ct") as string | null;
  const pesoStr   = formData.get("peso")    as string | null;

  let pesoNum: number;
  let modoCT = false;

  if (tipo === "pedra" && pesoCTStr) {
    // Modo CT: IA vai ler ct da balança
    const ct = parseFloat(pesoCTStr.replace(",", "."));
    if (isNaN(ct) || ct <= 0) {
      return NextResponse.json({ error: "peso_ct inválido" }, { status: 400 });
    }
    pesoNum = ct;
    modoCT  = true;
  } else {
    if (!pesoStr) return NextResponse.json({ error: "Peso obrigatório" }, { status: 400 });
    const p = parseFloat(pesoStr.replace(",", "."));
    if (isNaN(p) || p <= 0) {
      return NextResponse.json({ error: "Peso inválido" }, { status: 400 });
    }
    pesoNum = p;
  }

  const resultado = await validarPesoBalanca(
    base64,
    mediaType,
    pesoNum,
    tipo === "pedra" ? "pedra" : "metal",
    modoCT
  );
  return NextResponse.json(resultado);
}
