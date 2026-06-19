import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { METAL_COLORS } from "@/app/(dashboard)/orcamento/constants";
import { nomePrincipal } from "@/lib/gravacao";

/**
 * Normaliza cor_metal -> hex aceito pelo THREE.js.
 * No banco hist a campo veio salvo de duas formas:
 *  - como label ("Ouro Amarelo") em registros antigos
 *  - como hex ("#FFD700") em registros recentes
 * Mesma logica do applyRingParams no OrcamentoClient (linha ~356).
 */
function corToHex(raw: unknown): { hex: string; density: number } {
  const v = typeof raw === "string" ? raw : "";
  // Hex direto
  if (v.startsWith("#")) {
    const match = METAL_COLORS.find((m) => m.value === v);
    return { hex: v, density: match?.density ?? 14.69 };
  }
  // Label -> lookup
  const match = METAL_COLORS.find((m) => m.label === v || m.value === v);
  if (match) return { hex: match.value, density: match.density };
  // Default amarelo
  return { hex: "#FFD700", density: 14.69 };
}

/**
 * GET /api/ordens/[id]/ring-params
 *
 * Retorna os parametros 3D da(s) alianca(s) do orcamento associado a esta ordem
 * de fabricacao, no formato consumido pelo componente AliancaViewport.
 *
 * Fluxo: ordens.venda_id -> orcamentos.venda_gerada_id -> orcamento_fichas_tecnicas
 *   - ring1 = ficha_tecnica_id (obrigatorio se orcamento e tipo='alianca')
 *   - ring2 = ficha_tecnica_2_id (opcional - par de alianca)
 *
 * Retorna 200 com { ring1, ring2, profile1, profile2 } se ha orcamento.
 * Retorna 404 se a ordem nao tem orcamento associado (visualizador nao aparece).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });

  const { id } = await params;
  const ordemId = Number(id);
  if (isNaN(ordemId)) return NextResponse.json({ error: "ID invalido" }, { status: 400 });

  // Busca a ordem para pegar venda_id
  const [ordem] = await sql`
    SELECT id, venda_id FROM alissonerp.ordens WHERE id = ${ordemId} LIMIT 1
  `;
  if (!ordem) return NextResponse.json({ error: "Ordem nao encontrada" }, { status: 404 });
  if (!ordem.venda_id) {
    return NextResponse.json({ error: "Ordem sem venda associada" }, { status: 404 });
  }

  // Busca orcamento da venda
  const [orc] = await sql`
    SELECT id, ficha_tecnica_id, ficha_tecnica_2_id, tipo
    FROM alissonerp.orcamentos
    WHERE venda_gerada_id = ${ordem.venda_id}
    ORDER BY id DESC
    LIMIT 1
  `;
  if (!orc) return NextResponse.json({ error: "Orcamento nao encontrado" }, { status: 404 });
  if (orc.tipo !== "alianca") {
    return NextResponse.json({ error: "Orcamento nao e de alianca" }, { status: 404 });
  }
  if (!orc.ficha_tecnica_id) {
    return NextResponse.json({ error: "Orcamento sem ficha tecnica" }, { status: 404 });
  }

  // Carrega fichas tecnicas (1 ou 2)
  const ids = [orc.ficha_tecnica_id, orc.ficha_tecnica_2_id].filter((v): v is number => v != null);
  const fichas = await sql`
    SELECT id, perfil, diametro, largura, espessura, cor_metal, densidade_ouro,
           profundidade_concava, friso_lado, friso_largura, friso_profundidade,
           friso_offset, canal_largura, canal_borda_altura, chanfro_tamanho,
           dome_porcentagem, has_friso, friso_tipo, friso_kind,
           tamanho_pedra, pedra_fileiras, pedra_drill, pedra_meia_lua,
           pedra_volta_completa, tipo_pedra, qtd_pedras,
           texto, tipo_fonte
    FROM alissonerp.orcamento_fichas_tecnicas
    WHERE id = ANY(${ids}::int[])
  `;
  if (fichas.length === 0) {
    return NextResponse.json({ error: "Ficha tecnica do orcamento nao encontrada" }, { status: 404 });
  }

  const byId = new Map<number, Record<string, unknown>>();
  for (const f of fichas) byId.set(Number(f.id), f as Record<string, unknown>);

  // Converte uma linha da ficha tecnica do orcamento em { profile, params } no formato
  // consumido pelo AliancaViewport. Defaults conservadores quando coluna eh null.
  // Conversao replica a mesma logica de applyRingParams em OrcamentoClient.tsx
  // (linha ~351) — refatorar pra lib compartilhada exigiria desacoplar
  // dependencias do frontend (aroSize, calibracao). Por ora, copia controlada
  // com cores normalizadas via METAL_COLORS (mesma fonte do orcamento).
  function toViewerData(row: Record<string, unknown>) {
    const perfil = String(row.perfil ?? "Anatomica");
    const friso_largura = Number(row.friso_largura ?? 0);
    const friso_profundidade = Number(row.friso_profundidade ?? 0);
    // B1 (friso fantasma): a flag has_friso e a UNICA verdade sobre ter friso.
    // Antes, reconstruia friso a partir de medida residual (largura>0 && prof>0):
    // anel liso com medida esquecida no banco virava sulco fantasma no 3D.
    // Perfis legados FrisoUnico/FrisoLateral seguem cobertos pelo hasGroove abaixo.
    // IMPACTO se reverter: volta o friso fantasma no anel liso com medida residual.
    const has_friso = row.has_friso === true;
    const fonte = String(row.tipo_fonte ?? "");
    // 3D so renderiza o nome principal — adicionais aparecem na ficha tecnica.
    const texto = nomePrincipal(row.texto);
    const fontType: 1 | 2 = fonte === "Cursiva" ? 2 : 1;

    // FrisoUnico/FrisoLateral sao perfis legados — coerce pra Simples
    // e ativa o friso conforme o tipo, igual ao OrcamentoClient.
    let perfilNorm = perfil;
    let grooveType: "lateral" | "centro" | "duplo" = "lateral";
    if (perfil === "FrisoUnico") { perfilNorm = "Simples"; grooveType = "lateral"; }
    else if (perfil === "FrisoLateral") { perfilNorm = "Simples"; grooveType = "duplo"; }
    else if (row.friso_tipo === "centro" || row.friso_tipo === "duplo") grooveType = row.friso_tipo;

    const hasGroove = perfil === "FrisoUnico" || perfil === "FrisoLateral" || has_friso;
    const corNorm = corToHex(row.cor_metal);
    const densidade = row.densidade_ouro != null ? Number(row.densidade_ouro) : corNorm.density;

    return {
      profile: perfilNorm,
      params: {
        diameter: Number(row.diametro ?? 17),
        width: Number(row.largura ?? 5),
        height: Number(row.espessura ?? 1.5),
        concaveDepth: Number(row.profundidade_concava ?? 0.3),
        grooveSide: (row.friso_lado === "LOWER" ? "LOWER" : "UPPER") as "UPPER" | "LOWER",
        grooveWidth: friso_largura,
        grooveDepth: friso_profundidade,
        grooveOffset: Number(row.friso_offset ?? 0),
        canalWidth: Number(row.canal_largura ?? 0),
        canalBorderHeight: Number(row.canal_borda_altura ?? 0),
        chamferSize: Number(row.chanfro_tamanho ?? 0),
        domePercentage: Number(row.dome_porcentagem ?? 100),
        metalColor: corNorm.hex,
        goldDensity: densidade,
        goldPrice: 0,
        startMkp: 1,
        discountPercent: 0,
        hasGroove,
        grooveKind: (row.friso_kind === "risco" ? "risco" : "friso") as "friso" | "risco",
        grooveType,
        hasStones: Number(row.qtd_pedras ?? 0) > 0,
        stoneSize: Number(row.tamanho_pedra ?? 0),
        stoneRows: Number(row.pedra_fileiras ?? 1),
        stoneCount: Number(row.qtd_pedras ?? 0),
        stoneDrill: row.pedra_drill === true,
        stoneHalfMoon: row.pedra_meia_lua === true,
        stoneFull: row.pedra_volta_completa === true,
        stoneType: String(row.tipo_pedra ?? "diamante"),
        textEnabled: !!texto,
        textFontType: fontType,
        textContent: texto,
      },
    };
  }

  const ring1Row = byId.get(Number(orc.ficha_tecnica_id));
  const ring1 = ring1Row ? toViewerData(ring1Row) : null;
  const ring2Row = orc.ficha_tecnica_2_id ? byId.get(Number(orc.ficha_tecnica_2_id)) : null;
  const ring2 = ring2Row ? toViewerData(ring2Row) : null;

  if (!ring1) {
    return NextResponse.json({ error: "Dados do anel principal indisponiveis" }, { status: 404 });
  }

  return NextResponse.json({
    ring1,
    ring2,
    orcamento_id: orc.id,
  });
}
