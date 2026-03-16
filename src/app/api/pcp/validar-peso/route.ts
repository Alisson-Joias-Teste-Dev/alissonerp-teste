import { NextRequest, NextResponse } from "next/server";
import { validarPesoBalanca } from "@/lib/ia-validar-peso";

// POST /api/pcp/validar-peso
// Body (FormData):
//   tipo = 'metal' (default) | 'pedra'
//   file = imagem
//   peso = string (gramas) — peso digitado (metal) ou peso calculado qtd×peso_pedra (pedra)
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const tipo = (formData.get("tipo") as string | null) ?? "metal";

  if (!file) {
    return NextResponse.json({ error: "Foto obrigatória" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString("base64");
  const mediaType = file.type || "image/jpeg";

  const pesoStr = formData.get("peso") as string | null;
  if (!pesoStr) return NextResponse.json({ error: "Peso obrigatório" }, { status: 400 });
  const pesoNum = parseFloat(pesoStr.replace(",", "."));
  if (isNaN(pesoNum) || pesoNum <= 0) {
    return NextResponse.json({ error: "Peso inválido" }, { status: 400 });
  }

  const resultado = await validarPesoBalanca(
    base64,
    mediaType,
    pesoNum,
    tipo === "pedra" ? "pedra" : "metal"
  );
  return NextResponse.json(resultado);
}
