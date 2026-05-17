/**
 * POST /api/precificacao/curva/simular-produto
 *
 * Simula lucratividade para um peso especifico com a curva atual.
 * Aceita tambem um mkpManual opcional para comparar cenarios.
 *
 * Se config/categorias nao forem passados no body, busca do DB.
 * (Permitir passar no body e util para o simulador em tempo real,
 *  que mantem alteracoes nao-salvas no estado do cliente.)
 *
 * Permissao: isPrecificacaoAccess
 */

import { NextRequest, NextResponse } from "next/server";
import { authOr401 } from "@/lib/auth-server";
import { isPrecificacaoAccess } from "@/lib/roles";
import sql from "@/lib/db";
import {
  simularLucratividade,
  normalizeConfigRow,
  normalizeCategoriaRow,
  type CurvaConfig,
  type CurvaCategoriaInput,
  type Arredondamento,
} from "@/lib/curva-precificacao";

interface RequestBody {
  peso: number;
  cotacao?: number;
  mkpManual?: number;
  config?: CurvaConfig;
  categorias?: CurvaCategoriaInput[];
}

export async function POST(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!isPrecificacaoAccess(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const body = (await req.json()) as RequestBody;
  const { peso, cotacao: cotacaoIn, mkpManual } = body;

  if (peso == null || Number(peso) <= 0) {
    return NextResponse.json({ error: "peso deve ser > 0" }, { status: 400 });
  }

  try {
    let config = body.config;
    let categorias = body.categorias;

    if (!config) {
      const [row] = await sql`
        SELECT start_mkp, start_commission, gold_cost_percentage,
               sucata_compra_min_pct, sucata_compra_max_pct, arredondamento
        FROM alissonerp.curva_config WHERE id = 1
      `;
      if (!row) return NextResponse.json({ error: "Config não inicializada" }, { status: 500 });
      config = normalizeConfigRow(row as unknown as Record<string, unknown>);
    } else {
      // Sanitizar arredondamento (evita injecao de valor invalido via body)
      const arr: Arredondamento = ["dezena", "unidade", "centena"].includes(config.arredondamento)
        ? config.arredondamento
        : "dezena";
      config = { ...config, arredondamento: arr };
    }

    if (!categorias) {
      const rows = await sql`
        SELECT id, nome, max_weight, variation, comm_variation, max_discount, ativo, ordem
        FROM alissonerp.curva_categorias
        WHERE ativo = true
        ORDER BY ordem ASC
      `;
      categorias = (rows as unknown as Record<string, unknown>[]).map(normalizeCategoriaRow);
    }

    let cotacao = cotacaoIn != null ? Number(cotacaoIn) : 0;
    if (!cotacao) {
      const [row] = (await sql`SELECT ouro FROM public.parametros LIMIT 1`) as unknown as Array<{ ouro: string }>;
      cotacao = Number(row?.ouro ?? 0);
    }

    if (!cotacao || cotacao <= 0) {
      return NextResponse.json({ error: "Cotação do ouro não disponível" }, { status: 500 });
    }

    const resultado = simularLucratividade(
      Number(peso),
      cotacao,
      config,
      categorias,
      mkpManual != null ? Number(mkpManual) : undefined,
    );

    return NextResponse.json({ resultado });
  } catch (err) {
    console.error("[POST /api/precificacao/curva/simular-produto]", err);
    return NextResponse.json({ error: "Erro ao simular" }, { status: 500 });
  }
}
