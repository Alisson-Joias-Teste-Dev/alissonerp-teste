import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { gerarZplEtiquetaJoia, imprimirZplDireto } from "@/lib/rfid-zpl";
import { internalError } from "@/lib/api-error";

// POST /api/rfid/imprimir
// Body: { produto_id: number, tipo?: string }
//   tipo: "gerar" (só gera ZPL) | "imprimir" (gera + envia pra impressora)
//
// Gera novo EPC, cria registro RFID e imprime etiqueta
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [u] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!u || !["admin", "desenvolvedor", "gerente_fabrica", "gerente_loja"].includes(u.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const body = await req.json() as { produto_id?: number; tipo?: string };
  const produtoId = body.produto_id;
  if (!produtoId) {
    return NextResponse.json({ error: "produto_id obrigatório" }, { status: 400 });
  }

  const [prod] = await sql`
    SELECT id_produto, sku, nome FROM public.produtos WHERE id_produto = ${produtoId}::bigint
  `;
  if (!prod) return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 });

  // Gera novo EPC (sequencial)
  const [{ prox }] = await sql`
    SELECT COALESCE(MAX(SUBSTRING(epc FROM 5)::int), 0) + 1 AS prox
    FROM alissonerp.joias_rfid WHERE epc ~ '^AJ26[0-9]{8}$'
  `;
  const ano = new Date().getFullYear().toString().slice(-2);
  const epc = `AJ${ano}${String(prox).padStart(8, "0")}`;

  const tipo = body.tipo ?? "imprimir";

  try {
    // Cria registro RFID
    const rfidId = crypto.randomUUID();
    await sql`
      INSERT INTO alissonerp.joias_rfid (id, epc, produto_id, sku, nome, localizacao_atual, status)
      VALUES (${rfidId}::uuid, ${epc}, ${produtoId}::bigint, ${prod.sku ?? ""}, ${prod.nome}, 'Loja', 'pendente_impressao')
    `;

    const zpl = gerarZplEtiquetaJoia({ epc, sku: prod.sku ?? "", nome: prod.nome });

    if (tipo === "imprimir") {
      try {
        await imprimirZplDireto(zpl);
        await sql`UPDATE alissonerp.joias_rfid SET status = 'ativo' WHERE id = ${rfidId}::uuid`;
      } catch (printErr) {
        // Impressora offline — mantém pendente_impressao
        return NextResponse.json({
          ok: true,
          epc,
          zpl,
          status: "pendente_impressao",
          warning: `Impressora offline: ${(printErr as Error).message}. ZPL gerado para impressão manual.`,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      epc,
      zpl,
      status: tipo === "imprimir" ? "ativo" : "pendente_impressao",
      produto: { id: produtoId, sku: prod.sku, nome: prod.nome },
    });
  } catch (err) {
    return internalError("[POST /api/rfid/imprimir]", err, "Erro ao gerar RFID");
  }
}
