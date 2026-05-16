import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { uploadFile } from "@/lib/storage";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";
import { validateFichaTecnica, migrateProfile, CALIBRACAO_DEFAULTS, type CalibracaoDefaults } from "@/app/(dashboard)/orcamento/validations";
import { computeStoneCapacity } from "@/app/(dashboard)/orcamento/constants";
import { ProfileType } from "@/app/(dashboard)/orcamento/types";

const ROLES_ORCAMENTO = ["desenvolvedor", "admin", "gerente_loja", "gerente_fabrica", "consultora"] as const;

// GET /api/orcamento — lista orçamentos
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });

  const [caller] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid`;
  if (!caller) return NextResponse.json({ error: "Usuario nao encontrado" }, { status: 404 });

  const role = caller.role as string;
  const hasAccess = isFullAccess(role) || ROLES_ORCAMENTO.includes(role as typeof ROLES_ORCAMENTO[number]);
  if (!hasAccess) return NextResponse.json({ error: "Sem permissao" }, { status: 403 });

  const limit = Number(req.nextUrl.searchParams.get("limit") ?? 50);
  const offset = Number(req.nextUrl.searchParams.get("offset") ?? 0);

  // Consultora vê só os seus; admin/gerente vê todos
  const isRestricted = role === "consultora";

  const rows = isRestricted
    ? await sql`
        SELECT o.*, ft.modelo, ft.aro_numeracao,
               v.numero_pedido AS venda_numero_pedido,
               ord.numero_ordem AS ordem_numero
        FROM alissonerp.orcamentos o
        LEFT JOIN alissonerp.orcamento_fichas_tecnicas ft ON ft.id = o.ficha_tecnica_id
        LEFT JOIN public.vendas v ON v.id = o.venda_gerada_id
        LEFT JOIN alissonerp.ordens ord ON ord.id = o.ordem_gerada_id
        WHERE o.usuario_id = ${user.id}::uuid
        ORDER BY o.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `
    : await sql`
        SELECT o.*, ft.modelo, ft.aro_numeracao,
               v.numero_pedido AS venda_numero_pedido,
               ord.numero_ordem AS ordem_numero
        FROM alissonerp.orcamentos o
        LEFT JOIN alissonerp.orcamento_fichas_tecnicas ft ON ft.id = o.ficha_tecnica_id
        LEFT JOIN public.vendas v ON v.id = o.venda_gerada_id
        LEFT JOIN alissonerp.ordens ord ON ord.id = o.ordem_gerada_id
        ORDER BY o.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

  return NextResponse.json({ orcamentos: rows });
}

