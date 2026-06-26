import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { uploadFile } from "@/lib/storage";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess, ROLES_SERVICE_PANEL } from "@/lib/roles";
import { getParametroNumber, PARAM } from "@/lib/parametros";
import { zodError } from "@/lib/schemas/common";

const CarregarAditivoSchema = z.object({
  deposito_id: z.coerce.number().int().positive(),
  peso: z.coerce.number().positive(),
  foto_base64: z.string().min(1, "obrigatório"),
  operador_nome: z.string().optional(),
}).passthrough();

// POST /api/service/carregar-aditivo
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
  const raw = await req.json().catch(() => ({}));
  const parsed = CarregarAditivoSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;
  const deposito_id   = body.deposito_id;
  const peso          = body.peso;
  const foto_base64   = body.foto_base64;
  const operador_nome = body.operador_nome ?? "operador";

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
    const [parMov] = await tx`
      SELECT saida_id, entrada_id FROM alissonerp.fn_criar_par_movimentacao(
        ${ouro18kId}::integer,
        ${peso}::real,
        ${almoxarifadoId}::integer,
        NULL::integer,
        ${deposito_id}::integer,
        NULL::integer,
        'AD'::alissonerp.enum_marcador_estoque,
        NULL::integer,
        ${'Carga aditivo para ' + operador_nome + ' - Service'}
      )
    `;
    // parMov.saida_id e parMov.entrada_id disponíveis para log/audit futuros
    void parMov;
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
