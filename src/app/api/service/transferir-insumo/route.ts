import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { uploadFile } from "@/lib/storage";
import { validarPesoBalanca } from "@/lib/ia-validar-peso";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";

// POST /api/service/transferir-insumo
// Transfere insumo do estoque do operador logado para outro operador.
// Valida saldo antes de mover. IA valida foto para insumo_id=1 (ouro).
// Auth: is_operador_service = true OU fullAccess

function extrairMediaType(base64: string): string {
  if (base64.startsWith("data:image/png"))  return "image/png";
  if (base64.startsWith("data:image/webp")) return "image/webp";
  return "image/jpeg";
}
function extrairBase64Puro(b64: string): string {
  return b64.replace(/^data:[^;]+;base64,/, "");
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const [caller] = await sql`
      SELECT role, deposito_id, is_operador_service, nome
      FROM alissonerp.usuarios
      WHERE id = ${user.id}::uuid
    `;
    if (!caller) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 403 });

    const hasAccess = isFullAccess(caller.role as string) || caller.is_operador_service === true;
    if (!hasAccess) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

    if (!caller.deposito_id) {
      return NextResponse.json({ error: "Usuário sem depósito vinculado" }, { status: 422 });
    }

    const body = await req.json().catch(() => null) as {
      dest_deposito_id?: number;
      insumo_id?: number;
      quantidade?: number;
      foto_base64?: string;
    } | null;

    const origemId   = caller.deposito_id as number;
    const destId     = body?.dest_deposito_id ? parseInt(String(body.dest_deposito_id)) : null;
    const insumoId   = body?.insumo_id        ? parseInt(String(body.insumo_id))        : null;
    const quantidade = body?.quantidade       ? parseFloat(String(body.quantidade))     : null;
    const fotoBase64 = body?.foto_base64      ?? null;

    if (!destId   || isNaN(destId))   return NextResponse.json({ error: "dest_deposito_id obrigatório" }, { status: 400 });
    if (!insumoId || isNaN(insumoId)) return NextResponse.json({ error: "insumo_id obrigatório" },       { status: 400 });
    if (!quantidade || isNaN(quantidade) || quantidade <= 0)
      return NextResponse.json({ error: "quantidade deve ser > 0" }, { status: 400 });
    if (!fotoBase64) return NextResponse.json({ error: "foto_base64 obrigatória" }, { status: 400 });
    if (destId === origemId) return NextResponse.json({ error: "Destino deve ser um operador diferente" }, { status: 400 });

    // ── 1. Verificar depósito destino ─────────────────────────────────────────
    const [destDeposito] = await sql`
      SELECT id, nome, local_estoque_id FROM alissonerp.depositos WHERE id = ${destId}
    `;
    if (!destDeposito) return NextResponse.json({ error: "Operador destino não encontrado" }, { status: 404 });

    // ── 2. Verificar insumo ───────────────────────────────────────────────────
    const [insumo] = await sql`SELECT id, nome, categoria_id FROM alissonerp.insumos WHERE id = ${insumoId}`;
    if (!insumo) return NextResponse.json({ error: "Insumo não encontrado" }, { status: 404 });

    // ── 3. Verificar saldo da origem ──────────────────────────────────────────
    const saldoRows = await sql`
      SELECT COALESCE(SUM(saldo), 0) AS saldo
      FROM alissonerp.vw_saldo_estoque
      WHERE deposito_id = ${origemId} AND insumo_id = ${insumoId}
    `;
    const saldoAtual = parseFloat(String(saldoRows[0]?.saldo ?? 0));
    if (saldoAtual < quantidade) {
      return NextResponse.json(
        { error: `Saldo insuficiente. Disponível: ${saldoAtual.toFixed(4)}, solicitado: ${quantidade.toFixed(4)}` },
        { status: 422 }
      );
    }

    // ── 4. IA valida foto (obrigatório para ouro/metal) ───────────────────────
    const isOuro = (insumo.categoria_id as number) === 1;
    if (isOuro) {
      const mediaType  = extrairMediaType(fotoBase64);
      const base64Puro = extrairBase64Puro(fotoBase64);
      const validacao  = await validarPesoBalanca(base64Puro, mediaType, quantidade, "metal");
      if (!validacao.match) {
        return NextResponse.json(
          { error: `Peso não confirmado pela IA: ${validacao.mensagem}` },
          { status: 422 }
        );
      }
    }

    // ── 5. Upload da foto ─────────────────────────────────────────────────────
    const mediaType  = extrairMediaType(fotoBase64);
    const fotoPath   = `transferencias/${origemId}-${destId}/${insumoId}-${Date.now()}.jpg`;
    const fotoResult = await uploadFile("service-fotos", fotoPath, fotoBase64, mediaType);
    if ("error" in fotoResult) {
      return NextResponse.json({ error: `Erro no upload: ${fotoResult.error}` }, { status: 500 });
    }

    // ── 6. Depósito origem: local_estoque_id ──────────────────────────────────
    const [origemDeposito] = await sql`
      SELECT local_estoque_id FROM alissonerp.depositos WHERE id = ${origemId}
    `;
    const localOrigem = (origemDeposito?.local_estoque_id ?? 1) as number;
    const localDest   = (destDeposito.local_estoque_id   ?? 1) as number;

    const operadorNome = (caller.nome ?? "operador") as string;
    const obs = `Transferência ${insumo.nome as string}: ${operadorNome} → ${destDeposito.nome as string}`;

    // ── 7. Dupla-entrada em transação ─────────────────────────────────────────
    await (sql as unknown as { begin: (fn: (tx: typeof sql) => Promise<void>) => Promise<void> }).begin(async (tx) => {
      await tx`
        INSERT INTO alissonerp.movimentacoes_estoque
          (insumo_id, deposito_id, local_estoque_id, entrada, saida, marcador, obs, data_hora)
        VALUES (${insumoId}, ${origemId}, ${localOrigem}, 0, ${quantidade}, 'SA', ${obs}, NOW())
      `;
      await tx`
        INSERT INTO alissonerp.movimentacoes_estoque
          (insumo_id, deposito_id, local_estoque_id, entrada, saida, marcador, obs, data_hora)
        VALUES (${insumoId}, ${destId}, ${localDest}, ${quantidade}, 0, 'EA', ${obs}, NOW())
      `;
    });

    // ── 8. Novos saldos ───────────────────────────────────────────────────────
    const novosSaldos = await sql`
      SELECT deposito_id, COALESCE(SUM(saldo), 0) AS saldo
      FROM alissonerp.vw_saldo_estoque
      WHERE insumo_id = ${insumoId} AND deposito_id IN (${origemId}, ${destId})
      GROUP BY deposito_id
    `;
    const novoSaldoOrigem = parseFloat(parseFloat(String(novosSaldos.find(r => r.deposito_id === origemId)?.saldo ?? 0)).toFixed(4));
    const novoSaldoDest   = parseFloat(parseFloat(String(novosSaldos.find(r => r.deposito_id === destId)?.saldo   ?? 0)).toFixed(4));

    return NextResponse.json({
      success:           true,
      foto_url:          fotoResult.url,
      novo_saldo_origem: novoSaldoOrigem,
      novo_saldo_dest:   novoSaldoDest,
    });
  } catch (err: unknown) {
    const e = err as Error;
    console.error("[service/transferir-insumo] ERRO:", e?.message);
    return NextResponse.json({ error: e?.message ?? "Erro desconhecido" }, { status: 500 });
  }
}
