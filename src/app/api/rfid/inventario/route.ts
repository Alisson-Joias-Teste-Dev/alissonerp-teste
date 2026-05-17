import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { internalError } from "@/lib/api-error";

function extrairIdApi(epc: string): number | null {
  if (!epc || epc.length < 13) return null;
  if (!/^\d{24}$/.test(epc)) return null;
  const id = parseInt(epc.slice(4, 13), 10);
  return isNaN(id) || id <= 0 ? null : id;
}

async function getLocalNomeFromId(localId: number): Promise<string> {
  const [row] = await sql`
    SELECT nome FROM alissonerp.locais_estoque WHERE id = ${localId}
  `;
  return row?.nome ?? "Loja";
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const body = await req.json() as {
      leituras: string[];
      leitor_id?: string;
      local_estoque_id?: number;
      concluir?: boolean;
    };

    if (!Array.isArray(body.leituras) || body.leituras.length === 0) {
      return NextResponse.json({ error: "leituras é obrigatório (array de strings)" }, { status: 400 });
    }

    if (body.concluir) {
      return NextResponse.json({ ok: true, concluido: true, mensagem: "Inventario concluido" });
    }

    const leituras = [...new Set(body.leituras.map(l => l.trim()).filter(Boolean))];
    const leitorId = body.leitor_id ?? "TSL-1128";
    const localEstoqueId = body.local_estoque_id ?? 2;
    const localNome = await getLocalNomeFromId(localEstoqueId);

    // Registra todas as leituras
    await sql.begin(async (tx: any) => {
      for (const epc of leituras) {
        await tx`
          INSERT INTO alissonerp.joias_leituras (epc, evento, localizacao, leitor_id, operador, lido_em)
          VALUES (${epc}, 'inventario', ${localNome}, ${leitorId}, ${user.id}::uuid, now())
        `;
      }
    });

    // Extrai id_api_produto de cada EPC e busca os produtos
    const idsApi = [...new Set(leituras.map(extrairIdApi).filter(Boolean) as number[])];
    const naoIdentificados: string[] = [];

    const contagem: Record<number, { epcs: string[]; count: number }> = {};
    for (const epc of leituras) {
      const idApi = extrairIdApi(epc);
      if (!idApi) { naoIdentificados.push(epc); continue; }
      if (!contagem[idApi]) contagem[idApi] = { epcs: [], count: 0 };
      contagem[idApi].epcs.push(epc);
      contagem[idApi].count++;
    }

    // Busca dados dos produtos por id_api_produto
    const produtosMap = new Map<number, { id_produto: number; sku: string; nome: string }>();
    if (idsApi.length > 0) {
      const rows = await sql`
        SELECT id_produto, id_api_produto, sku, nome
        FROM public.produtos
        WHERE id_api_produto = ANY(${idsApi}::int[])
      `;
      for (const r of rows) {
        produtosMap.set(Number(r.id_api_produto), {
          id_produto: Number(r.id_produto),
          sku: (r.sku as string) ?? "",
          nome: (r.nome as string) ?? "",
        });
      }
    }

    // Busca estoque esperado por produto no local
    const esperado = new Map<number, { saldo_fisico: number; reservado: number; disponivel: number }>();
    const stockRows = await sql`
      SELECT produto_id, saldo_fisico::int, reservado::int, disponivel::int
      FROM alissonerp.vw_saldo_estoque_comercial_v2
      WHERE local_estoque_id = ${localEstoqueId}
    `;
    for (const r of stockRows) {
      esperado.set(Number(r.produto_id), {
        saldo_fisico: Number(r.saldo_fisico ?? 0),
        reservado: Number(r.reservado ?? 0),
        disponivel: Number(r.disponivel ?? 0),
      });
    }

    // Monta relatório por produto
    const produtos: Array<{
      produto_id: number | null;
      id_api_produto: number | null;
      sku: string | null;
      nome: string | null;
      esperado: number;
      encontrado: number;
      divergencia: number;
      epcs: string[];
      status: "ok" | "faltando" | "excedente" | "nao_cadastrado";
    }> = [];

    for (const [idApi, dados] of Object.entries(contagem)) {
      const id = Number(idApi);
      const prod = produtosMap.get(id);
      const stock = prod ? esperado.get(prod.id_produto) : null;
      const esperadoQty = stock?.saldo_fisico ?? 0;
      const divergencia = dados.count - esperadoQty;

      let status: "ok" | "faltando" | "excedente" | "nao_cadastrado";
      if (!prod) status = "nao_cadastrado";
      else if (divergencia < 0) status = "faltando";
      else if (divergencia > 0) status = "excedente";
      else status = "ok";

      produtos.push({
        produto_id: prod?.id_produto ?? null,
        id_api_produto: id,
        sku: prod?.sku ?? null,
        nome: prod?.nome ?? null,
        esperado: esperadoQty,
        encontrado: dados.count,
        divergencia,
        epcs: dados.epcs,
        status,
      });
    }

    // Produtos que deveriam ter estoque mas não foram escaneados
    for (const [produtoId, stock] of esperado) {
      if (stock.saldo_fisico <= 0) continue;
      const prod = [...produtosMap.values()].find(p => p.id_produto === produtoId);
      if (!prod) continue;
      const idApi = idsApi.find(a => produtosMap.get(a)?.id_produto === produtoId);
      if (idApi && contagem[idApi]) continue;

      produtos.push({
        produto_id: produtoId,
        id_api_produto: idApi ?? null,
        sku: prod.sku,
        nome: prod.nome,
        esperado: stock.saldo_fisico,
        encontrado: 0,
        divergencia: -stock.saldo_fisico,
        epcs: [],
        status: "faltando",
      });
    }

    const totalEsperado = produtos.reduce((s, p) => s + p.esperado, 0);
    const totalEncontrado = produtos.reduce((s, p) => s + p.encontrado, 0);
    const div = produtos.filter(p => p.status !== "ok");

    return NextResponse.json({
      ok: true,
      local_estoque_id: localEstoqueId,
      local_nome: localNome,
      total_epcs: leituras.length,
      total_epcs_unicos: leituras.length,
      nao_identificados: naoIdentificados,
      produtos,
      resumo: {
        total_produtos: produtos.length,
        total_esperado: totalEsperado,
        total_encontrado: totalEncontrado,
        produtos_com_divergencia: div.length,
        faltando: div.filter(p => p.status === "faltando").length,
        excedente: div.filter(p => p.status === "excedente").length,
        nao_cadastrado: div.filter(p => p.status === "nao_cadastrado").length,
      },
    });
  } catch (err) {
    return internalError("[POST /api/rfid/inventario]", err);
  }
}

export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const leituras = await sql`
      SELECT epc, evento, localizacao, leitor_id, created_at
      FROM alissonerp.joias_leituras
      WHERE evento = 'inventario'
      ORDER BY created_at DESC
      LIMIT 100
    `;

    return NextResponse.json(leituras);
  } catch (err) {
    return internalError("[GET /api/rfid/inventario]", err);
  }
}
