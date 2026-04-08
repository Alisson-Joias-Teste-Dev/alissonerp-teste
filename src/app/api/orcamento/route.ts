import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";

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
        SELECT o.*, ft.modelo, ft.aro_numeracao
        FROM alissonerp.orcamentos o
        LEFT JOIN alissonerp.orcamento_fichas_tecnicas ft ON ft.id = o.ficha_tecnica_id
        WHERE o.usuario_id = ${user.id}::uuid
        ORDER BY o.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `
    : await sql`
        SELECT o.*, ft.modelo, ft.aro_numeracao
        FROM alissonerp.orcamentos o
        LEFT JOIN alissonerp.orcamento_fichas_tecnicas ft ON ft.id = o.ficha_tecnica_id
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
    tipo, ficha, observacoes,
  } = body;

  if (!nome_cliente?.trim()) {
    return NextResponse.json({ error: "nome_cliente obrigatorio" }, { status: 400 });
  }

  // Gerar número do orçamento
  const [seqRow] = await sql`SELECT nextval('alissonerp.orcamento_seq') AS seq`;
  const numero = `ORC-${String(seqRow.seq).padStart(6, "0")}`;

  let fichaId: number | null = null;

  // Se veio ficha técnica, salvar primeiro
  if (ficha && typeof ficha === "object") {
    const [fichaRow] = await sql`
      INSERT INTO alissonerp.orcamento_fichas_tecnicas (
        modelo, aro_numeracao, largura, espessura, peso_estimado,
        perfil, diametro, densidade_ouro, cor_metal,
        tipo_fonte, texto, qtd_pedras, tamanho_pedra, tipo_aplicacao_pedra,
        profundidade_concava, friso_lado, friso_largura, friso_profundidade, friso_offset,
        canal_largura, canal_borda_altura, chanfro_tamanho, dome_porcentagem,
        pedra_fileiras, pedra_drill, pedra_meia_lua, pedra_volta_completa,
        pedras_detalhadas
      ) VALUES (
        ${ficha.modelo ?? null}, ${ficha.aro_numeracao ?? null},
        ${ficha.largura ?? null}, ${ficha.espessura ?? null}, ${ficha.peso_estimado ?? null},
        ${ficha.perfil ?? null}, ${ficha.diametro ?? null},
        ${ficha.densidade_ouro ?? null}, ${ficha.cor_metal ?? null},
        ${ficha.tipo_fonte ?? null}, ${ficha.texto ?? null},
        ${ficha.qtd_pedras ?? null}, ${ficha.tamanho_pedra ?? null},
        ${ficha.tipo_aplicacao_pedra ?? null},
        ${ficha.profundidade_concava ?? null}, ${ficha.friso_lado ?? null},
        ${ficha.friso_largura ?? null}, ${ficha.friso_profundidade ?? null},
        ${ficha.friso_offset ?? null},
        ${ficha.canal_largura ?? null}, ${ficha.canal_borda_altura ?? null},
        ${ficha.chanfro_tamanho ?? null}, ${ficha.dome_porcentagem ?? null},
        ${ficha.pedra_fileiras ?? null}, ${ficha.pedra_drill ?? false},
        ${ficha.pedra_meia_lua ?? false}, ${ficha.pedra_volta_completa ?? false},
        ${JSON.stringify(ficha.pedras_detalhadas ?? [])}::jsonb
      ) RETURNING id
    `;
    fichaId = fichaRow.id as number;
  }

  const [orcamento] = await sql`
    INSERT INTO alissonerp.orcamentos (
      numero_orcamento, tipo, vendedor_id, usuario_id,
      nome_cliente, nome_modelo, peso, valor, markup,
      desconto_pct, cotacao_ouro, cotacao_dolar, valor_ouro, valor_pedras,
      ficha_tecnica_id, observacoes
    ) VALUES (
      ${numero}, ${tipo ?? "alianca"},
      ${caller.id_vendedor ? Number(caller.id_vendedor) : null},
      ${user.id}::uuid,
      ${nome_cliente.trim()}, ${nome_modelo ?? null},
      ${peso ?? null}, ${valor ?? null}, ${markup ?? null},
      ${desconto_pct ?? 0}, ${cotacao_ouro ?? null},
      ${cotacao_dolar ?? null}, ${valor_ouro ?? null}, ${valor_pedras ?? null},
      ${fichaId}, ${observacoes ?? null}
    ) RETURNING *
  `;

  return NextResponse.json({ ok: true, orcamento });
}
