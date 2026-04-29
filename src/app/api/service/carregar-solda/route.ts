import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { uploadFile } from "@/lib/storage";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess, ROLES_SERVICE_PANEL } from "@/lib/roles";
import { getParametroNumber, PARAM } from "@/lib/parametros";

// POST /api/service/carregar-solda
// Dupla-entrada: sai do Almoxarifado Central (dep 1) e entra no depósito do operador.
// Auth: role em ROLES_SERVICE_PANEL OU fullAccess
//
// Body: { deposito_id: number, peso: number, foto_base64: string, operador_nome?: string }

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [caller] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid
  `;
  if (!caller) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 403 });

  const hasAccess =
    isFullAccess(caller.role as string) ||
    ROLES_SERVICE_PANEL.includes(caller.role as typeof ROLES_SERVICE_PANEL[number]);
  if (!hasAccess) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  // ── Body ──────────────────────────────────────────────────────────────────
  const body = await req.json().catch(() => null) as {
    deposito_id?: number;
    peso?: number;
    foto_base64?: string;
    operador_nome?: string;
  } | null;

  const deposito_id   = body?.deposito_id ? parseInt(String(body.deposito_id)) : null;
  const peso          = body?.peso        ? parseFloat(String(body.peso))       : null;
  const foto_base64   = body?.foto_base64 ?? null;
  const operador_nome = body?.operador_nome ?? "operador";

  if (!deposito_id || isNaN(deposito_id)) {
    return NextResponse.json({ error: "deposito_id obrigatório" }, { status: 400 });
  }
  if (!peso || isNaN(peso) || peso <= 0) {
    return NextResponse.json({ error: "peso deve ser > 0" }, { status: 400 });
  }
  if (!foto_base64) {
    return NextResponse.json({ error: "foto_base64 obrigatória" }, { status: 400 });
  }

  const almoxarifadoId = await getParametroNumber(PARAM.ALMOXARIFADO_DEPOSITO_ID);
  const ouro18kId      = await getParametroNumber(PARAM.OURO_18K_INSUMO_ID);

  // ── 1. Verificar saldo do pote (Almoxarifado Central) ────────────────────
  const [saldoPoteRow] = await sql`
    SELECT COALESCE(saldo, 0) AS saldo
    FROM alissonerp.vw_saldo_estoque
    WHERE deposito_id = ${almoxarifadoId} AND insumo_id = ${ouro18kId}
  `;
  const saldoPote = parseFloat(String(saldoPoteRow?.saldo ?? 0));
  if (saldoPote < peso) {
    return NextResponse.json(
      { error: `Saldo insuficiente no pote. Disponível: ${saldoPote.toFixed(3)}g, solicitado: ${peso.toFixed(3)}g` },
      { status: 422 }
    );
  }

  // ── 2. Upload da foto ─────────────────────────────────────────────────────
  const mediaType = foto_base64.startsWith("data:image/png") ? "image/png"
                  : foto_base64.startsWith("data:image/webp") ? "image/webp"
                  : "image/jpeg";
  const fotoPath  = `carregar-solda/${deposito_id}/${Date.now()}.jpg`;
  const fotoResult = await uploadFile("service-fotos", fotoPath, foto_base64, mediaType);
  if ("error" in fotoResult) {
    return NextResponse.json({ error: `Erro no upload da foto: ${fotoResult.error}` }, { status: 500 });
  }

  // ── 3. Dupla-entrada via fn_criar_par_movimentacao ────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sql as any).begin(async (tx: typeof sql) => {
    await tx`
      SELECT alissonerp.fn_criar_par_movimentacao(
        ${ouro18kId}::integer,
        ${peso}::real,
        ${almoxarifadoId}::integer,
        NULL::integer,
        ${deposito_id}::integer,
        NULL::integer,
        'AD'::alissonerp.enum_marcador_estoque,
        NULL::integer,
        ${'Carga de aditivo para ' + operador_nome + ' - Service'}
      )
    `;
  });

  // ── 4. Buscar novos saldos ─────────────────────────────────────────────────
  const saldosRows = await sql`
    SELECT deposito_id, COALESCE(saldo, 0) AS saldo
    FROM alissonerp.vw_saldo_estoque
    WHERE insumo_id = ${ouro18kId} AND deposito_id IN (${almoxarifadoId}, ${deposito_id})
  `;
  const novo_saldo_pote     = parseFloat(String(saldosRows.find(r => r.deposito_id === almoxarifadoId)?.saldo ?? 0));
  const novo_saldo_operador = parseFloat(String(saldosRows.find(r => r.deposito_id === deposito_id)?.saldo ?? 0));

  return NextResponse.json({
    success:             true,
    foto_url:            fotoResult.url,
    novo_saldo_pote:     parseFloat(novo_saldo_pote.toFixed(4)),
    novo_saldo_operador: parseFloat(novo_saldo_operador.toFixed(4)),
  });
}