// POST /api/orcamento — criar orçamento
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });

  const [caller] = await sql`
    SELECT u.role, v.id_vendedor
    FROM alissonerp.usuarios u
    LEFT JOIN public.vendedores v ON v.email = u.email
    WHERE u.id = ${user.id}::uuid
  `;
  if (!caller) return NextResponse.json({ error: "Usuario nao encontrado" }, { status: 404 });

  const body = await req.json();
  const {
    nome_cliente, nome_modelo, peso, valor, markup, desconto_pct,
    cotacao_ouro, cotacao_dolar, valor_ouro, valor_pedras,
    tipo, ficha, ficha2, quantidade, observacoes, cliente_id, foto_3d_base64,
  } = body;

  if (!nome_cliente?.trim() && !cliente_id) {
    return NextResponse.json({ error: "nome_cliente ou cliente_id obrigatorio" }, { status: 400 });
  }

  // Par de alianças exige as DUAS fichas — sem isso, ficha2 vinha como null
  // e o orçamento salvava só um anel mesmo com quantidade=2.
  if ((tipo ?? "alianca") === "alianca" && Number(quantidade) === 2 && (!ficha2 || typeof ficha2 !== "object")) {
    return NextResponse.json({ error: "Par de alianças exige ficha técnica do anel 2" }, { status: 422 });
  }

  // ── Validação de travas (bilateral: frontend + backend) ─────────────────
  // Para alianças, re-valida a ficha técnica contra as travas de espessura,
  // largura e capacidade de pedras usando calibracao persistida no config.
  if ((tipo ?? "alianca") === "alianca") {
    // Lê calibracao do config (fallback para defaults conservadores)
    const [configRow] = await sql`
      SELECT calibracao FROM alissonerp.config_orcamento WHERE name = 'default' LIMIT 1
    `;
    const calib: CalibracaoDefaults = (configRow?.calibracao as CalibracaoDefaults) ?? CALIBRACAO_DEFAULTS;

    const fichasParaValidar: Array<{ f: Record<string, unknown>; label: string }> = [];
    if (ficha && typeof ficha === "object") fichasParaValidar.push({ f: ficha, label: "alianca" });
    if (ficha2 && typeof ficha2 === "object" && quantidade === 2) fichasParaValidar.push({ f: ficha2, label: "alianca 2" });

    for (const { f, label } of fichasParaValidar) {
      const profile = migrateProfile(String(f.perfil ?? "Simples"));
      const capacity = computeStoneCapacity(
        Number(f.diametro ?? 0),
        Number(f.espessura ?? 0),
        Number(f.canal_borda_altura ?? 1.0),
        Number(f.tamanho_pedra ?? 0),
        Number(f.pedra_fileiras ?? 1),
        profile,
      );
      const errors = validateFichaTecnica(f, capacity, calib);
      if (errors.length > 0) {
        return NextResponse.json(
          { error: `Validacao falhou (${label}): ${errors[0].message}`, errors },
          { status: 400 },
        );
      }
    }
  }

  // Gerar número do orçamento
  const [seqRow] = await sql`SELECT nextval('alissonerp.orcamento_seq') AS seq`;
  const numero = `ORC-${String(seqRow.seq).padStart(6, "0")}`;

  // Upload foto 3D se enviada
  let foto3dUrl: string | null = null;
  if (foto_3d_base64 && typeof foto_3d_base64 === "string" && foto_3d_base64.startsWith("data:")) {
    const path = `orcamento/${numero}/3d-${Date.now()}.jpg`;
    const result = await uploadFile("ordem-fotos", path, foto_3d_base64, "image/jpeg");
    if (!("error" in result)) foto3dUrl = result.url;
  }

  let fichaId: number | null = null;

  // Se veio ficha técnica, salvar primeiro
  if (ficha && typeof ficha === "object") {
    const [fichaRow] = await sql`
      INSERT INTO alissonerp.orcamento_fichas_tecnicas (
        modelo, aro_numeracao, largura, espessura, peso_estimado,
        perfil, diametro, densidade_ouro, cor_metal,
        tipo_fonte, texto, qtd_pedras, tamanho_pedra, tipo_pedra, tipo_aplicacao_pedra,
        profundidade_concava, has_friso, friso_kind, friso_tipo,
        friso_lado, friso_largura, friso_profundidade, friso_offset,
        canal_largura, canal_borda_altura, chanfro_tamanho, dome_porcentagem,
        pedra_fileiras, pedra_drill, pedra_meia_lua, pedra_volta_completa,
        pedras_detalhadas
      ) VALUES (
        ${ficha.modelo ?? null}, ${ficha.aro_numeracao ?? null},
        ${ficha.largura ?? null}, ${ficha.espessura ?? null}, ${ficha.peso_estimado ?? null},
        ${ficha.perfil ?? null}, ${ficha.diametro ?? null},
        ${ficha.densidade_ouro ?? null}, ${ficha.cor_metal ?? null},
        ${ficha.tipo_fonte ?? null}, ${ficha.texto ?? null},
        ${ficha.qtd_pedras ?? null}, ${ficha.tamanho_pedra ?? null}, ${ficha.tipo_pedra ?? null},
        ${ficha.tipo_aplicacao_pedra ?? null},
        ${ficha.profundidade_concava ?? null},
        ${ficha.has_friso ?? false}, ${ficha.friso_kind ?? "friso"}, ${ficha.friso_tipo ?? null},
        ${ficha.friso_lado ?? null},
        ${ficha.friso_largura ?? null}, ${ficha.friso_profundidade ?? null},
        ${ficha.friso_offset ?? null},
        ${ficha.canal_largura ?? null}, ${ficha.canal_borda_altura ?? null},
        ${ficha.chanfro_tamanho ?? null}, ${ficha.dome_porcentagem ?? null},
        ${ficha.pedra_fileiras ?? null}, ${ficha.pedra_drill ?? false},
        ${ficha.pedra_meia_lua ?? false}, ${ficha.pedra_volta_completa ?? false},
        ${sql.json(ficha.pedras_detalhadas ?? [])}
      ) RETURNING id
    `;
    fichaId = fichaRow.id as number;
  }

  // Ficha técnica 2 (par de alianças)
  let ficha2Id: number | null = null;
  if (ficha2 && typeof ficha2 === "object" && quantidade === 2) {
    const [fichaRow2] = await sql`
      INSERT INTO alissonerp.orcamento_fichas_tecnicas (
        modelo, aro_numeracao, largura, espessura, peso_estimado,
        perfil, diametro, densidade_ouro, cor_metal,
        tipo_fonte, texto, qtd_pedras, tamanho_pedra, tipo_pedra, tipo_aplicacao_pedra,
        profundidade_concava, has_friso, friso_kind, friso_tipo,
        friso_lado, friso_largura, friso_profundidade, friso_offset,
        canal_largura, canal_borda_altura, chanfro_tamanho, dome_porcentagem,
        pedra_fileiras, pedra_drill, pedra_meia_lua, pedra_volta_completa,
        pedras_detalhadas
      ) VALUES (
        ${ficha2.modelo ?? null}, ${ficha2.aro_numeracao ?? null},
        ${ficha2.largura ?? null}, ${ficha2.espessura ?? null}, ${ficha2.peso_estimado ?? null},
        ${ficha2.perfil ?? null}, ${ficha2.diametro ?? null},
        ${ficha2.densidade_ouro ?? null}, ${ficha2.cor_metal ?? null},
        ${ficha2.tipo_fonte ?? null}, ${ficha2.texto ?? null},
        ${ficha2.qtd_pedras ?? null}, ${ficha2.tamanho_pedra ?? null}, ${ficha2.tipo_pedra ?? null},
        ${ficha2.tipo_aplicacao_pedra ?? null},
        ${ficha2.profundidade_concava ?? null},
        ${ficha2.has_friso ?? false}, ${ficha2.friso_kind ?? "friso"}, ${ficha2.friso_tipo ?? null},
        ${ficha2.friso_lado ?? null},
        ${ficha2.friso_largura ?? null}, ${ficha2.friso_profundidade ?? null},
        ${ficha2.friso_offset ?? null},
        ${ficha2.canal_largura ?? null}, ${ficha2.canal_borda_altura ?? null},
        ${ficha2.chanfro_tamanho ?? null}, ${ficha2.dome_porcentagem ?? null},
        ${ficha2.pedra_fileiras ?? null}, ${ficha2.pedra_drill ?? false},
        ${ficha2.pedra_meia_lua ?? false}, ${ficha2.pedra_volta_completa ?? false},
        ${sql.json(ficha2.pedras_detalhadas ?? [])}
      ) RETURNING id
    `;
    ficha2Id = fichaRow2.id as number;
  }

  const [orcamento] = await sql`
    INSERT INTO alissonerp.orcamentos (
      numero_orcamento, tipo, vendedor_id, usuario_id,
      nome_cliente, nome_modelo, peso, valor, markup,
      desconto_pct, cotacao_ouro, cotacao_dolar, valor_ouro, valor_pedras,
      ficha_tecnica_id, ficha_tecnica_2_id, quantidade, observacoes, cliente_id, foto_3d
    ) VALUES (
      ${numero}, ${tipo ?? "alianca"},
      ${caller.id_vendedor ? Number(caller.id_vendedor) : null},
      ${user.id}::uuid,
      ${nome_cliente.trim()}, ${nome_modelo ?? null},
      ${peso ?? null}, ${valor ?? null}, ${markup ?? null},
      ${desconto_pct ?? 0}, ${cotacao_ouro ?? null},
      ${cotacao_dolar ?? null}, ${valor_ouro ?? null}, ${valor_pedras ?? null},
      ${fichaId}, ${ficha2Id}, ${quantidade ?? 1}, ${observacoes ?? null}, ${cliente_id ?? null}, ${foto3dUrl}
    ) RETURNING *
  `;

  return NextResponse.json({ ok: true, orcamento });
}
