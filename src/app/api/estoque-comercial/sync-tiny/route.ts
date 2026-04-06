import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";

// ─── POST /api/estoque-comercial/sync-tiny ────────────────────────────────────
// Push estoque fabricaAJ → Tiny (inversão master)
export async function POST() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  if (!usuario || !isFullAccess(usuario.role)) {
    return NextResponse.json({ error: "Sem permissão — apenas admin/dev" }, { status: 403 });
  }

  // Buscar token Tiny
  const [tokenRow] = await sql`
    SELECT valor FROM alissonerp.configuracoes_secrets WHERE chave = 'tiny_api_token'
  `;
  if (!tokenRow?.valor) {
    return NextResponse.json({ error: "Token do Tiny não configurado" }, { status: 400 });
  }
  let tinyToken: string;
  try {
    tinyToken = JSON.parse(tokenRow.valor);
  } catch {
    tinyToken = tokenRow.valor;
  }
  if (!tinyToken || tinyToken.trim() === "") {
    return NextResponse.json({ error: "Token do Tiny inválido" }, { status: 400 });
  }

  // Buscar produtos ativos com saldo
  const produtos = await sql`
    SELECT
      ec.produto_id,
      p.sku,
      p.nome AS nome_produto,
      COALESCE(SUM(vec.saldo), 0) AS saldo
    FROM alissonerp.estoque_comercial_config ec
    JOIN public.produtos p ON p.id_produto = ec.produto_id
    LEFT JOIN alissonerp.vw_estoque_comercial_com_alerta vec ON vec.produto_id = ec.produto_id
    WHERE ec.ativo = true
      AND p.sku IS NOT NULL
      AND p.sku != ''
    GROUP BY ec.produto_id, p.sku, p.nome
    ORDER BY p.nome
  `;

  if (produtos.length === 0) {
    return NextResponse.json({ error: "Nenhum produto ativo com SKU encontrado" }, { status: 404 });
  }

  const resultados: Array<{
    produto_id: number;
    sku: string;
    nome: string;
    saldo: number;
    status: "ok" | "erro";
    erro?: string;
  }> = [];

  for (let idx = 0; idx < produtos.length; idx++) {
    const prod = produtos[idx];
    const sku = prod.sku as string;
    const saldo = Number(prod.saldo ?? 0);

    // Rate limiting: Tiny API ~30 req/min → esperar 2.1s entre requests
    if (idx > 0) await new Promise((r) => setTimeout(r, 2100));

    try {
      // Tiny API: atualizar estoque via produto.alterar.estoque.php
      const formData = new URLSearchParams();
      formData.append("token", tinyToken);
      formData.append("formato", "json");
      formData.append("estoque", JSON.stringify({
        estoque: {
          codigo: sku,
          quantidade: saldo,
          tipo: "B", // B = balanço (seta o valor absoluto)
        },
      }));

      const res = await fetch("https://api.tiny.com.br/api2/produto.atualizar.estoque.php", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString(),
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        resultados.push({ produto_id: prod.produto_id as number, sku, nome: prod.nome_produto as string, saldo, status: "erro", erro: `HTTP ${res.status}` });
        continue;
      }

      const data = await res.json() as {
        retorno?: {
          status?: string;
          erros?: Array<{ erro: string }> | { erro: string };
        };
      };

      if (data.retorno?.status === "OK") {
        resultados.push({
          produto_id: prod.produto_id as number,
          sku,
          nome: prod.nome_produto as string,
          saldo,
          status: "ok",
        });
      } else {
        let erroMsg = "Erro desconhecido";
        const erros = data.retorno?.erros;
        if (erros) {
          erroMsg = Array.isArray(erros)
            ? erros.map((e) => e.erro).join("; ")
            : (erros as { erro: string }).erro;
        }
        resultados.push({
          produto_id: prod.produto_id as number,
          sku,
          nome: prod.nome_produto as string,
          saldo,
          status: "erro",
          erro: erroMsg,
        });
      }
    } catch (e) {
      resultados.push({
        produto_id: prod.produto_id as number,
        sku,
        nome: prod.nome_produto as string,
        saldo,
        status: "erro",
        erro: e instanceof Error ? e.message : "Falha de comunicação",
      });
    }
  }

  const totalOk = resultados.filter((r) => r.status === "ok").length;
  const totalErro = resultados.filter((r) => r.status === "erro").length;

  return NextResponse.json({
    ok: totalErro === 0,
    total: resultados.length,
    sincronizados: totalOk,
    erros: totalErro,
    detalhes: resultados,
  });
}
